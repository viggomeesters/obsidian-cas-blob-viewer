import {
  App,
  MarkdownPostProcessorContext,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
  normalizePath,
} from "obsidian";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import {
  type CasReference,
  type FileMetadata,
  casBlobPath,
  casBlockToReference,
  parseCasTarget,
  parseJsonlMetadata,
  parseWidth,
  sniffMime,
  vaultRelativePath,
} from "./cas";

interface CasBlobViewerSettings {
  blobRoot: string;
  recordsFile: string;
  maxRenderBytes: number;
  renderWikiEmbeds: boolean;
  renderCodeBlocks: boolean;
  renderLivePreview: boolean;
}

const DEFAULT_SETTINGS: CasBlobViewerSettings = {
  blobRoot: "blobs/sha256",
  recordsFile: "records/files.jsonl",
  maxRenderBytes: 25 * 1024 * 1024,
  renderWikiEmbeds: true,
  renderCodeBlocks: true,
  // Off by default: Live Preview replacement widgets can block note open/rendering
  // in large notes. Reading view/postprocessing is the safe default.
  renderLivePreview: false,
};

const CAS_TARGET_RE = /(cas:sha256:[a-f0-9]{64}|cas-sha256-[a-f0-9]{64}|cassha256:?[a-f0-9]{64}|blob:\/\/sha256\/[a-f0-9]{64}|file\.sha256\.[a-f0-9]{64})(?:\|([^\]]+))?/i;
const WIKI_CAS_SOURCE_RE = /!\[\[(cas:sha256:[a-f0-9]{64}|cas-sha256-[a-f0-9]{64}|cassha256:?[a-f0-9]{64}|blob:\/\/sha256\/[a-f0-9]{64}|file\.sha256\.[a-f0-9]{64})(?:\|([^\]]+))?\]\]/gi;

export default class CasBlobViewerPlugin extends Plugin {
  settings: CasBlobViewerSettings = DEFAULT_SETTINGS;
  private metadataCache: Map<string, FileMetadata> | null = null;
  private active = false;
  private readonly objectUrls = new Set<string>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.active = true;

    if (this.settings.renderLivePreview) {
      this.registerEditorExtension(casLivePreviewExtension(this));
    }
    if (this.settings.renderWikiEmbeds) this.startNativeUnresolvedEmbedObserver();

    if (this.settings.renderWikiEmbeds) {
      this.registerMarkdownPostProcessor((el, ctx) => {
        void this.renderCasWikiEmbeds(el, ctx);
      });
    }

    if (this.settings.renderCodeBlocks) {
      this.registerMarkdownCodeBlockProcessor("cas-blob", (source, el, ctx) => {
        const ref = casBlockToReference(source);
        if (!ref) {
          this.renderError(el, "Invalid cas-blob block: missing sha256.");
          return;
        }
        void this.renderReference(el, ref);
      });
    }

    this.addCommand({
      id: "clear-cas-metadata-cache",
      name: "Clear CAS metadata cache",
      callback: () => {
        this.metadataCache = null;
        new Notice("CAS metadata cache cleared.");
      },
    });

    this.addSettingTab(new CasBlobViewerSettingTab(this.app, this));
  }

  onunload(): void {
    this.active = false;
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.metadataCache = null;
  }

  private startNativeUnresolvedEmbedObserver(): void {
    const root = this.app.workspace.containerEl;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.instanceOf(HTMLElement)) {
            void this.replaceNativeUnresolvedCasEmbeds(node);
          }
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    this.register(() => observer.disconnect());
    void this.replaceNativeUnresolvedCasEmbeds(root);
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<CasBlobViewerSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(loaded ?? {}) };
    if (!Number.isFinite(this.settings.maxRenderBytes) || this.settings.maxRenderBytes <= 0) {
      this.settings.maxRenderBytes = DEFAULT_SETTINGS.maxRenderBytes;
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async renderCasWikiEmbeds(el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    if (!this.active || !this.settings.renderWikiEmbeds) return;
    const source = ctx.getSectionInfo(el)?.text ?? "";
    const sourceRefs = parseSourceRefs(source);
    await this.replaceExistingCasNodes(el, ctx);

    for (const ref of sourceRefs) {
      if (this.hasRenderedHash(el, ref.hash)) continue;
      const mount = el.createDiv({ cls: "cas-blob-viewer", attr: { "data-cas-hash": ref.hash } });
      await this.renderReference(mount, ref);
    }
  }

  private async replaceExistingCasNodes(el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    const candidates = Array.from(el.querySelectorAll<HTMLElement>(".internal-embed, .internal-link, span, a"));
    for (const node of candidates) {
      const target = readCasTarget(node);
      if (!target) continue;
      const ref = parseCasTarget(target);
      if (!ref) continue;
      const mount = createDiv({ cls: "cas-blob-viewer", attr: { "data-cas-hash": ref.hash } });
      node.replaceWith(mount);
      await this.renderReference(mount, ref);
    }
  }

  private async replaceNativeUnresolvedCasEmbeds(root: HTMLElement): Promise<void> {
    if (!this.active || !this.settings.renderWikiEmbeds) return;
    const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("div, span, a"))];
    for (const node of nodes) {
      if (!looksLikeNativeUnresolvedCasEmbed(node)) continue;
      const target = readCasTarget(node);
      if (!target) continue;
      const ref = parseCasTarget(target);
      if (!ref) continue;
      const mount = createDiv({ cls: "cas-blob-viewer", attr: { "data-cas-hash": ref.hash } });
      node.replaceWith(mount);
      await this.renderReference(mount, ref);
    }
  }

  private hasRenderedHash(el: HTMLElement, hash: string): boolean {
    return Boolean(el.querySelector(`[data-cas-hash="${hash}"]`));
  }

  async renderReference(el: HTMLElement, ref: CasReference): Promise<void> {
    if (!this.active) return;
    el.empty();
    el.addClass("cas-blob-viewer");
    el.setAttr("data-cas-hash", ref.hash);

    try {
      const blobPath = normalizePath(casBlobPath(this.settings.blobRoot, ref.hash));
      const stat = await this.app.vault.adapter.stat(blobPath);
      if (!stat) {
        this.renderError(el, `CAS blob not found: ${blobPath}`);
        return;
      }
      if (stat.size > this.settings.maxRenderBytes) {
        this.renderCard(el, ref, await this.getMetadata(ref.hash), `Blob is too large to render inline (${stat.size} bytes).`);
        return;
      }

      const [bytes, metadata] = await Promise.all([
        this.app.vault.adapter.readBinary(blobPath),
        this.getMetadata(ref.hash),
      ]);
      if (!this.active) return;
      if (bytes.byteLength > this.settings.maxRenderBytes) {
        this.renderCard(el, ref, metadata, "Blob is too large to render inline.");
        return;
      }
      const mime = metadata?.mime_type ?? sniffMime(bytes);
      if (mime.startsWith("text/") || mime === "application/xhtml+xml") {
        el.createEl("pre", { text: new TextDecoder().decode(bytes) });
        return;
      }
      if (mime.startsWith("image/")) {
        this.renderImage(el, bytes, mime, ref, metadata);
        return;
      }
      if (isBrowserOpenableMime(mime)) {
        this.renderOpenableCard(el, ref, metadata, `${mime} opens from the CAS blob without creating a duplicate file.`, bytes, mime);
        return;
      }
      this.renderCard(el, ref, metadata, `${mime} preview is not implemented.`);
    } catch (error) {
      this.renderError(el, `Unable to render CAS blob: ${errorMessage(error)}`);
    }
  }

  private renderImage(el: HTMLElement, bytes: ArrayBuffer, mime: string, ref: CasReference, metadata: FileMetadata | null): void {
    const objectUrl = this.createObjectUrl(bytes, mime);
    const displayName = ref.caption ?? fileDisplayName(metadata) ?? `CAS blob ${ref.hash}`;
    const image = el.createEl("img", {
      cls: "cas-blob-viewer__image",
      attr: {
        alt: displayName,
        src: objectUrl,
      },
    });
    const width = parseWidth(ref.width);
    if (width) image.style.maxWidth = width;
    this.registerDomEvent(image, "load", () => {
      this.releaseObjectUrlLater(objectUrl, 60_000);
    });
    this.registerDomEvent(image, "error", () => {
      URL.revokeObjectURL(objectUrl);
      this.objectUrls.delete(objectUrl);
    });
    const caption = displayName;
    if (caption) {
      el.createDiv({ cls: "cas-blob-viewer__meta", text: caption });
    }
  }

  private renderCard(el: HTMLElement, ref: CasReference, metadata: FileMetadata | null, message: string): HTMLElement {
    const card = el.createDiv({ cls: "cas-blob-viewer__card" });
    card.createDiv({ text: metadata?.filename ?? metadata?.id ?? `CAS blob ${ref.hash}` });
    card.createDiv({ cls: "cas-blob-viewer__meta", text: message });
    card.createDiv({ cls: "cas-blob-viewer__meta", text: ref.hash });
    return card;
  }

  private renderOpenableCard(el: HTMLElement, ref: CasReference, metadata: FileMetadata | null, message: string, bytes: ArrayBuffer, mime: string): void {
    const card = this.renderCard(el, ref, metadata, message);
    const button = card.createEl("button", { cls: "cas-blob-viewer__button", text: `Open ${openableLabel(mime)}` });
    this.registerDomEvent(button, "click", () => {
      const objectUrl = this.createObjectUrl(bytes, mime);
      window.open(objectUrl, "_blank", "noopener");
      this.releaseObjectUrlLater(objectUrl, 5 * 60 * 1000);
    });
  }

  private createObjectUrl(bytes: ArrayBuffer, mime: string): string {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    this.objectUrls.add(url);
    return url;
  }

  private releaseObjectUrlLater(url: string, delay: number): void {
    const timer = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      this.objectUrls.delete(url);
    }, delay);
    this.register(() => window.clearTimeout(timer));
  }

  private renderError(el: HTMLElement, message: string): void {
    el.createDiv({ cls: "cas-blob-viewer__card cas-blob-viewer__error", text: message });
  }

  private async getMetadata(hash: string): Promise<FileMetadata | null> {
    if (!this.metadataCache) {
      try {
        const text = await this.app.vault.adapter.read(normalizePath(vaultRelativePath(this.settings.recordsFile)));
        this.metadataCache = parseJsonlMetadata(text);
      } catch {
        this.metadataCache = new Map();
      }
    }
    return this.metadataCache.get(hash) ?? null;
  }
}

class CasEmbedWidget extends WidgetType {
  constructor(
    private readonly plugin: CasBlobViewerPlugin,
    private readonly ref: CasReference,
  ) {
    super();
  }

  eq(other: CasEmbedWidget): boolean {
    return this.ref.hash === other.ref.hash && this.ref.width === other.ref.width && this.ref.caption === other.ref.caption;
  }

  toDOM(): HTMLElement {
    const el = createDiv({ cls: "cas-blob-viewer cas-blob-viewer--live-preview", attr: { "data-cas-hash": this.ref.hash } });
    void this.plugin.renderReference(el, this.ref);
    return el;
  }
}

function casLivePreviewExtension(plugin: CasBlobViewerPlugin) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildCasDecorations(view, plugin);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildCasDecorations(update.view, plugin);
      }
    }
  }, {
    decorations: (value) => value.decorations,
  });
}

function buildCasDecorations(view: EditorView, plugin: CasBlobViewerPlugin): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of view.visibleRanges) {
    let pos = range.from;
    while (pos <= range.to) {
      const line = view.state.doc.lineAt(pos);
      addLineDecorations(builder, line.from, line.text, plugin);
      if (line.to >= range.to) break;
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

function addLineDecorations(builder: RangeSetBuilder<Decoration>, lineFrom: number, text: string, plugin: CasBlobViewerPlugin): void {
  WIKI_CAS_SOURCE_RE.lastIndex = 0;
  for (const match of text.matchAll(WIKI_CAS_SOURCE_RE)) {
    if (match.index === undefined) continue;
    const raw = match[2] ? `${match[1]}|${match[2]}` : match[1];
    const ref = parseCasTarget(raw);
    if (!ref) continue;
    builder.add(
      lineFrom + match.index,
      lineFrom + match.index + match[0].length,
      // Inline replacement is deliberate: CodeMirror block replacement widgets must sit at
      // line boundaries and can break Live Preview/opening for a note where the CAS embed
      // is part of a normal Markdown line. CSS makes the rendered image block-like.
      Decoration.replace({ widget: new CasEmbedWidget(plugin, ref) }),
    );
  }
}

class CasBlobViewerSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CasBlobViewerPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      { name: "Blob root", desc: "Vault-relative CAS root. Layout: <root>/<first-two>/<sha256>.", render: setting => {
        setting.addText(text => text.setValue(this.plugin.settings.blobRoot).onChange(async value => {
          this.plugin.settings.blobRoot = value.trim() || DEFAULT_SETTINGS.blobRoot;
          await this.plugin.saveSettings();
        }));
      } },
      { name: "Metadata records file", desc: "Optional vault-relative JSONL metadata file.", render: setting => {
        setting.addText(text => text.setValue(this.plugin.settings.recordsFile).onChange(async value => {
          this.plugin.settings.recordsFile = value.trim() || DEFAULT_SETTINGS.recordsFile;
          await this.plugin.saveSettings();
        }));
      } },
      { name: "Maximum inline bytes", render: setting => {
        setting.addText(text => text.setValue(String(this.plugin.settings.maxRenderBytes)).onChange(async value => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.maxRenderBytes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.maxRenderBytes;
          await this.plugin.saveSettings();
        }));
      } },
      ...([ ["renderWikiEmbeds", "Render wiki embeds"], ["renderLivePreview", "Live Preview rendering"], ["renderCodeBlocks", "Render cas-blob code blocks"] ] as const).map(([key, name]) => ({
        name,
        desc: key === "renderLivePreview" ? "Experimental. Reload the plugin after changing this option." : "Reload the plugin after changing this option.",
        render: (setting: Setting) => {
          setting.addToggle(toggle => toggle.setValue(this.plugin.settings[key]).onChange(async value => {
            this.plugin.settings[key] = value;
            await this.plugin.saveSettings();
          }));
        },
      })),
    ];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Storage").setHeading();

    new Setting(containerEl)
      .setName("Blob root")
      .setDesc("Vault-relative CAS root. Layout must be <root>/<first-two>/<sha256>.")
      .addText((text) => text
        .setPlaceholder("blobs/sha256")
        .setValue(this.plugin.settings.blobRoot)
        .onChange(async (value) => {
          this.plugin.settings.blobRoot = value.trim() || DEFAULT_SETTINGS.blobRoot;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Metadata records file")
      .setDesc("Optional vault-relative JSONL file used for captions and MIME metadata.")
      .addText((text) => text
        .setPlaceholder("records/files.jsonl")
        .setValue(this.plugin.settings.recordsFile)
        .onChange(async (value) => {
          this.plugin.settings.recordsFile = value.trim() || DEFAULT_SETTINGS.recordsFile;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Maximum inline bytes")
      .setDesc("Large blobs render as a metadata card instead of inline content.")
      .addText((text) => text
        .setPlaceholder(String(DEFAULT_SETTINGS.maxRenderBytes))
        .setValue(String(this.plugin.settings.maxRenderBytes))
        .onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.maxRenderBytes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.maxRenderBytes;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName("Rendering").setHeading();

    new Setting(containerEl)
      .setName("Render wiki embeds")
      .setDesc("Render ![[cas-sha256-<hash>|width]] references in reading view.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.renderWikiEmbeds)
        .onChange(async (value) => {
          this.plugin.settings.renderWikiEmbeds = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Live Preview rendering")
      .setDesc("Experimental. Reading view is the safe default; Live Preview widgets may make large notes harder to open.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.renderLivePreview)
        .onChange(async (value) => {
          this.plugin.settings.renderLivePreview = value;
          await this.plugin.saveSettings();
          new Notice("Reload Obsidian to apply Live Preview rendering.");
        }));

    new Setting(containerEl)
      .setName("Render cas-blob code blocks")
      .setDesc("Render fenced cas-blob blocks as a fallback syntax.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.renderCodeBlocks)
        .onChange(async (value) => {
          this.plugin.settings.renderCodeBlocks = value;
          await this.plugin.saveSettings();
        }));
  }
}

function parseSourceRefs(source: string): CasReference[] {
  const refs: CasReference[] = [];
  for (const match of source.matchAll(WIKI_CAS_SOURCE_RE)) {
    const raw = match[2] ? `${match[1]}|${match[2]}` : match[1];
    const ref = parseCasTarget(raw);
    if (ref) refs.push(ref);
  }
  return refs;
}

function fileDisplayName(metadata: FileMetadata | null): string | null {
  if (!metadata) return null;
  if (metadata.filename) return metadata.filename;
  const firstPath = metadata.source_paths?.[0];
  if (firstPath) return firstPath.split("/").pop() ?? firstPath;
  return metadata.id ?? null;
}

function isBrowserOpenableMime(mime: string): boolean {
  return mime === "application/pdf";
}

function openableLabel(mime: string): string {
  if (mime === "text/html" || mime === "application/xhtml+xml") return "HTML";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("text/")) return "text";
  return "file";
}

function readCasTarget(node: HTMLElement): string | null {
  const attrs = ["src", "href", "data-href", "aria-label", "title"];
  for (const attr of attrs) {
    const value = node.getAttr(attr);
    if (!value) continue;
    const match = value.match(CAS_TARGET_RE);
    if (match) return match[2] ? `${match[1]}|${match[2]}` : match[1];
  }
  const text = node.textContent ?? "";
  const match = text.match(CAS_TARGET_RE);
  return match ? (match[2] ? `${match[1]}|${match[2]}` : match[1]) : null;
}

function looksLikeNativeUnresolvedCasEmbed(node: HTMLElement): boolean {
  if (node.closest(".cas-blob-viewer")) return false;
  const text = (node.textContent ?? "").trim();
  if (text.length === 0 || text.length > 500) return false;
  if (!CAS_TARGET_RE.test(text)) return false;
  CAS_TARGET_RE.lastIndex = 0;
  return text.includes("not created yet") || text.includes("Click to create");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

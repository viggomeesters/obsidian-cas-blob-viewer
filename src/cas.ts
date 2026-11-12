export interface CasReference {
  hash: string;
  width?: string;
  caption?: string;
}

export interface FileMetadata {
  id?: string;
  filename?: string;
  mime_type?: string;
  size_bytes?: number;
  sha256: string;
  storage_ref?: string;
  source_paths?: string[];
}

export const SHA256_RE = /^[a-f0-9]{64}$/i;

export function normalizeHash(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  return SHA256_RE.test(trimmed) ? trimmed : null;
}

export function parseCasTarget(rawTarget: string): CasReference | null {
  const [targetPart, ...rest] = rawTarget.split("|");
  const target = targetPart.trim();
  const width = rest[0]?.trim();
  const caption = rest.slice(1).join("|").trim() || undefined;

  const prefixed = target.match(/^cas:sha256:([a-f0-9]{64})$/i);
  if (prefixed) {
    return { hash: prefixed[1].toLowerCase(), width: width || undefined, caption };
  }

  // Obsidian native wikilinks do not preserve URI-like colons reliably in unresolved embeds.
  // This hyphenated form is the preferred durable daily-note syntax.
  const obsidianSafe = target.match(/^cas-sha256-([a-f0-9]{64})$/i);
  if (obsidianSafe) {
    return { hash: obsidianSafe[1].toLowerCase(), width: width || undefined, caption };
  }

  // Backward-compatible parser for the common Obsidian-munged form seen from ![[cas:sha256:<hash>]].
  const mungedObsidian = target.match(/^cassha256:?([a-f0-9]{64})$/i);
  if (mungedObsidian) {
    return { hash: mungedObsidian[1].toLowerCase(), width: width || undefined, caption };
  }

  const blobUrl = target.match(/^blob:\/\/sha256\/([a-f0-9]{64})$/i);
  if (blobUrl) {
    return { hash: blobUrl[1].toLowerCase(), width: width || undefined, caption };
  }

  const fileId = target.match(/^file\.sha256\.([a-f0-9]{64})$/i);
  if (fileId) {
    return { hash: fileId[1].toLowerCase(), width: width || undefined, caption };
  }

  const bare = normalizeHash(target);
  return bare ? { hash: bare, width: width || undefined, caption } : null;
}

export function casBlobPath(blobRoot: string, hash: string): string {
  const normalizedRoot = vaultRelativePath(blobRoot);
  if (!normalizeHash(hash)) throw new Error("Invalid CAS hash.");
  return `${normalizedRoot}/${hash.slice(0, 2)}/${hash}`;
}

export function vaultRelativePath(value: string): string {
  const path = value.replace(/\\/g, "/");
  if (!path || path.startsWith("/") || path.includes(":") || path.split("/").some(part => part === ".." || part === ".")) {
    throw new Error("Use a vault-relative path without traversal.");
  }
  return path.replace(/\/+$/g, "");
}

export function parseWidth(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{1,4}$/.test(trimmed)) return `${trimmed}px`;
  if (/^\d{1,4}px$/.test(trimmed)) return trimmed;
  if (/^\d{1,3}%$/.test(trimmed)) return trimmed;
  return undefined;
}

export function sniffMime(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes.slice(0, 16));
  if (view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47) return "image/png";
  if (view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) return "image/jpeg";
  if (view[0] === 0x47 && view[1] === 0x49 && view[2] === 0x46) return "image/gif";
  if (view[0] === 0x25 && view[1] === 0x50 && view[2] === 0x44 && view[3] === 0x46) return "application/pdf";
  if (view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46 && view[3] === 0x46 && view[8] === 0x57 && view[9] === 0x45 && view[10] === 0x42 && view[11] === 0x50) return "image/webp";
  return "application/octet-stream";
}

export function parseJsonlMetadata(text: string): Map<string, FileMetadata> {
  const byHash = new Map<string, FileMetadata>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as Partial<FileMetadata> & { record_type?: string };
      if (record.record_type !== "file" || typeof record.sha256 !== "string") continue;
      const hash = normalizeHash(record.sha256);
      if (!hash) continue;
      byHash.set(hash, { ...record, sha256: hash });
    } catch {
      // Ignore malformed JSONL rows; metadata is optional and rendering can still fall back to sniffing.
    }
  }
  return byHash;
}

export function casBlockToReference(source: string): CasReference | null {
  const values = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/);
    if (match) values.set(match[1].toLowerCase(), match[2]);
  }
  const hash = normalizeHash(values.get("sha256") ?? values.get("hash") ?? "");
  if (!hash) return null;
  return {
    hash,
    width: values.get("width") ?? undefined,
    caption: values.get("caption") ?? values.get("name") ?? undefined,
  };
}

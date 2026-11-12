# CAS Blob Viewer

Render content-addressed vault blobs inline from durable sha256 references.

## Why

Some vault workflows store file payloads once in a CAS layout:

```text
blobs/sha256/<first-two>/<sha256>
```

Daily notes can then reference the durable hash instead of keeping duplicate attachment files around.

## Syntax

Image/embed syntax:

```md
![[cas-sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|500]]
```

The plugin also accepts legacy `cas:sha256:<hash>` and `blob://sha256/<hash>` references, but the hyphenated form is preferred because native wikilinks handle it cleanly.

Code block fallback:

````md
```cas-blob
sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
width: 500
caption: Pasted image
```
````

## Scope and safety

- Read-only: the plugin reads blobs and optional metadata, but does not write or delete vault files.
- No network access.
- No duplicate preview files.
- Payload source of truth remains the CAS blob.

## Settings

- Blob root: default `blobs/sha256`
- Metadata records file: default `records/files.jsonl`
- Maximum render bytes: default 25 MB



## Live Preview

Live Preview rendering is off by default. Reading view rendering is the safe default because editor replacement widgets can interfere with opening large notes. Enable Live Preview rendering only after testing in a small note.

## Installation and compatibility

The Community submission is being prepared. Manual installation uses `main.js`, `manifest.json` and `styles.css` from a release whose tag equals the manifest version. Place them in `.obsidian/plugins/cas-blob-viewer/` in a test vault first.

The plugin reads existing blobs; it does not create a CAS store or import attachments. All paths must remain relative to the current vault. Optional metadata must use `record_type: "file"`, `sha256`, and optionally `filename`/`mime_type`. Invalid metadata rows are ignored. HTML, XHTML and text render as inert source, never as an executable web page. PDF content opens in the browser's PDF viewer. Images render inline. Unsupported content and oversized blobs display a card. The size limit controls preview reads; the hash syntax identifies the expected blob but does not verify its digest.

Rendering toggles require reloading the plugin. Live Preview remains experimental and off by default. Version 0.1.5 is validated on current desktop Obsidian on macOS; mobile and exact minimum-version execution are not claimed by those tests.

## Development

Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm run community:check`. CodeMirror is supplied by Obsidian and kept external to the bundle. No runtime network request, external helper or package installation is required.

## License

MIT; see LICENSE. No vendored third-party runtime code is included in the release bundle.

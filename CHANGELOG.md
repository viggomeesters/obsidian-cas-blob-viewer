# Changelog

## 0.1.7 - 2026-11-16

- Maintenance verification for Obsidian 1.15.1 on macOS desktop.
- Add reproducible official Obsidian lint checks; no runtime code change.

## 0.1.6

- Declare the ES2020 library used by String.matchAll, so official source analysis resolves its types consistently.
- Make the actual-host runner restore renderer background timer policy independently of other cleanup.
- Supersede the unpublished 0.1.5 draft without replacing its tag or assets.

## 0.1.5

- Prepare the first Community release from reviewed standalone source.
- Render HTML/XHTML and text as inert source.
- Honor the wiki-embed toggle and release object URLs on unload.
- Reject paths outside the vault and check actual payload size before rendering.
- Add searchable settings, official lint and security/lifecycle regressions.
- Preserve reading-view defaults and opt-in experimental Live Preview.

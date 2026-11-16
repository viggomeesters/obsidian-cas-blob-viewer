# Obsidian 1.15.1 assessment — 16 November 2026

Source assessed: `358e2dbb278fae7c3ce76abe054fcb2960c6517e`, plugin 0.1.6.

[Obsidian desktop 1.15.1](https://obsidian.md/changelog/2026-11-12-desktop-v1.15.1/) changes startup, indexing, hidden-window timers, plugin installation settings and external opening of unrecognized attachments. A targeted source search found no `activeWindow`, Array/String `contains`, `trashFile`, `promptForDeletion`, PIXI or Mermaid use requiring a change. DOM element `contains` is a different API. This bounded search does not establish runtime compatibility.

Local checks passed in a fresh macOS checkout using the existing lockfile and `npm ci --ignore-scripts`. Executed repository scripts: `npm run build`, `npm run lint`, `npm run test`, `npm run typecheck`. Scripts absent from package.json were skipped, not counted as successful tests. Production `main.js` SHA-256: `b206b9f06ec728396978c5910143e603cd9f60277719a7ea7550dbf963a34dff`. Parser fixtures, test doubles and headless host tests only prove their own tested behavior.

Actual Obsidian 1.15.1 startup, view/file opening, lifecycle and relevant settings remain unverified. No established non-disruptive background connection to a 1.15.1 host was available; the running app and the designated test vault's settings/fixtures were left untouched. No mobile or minimum-version runtime claim follows from these checks. Keep the maintenance issue open for the real-host gate. No release or version bump was made.

Locked-tree npm audit snapshot: `{"info":0,"low":0,"moderate":12,"high":0,"critical":0,"total":12}`. These are whole dependency-tree package counts, not demonstrated runtime exposure; test-only dependencies are included. No broad dependency upgrade or force-fix was applied. Remaining advisories require separate dependency triage.

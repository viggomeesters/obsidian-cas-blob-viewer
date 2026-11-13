# Release validation — 0.1.6

The clean Community candidate contains the plugin, build/lint configuration, synthetic tests and public documentation. Runtime dependencies on Obsidian/CodeMirror are external and supplied by the host. No private vault helper or history is part of this repository.

Local checks: clean `npm ci`, TypeScript, official `eslint-plugin-obsidianmd` with no warnings, unit parsing/path tests, built-plugin security/lifecycle regressions, production build and Community preflight. The synthetic runtime harness executes the actual bundled entrypoint, rather than mirroring its implementation.

[Actual-host report](evidence/runtime-0.1.6-macos.json): 21 checks pass in Obsidian 1.15.0 (installer 1.12.7), macOS Apple Silicon. Covers inert HTML, absence of active markup/script execution, preserved source bytes, PNG rendering, empty/missing/oversized content, traversal rejection, wiki toggle, six searchable settings and six legacy controls, real preview note, cooperating plugin state and exact settings/active-note restoration. A real rendered synthetic HTML preview is shown below. No real vault content is used.

![Inert HTML source in actual Obsidian](runtime-preview.png)

For another local host run, use the marked isolated standard test vault and a new report destination:

```sh
npm run test:host -- /absolute/path/to/obsidian-test-vault /absolute/local/path/new-report.json
```

The host runner assumes the candidate is already installed and loaded. It creates its own unique fixtures, restores the exact settings bytes and active note, and leaves fixtures as inspectable evidence. It never installs to or tests a main user vault.

Boundaries: exact minimum-version execution, mobile devices, PDF viewer interaction and experimental Live Preview are not established by this host report. The API minimum is retained after source/lint assessment; these tests do not turn that into actual host evidence. The content-addressed filename is not rehashed by the plugin. File size is checked before and after reading; the adapter API returns a complete buffer, so concurrent growth cannot be prevented from allocating before the second check.

The exact-source official preview and full release review are Completed for commit `f34cc596b7aeea16243f54027d85892d61417759`. Network, vault-read behavior, dependencies, obfuscation and build verification are Pass. Obsidian reproduced the released main.js byte-for-byte. All three anonymous release downloads match the tested files, and the public Community listing displays 0.1.6.

Fresh app-catalog installation passed on 13 November 2026. The ID/repository now matches the official registry. The prior test installation was backed up and uninstalled; its directory was confirmed absent before the supported CLI Community install. Acceptance waited for actual downloaded files and a loaded 0.1.6 instance, rather than relying on the install command's return. No manual files were substituted. Installed manifest/CSS match the release exactly; main.js matches after removing only the exact 18-byte `\n/* nosourcemap */` suffix added by Obsidian. All 21 [fresh catalog host checks](evidence/runtime-0.1.6-catalog-macos.json) pass. An additional real reload proves the old instance inactive with object URLs released and a distinct 0.1.6 instance loaded. Default settings, the enabled plugin list, cooperating plugins and active note are preserved. See [catalog evidence](evidence/catalog-install-0.1.6.json) and [publication readback](evidence/publication-0.1.6.json). The prior propagation failure remains recorded as dated history; issue #1's catalog-install criterion is now met.

Clean npm installation, lint, typecheck, unit/bundle tests, production build and Community preflight were repeated against the unchanged release source. The production audit reports zero findings. The full development audit reports 12 moderate findings in lint/SDK dependency chains, with no high/critical findings; these packages are not bundled into this plugin. [Dependency maintenance](https://github.com/viggomeesters/obsidian-cas-blob-viewer/issues/5) is tracked separately. No automatic force/downgrade, replacement release assets or new plugin version was used to clear that maintenance item. This audit does not assess the Obsidian host's own dependency tree.

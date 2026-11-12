import fs from "node:fs";
import path from "node:path";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
const source = fs.readFileSync("src/main.ts", "utf8");
const allowedManifestNamePattern = /^[A-Za-z0-9 ()+-]+$/;
const lowerName = manifest.name.toLowerCase();
const lowerDescription = manifest.description.toLowerCase();
const directHeadingElementPattern = /\.createEl\(\s*["']h[1-6]["']/;
const pluginNameHeadingPattern = new RegExp(
  `\\.setName\\(\\s*['\"]${escapeRegExp(manifest.name)}['\"]\\s*\\)\\.setHeading\\(`,
);

const checks = [
  [manifest.id === "cas-blob-viewer", "manifest id is stable"],
  [/^[a-z][a-z-]*[a-z]$/.test(manifest.id), "manifest id uses lowercase letters and hyphens"],
  [!manifest.id.includes("obsidian") && !manifest.id.endsWith("plugin"), "manifest id avoids obsidian/plugin"],
  [manifest.version === pkg.version, "manifest/package versions match"],
  [versions[manifest.version] === manifest.minAppVersion, "versions.json maps current version to minAppVersion"],
  [allowedManifestNamePattern.test(manifest.name), "manifest name uses allowed punctuation only"],
  [!lowerName.includes("obsidian") && !lowerName.includes("obsi-") && !lowerName.includes("-sidian"), "manifest name avoids Obsidian variants"],
  [!lowerDescription.includes("obsidian"), "manifest description avoids Obsidian"],
  [!source.includes("detachLeavesOfType"), "does not detach leaves in onunload"],
  [!source.includes("revealLeaf("), "does not use revealLeaf"],
  [!directHeadingElementPattern.test(source), "settings headings use Setting.setHeading"],
  [!pluginNameHeadingPattern.test(source), "settings headings avoid the plugin name"],
  [!source.includes("requestUrl") && !source.includes("fetch("), "no network access"],
  [!source.includes("writeBinary") && !source.includes("adapter.write") && !source.includes("vault.modify"), "plugin is read-only"],
];

let failed = false;
for (const [ok, message] of checks) {
  if (ok) {
    console.log(`OK ${message}`);
  } else {
    failed = true;
    console.error(`FAIL ${message}`);
  }
}

for (const required of ["manifest.json", "package.json", "versions.json", "README.md", "LICENSE", "src/main.ts", "styles.css"]) {
  if (!fs.existsSync(path.join(process.cwd(), required))) {
    failed = true;
    console.error(`FAIL missing ${required}`);
  }
}

if (failed) process.exit(1);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

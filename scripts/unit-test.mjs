import assert from "node:assert/strict";
import {
  casBlobPath,
  casBlockToReference,
  parseCasTarget,
  parseJsonlMetadata,
  parseWidth,
  sniffMime,
} from "../dist-test/cas.js";

const hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

assert.deepEqual(parseCasTarget(`cas:sha256:${hash}|500`), { hash, width: "500", caption: undefined });
assert.deepEqual(parseCasTarget(`cas-sha256-${hash}|500`), { hash, width: "500", caption: undefined });
assert.deepEqual(parseCasTarget(`cassha256:${hash}|500`), { hash, width: "500", caption: undefined });
assert.deepEqual(parseCasTarget(`blob://sha256/${hash}|75%`), { hash, width: "75%", caption: undefined });
assert.deepEqual(parseCasTarget(`file.sha256.${hash}|name.png`), { hash, width: "name.png", caption: undefined });
assert.equal(parseCasTarget("not-a-hash"), null);
assert.equal(casBlobPath("blobs/sha256", hash), `blobs/sha256/aa/${hash}`);
assert.equal(parseWidth("500"), "500px");
assert.equal(parseWidth("75%"), "75%");
assert.equal(parseWidth("99999"), undefined);

const jsonl = [
  JSON.stringify({ record_type: "file", id: `file.sha256.${hash}`, sha256: hash, mime_type: "image/png", filename: "Pasted.png" }),
  "not-json",
  JSON.stringify({ record_type: "note", sha256: hash }),
].join("\n");
const metadata = parseJsonlMetadata(jsonl);
assert.equal(metadata.get(hash)?.filename, "Pasted.png");

assert.equal(casBlockToReference(`sha256: ${hash}\nwidth: 500\ncaption: Test`)?.caption, "Test");
assert.equal(sniffMime(new Uint8Array([0x89,0x50,0x4e,0x47]).buffer), "image/png");
assert.equal(sniffMime(new Uint8Array([0xff,0xd8,0xff,0x00]).buffer), "image/jpeg");

console.log("unit tests passed");

for (const root of ['../outside', '/absolute', 'C:\\outside', 'a/../b', './blobs']) {
  assert.throws(() => casBlobPath(root, hash));
}
assert.throws(() => casBlobPath('blobs/sha256', '../outside'));

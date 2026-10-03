import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { planPackage, encodeICO } from "../public/js/exports/package.js";
import { zip, crc32 } from "../public/js/exports/zip.js";
import { readPNG, readZip, verifyPackage } from "../scripts/verify-package.mjs";
function chunk(type, data) {
  const b = Buffer.alloc(data.length + 12);
  b.writeUInt32BE(data.length);
  b.write(type, 4);
  data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, -4)), b.length - 4);
  return b;
}
function png(size, filter = 0) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const pixels = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) pixels[y * (size * 3 + 1)] = filter;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
async function fixture(change = () => {}) {
  const p = planPackage({ targets: ["web"] }),
    files = { ...p.text };
  for (const i of p.images) files[i.name] = new Blob([png(i.size)]);
  files["web/favicon.ico"] = encodeICO(
    [16, 32, 48].map((size) => ({ size, bytes: png(size) })),
  );
  files["source.png"] = new Blob([png(16)]);
  files["recipe.json"] = "{}";
  files["README.txt"] = "test fixture";
  files["report.json"] = JSON.stringify({
    version: 1,
    name: "Test",
    targets: ["web"],
    fileCount: Object.keys(files).length + 1,
    images: p.images,
    warnings: [],
  });
  await change(files);
  return Buffer.from(await (await zip(files)).arrayBuffer());
}
test("verifier accepts a full independent web fixture and all PNG filters decode", async () => {
  const r = verifyPackage(await fixture());
  assert.equal(r.files, 15);
  assert.equal(r.renderedPNGs, 8);
  for (let filter = 0; filter <= 4; filter++)
    assert.equal(readPNG(png(3, filter)).pixels.length, 27);
});
test("verifier rejects damaged ZIP payloads before trusting metadata", async () => {
  const b = await fixture();
  b[80] ^= 255;
  assert.throws(() => readZip(b), /integrity/);
});
test("verifier rejects a wrong icon size even when the ZIP CRC is valid", async () => {
  const b = await fixture((files) => {
    files["web/icon-512.png"] = new Blob([png(32)]);
  });
  assert.throws(() => verifyPackage(b), /expected 512×512/);
});
test("verifier catches stale manifest paths and detached ICO frames", async () => {
  const badManifest = await fixture((files) => {
    const m = JSON.parse(files["web/site.webmanifest"]);
    m.icons[0].src = "missing.png";
    files["web/site.webmanifest"] = JSON.stringify(m);
  });
  assert.throws(() => verifyPackage(badManifest), /manifest is missing/);
  const badICO = await fixture(async (files) => {
    const b = Buffer.from(await files["web/favicon.ico"].arrayBuffer());
    b[b.length - 1] ^= 1;
    files["web/favicon.ico"] = new Blob([b]);
  });
  assert.throws(() => verifyPackage(badICO), /payload differs/);
});
test("verifier rejects missing files and inconsistent report counts", async () => {
  const missing = await fixture((files) => {
    delete files["web/icon-512.png"];
    const r = JSON.parse(files["report.json"]);
    r.fileCount--;
    files["report.json"] = JSON.stringify(r);
  });
  assert.throws(() => verifyPackage(missing), /Missing file/);
  const badCount = await fixture((files) => {
    const r = JSON.parse(files["report.json"]);
    r.fileCount = 1;
    files["report.json"] = JSON.stringify(r);
  });
  assert.throws(() => verifyPackage(badCount), /file count/);
});
test("PNG decoder rejects damaged chunks, invalid filters and trailing bytes", () => {
  const corrupt = png(2);
  corrupt[corrupt.length - 5] ^= 1;
  assert.throws(() => readPNG(corrupt), /CRC/);
  assert.throws(() => readPNG(png(2, 5)), /row filter/);
  assert.throws(
    () => readPNG(Buffer.concat([png(2), Buffer.from([0])])),
    /incomplete PNG/,
  );
});

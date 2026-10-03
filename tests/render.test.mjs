import test from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  placement,
  svg,
  toBlob,
  defaults,
  presets,
} from "../public/js/studio/render.js";
import { zip, crc32 } from "../public/js/exports/zip.js";
const img = "data:image/png;base64,aGVsbG8=";
test("untrusted recipes cannot insert SVG attributes or exceed supported export dimensions", () => {
  const c = normalize({
    color: '"/><script>x</script>',
    scale: 100000,
    size: 90000,
    layout: "evil",
    motion: "evil",
  });
  assert.equal(c.color, "#b4aad3");
  assert.equal(c.scale, 135);
  assert.equal(c.size, 1024);
  assert.equal(c.layout, "center");
  assert.equal(c.motion, "breathe");
  assert.throws(() => svg("https://tracker.invalid/a.png"));
  assert.throws(() => svg("data:image/svg+xml;base64,AAAA"));
});
test("side layouts mirror their crop and preserve equal scale", () => {
  const l = placement({ layout: "left" }),
    r = placement({ layout: "right" });
  assert.equal(l.x + r.x, 1024);
  assert.equal(l.y, r.y);
  assert.equal(l.s, r.s);
  assert.equal(l.r, -r.r);
});
test("small exports omit seasonal details, static SVG omits animation", () => {
  const tiny = svg(img, { size: 16, occasion: "christmas", motion: "bounce" });
  assert(!tiny.includes("<style>"));
  assert(!tiny.includes("stroke-linecap"));
  const moving = svg(img, { size: 1024, motion: "bounce" }, true);
  assert(moving.includes("@keyframes"));
  assert(moving.includes("prefers-reduced-motion"));
});
test("local data URL conversion preserves bytes and MIME without any network access", async () => {
  const blob = toBlob(img);
  assert.equal(blob.type, "image/png");
  assert.equal(await blob.text(), "hello");
  assert.throws(() => toBlob("data:text/html;base64,AAAA"));
});
test("ZIP records preserve binary content, unicode names and CRCs", async () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const z = new Uint8Array(
      await (
        await zip({ "résumé.png": toBlob(img), "recipe.json": "{}" })
      ).arrayBuffer(),
    ),
    d = new DataView(z.buffer);
  assert.equal(d.getUint32(0, true), 0x04034b50);
  assert.equal(d.getUint16(6, true), 0x800);
  const n = d.getUint16(26, true),
    len = d.getUint32(18, true),
    content = z.slice(30 + n, 30 + n + len);
  assert.equal(new TextDecoder().decode(z.slice(30, 30 + n)), "résumé.png");
  assert.equal(new TextDecoder().decode(content), "hello");
  assert.equal(crc32(content), d.getUint32(14, true));
  assert.equal(d.getUint32(z.length - 22, true), 0x06054b50);
  assert.equal(d.getUint16(z.length - 12, true), 2);
  await assert.rejects(() => zip({ "../escape": "bad" }));
});

test("every new layout animates by default while explicit Still and PNG rendering stay static", () => {
  assert.equal(defaults.motion, "breathe");
  for (const recipe of [{}, ...presets]) {
    assert.match(svg(img, recipe, true), /@keyframes/);
    assert.doesNotMatch(svg(img, recipe, false), /@keyframes/);
    assert.doesNotMatch(
      svg(img, { ...recipe, motion: "none" }, true),
      /@keyframes/,
    );
  }
});

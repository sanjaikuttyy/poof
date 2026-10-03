import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAlpha,
  validateMonochromeDataURL,
  planPackage,
  encodeICO,
  sanitizeName,
  SAFE,
  fitSafeBounds,
} from "../public/js/exports/package.js";

const fixture = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
);
test("iOS asset catalog references exactly the generated classic iPhone/iPad and marketing slots", () => {
  const p = planPackage({ targets: ["ios"] });
  const c = JSON.parse(p.text["ios/AppIcon.appiconset/Contents.json"]);
  assert.equal(c.images.length, 18);
  assert.equal(p.images.length, 18);
  for (const item of c.images) {
    const f = p.images.find(
      (x) => x.name === `ios/AppIcon.appiconset/${item.filename}`,
    );
    assert.ok(f);
    assert.equal(f.size, parseFloat(item.size) * parseInt(item.scale));
  }
  assert.ok(
    c.images.some(
      (x) => x.idiom === "ipad" && x.size === "83.5x83.5" && x.scale === "2x",
    ),
  );
  assert.ok(p.images.some((x) => x.size === 1024));
  assert.equal(new Set(p.images.map((x) => x.name)).size, p.images.length);
});
test("Android density mapping and adaptive resource references resolve", () => {
  const p = planPackage({ targets: ["android"] });
  assert.equal(p.images.length, 21);
  for (const [density, legacy, adaptive] of [
    ["mdpi", 48, 108],
    ["hdpi", 72, 162],
    ["xhdpi", 96, 216],
    ["xxhdpi", 144, 324],
    ["xxxhdpi", 192, 432],
  ]) {
    assert.equal(
      p.images.find(
        (x) => x.name === `android/res/mipmap-${density}/ic_launcher.png`,
      ).size,
      legacy,
    );
    assert.equal(
      p.images.find(
        (x) =>
          x.name ===
          `android/res/drawable-${density}/ic_launcher_foreground.png`,
      ).size,
      adaptive,
    );
    assert.equal(
      p.images.find(
        (x) =>
          x.name ===
          `android/res/drawable-${density}/ic_launcher_monochrome.png`,
      ).kind,
      "monochrome",
    );
  }
  assert.ok(
    !p.text["android/res/mipmap-anydpi-v26/ic_launcher.xml"].includes(
      "<monochrome",
    ),
  );
  assert.ok(
    p.text["android/res/mipmap-anydpi-v33/ic_launcher_round.xml"].includes(
      "@drawable/ic_launcher_monochrome",
    ),
  );
});
test("safe inset squares fit entirely inside Android and PWA safe circles", () => {
  assert.ok(SAFE.android * Math.SQRT2 <= 66 / 108 + 1e-12);
  assert.ok(SAFE.maskable * Math.SQRT2 <= 0.8 + 1e-12);
});
test("web manifest uses distinct any/maskable assets which all exist", () => {
  const p = planPackage({ targets: ["web"], name: "My app" });
  const manifest = JSON.parse(p.text["web/site.webmanifest"]);
  assert.equal(manifest.icons.length, 4);
  for (const icon of manifest.icons) {
    const spec = p.images.find((x) => x.name === `web/${icon.src}`);
    assert.ok(spec);
    assert.equal(icon.sizes, `${spec.size}x${spec.size}`);
    assert.equal(
      spec.kind,
      icon.purpose === "maskable" ? "maskable" : "normal",
    );
  }
  for (const size of [16, 32, 48, 180])
    assert.ok(p.images.some((x) => x.size === size));
});
test("optional macOS is a separate catalog including 1024 physical pixel slot", () => {
  const p = planPackage({ targets: ["macos"] });
  assert.equal(p.images.length, 10);
  const c = JSON.parse(p.text["macos/AppIcon.appiconset/Contents.json"]);
  assert.ok(c.images.every((x) => x.idiom === "mac"));
  assert.ok(p.images.some((x) => x.size === 1024));
});
test("ICO directory offsets, bit depth, lengths and payload round-trip", async () => {
  const ico = encodeICO([
    { size: 1, bytes: fixture },
    { size: 1, bytes: fixture },
  ]);
  const bytes = new Uint8Array(await ico.arrayBuffer()),
    v = new DataView(bytes.buffer);
  assert.equal(v.getUint16(0, true), 0);
  assert.equal(v.getUint16(2, true), 1);
  assert.equal(v.getUint16(4, true), 2);
  assert.equal(v.getUint16(12, true), 32);
  assert.equal(v.getUint32(18, true), 38);
  assert.equal(v.getUint32(34, true), 38 + fixture.length);
  assert.equal(bytes.length, 38 + fixture.length * 2);
  assert.deepEqual(bytes.slice(38, 38 + fixture.length), fixture);
  assert.throws(() => encodeICO([{ size: 16, bytes: fixture }]), /dimensions/);
  assert.throws(() => encodeICO([{ size: 0, bytes: fixture }]));
  assert.throws(() => encodeICO([]));
});
test("untrusted display names cannot alter paths and unsupported targets reject", () => {
  const name = "../../evil<script>\u0000";
  const p = planPackage({ name });
  assert.ok(!sanitizeName(name).includes("<"));
  assert.ok(p.images.every((x) => !x.name.includes("..")));
  assert.equal(sanitizeName("  "), "My app");
  assert.equal(sanitizeName("a".repeat(100)).length, 80);
  assert.throws(() => planPackage({ targets: ["../../"] }));
  assert.throws(() => planPackage({ targets: [] }));
  const all = planPackage();
  assert.deepEqual(all.targets, ["ios", "android", "web"]);
});

test("alpha bounds preserve non-square aspect ratio and fit every corner inside safe circle", () => {
  const fit = fitSafeBounds(800, 400, 432, 66 / 108);
  assert.equal(fit.width / fit.height, 2);
  assert.ok(Math.abs(Math.hypot(fit.width / 2, fit.height / 2) - 132) < 1e-10);
  assert.equal(fit.x + fit.width / 2, 216);
  assert.equal(fit.y + fit.height / 2, 216);
  assert.throws(() => fitSafeBounds(0, 1, 512, 0.8));
});

test("custom monochrome accepts PNG and rejects external URLs, other formats and oversized input", () => {
  const png =
    "data:image/png;base64," + Buffer.from(fixture).toString("base64");
  assert.doesNotThrow(() => validateMonochromeDataURL(png));
  for (const input of [
    "https://example.com/icon.png",
    png.replace("image/png", "image/jpeg"),
    "data:image/png;base64,AAAA",
    null,
  ])
    assert.throws(() => validateMonochromeDataURL(input));
  assert.throws(() =>
    validateMonochromeDataURL(
      "data:image/png;base64," + "A".repeat(14 * 1024 * 1024),
    ),
  );
});
test("custom monochrome rejects opaque, uniformly translucent, empty and near-invisible alpha", () => {
  for (const alpha of [0, 8, 128, 255]) {
    const p = new Uint8ClampedArray(20 * 20 * 4);
    for (let i = 3; i < p.length; i += 4) p[i] = alpha;
    assert.throws(
      () => analyzeAlpha(p, 20, 20, true),
      alpha <= 8 ? /empty or too faint/ : /transparent background/,
    );
  }
});
test("custom alpha bbox is independent, padded, and ignores negligible ghost pixels", () => {
  const p = new Uint8ClampedArray(20 * 20 * 4);
  for (let y = 7; y <= 10; y++)
    for (let x = 8; x <= 11; x++) p[(y * 20 + x) * 4 + 3] = 255;
  p[3] = 8;
  assert.deepEqual(analyzeAlpha(p, 20, 20, true), {
    x: 6,
    y: 5,
    width: 8,
    height: 8,
    hasCutout: true,
  });
  const b = analyzeAlpha(p, 20, 20, true),
    fit = fitSafeBounds(b.width, b.height, 432, 66 / 108);
  assert.ok(Math.hypot(fit.width, fit.height) <= 264 + 1e-10);
});
test("Android application snippet declares its android namespace", () => {
  const xml = planPackage({ targets: ["android"] }).text[
    "android/AndroidManifest-snippet.xml"
  ];
  assert.match(
    xml,
    /<application xmlns:android="http:\/\/schemas.android.com\/apk\/res\/android"/,
  );
});

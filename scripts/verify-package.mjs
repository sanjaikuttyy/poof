#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { inflateRawSync, inflateSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { planPackage } from "../public/js/exports/package.js";
import { crc32 } from "../public/js/exports/zip.js";
const LIMIT = 128 * 1024 * 1024;
function requireThat(condition, message) {
  if (!condition) throw Error(message);
}

/** Read, but never extract or execute, a bounded ordinary ZIP archive. */
export function readZip(input) {
  const b = Buffer.from(input);
  requireThat(
    b.length >= 22 && b.length <= LIMIT,
    "ZIP size is invalid (maximum 128 MB).",
  );
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (
      b.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + b.readUInt16LE(i + 20) === b.length
    ) {
      end = i;
      break;
    }
  requireThat(end >= 0, "ZIP end directory is missing.");
  const count = b.readUInt16LE(end + 10),
    start = b.readUInt32LE(end + 16),
    length = b.readUInt32LE(end + 12);
  requireThat(
    !b.readUInt16LE(end + 4) &&
      !b.readUInt16LE(end + 6) &&
      b.readUInt16LE(end + 8) === count,
    "Multi-disk ZIPs are unsupported.",
  );
  requireThat(
    count > 0 && count <= 1000 && start + length === end,
    "ZIP central directory is invalid.",
  );
  const files = new Map();
  let at = start,
    total = 0;
  for (let n = 0; n < count; n++) {
    requireThat(
      at + 46 <= end && b.readUInt32LE(at) === 0x02014b50,
      "Broken ZIP directory entry.",
    );
    const flags = b.readUInt16LE(at + 8),
      method = b.readUInt16LE(at + 10),
      crc = b.readUInt32LE(at + 16),
      compressed = b.readUInt32LE(at + 20),
      size = b.readUInt32LE(at + 24),
      nl = b.readUInt16LE(at + 28),
      xl = b.readUInt16LE(at + 30),
      cl = b.readUInt16LE(at + 32),
      local = b.readUInt32LE(at + 42);
    requireThat(
      at + 46 + nl + xl + cl <= end && !(flags & 1) && [0, 8].includes(method),
      "Unsupported or corrupt ZIP entry.",
    );
    const name = b.subarray(at + 46, at + 46 + nl).toString("utf8");
    requireThat(
      name &&
        !name.startsWith("/") &&
        !name.includes("\\") &&
        !name.includes("\0") &&
        !name.split("/").includes("..") &&
        !files.has(name),
      `Unsafe or duplicate ZIP path: ${name}`,
    );
    requireThat(
      size <= LIMIT && (total += size) <= LIMIT,
      "Expanded ZIP exceeds 128 MB.",
    );
    requireThat(
      local + 30 <= start && b.readUInt32LE(local) === 0x04034b50,
      "Missing ZIP local header.",
    );
    const lnl = b.readUInt16LE(local + 26),
      lxl = b.readUInt16LE(local + 28),
      dataAt = local + 30 + lnl + lxl;
    requireThat(
      dataAt + compressed <= start &&
        b.readUInt16LE(local + 8) === method &&
        b.subarray(local + 30, local + 30 + lnl).toString("utf8") === name,
      "ZIP local header differs from directory.",
    );
    const payload = b.subarray(dataAt, dataAt + compressed),
      data =
        method === 8
          ? inflateRawSync(payload, { maxOutputLength: LIMIT })
          : payload;
    requireThat(
      data.length === size && crc32(data) === crc,
      `ZIP integrity check failed: ${name}`,
    );
    files.set(name, data);
    at += 46 + nl + xl + cl;
  }
  requireThat(at === end, "Unexpected data in ZIP central directory.");
  return files;
}

/** Decode browser-exported non-interlaced 8-bit RGB/RGBA PNGs, including filter reconstruction. */
export function readPNG(input, name = "PNG") {
  const b = Buffer.from(input),
    signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  requireThat(
    b.length >= 45 && b.subarray(0, 8).equals(signature),
    `${name}: invalid PNG signature.`,
  );
  let at = 8,
    width,
    height,
    channels,
    ended = false;
  const idat = [];
  while (at + 12 <= b.length) {
    const len = b.readUInt32BE(at),
      type = b.toString("ascii", at + 4, at + 8);
    requireThat(
      len <= LIMIT && at + 12 + len <= b.length,
      `${name}: truncated ${type} chunk.`,
    );
    requireThat(
      crc32(b.subarray(at + 4, at + 8 + len)) === b.readUInt32BE(at + 8 + len),
      `${name}: ${type} CRC mismatch.`,
    );
    const d = b.subarray(at + 8, at + 8 + len);
    if (at === 8) requireThat(type === "IHDR", `${name}: IHDR must be first.`);
    if (type === "IHDR") {
      requireThat(!width && len === 13, `${name}: invalid IHDR.`);
      width = d.readUInt32BE(0);
      height = d.readUInt32BE(4);
      channels = d[9] === 2 ? 3 : d[9] === 6 ? 4 : 0;
      requireThat(
        width > 0 &&
          height > 0 &&
          width <= 8192 &&
          height <= 8192 &&
          d[8] === 8 &&
          channels &&
          d[10] === 0 &&
          d[11] === 0 &&
          d[12] === 0,
        `${name}: expected non-interlaced 8-bit RGB or RGBA PNG.`,
      );
    } else if (type === "IDAT") idat.push(d);
    else if (type === "IEND") {
      requireThat(len === 0, `${name}: invalid IEND.`);
      ended = true;
      at += 12;
      break;
    }
    at += 12 + len;
  }
  requireThat(
    ended && at === b.length && idat.length,
    `${name}: incomplete PNG.`,
  );
  const stride = width * channels,
    expected = height * (stride + 1);
  requireThat(expected <= LIMIT, `${name}: decoded pixels exceed limit.`);
  const raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expected });
  requireThat(raw.length === expected, `${name}: wrong pixel stream length.`);
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    requireThat(filter <= 4, `${name}: invalid PNG row filter.`);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0,
        up = y ? pixels[(y - 1) * stride + x] : 0,
        ul = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - ul,
          pa = Math.abs(p - left),
          pb = Math.abs(p - up),
          pc = Math.abs(p - ul);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
      }
      pixels[y * stride + x] =
        (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}

export function verifyPackage(bytes) {
  const files = readZip(bytes);
  const get = (name) => {
    requireThat(files.has(name), `Missing file: ${name}`);
    return files.get(name);
  };
  const json = (name) => {
    try {
      return JSON.parse(get(name).toString("utf8"));
    } catch (e) {
      throw Error(`${name}: ${e.message}`);
    }
  };
  const report = json("report.json");
  requireThat(report.version === 1, "Unsupported report version.");
  const plan = planPackage({ name: report.name, targets: report.targets });
  requireThat(
    report.fileCount === files.size,
    "Report file count does not match archive.",
  );
  const images = new Map();
  for (const spec of plan.images) {
    const image = readPNG(get(spec.name), spec.name);
    images.set(spec.name, image);
    requireThat(
      image.width === spec.size && image.height === spec.size,
      `${spec.name}: expected ${spec.size}×${spec.size}.`,
    );
    if (spec.name.startsWith("ios/") || spec.name.startsWith("macos/"))
      requireThat(
        image.channels === 3,
        `${spec.name}: Apple default raster must have no alpha channel.`,
      );
    if (spec.kind === "adaptive" || spec.kind === "monochrome") {
      requireThat(
        image.channels === 4,
        `${spec.name}: foreground requires alpha.`,
      );
      let visible = 0;
      for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++)
          if (image.pixels[(y * image.width + x) * 4 + 3] > 8) {
            visible++;
            requireThat(
              Math.hypot(
                x + 0.5 - image.width / 2,
                y + 0.5 - image.height / 2,
              ) <=
                (image.width * 33) / 108 + 1.5,
              `${spec.name}: artwork exceeds the safe circle.`,
            );
          }
      requireThat(visible > 0, `${spec.name}: foreground is empty.`);
    }
  }
  for (const platform of ["ios", "macos"])
    if (plan.targets.includes(platform)) {
      const dir = `${platform}/AppIcon.appiconset/`,
        catalog = json(dir + "Contents.json"),
        expected = JSON.parse(plan.text[dir + "Contents.json"]);
      requireThat(
        Array.isArray(catalog.images) &&
          catalog.images.length === expected.images.length,
        `${platform}: missing catalog slots.`,
      );
      for (const slot of expected.images) {
        const matches = catalog.images.filter(
          (x) =>
            x.idiom === slot.idiom &&
            x.size === slot.size &&
            x.scale === slot.scale,
        );
        requireThat(
          matches.length === 1 && matches[0].filename === slot.filename,
          `${platform}: invalid catalog slot ${slot.filename}.`,
        );
        get(dir + matches[0].filename);
      }
    }
  if (plan.targets.includes("android")) {
    for (const [path, text] of Object.entries(plan.text).filter(([n]) =>
      n.endsWith(".xml"),
    ))
      requireThat(
        get(path).toString("utf8") === text,
        `${path}: resource definition differs from supported package format.`,
      );
    const color = get("android/res/values/ic_launcher_background.xml").toString(
      "utf8",
    );
    requireThat(
      /<color name="ic_launcher_background">#[\da-f]{6}<\/color>/i.test(color),
      "Android background color resource is missing.",
    );
    const name = "android/play-store-512.png",
      play = images.get(name);
    requireThat(get(name).length <= 1024 * 1024, "Play icon exceeds 1024 KB.");
    requireThat(play.channels === 4, "Play icon must be 32-bit RGBA.");
    for (let i = 3; i < play.pixels.length; i += 4)
      requireThat(
        play.pixels[i] === 255,
        "Play icon contains transparent pixels.",
      );
  }
  if (plan.targets.includes("web")) {
    const manifest = json("web/site.webmanifest"),
      expected = JSON.parse(plan.text["web/site.webmanifest"]);
    for (const icon of expected.icons) {
      requireThat(
        manifest.icons?.some(
          (i) =>
            i.src === icon.src &&
            i.sizes === icon.sizes &&
            i.type === icon.type &&
            i.purpose === icon.purpose,
        ),
        `Web manifest is missing ${icon.src}.`,
      );
      get("web/" + icon.src);
    }
    const ico = get("web/favicon.ico");
    requireThat(
      ico.length >= 54 &&
        ico.readUInt16LE(0) === 0 &&
        ico.readUInt16LE(2) === 1 &&
        ico.readUInt16LE(4) === 3,
      "Invalid ICO directory.",
    );
    for (const [i, size] of [16, 32, 48].entries()) {
      const at = 6 + i * 16,
        length = ico.readUInt32LE(at + 8),
        offset = ico.readUInt32LE(at + 12);
      requireThat(
        ico[at] === size &&
          ico[at + 1] === size &&
          offset >= 54 &&
          offset + length <= ico.length,
        `Invalid ${size}px ICO entry.`,
      );
      requireThat(
        ico
          .subarray(offset, offset + length)
          .equals(get(`web/favicon-${size}.png`)),
        `ICO ${size}px payload differs from its PNG.`,
      );
    }
    get("web/head-snippet.html");
  }
  json("recipe.json");
  readPNG(get("source.png"), "source.png");
  if (files.has("custom-monochrome.png"))
    readPNG(get("custom-monochrome.png"), "custom-monochrome.png");
  get("README.txt");
  return {
    files: files.size,
    renderedPNGs: images.size,
    targets: plan.targets,
    warnings: Array.isArray(report.warnings) ? report.warnings : [],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    requireThat(
      process.argv.length === 3,
      "Usage: npm run verify -- /path/to/app-icons.zip",
    );
    const result = verifyPackage(await readFile(process.argv[2]));
    console.log(
      `PASS: ${result.files} files; ${result.renderedPNGs} PNGs; ${result.targets.join(", ")}.`,
    );
    console.log(
      "Archive integrity, pixel streams, dimensions, resource references and supported format checks passed.",
    );
    for (const warning of result.warnings) console.log(`REVIEW: ${warning}`);
    console.log(
      "This does not compile native apps, assess artwork quality or guarantee store acceptance.",
    );
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exitCode = 1;
  }
}

import { normalize, svg, decode, toBlob } from "../studio/render.js";

export function sanitizeName(value = "My app") {
  return (
    String(value)
      .normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f<>]/g, "")
      .trim()
      .slice(0, 80) || "My app"
  );
}
export function validateMonochromeDataURL(value) {
  if (
    typeof value !== "string" ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ||
    value.length > 14 * 1024 * 1024
  )
    throw Error("Choose a transparent monochrome PNG smaller than 10 MB.");
  const encoded = value.slice(22);
  const byteLength =
    (encoded.length * 3) / 4 -
    (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  if (byteLength > 10 * 1024 * 1024)
    throw Error("Choose a transparent monochrome PNG smaller than 10 MB.");
  if (encoded.length % 4 || !encoded.startsWith("iVBORw0KGgo"))
    throw Error("The monochrome file must be a valid PNG.");
}
/** Bounds include a two-pixel sampling margin; only non-negligible alpha defines shape. */
export function analyzeAlpha(pixels, width, height, requireCutout = false) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    pixels.length !== width * height * 4
  )
    throw Error("Invalid alpha pixels.");
  let translucent = 0,
    clear = 0,
    minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const a = pixels[(y * width + x) * 4 + 3];
      if (a < 250) translucent++;
      if (a <= 8) clear++;
      if (a > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  if (maxX < 0)
    throw Error(
      requireCutout
        ? "The monochrome PNG is empty or too faint. Choose a visible mark on a transparent background."
        : "The source image is fully transparent or too faint. Choose visible artwork.",
    );
  if (requireCutout && clear <= width * height * 0.01)
    throw Error(
      "The monochrome PNG needs a transparent background around its mark. An opaque or uniformly translucent image becomes a solid themed icon.",
    );
  minX = Math.max(0, minX - 2);
  minY = Math.max(0, minY - 2);
  maxX = Math.min(width - 1, maxX + 2);
  maxY = Math.min(height - 1, maxY + 2);
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    hasCutout: translucent > width * height * 0.01,
  };
}
export function fitSafeBounds(width, height, size, diameter) {
  if (
    ![width, height, size, diameter].every(
      (x) => Number.isFinite(x) && x > 0,
    ) ||
    diameter > 1
  )
    throw Error("Invalid safe bounds.");
  const scale = (size * diameter) / Math.hypot(width, height);
  return {
    width: width * scale,
    height: height * scale,
    x: (size - width * scale) / 2,
    y: (size - height * scale) / 2,
  };
}
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const APPLE_INFO = { version: 1, author: "xcode" };
export const SAFE = Object.freeze({
  android: 66 / (108 * Math.SQRT2),
  maskable: 0.8 / Math.SQRT2,
});

/** Pure output plan; every pixel size is explicit and independent of preview controls. */
export function planPackage({
  name = "My app",
  targets = ["ios", "android", "web"],
} = {}) {
  if (
    !Array.isArray(targets) ||
    !targets.length ||
    targets.some((x) => !["ios", "android", "web", "macos"].includes(x))
  )
    throw Error("Select iOS, Android, web, or macOS.");
  const plan = {
    name: sanitizeName(name),
    targets: [...new Set(targets)],
    images: [],
    text: {},
  };
  const add = (name, size, kind = "normal") =>
    plan.images.push({ name, size, kind });
  const apple = (platform, slots) => {
    const dir = `${platform}/AppIcon.appiconset`;
    const images = slots.map(([idiom, pt, scale]) => {
      const filename = `icon-${idiom}-${pt}@${scale}x.png`;
      add(`${dir}/${filename}`, pt * scale);
      return { idiom, size: `${pt}x${pt}`, scale: `${scale}x`, filename };
    });
    plan.text[`${dir}/Contents.json`] = json({ images, info: APPLE_INFO });
  };
  if (plan.targets.includes("ios")) {
    const slots = [];
    for (const pt of [20, 29, 40, 60])
      for (const scale of [2, 3]) slots.push(["iphone", pt, scale]);
    for (const pt of [20, 29, 40, 76])
      for (const scale of [1, 2]) slots.push(["ipad", pt, scale]);
    slots.push(["ipad", 83.5, 2], ["ios-marketing", 1024, 1]);
    apple("ios", slots);
  }
  if (plan.targets.includes("macos"))
    apple(
      "macos",
      [16, 32, 128, 256, 512].flatMap((pt) =>
        [1, 2].map((scale) => ["mac", pt, scale]),
      ),
    );
  if (plan.targets.includes("android")) {
    for (const [density, scale] of [
      ["mdpi", 1],
      ["hdpi", 1.5],
      ["xhdpi", 2],
      ["xxhdpi", 3],
      ["xxxhdpi", 4],
    ]) {
      add(`android/res/mipmap-${density}/ic_launcher.png`, 48 * scale);
      add(
        `android/res/mipmap-${density}/ic_launcher_round.png`,
        48 * scale,
        "round",
      );
      add(
        `android/res/drawable-${density}/ic_launcher_foreground.png`,
        108 * scale,
        "adaptive",
      );
      add(
        `android/res/drawable-${density}/ic_launcher_monochrome.png`,
        108 * scale,
        "monochrome",
      );
    }
    const adaptive = (mono) =>
      `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_background" />\n  <foreground android:drawable="@drawable/ic_launcher_foreground" />\n${mono ? '  <monochrome android:drawable="@drawable/ic_launcher_monochrome" />\n' : ""}</adaptive-icon>\n`;
    for (const variant of ["ic_launcher", "ic_launcher_round"])
      for (const version of [26, 33])
        plan.text[`android/res/mipmap-anydpi-v${version}/${variant}.xml`] =
          adaptive(version === 33);
    add("android/play-store-512.png", 512, "store");
    plan.text["android/AndroidManifest-snippet.xml"] =
      '<!-- Merge these attributes into your existing <application> element. -->\n<application xmlns:android="http://schemas.android.com/apk/res/android" android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round" />\n';
  }
  if (plan.targets.includes("web")) {
    for (const size of [16, 32, 48]) add(`web/favicon-${size}.png`, size);
    add("web/apple-touch-icon.png", 180);
    for (const size of [192, 512]) {
      add(`web/icon-${size}.png`, size);
      add(`web/icon-maskable-${size}.png`, size, "maskable");
    }
    plan.text["web/site.webmanifest"] = json({
      name: plan.name,
      short_name: plan.name.slice(0, 24),
      start_url: "./",
      scope: "./",
      display: "standalone",
      icons: [192, 512].flatMap((size) => [
        {
          src: `icon-${size}.png`,
          sizes: `${size}x${size}`,
          type: "image/png",
          purpose: "any",
        },
        {
          src: `icon-maskable-${size}.png`,
          sizes: `${size}x${size}`,
          type: "image/png",
          purpose: "maskable",
        },
      ]),
    });
    plan.text["web/head-snippet.html"] =
      '<!-- Place these files at your app root, or update the paths below. -->\n<link rel="icon" href="./favicon.ico" sizes="16x16 32x32 48x48">\n<link rel="icon" type="image/png" sizes="32x32" href="./favicon-32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="./favicon-16.png">\n<link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png">\n<link rel="manifest" href="./site.webmanifest">\n';
  }
  return plan;
}

/** ICO with PNG payloads (supported by modern browsers and Windows Vista+). */
export function encodeICO(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 256)
    throw Error("ICO needs 1–256 images.");
  const header = new Uint8Array(6 + entries.length * 16),
    view = new DataView(header.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);
  let offset = header.length;
  const payloads = entries.map(({ size, bytes }, i) => {
    if (
      !Number.isInteger(size) ||
      size < 1 ||
      size > 256 ||
      !(bytes instanceof Uint8Array) ||
      bytes.length < 24 ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((v, k) => bytes[k] === v)
    )
      throw Error("ICO entries must contain square PNG bytes sized 1–256.");
    const png = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (png.getUint32(16) !== size || png.getUint32(20) !== size)
      throw Error("ICO PNG dimensions do not match its directory entry.");
    const at = 6 + i * 16;
    header[at] = header[at + 1] = size === 256 ? 0 : size;
    view.setUint16(at + 4, 1, true);
    view.setUint16(at + 6, 32, true);
    view.setUint32(at + 8, bytes.length, true);
    view.setUint32(at + 12, offset, true);
    offset += bytes.length;
    return bytes;
  });
  return new Blob([header, ...payloads], { type: "image/x-icon" });
}

function canvas(size, opaque = false) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d", { alpha: !opaque });
  if (!ctx) throw Error("Canvas is unavailable in this browser.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return [c, ctx];
}
function blob(c) {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (value) =>
        value ? resolve(value) : reject(Error("Could not encode an icon PNG.")),
      "image/png",
    ),
  );
}
async function composition(image, recipe, small = false) {
  // The SVG viewBox stays at 1024. Small variants omit decorative occasion marks.
  const xml = svg(image, { ...recipe, size: small ? 64 : 1024 }, false).replace(
    /width="\d+" height="\d+"/,
    'width="1024" height="1024"',
  );
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
  try {
    return await decode(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function buildPackage(imageDataURL, recipe = {}, options = {}) {
  if (
    typeof imageDataURL !== "string" ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(imageDataURL)
  )
    throw Error("A local raster image is required.");
  const plan = planPackage(options),
    config = normalize(recipe);
  const source = await decode(imageDataURL);
  const [normal, small] = await Promise.all([
    composition(imageDataURL, config),
    composition(imageDataURL, config, true),
  ]);
  const files = [],
    rendered = new Map();
  // Derive independent bounds so a supplied monochrome mark is never framed by the mascot.
  function measure(image, required = false) {
    const [, ctx] = canvas(256);
    ctx.drawImage(image, 0, 0, 256, 256);
    const measured = analyzeAlpha(
      ctx.getImageData(0, 0, 256, 256).data,
      256,
      256,
      required,
    );
    return {
      ...measured,
      x: (measured.x / 256) * image.naturalWidth,
      y: (measured.y / 256) * image.naturalHeight,
      width: (measured.width / 256) * image.naturalWidth,
      height: (measured.height / 256) * image.naturalHeight,
    };
  }
  const bounds = measure(source),
    hasCutout = bounds.hasCutout;
  let monochromeSource = null,
    monochromeBounds = null;
  if (options.monochromeImage != null) {
    validateMonochromeDataURL(options.monochromeImage);
    try {
      monochromeSource = await decode(options.monochromeImage);
    } catch {
      throw Error(
        "The monochrome PNG could not be read. Choose a valid transparent PNG.",
      );
    }
    if (
      monochromeSource.naturalWidth > 8192 ||
      monochromeSource.naturalHeight > 8192
    )
      throw Error(
        "Choose a monochrome PNG no larger than 8192 pixels per side.",
      );
    monochromeBounds = measure(monochromeSource, true);
    files.push({
      name: "custom-monochrome.png",
      data: toBlob(options.monochromeImage),
    });
  }
  function drawCutout(ctx, size, diameter, image = source, box = bounds) {
    const fit = fitSafeBounds(box.width, box.height, size, diameter);
    ctx.drawImage(
      image,
      box.x,
      box.y,
      box.width,
      box.height,
      fit.x,
      fit.y,
      fit.width,
      fit.height,
    );
  }
  for (const spec of plan.images) {
    const { name, size, kind } = spec,
      cacheKey = `${size}:${kind}`;
    let data = rendered.get(cacheKey);
    if (!data) {
      const [c, ctx] = canvas(
        size,
        !["round", "adaptive", "monochrome", "store"].includes(kind),
      );
      const art = size <= 64 ? small : normal;
      if (kind === "adaptive" || kind === "monochrome") {
        const edge = size * SAFE.android,
          left = (size - edge) / 2;
        if (kind === "monochrome" && monochromeSource)
          drawCutout(ctx, size, 66 / 108, monochromeSource, monochromeBounds);
        else if (hasCutout) drawCutout(ctx, size, 66 / 108);
        else
          ctx.drawImage(
            kind === "monochrome" ? source : art,
            left,
            left,
            edge,
            edge,
          );
        if (kind === "monochrome") {
          ctx.globalCompositeOperation = "source-in";
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size, size);
        }
      } else if (kind === "maskable") {
        ctx.fillStyle = config.color;
        ctx.fillRect(0, 0, size, size);
        if (hasCutout) drawCutout(ctx, size, 0.8);
        else {
          const edge = size * SAFE.maskable;
          ctx.drawImage(art, (size - edge) / 2, (size - edge) / 2, edge, edge);
        }
      } else {
        if (kind === "round") {
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
          ctx.clip();
        }
        ctx.drawImage(art, 0, 0, size, size);
      }
      data = await blob(c);
      rendered.set(cacheKey, data);
    }
    files.push({ name, data });
  }
  if (plan.targets.includes("android"))
    plan.text["android/res/values/ic_launcher_background.xml"] =
      `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">${config.color}</color></resources>\n`;
  if (plan.targets.includes("web")) {
    const entries = [];
    for (const size of [16, 32, 48])
      entries.push({
        size,
        bytes: new Uint8Array(
          await rendered.get(`${size}:normal`).arrayBuffer(),
        ),
      });
    files.push({ name: "web/favicon.ico", data: encodeICO(entries) });
    const manifest = JSON.parse(plan.text["web/site.webmanifest"]);
    manifest.background_color = manifest.theme_color = config.color;
    plan.text["web/site.webmanifest"] = json(manifest);
  }
  for (const [name, data] of Object.entries(plan.text))
    files.push({ name, data });
  const sourceWidth =
    Number.isFinite(options.sourceWidth) && options.sourceWidth > 0
      ? options.sourceWidth
      : source.naturalWidth;
  const sourceHeight =
    Number.isFinite(options.sourceHeight) && options.sourceHeight > 0
      ? options.sourceHeight
      : source.naturalHeight;
  const warnings = [];
  if (Math.min(sourceWidth, sourceHeight) < 1024)
    warnings.push(
      `Source is ${sourceWidth}×${sourceHeight}; larger exports resample existing pixels and do not add detail.`,
    );
  if (plan.targets.includes("android"))
    warnings.push(
      hasCutout
        ? "Adaptive icons center the source alpha bounds inside the 66dp safe circle, with a solid background. They intentionally use the full source character rather than the selected cropped composition."
        : "Adaptive foreground uses an inset flattened composition because the source has no meaningful transparency. Its full square fits inside the central 66dp safe circle; it is intentionally smaller than the legacy icon.",
    );
  if (plan.targets.includes("android"))
    warnings.push(
      monochromeSource
        ? "Themed icons use your custom monochrome PNG alpha, independently centered inside the 66dp safe circle and converted to white. Source alpha controls visibility; RGB colors do not. Review the result on a themed launcher."
        : "Themed icons use the source alpha silhouette, without facial detail. Supply a custom monochrome PNG for a designed mark and review themed icons on a device.",
    );
  if (plan.targets.includes("android") && !hasCutout && !monochromeSource)
    warnings.push(
      "Source has little or no transparency: the monochrome layer may appear as a solid square. Replace it with a designed transparent silhouette before shipping.",
    );
  if (plan.targets.includes("web"))
    warnings.push(
      hasCutout
        ? "Maskable icons center the full source alpha bounds inside the 40%-radius safe circle on a solid background. They do not preserve the selected peek crop or gradient."
        : "Maskable icons inset the flattened composition inside the 40%-radius safe circle because the source is opaque. This preserves every corner but creates extra visual margin.",
    );
  const playStore = files.find((f) => f.name === "android/play-store-512.png");
  if (playStore && playStore.data.size > 1024 * 1024)
    warnings.push(
      "Play Store PNG exceeds 1024 KB. Optimize its PNG compression before submission.",
    );
  if (plan.targets.some((t) => ["ios", "macos"].includes(t)))
    warnings.push(
      "Raster catalogs contain static default appearances. No Apple Icon Composer document, dark/tinted appearance, or device-build verification is included.",
    );
  const report = {
    version: 1,
    name: plan.name,
    targets: plan.targets,
    source: { width: sourceWidth, height: sourceHeight },
    images: plan.images,
    previews: plan.images
      .filter((f) =>
        [
          "android/res/drawable-xxxhdpi/ic_launcher_foreground.png",
          "android/res/drawable-xxxhdpi/ic_launcher_monochrome.png",
          "android/play-store-512.png",
          "web/icon-maskable-512.png",
          "ios/AppIcon.appiconset/icon-ios-marketing-1024@1x.png",
        ].includes(f.name),
      )
      .map((f) => f.name),
    sourceHasCutout: hasCutout,
    monochrome: monochromeSource ? "custom-alpha" : "source-alpha",
    fileCount: files.length + 4,
    warnings,
    validation: {
      pngEncoding:
        "Browser canvas PNG encoding completed at the planned dimensions.",
      playStoreBytes: playStore?.data.size ?? null,
      playStoreWithin1024KB: playStore
        ? playStore.data.size <= 1024 * 1024
        : null,
      deviceBuild: "Not performed",
      storeSubmission: "Not performed",
    },
    references: [
      "https://developer.apple.com/documentation/xcode/configuring-your-app-icon",
      "https://developer.apple.com/library/archive/qa/qa1686/_index.html",
      "https://developer.android.com/develop/ui/views/launch/icon_design_adaptive",
      "https://www.w3.org/TR/appmanifest/#icon-masks",
    ],
  };
  files.push(
    { name: "source.png", data: toBlob(imageDataURL) },
    { name: "recipe.json", data: json({ version: 1, ...config }) },
    { name: "report.json", data: json(report) },
    { name: "README.txt", data: instructions(plan, report) },
  );
  return { files, report };
}
function instructions(plan, report) {
  return `POOF ICON PACKAGE — ${plan.name}\n\nOnly the selected targets are included: ${plan.targets.join(", ")}.\n\n${plan.targets.includes("ios") ? "iOS / iPadOS\nCopy ios/AppIcon.appiconset into your existing Assets.xcassets, replacing the existing AppIcon set after backing it up. In the app target, set App Icons Source to AppIcon. The catalog includes classic iPhone/iPad slots plus the opaque 1024px marketing image. Do not add rounded corners; the OS applies its mask. Build and inspect in Xcode.\n\n" : ""}${plan.targets.includes("macos") ? "macOS\nCopy macos/AppIcon.appiconset into the macOS target asset catalog, then set App Icons Source to AppIcon. This is a separate raster catalog; do not merge its Contents.json into the iOS catalog.\n\n" : ""}${plan.targets.includes("android") ? "Android\nCopy android/res/* into app/src/main/res/, merging folders and replacing only the ic_launcher resources after backup. If your project uses another icon name, update the application icon attributes using AndroidManifest-snippet.xml. Use compileSdk 33 or newer for the monochrome element. Density-specific legacy and round icons cover mdpi through xxxhdpi; v26 adaptive resources use a solid color background and transparent 108dp foreground; v33 adds monochrome. play-store-512.png is for the store listing, not a launcher resource. Inspect square, circle, squircle, and themed launcher appearances in Android Studio/on devices before release.\n\n" : ""}${plan.targets.includes("web") ? "Web / PWA\nCopy the files in web/ (except head-snippet.html) to your app public root and merge head-snippet.html into <head>. If installed under a subdirectory, adjust icon paths and manifest start_url/scope. Merge site.webmanifest with your existing manifest instead of discarding app-specific settings. PNG-backed favicon.ico contains 16, 32, and 48px entries for modern browsers. The manifest references distinct any and maskable 192/512 icons. Icons alone do not implement offline support or guarantee PWA installability.\n\n" : ""}ARTWORK AND LIMITS\n${report.warnings.map((x) => "- " + x).join("\n")}\n\nreport.json lists every generated PNG and target size. recipe.json captures the layout. This export does not alter your project or upload files. Review small icons for readability and simplify detailed artwork where needed.\n\nSPECIFICATION REFERENCES\n${report.references.join("\n")}\n`;
}

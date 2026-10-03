import { downloadLink } from "./download-link.js";
import { svg, png, dataURL, decode, normalize } from "../studio/render.js";
import { buildPackage, sanitizeName } from "./package.js";
import { zip } from "./zip.js";

export function initExport({ getState, notify, onEdit }) {
  const dialog = document.createElement("dialog");
  dialog.id = "package-dialog";
  dialog.setAttribute("aria-labelledby", "package-title");
  dialog.innerHTML = `
    <form method="dialog"><button class="close" aria-label="Close app package">×</button></form>
    <p class="eyebrow">THE LAST MILE, TAKEN CARE OF</p>
    <h2 id="package-title">One icon. <em>Ready to ship.</em></h2>
    <p class="package-lede">The right sizes, the right filenames, and instructions that get you into your app.</p>
    <div class="package-layout">
      <div class="package-summary">
        <div id="package-art"></div>
        <p class="package-caption">Your selected layout · static exports</p>
        <div id="package-tiny" aria-label="Actual size previews"></div>
        <div class="package-source" id="package-source"></div>
        <a class="text-button" href="#studio" id="package-edit">Adjust in Studio ↗</a>
      </div>
      <div class="package-options">
        <label class="field-label" for="package-name">App name</label>
        <input id="package-name" maxlength="60" autocomplete="off" placeholder="My app" />
        <fieldset class="package-targets"><legend>Where are you shipping?</legend>
          <label><input type="checkbox" value="ios" checked/><span><strong>Apple</strong><small>iPhone, iPad & macOS asset catalogs</small></span><span class="target-type">XCODE</span></label>
          <label><input type="checkbox" value="android" checked/><span><strong>Android</strong><small>Adaptive, themed & legacy icons · Play listing</small></span><span class="target-type">RES</span></label>
          <label><input type="checkbox" value="web" checked/><span><strong>Web</strong><small>Favicon ICO, Apple touch & PWA icons</small></span><span class="target-type">WEB</span></label>
        </fieldset>
        <p class="package-note">Android and maskable web icons get a separate, centered safe frame. Your selected layout stays in the standard icons.</p>
        <details class="package-override"><summary>Custom themed icon <span>Optional</span></summary><p class="fine">Have a simplified mark for Android? Upload a transparent PNG. Its alpha shapes become the themed icon; cut out details you want to show through.</p><input type="file" id="monochrome-upload" accept="image/png" aria-label="Custom monochrome PNG" /><button type="button" class="text-button" id="clear-monochrome" hidden>Use automatic silhouette</button></details>
        <p id="package-error" role="alert" hidden></p>
        <button class="primary" id="build-package">Build my app package →</button>
        <p class="fine package-local">Made locally in your browser. No API key. No upload.</p>
      </div>
    </div>
    <section id="package-ready" hidden aria-live="polite">
      <div class="package-ready-heading"><div><p class="eyebrow">PACKED & CHECKED</p><h3 id="package-count">Your package is ready.</h3></div><div class="package-finish-actions"><button class="secondary" id="package-back">Change options</button><a class="primary compact" id="save-package" download="app-icons.zip">Download ZIP ↓</a></div></div>
      <p id="package-checks" class="fine"></p>
      <div id="package-platform-previews"></div>
      <details id="package-notes"><summary>Framing & release notes</summary><ul id="package-warnings"></ul></details>
      <details><summary>See the files inside</summary><pre id="package-files"></pre></details>
      <div class="install-guides">
        <details data-guide="ios"><summary>Install in Xcode <span>01</span></summary><p>Follow README.txt in the package. Drag the iOS AppIcon.appiconset into Assets.xcassets, replacing the existing AppIcon. Select AppIcon as the target’s app icon source. The macOS catalog is separate.</p><p>These are static image catalogs. Layered Icon Composer artwork and custom dark / tinted variants need separate design work.</p></details>
        <details data-guide="android"><summary>Install in Android Studio <span>02</span></summary><p>Merge android/res into app/src/main/res. Use the included manifest snippet for your application’s icon attributes. Build and inspect both themed and unthemed icons on a device. A monochrome silhouette cannot preserve every facial detail.</p></details>
        <details data-guide="web"><summary>Install on the web <span>03</span></summary><p>Copy the web assets into your public directory. Merge the supplied head tags into your HTML and icon entries into your existing manifest. Match URLs to your deployment path; review app name, start URL and scope before publishing.</p><p>Still seeing your old icon? Test in a private window, clear the favicon cache, and reinstall the PWA. Check that your server serves the new files.</p></details>
      </div>
    </section>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s);
  let snapshot,
    archive,
    revision = 0,
    busy = false,
    archiveURL,
    customMonochrome = null;

  $("#package-back").onclick = () => {
    dialog.classList.remove("is-ready");
    $("#package-ready").hidden = true;
    dialog.scrollTop = 0;
  };
  function invalidate() {
    dialog.classList.remove("is-ready");
    archive = null;
    if (archiveURL) URL.revokeObjectURL(archiveURL);
    archiveURL = null;
    $("#save-package").removeAttribute("href");
    $("#package-error").hidden = true;
    $("#package-ready").hidden = true;
    $("#build-package").textContent = "Build my app package →";
  }
  $("#package-name").oninput = invalidate;
  dialog
    .querySelectorAll(".package-targets input")
    .forEach((el) => (el.onchange = invalidate));
  $("#package-edit").onclick = (e) => {
    e.preventDefault();
    dialog.close();
    onEdit(snapshot.recipe);
  };
  function fail(message) {
    $("#package-error").textContent = message;
    $("#package-error").hidden = false;
    notify(message);
  }
  $("#monochrome-upload").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.type !== "image/png" || file.size > 10 * 1024 * 1024)
        throw Error("Choose a transparent PNG smaller than 10 MB.");
      const url = await dataURL(file),
        img = await decode(url);
      if (img.width > 8192 || img.height > 8192)
        throw Error("Choose a PNG no larger than 8192 pixels per side.");
      customMonochrome = url;
      $("#clear-monochrome").hidden = false;
      invalidate();
    } catch (e) {
      fail(e.message);
    }
  };
  $("#clear-monochrome").onclick = () => {
    customMonochrome = null;
    $("#monochrome-upload").value = "";
    $("#clear-monochrome").hidden = true;
    invalidate();
  };
  $("#build-package").onclick = async () => {
    if (busy) return;
    const targets = [
      ...dialog.querySelectorAll(".package-targets input:checked"),
    ].flatMap((el) => (el.value === "ios" ? ["ios", "macos"] : [el.value]));
    if (!targets.length) {
      fail("Choose at least one platform for your package.");
      return;
    }
    busy = true;
    $("#package-error").hidden = true;
    $("#clear-monochrome").disabled = true;
    const current = revision;
    dialog
      .querySelectorAll(".package-options input")
      .forEach((el) => (el.disabled = true));
    $("#build-package").disabled = true;
    $("#build-package").textContent = "Rendering & checking files…";
    try {
      const result = await buildPackage(snapshot.image, snapshot.recipe, {
        name: $("#package-name").value || "My app",
        targets,
        sourceWidth: snapshot.width,
        sourceHeight: snapshot.height,
        monochromeImage: customMonochrome,
      });
      const packed = await zip(
        Object.fromEntries(result.files.map((f) => [f.name, f.data])),
      );
      if (current !== revision) return;
      archive = packed;
      if (archiveURL) URL.revokeObjectURL(archiveURL);
      archiveURL = await downloadLink(packed, "poof-app-icons.zip");
      $("#save-package").href = archiveURL;
      $("#save-package").download =
        (sanitizeName($("#package-name").value)
          .replace(/[^a-z0-9_-]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "poof") + "-app-icons.zip";
      $("#package-count").textContent =
        `${result.files.length} files. One handoff.`;
      $("#package-checks").textContent =
        `${archive.size < 1048576 ? Math.max(1, Math.round(archive.size / 1024)) + " KB" : (archive.size / 1048576).toFixed(1) + " MB"} ZIP · Source artwork, recipe and installation guide included. ${targets.some((t) => t !== "web") ? "Test native builds in your project." : "Review manifest paths before publishing."}`;
      const warnings = result.report.warnings || [];
      $("#package-notes").open =
        Math.min(snapshot.width, snapshot.height) < 1024 ||
        !result.report.sourceHasCutout ||
        result.report.validation.playStoreWithin1024KB === false;
      $("#package-warnings").replaceChildren(
        ...warnings.map((w) => {
          const li = document.createElement("li");
          li.textContent = typeof w === "string" ? w : JSON.stringify(w);
          return li;
        }),
      );
      $("#package-files").textContent = result.files
        .map((f) => f.name)
        .join("\n");
      const previews = [];
      for (const path of result.report.previews || []) {
        const file = result.files.find((f) => f.name === path);
        if (!file) continue;
        const figure = document.createElement("figure"),
          img = document.createElement("img"),
          caption = document.createElement("figcaption");
        img.src = await dataURL(file.data);
        const mono = path.includes("monochrome"),
          adaptive = path.includes("foreground"),
          maskable = path.includes("maskable");
        caption.textContent = mono
          ? "Android · themed silhouette"
          : adaptive
            ? "Android · adaptive layer"
            : maskable
              ? "Web · maskable"
              : path.includes("ios/")
                ? "Apple · 1024 master"
                : "Google Play";
        img.alt = caption.textContent;
        if (adaptive || mono) {
          const mask = document.createElement("div");
          mask.className = "adaptive-mask";
          mask.style.background = snapshot.recipe.color;
          img.style.width = "150%";
          img.style.height = "150%";
          mask.append(img);
          figure.append(mask);
        } else {
          img.className = maskable ? "maskable-preview" : "standard-preview";
          figure.append(img);
        }
        figure.append(caption);
        previews.push(figure);
      }
      $("#package-platform-previews").replaceChildren(...previews);
      dialog
        .querySelectorAll("[data-guide]")
        .forEach((el) => (el.hidden = !targets.includes(el.dataset.guide)));
      $("#package-ready").hidden = false;
      $("#build-package").textContent = "Package ready ✓";
      dialog.classList.add("is-ready");
      dialog.scrollTop = 0;
      notify(
        "Your package is ready. Review the previews and download the ZIP.",
      );
    } catch (e) {
      fail(e.message || "Package export failed. Please retry.");
      $("#build-package").textContent = "Try building again →";
    } finally {
      busy = false;
      $("#clear-monochrome").disabled = false;
      dialog
        .querySelectorAll(".package-options input")
        .forEach((el) => (el.disabled = false));
      $("#build-package").disabled = false;
    }
  };
  return {
    async open(recipe) {
      if (busy) {
        dialog.showModal();
        return;
      }
      const s = getState();
      if (!(s.result || s.source)) {
        notify("Choose your artwork first.");
        return;
      }
      const current = ++revision;
      customMonochrome = null;
      $(".package-override").open = false;
      $("#monochrome-upload").value = "";
      $("#clear-monochrome").hidden = true;
      snapshot = {
        image: s.result || s.source,
        recipe: normalize(recipe || s.recipe),
        width: s.resultWidth || s.sourceWidth,
        height: s.resultHeight || s.sourceHeight,
      };
      invalidate();
      $("#package-name").value = s.name.replace(/\.[^.]+$/, "").slice(0, 60);
      $("#package-art").innerHTML = svg(snapshot.image, snapshot.recipe, false);
      $("#package-source").textContent = snapshot.width
        ? `${snapshot.width} × ${snapshot.height} source pixels${Math.min(snapshot.width, snapshot.height) < 1024 ? " · Below the recommended 1024 px. Exporting larger won’t restore detail." : ""}`
        : "Source resolution unavailable. Review sharpness at full size.";
      $("#package-tiny").replaceChildren();
      dialog.showModal();
      dialog.scrollTop = 0;
      for (const size of [16, 32, 64]) {
        const src = await dataURL(
          await png(snapshot.image, { ...snapshot.recipe, size }),
        );
        if (current !== revision) return;
        const wrap = document.createElement("div"),
          img = document.createElement("img"),
          label = document.createElement("span");
        img.src = src;
        img.width = img.height = size;
        img.alt = `${size} pixel icon`;
        label.textContent = `${size} px`;
        wrap.append(img, label);
        $("#package-tiny").append(wrap);
      }
    },
  };
}

import {
  presets,
  defaults,
  normalize,
  svg,
  png,
  decode,
  download,
  dataURL,
  toBlob,
} from "./studio/render.js";
import { zip } from "./exports/zip.js";
import { buildCodexKit } from "./integrations/codex-kit.js";
import { downloadLink } from "./exports/download-link.js";
import { watchServer } from "./integrations/server-status.js";
import { initExport } from "./exports/ui.js";
import { initPlush } from "./plush/playground.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const state = {
  source: null,
  result: null,
  name: "Your icon",
  demo: false,
  mode: "fur",
  material: "fur",
  key: "",
  recipe: { ...defaults },
  busy: false,
  editing: false,
};
let abort,
  noticeTimer,
  pendingGeneration = false,
  galleryVersion = 0,
  studioVersion = 0,
  inputVersion = 0;
const studioImage = () => state.result || state.source;
const exporter = initExport({
  getState: () => state,
  onEdit: (recipe) => {
    state.recipe = recipe;
    syncControls();
    location.hash = "studio";
    updateStudio().catch((e) => notice(e.message));
  },
  notify: (...args) => notice(...args),
});
const playground = initPlush({
  getState: () => state,
  onUseOriginal: () => useOriginal(),
});
let looks = [];
function rememberLook(image, label, width = 1024, height = 1024) {
  if (!looks.some((l) => l.image === image))
    looks.push({ image, label, width, height });
  looks = looks.slice(-8);
  const area = $("#look-history");
  area.replaceChildren();
  if (!looks.length) return;
  const caption = document.createElement("p");
  caption.textContent = "Your looks · this session";
  area.append(caption);
  looks.forEach((look) => {
    const b = document.createElement("button"),
      img = document.createElement("img");
    img.src = look.image;
    img.alt = look.label;
    b.title = look.label;
    b.append(img);
    b.onclick = safe(async () => {
      if (state.busy) return;
      state.result = look.image;
      state.resultWidth = look.width;
      state.resultHeight = look.height;
      state.label = look.label;
      state.editing = false;
      await showResults();
    });
    area.append(b);
  });
}
async function useOriginal() {
  if (state.busy) return;
  state.result = state.source;
  state.resultWidth = state.sourceWidth;
  state.resultHeight = state.sourceHeight;
  state.label = "ORIGINAL ARTWORK · LOCAL LAYOUTS";
  state.editing = false;
  await showResults();
  if (location.hash === "#studio") await updateStudio();
}
function notice(message, sticky = false) {
  clearTimeout(noticeTimer);
  if ($("#connection").open) $("#connection-status").textContent = message;
  $("#status").textContent = message;
  $("#status").hidden = false;
  if (!sticky)
    noticeTimer = setTimeout(() => ($("#status").hidden = true), 6500);
}
function safe(fn) {
  return async (...a) => {
    try {
      await fn(...a);
    } catch (e) {
      notice(e.message || "Something went wrong. Please try again.");
    }
  };
}
async function asset(path) {
  const r = await fetch(path);
  if (!r.ok) throw Error("Could not load the example.");
  return dataURL(await r.blob());
}
async function sample() {
  if (state.busy) return;
  const revision = ++inputVersion;
  const [source, result] = await Promise.all([
    asset("/assets/pogo-original.png"),
    asset("/assets/pogo-plush.png"),
  ]);
  if (revision !== inputVersion) return;
  state.source = source;
  state.result = result;
  state.sourceWidth =
    state.sourceHeight =
    state.resultWidth =
    state.resultHeight =
      1024;
  state.recipe = { ...defaults };
  looks = [];
  rememberLook(result, "Pogo plush · example");
  playground.reset();
  state.label = "POGO · PRE-MADE EXAMPLE";
  state.editing = false;
  state.name = "Pogo";
  state.material = "fur";
  state.demo = true;
  state.mode = "fur";
  selectMode("fur");
  showSource();
  await showResults();
}
function showSource() {
  playground.refresh();
  $("#source-image").src = state.source;
  $("#source-name").textContent = state.name;
  route();
}
function route() {
  const studio = location.hash === "#studio";
  $("#studio-link").setAttribute("aria-current", studio ? "page" : "false");
  $("#builder-link").setAttribute("aria-current", studio ? "false" : "page");
  $("#studio-view").hidden = !studio;
  $("#home-view").hidden = studio || !!state.source;
  $("#builder-view").hidden =
    studio || !state.source || (!!state.result && !state.editing);
  $("#results-view").hidden = studio || !state.result || state.editing;
  $("#finish-edit").hidden = !state.result;
  if (studio) {
    if (!studioImage()) {
      sample().catch((e) => notice(e.message));
      return;
    }
    updateStudio().catch((e) => notice(e.message));
  }
}
function selectMode(mode) {
  state.mode = mode;
  $$(".mode").forEach((b) => {
    const selected = b.dataset.mode === mode;
    b.classList.toggle("selected", selected);
    b.setAttribute("aria-pressed", String(selected));
  });
  $("#generate").textContent =
    mode === "fur"
      ? playground.getMaterial() === "clay"
        ? "Make it 3D →"
        : "Make it fluffy →"
      : "Imagine my mascot →";
}
async function readImage(file) {
  if (!file) return null;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw Error("Choose a PNG, JPG or WebP image.");
  if (file.size > 10 * 1024 * 1024)
    throw Error("Choose an image smaller than 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const i = await decode(url);
    if (i.width > 8192 || i.height > 8192)
      throw Error("Choose an image no larger than 8192 pixels per side.");
    const scale = 1024 / Math.max(i.width, i.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(
      i,
      (1024 - i.width * scale) / 2,
      (1024 - i.height * scale) / 2,
      i.width * scale,
      i.height * scale,
    );
    return {
      image: canvas.toDataURL("image/png"),
      width: i.width,
      height: i.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function upload(file) {
  if (state.busy)
    throw Error("Cancel the current generation before changing your icon.");
  const revision = ++inputVersion;
  const image = await readImage(file);
  if (!image || revision !== inputVersion) return;
  ++galleryVersion;
  state.source = image.image;
  state.sourceWidth = image.width;
  state.sourceHeight = image.height;
  state.resultWidth = state.resultHeight = null;
  looks = [];
  $("#look-history").replaceChildren();
  playground.reset();
  state.result = null;
  state.editing = false;
  state.demo = false;
  state.name = file.name;
  state.recipe = { ...defaults };
  state.material = "fur";
  selectMode("fur");
  location.hash = "";
  showSource();
}
async function showResults() {
  if (!state.result) return;
  const version = ++galleryVersion;
  const resultImage = state.result;
  $("#result-source-thumb").src = state.source;
  $("#result-source-name").textContent = state.name;
  $("#result-label").textContent = state.label || "YOUR NEW LOOK";
  const cards = await Promise.all(
    presets.map(async (c, i) => {
      const card = document.createElement("article");
      const art = document.createElement("div");
      art.className = "result-art";
      art.innerHTML = svg(resultImage, { ...c, size: 512 }, true);
      art.querySelector("svg").setAttribute("aria-label", c.name);
      const meta = document.createElement("div");
      meta.className = "result-meta";
      const title = document.createElement("span");
      title.textContent = `0${i + 1} · ${c.name}`;
      const btn = document.createElement("button");
      btn.textContent = "↓";
      btn.setAttribute("aria-label", `Download ${c.name}`);
      btn.addEventListener(
        "click",
        safe(async () =>
          download(
            await png(resultImage, { ...c, size: 1024 }),
            `poof-${i + 1}.png`,
          ),
        ),
      );
      const edit = document.createElement("button");
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", `Edit ${c.name}`);
      edit.onclick = () => {
        state.recipe = normalize(c);
        syncControls();
        location.hash = "studio";
      };
      const pack = document.createElement("button");
      pack.className = "package-card";
      pack.textContent = "Get package";
      pack.setAttribute("aria-label", `Get package for ${c.name}`);
      pack.onclick = safe(() => exporter.open(c));
      meta.append(title, edit, pack, btn);
      card.append(art, meta);
      return card;
    }),
  );
  if (version !== galleryVersion) return;
  $("#results-grid").replaceChildren(...cards);
  route();
}
function connect(tab = "api") {
  $("#connection-status").textContent = "";
  $("#download-kit").hidden = false;
  $("#save-kit").hidden = true;
  $("#save-kit").removeAttribute("href");
  $("#connection").showModal();
  connectionTab(tab);
}
function connectionTab(tab) {
  $("#codex-prompt").textContent = currentPrompt();
  const isAPI = tab === "api";
  $("#api-panel").hidden = !isAPI;
  $("#codex-panel").hidden = isAPI;
  for (const id of ["api", "codex"]) {
    $(`#${id}-tab`).classList.toggle("selected", id === tab);
    $(`#${id}-tab`).setAttribute("aria-pressed", String(id === tab));
  }
}
async function generate(material = playground.getMaterial()) {
  if (state.busy) return;
  if (!state.source) {
    await sample();
    return;
  }
  state.material = material;
  playground.setMaterial(material);
  if (!state.key) {
    pendingGeneration = true;
    connect("api");
    return;
  }
  state.busy = true;
  playground.refresh();
  abort = new AbortController();
  $("#generate").disabled = true;
  $("#generate").classList.add("is-pending");
  $("#make-clay").disabled = true;
  $("#cancel").hidden = false;
  notice("Creating your icon style. This can take a few minutes…", true);
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: state.source,
        key: state.key,
        mode: state.mode,
        material,
        prompt: playground.getPrompt(material),
      }),
      signal: abort.signal,
    });
    const result = await res.json().catch(() => ({
      error: "The local Poof server is unavailable. Start it with npm start.",
    }));
    if (!res.ok)
      throw Error(
        typeof result.error === "string"
          ? result.error
          : "Generation failed. Please retry.",
      );
    if (!result.image) throw Error("No image was returned. Please retry.");
    const rendered = await decode(result.image);
    state.result = result.image;
    state.resultWidth = rendered.width;
    state.resultHeight = rendered.height;
    rememberLook(
      result.image,
      material === "clay" ? "3D clay" : "Plush",
      rendered.width,
      rendered.height,
    );
    state.demo = false;
    state.editing = false;
    state.label = "YOUR NEW LOOK";
    await showResults();
    location.hash = "studio";
    notice(
      "Your style is ready. Choose Center, Left peek or Right peek, then fine-tune the icon.",
    );
    if (location.hash !== "#studio")
      window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    notice(
      e.name === "AbortError"
        ? "Generation cancelled. Your original icon is safe."
        : e instanceof TypeError
          ? "Cannot reach Poof’s local server. Run npm start in the poof folder and keep that terminal open, then retry. Your image is still here."
          : e.message,
      true,
    );
  } finally {
    state.busy = false;
    playground.refresh();
    $("#generate").disabled = false;
    $("#generate").classList.remove("is-pending");
    $("#make-clay").disabled = false;
    $("#cancel").hidden = true;
  }
}
function syncControls() {
  for (const [k, v] of Object.entries(state.recipe)) {
    const el = $("#controls").elements.namedItem(k);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = v;
    else el.value = v;
  }
  $("#scale-value").value = state.recipe.scale + "%";
}
async function updateStudio() {
  const image = studioImage(),
    recipe = { ...state.recipe };
  if (!image) return;
  syncControls();
  $$("[data-layout]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.layout === recipe.layout)),
  );
  $("#studio-preview").innerHTML = svg(image, { ...recipe, size: 1024 }, true);
  const version = ++studioVersion;
  const sizes = await Promise.all(
    [64, 32, 16].map(async (size) => {
      const d = document.createElement("div"),
        i = document.createElement("img"),
        s = document.createElement("span");
      i.src = await dataURL(await png(image, { ...recipe, size }));
      i.width = i.height = size;
      i.alt = `${size} pixel preview`;
      s.textContent = `${size} px`;
      d.append(i, s);
      return d;
    }),
  );
  if (version === studioVersion) $("#size-strip").replaceChildren(...sizes);
}
function currentPrompt() {
  return `Use $poof-icon from .agents/skills/poof-icon/SKILL.md to transform input.png with recipe.json. Mode: ${state.mode === "mascot" ? "create a new mascot inspired by the source" : "preserve the existing icon identity"}. Material: ${state.material}. Art direction: ${playground.getPrompt(state.material)}\nProduce one 1024×1024 transparent PNG named result.png using an available image-generation tool. Review the result against the source, then return the PNG for import into Poof. If image generation is unavailable, report the limitation.`;
}
async function kit() {
  if (!state.source)
    throw Error(
      "Upload an image or choose Explore Pogo icons before preparing a kit.",
    );
  const source = state.source,
    recipe = {
      version: 1,
      mode: state.mode,
      material: state.material,
      artDirection: playground.getPrompt(state.material),
      ...state.recipe,
    },
    prompt = currentPrompt();
  const button = $("#download-kit");
  button.disabled = true;
  button.textContent = "Preparing your kit…";
  try {
    const blob = await buildCodexKit({ source, recipe, prompt });
    $("#save-kit").href = await downloadLink(blob, "poof-codex-kit.zip");
    $("#save-kit").hidden = false;
    button.hidden = true;
    notice(
      "Kit prepared locally. Choose Save Codex kit ZIP, then open PROMPT.md in Codex.",
    );
  } finally {
    button.disabled = false;
    button.textContent = "Prepare Codex kit ↓";
  }
}
async function openInCodex() {
  if (!state.source)
    throw Error("Upload an image or explore Pogo before opening Codex.");
  const prompt = currentPrompt();
  let copied = false;
  try {
    await navigator.clipboard.writeText(
      "Use $poof-icon with input.png and recipe.json. Follow PROMPT.md and save result.png.",
    );
    copied = true;
  } catch {}
  const button = $("#open-codex");
  button.disabled = true;
  button.textContent = "Opening your kit…";
  try {
    const response = await fetch("/api/codex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: state.source,
        recipe: {
          ...state.recipe,
          version: 1,
          mode: state.mode,
          material: state.material,
          artDirection: playground.getPrompt(state.material),
        },
        prompt,
      }),
      signal: AbortSignal.timeout(25000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(
        result.error || "Could not open Codex. Download the kit instead.",
      );
    notice(
      `Kit opened in Codex. ${copied ? "Paste the copied request into a new chat and send it." : "Open PROMPT.md and send its request in a new chat."} Import result.png here when ready. Saved locally: ${result.folder}`,
    );
  } catch (error) {
    if (error instanceof TypeError)
      throw Error(
        "Start Poof with npm start to open Codex. You can also download the kit.",
      );
    throw error;
  } finally {
    button.disabled = false;
    button.textContent = "Open in Codex ↗";
  }
}
async function shareCard() {
  const source = state.source,
    result = state.result,
    demo = state.demo;
  await Promise.all([
    document.fonts.load("400 68px Newsreader"),
    document.fonts.load("600 15px Mulish"),
    document.fonts.load("400 16px Mulish"),
  ]);
  const c = document.createElement("canvas");
  c.width = 1600;
  c.height = 1000;
  const x = c.getContext("2d", { alpha: false });
  x.fillStyle = "#000";
  x.fillRect(0, 0, 1600, 1000);
  x.fillStyle = "#fff";
  x.font = "400 68px Newsreader";
  x.fillText("From artwork to app icon.", 80, 115);
  x.font = "600 15px Mulish";
  x.fillStyle = "#ffffffa3";
  x.fillText("ORIGINAL", 80, 195);
  x.fillText("A SOFTER SIDE", 850, 195);
  for (const [img, left] of [
    [source, 80],
    [result, 850],
  ]) {
    x.fillStyle = "#141416";
    x.beginPath();
    x.roundRect(left, 225, 670, 650, 24);
    x.fill();
    const i = await decode(img);
    x.drawImage(i, left + 25, 240, 620, 620);
  }
  x.fillStyle = "#fff";
  x.font = "400 40px Newsreader";
  x.fillText("poof", 80, 947);
  x.fillStyle = "#ffcf94";
  x.fillText(".", 151, 947);
  x.fillStyle = "#ffffffa3";
  x.font = "16px Mulish";
  x.fillText("Make app icons for iOS & Android.", 205, 942);
  x.textAlign = "right";
  x.font = "13px Mulish";
  x.fillText(demo ? "Pogo · pre-made example" : "Made with Poof", 1520, 940);
  download(
    await new Promise((r) => c.toBlob(r, "image/png")),
    "poof-before-after.png",
  );
}
$("#upload-button").onclick = () => $("#upload").click();
$("#upload").onchange = safe((e) => upload(e.target.files[0]));
$("#try-pogo").onclick = safe(async () => {
  await sample();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
$("#start-over").onclick = () => {
  if (state.busy) {
    notice("Cancel the current generation before changing your icon.");
    return;
  }
  ++inputVersion;
  ++galleryVersion;
  ++studioVersion;
  state.source = state.result = null;
  state.demo = false;
  $("#upload").value = "";
  route();
};
const zone = $("#drop-zone");
zone.ondragover = (e) => {
  e.preventDefault();
  zone.classList.add("dragover");
};
zone.ondragleave = () => zone.classList.remove("dragover");
zone.ondrop = safe(async (e) => {
  e.preventDefault();
  zone.classList.remove("dragover");
  await upload(e.dataTransfer.files[0]);
});
$$(".mode").forEach(
  (b) =>
    (b.onclick = () => {
      if (!state.busy) selectMode(b.dataset.mode);
    }),
);
$("#generate").onclick = safe(() => generate());
$("#cancel").onclick = () => abort?.abort();
$("#connection-button").onclick = () => {
  pendingGeneration = false;
  connect();
};
$("#codex-shortcut").onclick = () => {
  pendingGeneration = false;
  connect("codex");
};
$("#api-tab").onclick = () => connectionTab("api");
$("#codex-tab").onclick = () => connectionTab("codex");
$("#open-codex").onclick = safe(openInCodex);
$("#save-key").onclick = safe(async () => {
  const key = $("#api-key").value.trim();
  if (!key) {
    notice("Enter an API key, or choose My Codex.");
    return;
  }
  state.key = key;
  $("#api-key").value = "";
  $(".dot").classList.add("connected");
  $(".connection-label").textContent = "API key ready";
  $("#connection").close();
  notice("Key connected for this tab only.");
  if (pendingGeneration) {
    pendingGeneration = false;
    await generate(state.material);
  }
});
$("#forget-key").onclick = () => {
  state.key = "";
  $("#api-key").value = "";
  $(".dot").classList.remove("connected");
  $(".connection-label").textContent = "Connect AI";
  notice("API key forgotten.");
};
$("#connection").addEventListener("close", () => {
  $("#api-key").value = "";
});
$("#download-kit").onclick = safe(kit);
$("#copy-prompt").onclick = safe(async () => {
  await navigator.clipboard.writeText(currentPrompt());
  notice("Prompt copied.");
});
$("#import-result").onclick = () => $("#result-upload").click();
$("#result-upload").onchange = safe(async (e) => {
  if (state.busy) throw Error("Cancel generation before importing a result.");
  const revision = inputVersion;
  const img = await readImage(e.target.files[0]);
  if (img && revision === inputVersion) {
    state.result = img.image;
    state.resultWidth = img.width;
    state.resultHeight = img.height;
    rememberLook(img.image, "Imported look", img.width, img.height);
    state.demo = false;
    state.editing = false;
    state.label = "YOUR IMPORTED CHARACTER";
    await showResults();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});
$("#download-all").onclick = safe(async () => {
  notice("Preparing your six icons…");
  const result = state.result;
  const files = {};
  for (let i = 0; i < presets.length; i++)
    files[`poof-${i + 1}.png`] = await png(result, {
      ...presets[i],
      size: 1024,
    });
  files["character.png"] = toBlob(result);
  files["recipes.json"] = JSON.stringify(presets.map(normalize), null, 2);
  files["README.txt"] =
    "Poof layouts: six static opaque 1024px square PNGs. Rounded corners are preview-only. character.png retains the source image transparency. recipes.json contains editable layouts. Check platform-specific requirements before submission.\n";
  download(await zip(files), "poof-icons.zip");
  notice("Your icon pack is ready.");
});
$("#download-cutout").onclick = safe(async () =>
  download(toBlob(state.result), "poof-character.png"),
);
$("#share-card").onclick = safe(shareCard);
$("#controls").onsubmit = (e) => e.preventDefault();
$("#controls").oninput = safe(async () => {
  const raw = Object.fromEntries(new FormData($("#controls")));
  raw.gradient = $("#controls").elements.gradient.checked;
  state.recipe = normalize(raw);
  await updateStudio();
});
$("#studio-download").onclick = safe(async () =>
  download(
    await png(studioImage(), state.recipe),
    `poof-${state.recipe.size}.png`,
  ),
);
$("#svg-download").onclick = () =>
  download(
    new Blob([svg(studioImage(), state.recipe, true)], {
      type: "image/svg+xml",
    }),
    "poof-icon.svg",
  );
$("#recipe-download").onclick = () =>
  download(
    new Blob([JSON.stringify({ version: 1, ...state.recipe }, null, 2)], {
      type: "application/json",
    }),
    "poof-recipe.json",
  );
$("#recipe-import").onclick = () => $("#recipe-file").click();
$("#recipe-file").onchange = safe(async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 10000) throw Error("Recipe files must be smaller than 10 KB.");
  const r = JSON.parse(await f.text());
  if (!r || typeof r !== "object" || Array.isArray(r))
    throw Error("Choose a Poof JSON recipe.");
  state.recipe = normalize(r);
  await updateStudio();
  notice("Recipe loaded.");
});
$("#make-clay").onclick = safe(() => generate("clay"));
$("#use-original").onclick = safe(useOriginal);
$("#studio-package").onclick = safe(() => exporter.open());
document.addEventListener("plush:change", () => {
  state.material = playground.getMaterial();
  selectMode(state.mode);
});
window.addEventListener("hashchange", () => {
  route();
  window.scrollTo({ top: 0 });
});
route();

let heroMaterial = "plush",
  heroMoving = true;
$$("[data-hero-material]").forEach(
  (b) =>
    (b.onclick = () => {
      heroMaterial = b.dataset.heroMaterial;
      $("#hero-character").src = "/assets/pogo-" + heroMaterial + ".png";
      $("#hero-character").alt =
        heroMaterial === "plush"
          ? "Pogo in its original golden plush coat"
          : "Pogo’s original sun character";
      $$("[data-hero-material]").forEach((btn) => {
        const on = btn === b;
        btn.classList.toggle("selected", on);
        btn.setAttribute("aria-pressed", String(on));
      });
      $(".material-caption").textContent =
        heroMaterial === "plush" ? "Plush app icon" : "Original artwork";
    }),
);
$("#hero-peek").onclick = () => {
  const peek = $(".hero-art").dataset.framing !== "peek";
  $(".hero-art").dataset.framing = peek ? "peek" : "center";
  $("#hero-peek").textContent = peek ? "Back to center ↖" : "Try a peek ↗";
  $("#hero-peek").setAttribute("aria-pressed", String(peek));
};
$("#hero-motion").onclick = () => {
  heroMoving = !heroMoving;
  $(".hero-character").classList.toggle("is-moving", heroMoving);
  $("#hero-motion").textContent = heroMoving ? "Ⅱ" : "▷";
  $("#hero-motion").setAttribute(
    "aria-label",
    heroMoving ? "Pause Pogo motion" : "Play Pogo motion",
  );
  $("#hero-motion").setAttribute("aria-pressed", String(heroMoving));
};

$("#results-edit").onclick = () => {
  state.editing = true;
  route();
  window.scrollTo({ top: 0, behavior: "smooth" });
};
$("#finish-edit").onclick = () => {
  state.editing = false;
  route();
};
$("#results-change").onclick = () => $("#start-over").click();

let galleryMoving = true;
$("#gallery-motion").onclick = () => {
  galleryMoving = !galleryMoving;
  $("#results-grid").dataset.paused = String(!galleryMoving);
  $("#gallery-motion").textContent = galleryMoving
    ? "Pause previews"
    : "Play previews";
  $("#gallery-motion").setAttribute("aria-pressed", String(galleryMoving));
};

$("#open-customize").onclick = () => {
  location.hash = "studio";
};
$$("[data-layout]").forEach(
  (button) =>
    (button.onclick = safe(async () => {
      state.recipe = normalize({
        ...state.recipe,
        layout: button.dataset.layout,
      });
      await updateStudio();
    })),
);
const checkServer = watchServer({
  onStatus: (online) => {
    $("#server-offline").hidden = online;
    $("#connection-server-offline").hidden = online;
  },
});
$("#retry-server").onclick = checkServer;

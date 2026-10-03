export const presets = [
  { name: "Front and center", layout: "center", color: "#b4aad3" },
  { name: "Left peek", layout: "left", color: "#292b31", motion: "peek" },
  {
    name: "Gradient",
    layout: "center",
    color: "#e8b395",
    gradient: true,
  },
  { name: "Right peek", layout: "right", color: "#b8c7b3", motion: "peek" },
  { name: "Bottom peek", layout: "rise", color: "#a9bfce", motion: "bounce" },
  {
    name: "Christmas",
    layout: "center",
    color: "#784455",
    occasion: "christmas",
  },
];
export const defaults = {
  layout: "center",
  color: "#b4aad3",
  gradient: false,
  scale: 100,
  occasion: "none",
  motion: "breathe",
  size: 1024,
};
export function normalize(raw = {}) {
  const c = { ...defaults };
  for (const [k, values] of Object.entries({
    layout: ["center", "left", "right", "rise"],
    occasion: ["none", "christmas", "birthday", "valentine", "halloween"],
    motion: ["none", "breathe", "peek", "bounce"],
  }))
    if (values.includes(raw[k])) c[k] = raw[k];
  if (/^#[\da-f]{6}$/i.test(raw.color)) c.color = raw.color;
  if (typeof raw.gradient === "boolean") c.gradient = raw.gradient;
  if (Number.isFinite(+raw.scale))
    c.scale = Math.max(65, Math.min(135, +raw.scale));
  if ([16, 32, 64, 180, 512, 1024].includes(+raw.size)) c.size = +raw.size;
  return c;
}
export function placement(raw) {
  const c = normalize(raw);
  let x = 512,
    y = 512,
    s = 0.91,
    r = 0;
  if (c.layout === "left") {
    x = 365;
    y = 660;
    s = 1.28;
    r = -18;
  }
  if (c.layout === "right") {
    x = 659;
    y = 660;
    s = 1.28;
    r = 18;
  }
  if (c.layout === "rise") {
    y = 780;
    s = 1.25;
  }
  return { x, y, s: (s * c.scale) / 100, r };
}
function decor(c) {
  if (c.occasion === "christmas")
    return '<g fill="none" stroke="#fff7e8" stroke-width="5" stroke-linecap="round"><path d="M130 110v50m-25-25h50m-42-17 34 34m0-34-34 34M865 205v36m-18-18h36M820 90v25m-12-12h24"/></g>';
  if (c.occasion === "birthday")
    return '<g fill="none" stroke-width="10" stroke-linecap="round"><path d="m120 120 18 27m730 80 30-12m-60 620 20 25" stroke="#fbe4a0"/><path d="m200 860-14 23m560-780 20 20" stroke="#f4bdd7"/></g>';
  if (c.occasion === "valentine")
    return '<path d="M855 160c-75-44-44-90 0-58 44-32 75 14 0 58M140 790c-45-28-27-58 0-37 27-21 45 9 0 37" fill="#eab5b8"/>';
  if (c.occasion === "halloween")
    return '<path d="M795 140q30-35 50-4 20-42 55-19l-35 38q-22-3-25 16-5-17-24-12Z" fill="#edca83"/>';
  return "";
}
export function svg(image, raw = {}, animated = false) {
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image))
    throw Error("A local raster image is required.");
  const c = normalize(raw),
    p = placement(c),
    id = "p" + Math.random().toString(36).slice(2);
  const keyframes = {
    breathe: "0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}",
    peek: "0%,100%{transform:translate(-12px,18px)}45%,65%{transform:translate(12px,-10px)}",
    bounce:
      "0%,30%,80%,100%{transform:translateY(0)}50%{transform:translateY(-42px)}65%{transform:translateY(6px)}",
  };
  const motion =
    animated && keyframes[c.motion]
      ? `<style>@keyframes ${id}{${keyframes[c.motion]}} .${id}{animation:${id} 4s ease-in-out infinite}@media(prefers-reduced-motion:reduce){.${id}{animation:none}}</style>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.size}" height="${c.size}" viewBox="0 0 1024 1024" role="img" aria-label="Icon preview"><defs><linearGradient id="${id}bg" x2="1" y2="1"><stop stop-color="${c.color}"/><stop offset="1" stop-color="${c.color}"/></linearGradient><linearGradient id="${id}light" x2="1" y2="1"><stop stop-color="white" stop-opacity=".3"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs>${motion}<rect width="1024" height="1024" fill="${c.color}"/>${c.gradient ? `<rect width="1024" height="1024" fill="url(#${id}light)"/>` : ""}<g transform="translate(${p.x} ${p.y}) rotate(${p.r}) scale(${p.s})"><g class="${id}"><image href="${image}" x="-512" y="-512" width="1024" height="1024"/></g></g>${c.size > 64 ? decor(c) : ""}</svg>`;
}
export async function decode(src) {
  const i = new Image();
  i.src = src;
  await i.decode();
  return i;
}
export async function png(image, raw = {}) {
  const c = normalize(raw);
  const blob = new Blob([svg(image, c)], { type: "image/svg+xml" }),
    url = URL.createObjectURL(blob);
  try {
    const i = await decode(url),
      canvas = document.createElement("canvas");
    canvas.width = canvas.height = c.size;
    canvas.getContext("2d", { alpha: false }).drawImage(i, 0, 0);
    return await new Promise((res, rej) =>
      canvas.toBlob(
        (b) => (b ? res(b) : rej(Error("PNG export failed."))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
export async function dataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(Error("Could not read this image."));
    r.readAsDataURL(blob);
  });
}

export function toBlob(url) {
  const [head, b64] = url.split(",");
  if (!/^data:image\/(png|jpeg|webp);base64$/.test(head) || !b64)
    throw Error("Invalid image data.");
  const bytes = Uint8Array.from(atob(b64), (x) => x.charCodeAt(0));
  return new Blob([bytes], { type: head.slice(5, -7) });
}

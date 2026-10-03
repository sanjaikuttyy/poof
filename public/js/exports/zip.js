// Store-only ZIP, UTF-8 filenames, CRC-32. No third-party runtime or remote scripts.
const table = Uint32Array.from({ length: 256 }, (_, i) => {
  for (let k = 0; k < 8; k++) i = i & 1 ? 0xedb88320 ^ (i >>> 1) : i >>> 1;
  return i >>> 0;
});
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const x of bytes) c = table[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export async function zip(files) {
  const enc = new TextEncoder(),
    parts = [],
    central = [];
  let offset = 0,
    centralSize = 0;
  for (const [name, value] of Object.entries(files)) {
    if (name.includes("..") || name.startsWith("/"))
      throw Error("Unsafe ZIP name");
    const n = enc.encode(name),
      data =
        typeof value === "string"
          ? enc.encode(value)
          : new Uint8Array(await value.arrayBuffer()),
      crc = crc32(data);
    const head = new Uint8Array(30 + n.length),
      v = new DataView(head.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint16(12, 33, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, n.length, true);
    head.set(n, 30);
    parts.push(head, data);
    const cen = new Uint8Array(46 + n.length),
      w = new DataView(cen.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x800, true);
    w.setUint16(14, 33, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, data.length, true);
    w.setUint32(24, data.length, true);
    w.setUint16(28, n.length, true);
    w.setUint32(42, offset, true);
    cen.set(n, 46);
    central.push(cen);
    centralSize += cen.length;
    offset += head.length + data.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, central.length, true);
  e.setUint16(10, central.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}

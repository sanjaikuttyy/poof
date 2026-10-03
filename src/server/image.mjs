import { fail } from "./http.mjs";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export function validatePNG(data, maxBytes = 10 * 1024 * 1024) {
  if (typeof data !== "string" || !data.startsWith("data:image/png;base64,"))
    fail(
      400,
      "Choose a PNG image. The browser can convert your upload to PNG.",
    );
  const encoded = data.slice(22);
  if (
    !encoded ||
    encoded.length > Math.ceil(maxBytes / 3) * 4 ||
    encoded.length % 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    fail(400, "The image is too large or has invalid image data.");
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  )
    fail(400, "The image is not a valid PNG.");
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (
    !width ||
    !height ||
    width > 4096 ||
    height > 4096 ||
    width * height > 16777216
  )
    fail(400, "Use an image up to 4096 × 4096 pixels.");
  let offset = 8,
    hasData = false,
    ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12)
      fail(400, "The PNG is incomplete.");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") hasData = true;
    offset += length + 12;
    if (type === "IEND") {
      ended = length === 0 && offset === bytes.length;
      break;
    }
  }
  if (!hasData || !ended) fail(400, "The PNG is incomplete.");
  return bytes;
}

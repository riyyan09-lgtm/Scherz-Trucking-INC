// QR code generator — wraps the `qrcode` npm package (battle-tested, correct
// module placement, masking, and Reed-Solomon EC) and returns an SVG data URI
// so invoice/agreement PDFs can show a real, scannable QR (the permanent
// booking/sign URL). Kept as a single small function so callers don't change.
import QRCode from "qrcode";

export async function qrSvg(text, sizePx = 110) {
  // qrcode's toString() returns a Promise when called without a callback.
  const svg = await QRCode.toString(text, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
  // qrcode's svg has width/height attrs; normalize to the requested pixel size.
  const sized = svg
    .replace(/width="[^"]*"/, `width="${sizePx}"`)
    .replace(/height="[^"]*"/, `height="${sizePx}"`);
  return `data:image/svg+xml;utf8,${encodeURIComponent(sized)}`;
}

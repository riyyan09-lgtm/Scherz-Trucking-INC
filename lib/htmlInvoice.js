// HTML -> PDF invoice rendering. Replaces the coordinate-overlay PDF mapper
// long-term: the admin edits real HTML/CSS instead of dragging boxes onto a
// flat PDF, and Puppeteer (a real headless browser) lays the text out --
// no vertical-centering math, no font-size-guessing, no per-template
// coordinate drift. This is the same approach Stripe/Shopify/QuickBooks use.
import puppeteerCore from "puppeteer-core";
import fs from "fs";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// {{token}} is replaced with an HTML-escaped value -- lead data (customer
// name, email, notes...) is untrusted, and unlike a value drawn as PDF
// text, this HTML is actually loaded and executed by a real browser before
// being printed to PDF, so an unescaped `<script>` in a customer's name
// would run. {{{token}}} (triple brace, Mustache's convention) is inserted
// RAW/unescaped -- only for markup the SERVER builds itself out of
// already-escaped pieces (e.g. the vehicle table rows, one row per real
// vehicle on the order -- see buildVehicleRowsHtml), never for passing
// lead data straight through. Admin-authored template markup (logo,
// static wording) is the trusted part; interpolated values never are.
export function renderTemplate(html, values) {
  return String(html).replace(/\{\{\{\s*([a-zA-Z0-9_]+)\s*\}\}\}|\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, rawKey, escKey) => {
    if (rawKey) return rawKey in values ? String(values[rawKey] ?? "") : "";
    return escKey in values ? escapeHtml(values[escKey]) : "";
  });
}

// Builds the <tr> rows for the vehicle table -- one per real vehicle on the
// order, each cell escaped individually. This is what {{{vehicle_rows}}}
// resolves to; HTML handles a variable number of rows as a normal loop, no
// coordinate-based "repeat" mechanism needed the way the PDF mapper needed one.
export function buildVehicleRowsHtml(vehicles) {
  if (!vehicles || vehicles.length === 0) {
    return `<tr><td colspan="7" style="text-align:center;color:#999;">—</td></tr>`;
  }
  return vehicles
    .map((v, i) => {
      const cond = v.running ? "Operable" : v.damage_notes || "Inoperable";
      const cells = [i + 1, v.year ?? "—", v.make || "—", v.model || "—", v.type || "—", v.running ? "Yes" : "No", cond];
      return `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`;
    })
    .join("\n");
}

// Builds the Nest-style vehicle list (one "YEAR MAKE MODEL (Type) (Inoperable:
// Yes/No)" line per vehicle) used by the default agreement/certificate
// template's {{{vehicle_list}}} token.
export function buildVehicleListHtml(vehicles) {
  if (!vehicles || vehicles.length === 0) return `<div style="margin:4px 0 0 14px;color:#999;">—</div>`;
  return vehicles
    .map((v) => {
      const inop = v.running ? "No" : "Yes";
      const parts = [v.year, v.make, v.model].filter(Boolean).join(" ");
      const type = v.type ? ` (${v.type})` : "";
      return `<div class="veh" style="margin:4px 0 0 14px;">${escapeHtml(parts)}${escapeHtml(type)} (Inoperable: ${inop})</div>`;
    })
    .join("\n");
}

// templates that want a compact reference next to the signature/date
// instead of (or in addition to) the full vehicle table.
export function buildVehicleSummary(vehicles) {
  const v = vehicles && vehicles[0];
  if (!v) return "";
  const parts = [v.year, v.make, v.model].filter(Boolean).join(" ");
  return v.type ? `${parts} (${v.type})` : parts;
}

async function launchBrowser() {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Local dev: there's no serverless Chromium binary for Windows/macOS dev
  // machines, so use whatever real Chrome/Edge is already installed.
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const executablePath = candidates.find((p) => fs.existsSync(p));
  if (!executablePath) {
    throw new Error("No local Chrome/Edge found for HTML invoice rendering — set CHROME_PATH to a browser executable.");
  }
  return puppeteerCore.launch({ executablePath, headless: true });
}

// Renders a full HTML document (already has values substituted in) to a
// PDF buffer. `html` must be self-contained -- inline CSS, base64 images --
// since the page never has network access to fetch anything external.
export async function renderHtmlToPdf(html) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}

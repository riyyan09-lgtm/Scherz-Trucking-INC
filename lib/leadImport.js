// Bulk lead import for the tenant portal's "Add Leads" button (Lead
// Management → Unassigned Leads card). Three input shapes all reduce to the
// same normalized row shape before insert:
//   - pasted/uploaded delimited text (.txt/.csv, comma/tab/pipe, header row)
//   - .xlsx (first sheet, header row) via the xlsx package
//   - .pdf — text layer extracted via pdfjs-dist, then parsed as delimited
//     text. Only works for text-based PDFs (e.g. exported from a
//     spreadsheet); scanned/image PDFs have no text layer to read.
import * as XLSX from "xlsx";

// Recognized column headers -> normalized field name. Matched case-
// insensitively after stripping spaces/underscores, so "Vehicle Year",
// "vehicle_year", and "year" all resolve to vehicle_year.
const HEADER_ALIASES = {
  name: "name", customername: "name", fullname: "name", customer: "name",
  phone: "phone", phonenumber: "phone", cell: "phone", mobile: "phone",
  email: "email", emailaddress: "email",
  origin: "origin", originzip: "origin", from: "origin", pickup: "origin", pickupzip: "origin", pickuplocation: "origin",
  destination: "destination", destinationzip: "destination", to: "destination", dropoff: "destination", dropoffzip: "destination", deliverylocation: "destination",
  year: "vehicle_year", vehicleyear: "vehicle_year",
  make: "vehicle_make", vehiclemake: "vehicle_make",
  model: "vehicle_model", vehiclemodel: "vehicle_model",
  notes: "notes", note: "notes", comment: "notes", comments: "notes",
};

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase().replace(/[\s_]+/g, "");
}

// Row object (raw header -> value) -> normalized {name, phone, ...}. Unknown
// headers are ignored rather than rejected, so extra columns are harmless.
function normalizeRow(raw) {
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    const field = HEADER_ALIASES[normalizeHeader(key)];
    if (!field) continue;
    const v = typeof val === "string" ? val.trim() : val != null ? String(val).trim() : "";
    if (v) out[field] = v;
  }
  return out;
}

// "space" is a synthetic delimiter (not a literal character) meaning
// "columns aligned with runs of 2+ spaces" -- the shape you get pasting a
// table out of a chat message, terminal, or PDF viewer, where columns are
// padded with spaces rather than joined by a real tab/comma/pipe.
function detectDelimiter(line) {
  const counts = { "\t": (line.match(/\t/g) || []).length, "|": (line.match(/\|/g) || []).length, ",": (line.match(/,/g) || []).length };
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (best[1] > 0) return best[0];
  return (line.match(/ {2,}/g) || []).length > 0 ? "space" : ",";
}

function splitCsvLine(line, delim) {
  // Minimal CSV cell splitter: handles a delimiter inside "quoted" cells.
  // No need for full RFC 4180 support here (embedded newlines, escaped
  // quotes) — this is a lightweight lead-import template, not a general CSV
  // parser, and the header-driven mapping degrades harmlessly on odd input.
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === delim && !inQuotes) { cells.push(cur); cur = ""; continue; }
    cur += c;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

// For "space" mode, column boundaries are read off the HEADER row once and
// then reused for every data row (fixed character positions), rather than
// re-detecting a gap on each line independently. A per-line regex split
// would misalign as soon as one row's value is long enough to shrink its
// gap to a single space (e.g. a long name crowding the phone column) --
// slicing at the header's fixed positions is immune to that since it
// doesn't care how many spaces actually precede the next column.
function findColumnStarts(line) {
  const starts = [0];
  const re = / {2,}\S/g;
  let m;
  while ((m = re.exec(line))) starts.push(m.index + m[0].length - 1);
  return starts;
}

function splitFixedWidth(line, starts) {
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : line.length;
    return line.slice(start, end).trim();
  });
}

// Parses delimited text (comma/tab/pipe) with a required header row into
// normalized row objects. Returns { rows, error } — error is a user-facing
// message when no usable header (name + phone) is found.
export function parseDelimitedText(text) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], error: "No data found." };

  const delim = detectDelimiter(lines[0]);
  const columnStarts = delim === "space" ? findColumnStarts(lines[0]) : null;
  const splitLine = (line) => (columnStarts ? splitFixedWidth(line, columnStarts) : splitCsvLine(line, delim));
  const header = splitLine(lines[0]);
  const normalizedHeader = header.map(normalizeHeader);
  const hasName = normalizedHeader.some((h) => HEADER_ALIASES[h] === "name");
  const hasPhone = normalizedHeader.some((h) => HEADER_ALIASES[h] === "phone");
  if (!hasName || !hasPhone) {
    return {
      rows: [],
      error: "First row must be a header with at least Name and Phone columns (e.g. Name,Phone,Email,Origin,Destination,Year,Make,Model,Notes).",
    };
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const raw = {};
    header.forEach((h, idx) => { raw[h] = cells[idx] ?? ""; });
    rows.push(normalizeRow(raw));
  }
  return { rows, error: null };
}

export function parseXlsx(bytes) {
  const wb = XLSX.read(bytes, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], error: "The spreadsheet has no sheets." };
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (json.length === 0) return { rows: [], error: "No rows found in the first sheet." };
  const rows = json.map(normalizeRow);
  const hasAny = rows.some((r) => r.name && r.phone);
  if (!hasAny) {
    return {
      rows: [],
      error: "No row had both a Name and Phone column recognized. Expected headers like Name, Phone, Email, Origin, Destination, Year, Make, Model, Notes.",
    };
  }
  return { rows, error: null };
}

// Extracts the text layer of a PDF (page by page, left-to-right/top-to-
// bottom) and hands it to the same delimited-text parser. Only recovers
// data from PDFs that have a real text layer (e.g. exported from Excel);
// a scanned/photographed PDF has no text to extract and will read as empty.
// pdfjs falls back to a font's raw glyph outlines (via matrix math) when a
// PDF omits proper width metrics for a standard font -- even for plain text
// extraction, not just rendering. That path calls the browser-only
// `DOMMatrix` API, which Node doesn't provide and pdfjs can only auto-
// polyfill from the optional native `canvas` package (not installed here,
// to avoid a native-build dependency on Vercel). Minimal 2D affine
// polyfill covering just the methods pdfjs actually calls.
function ensureDOMMatrixPolyfill() {
  if (globalThis.DOMMatrix) return;
  class DOMMatrixPolyfill {
    constructor(init) {
      if (Array.isArray(init) && init.length === 6) [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      else if (init && typeof init === "object") {
        const { a = 1, b = 0, c = 0, d = 1, e = 0, f = 0 } = init;
        Object.assign(this, { a, b, c, d, e, f });
      } else Object.assign(this, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    }
    multiplySelf(o) {
      const { a, b, c, d, e, f } = this;
      this.a = a * o.a + c * o.b; this.b = b * o.a + d * o.b;
      this.c = a * o.c + c * o.d; this.d = b * o.c + d * o.d;
      this.e = a * o.e + c * o.f + e; this.f = b * o.e + d * o.f + f;
      return this;
    }
    preMultiplySelf(o) {
      const m = new DOMMatrixPolyfill(o).multiplySelf(this);
      Object.assign(this, m);
      return this;
    }
    translate(tx, ty) {
      const r = new DOMMatrixPolyfill(this);
      r.e = this.a * tx + this.c * ty + this.e;
      r.f = this.b * tx + this.d * ty + this.f;
      return r;
    }
    scale(sx, sy = sx) {
      const r = new DOMMatrixPolyfill(this);
      r.a = this.a * sx; r.b = this.b * sx; r.c = this.c * sy; r.d = this.d * sy;
      return r;
    }
    invertSelf() {
      const { a, b, c, d, e, f } = this;
      const det = a * d - b * c;
      if (!det) { this.a = this.b = this.c = this.d = NaN; this.e = this.f = NaN; return this; }
      this.a = d / det; this.b = -b / det; this.c = -c / det; this.d = a / det;
      this.e = (c * f - d * e) / det; this.f = (b * e - a * f) / det;
      return this;
    }
  }
  globalThis.DOMMatrix = DOMMatrixPolyfill;
}

export async function parsePdf(bytes) {
  ensureDOMMatrixPolyfill();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const path = await import("path");
  const standardFontDataUrl = path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts").split(path.sep).join("/") + "/";
  // pdfjs rejects a Node Buffer even though it's a Uint8Array subclass --
  // it checks the exact type, not instanceof. Copy into a plain Uint8Array.
  const data = Buffer.isBuffer(bytes) ? new Uint8Array(bytes) : bytes;
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, standardFontDataUrl }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Group text items into lines by rounded Y position (pdf.js text items
    // carry their own baseline transform), then join left-to-right by X.
    const byY = new Map();
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push(item);
    }
    const ys = [...byY.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const items = byY.get(y).sort((a, b) => a.transform[4] - b.transform[4]);
      lines.push(items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim());
    }
  }
  return parseDelimitedText(lines.filter(Boolean).join("\n"));
}

const US_ZIP = /^\d{5}(-\d{4})?$/;

// Normalized row -> insert-ready values, or null if it fails minimum
// validation (name + phone required, matching leads.name/phone NOT NULL).
export function rowToLeadValues(row) {
  if (!row.name || !row.phone) return null;
  const originIsZip = row.origin && US_ZIP.test(row.origin);
  const destIsZip = row.destination && US_ZIP.test(row.destination);
  const year = row.vehicle_year ? parseInt(row.vehicle_year, 10) : null;
  return {
    name: row.name.slice(0, 200),
    phone: row.phone.slice(0, 40),
    email: row.email ? row.email.slice(0, 200) : null,
    origin_zip: originIsZip ? row.origin : null,
    origin_city: !originIsZip && row.origin ? row.origin.slice(0, 200) : null,
    destination_zip: destIsZip ? row.destination : null,
    destination_city: !destIsZip && row.destination ? row.destination.slice(0, 200) : null,
    vehicle_year: Number.isFinite(year) ? year : null,
    vehicle_make: row.vehicle_make ? row.vehicle_make.slice(0, 60) : null,
    vehicle_model: row.vehicle_model ? row.vehicle_model.slice(0, 60) : null,
    notes: row.notes ? row.notes.slice(0, 2000) : null,
  };
}

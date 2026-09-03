// Single source of truth for Scherz Trucking INC's customer-facing identity.
//
// This project reuses the scherz-trucking-app website design but is a separately-
// branded site for Scherz Trucking INC. All display strings live here so the
// next rename is a one-line change.

export const BRAND = {
  // Full legal/marketing name — footers, schema.org, email signatures.
  name: "Scherz Trucking INC",
  // Short form for tight spots: header wordmark, nav, chat widget title.
  short: "Scherz Trucking",
  // Appended to page titles via the root layout's title template.
  titleSuffix: "Scherz Trucking INC",
  tagline: "Licensed & insured auto transport, matched city by city.",
};

// Company credentials
export const COMPANY = {
  name: "Scherz Trucking INC",
  email: "quotes@scherztruckinginc.com",
  address: "4434 460TH LN, HAY SPRINGS, NE 69347",
  usdot: "1117160",
  mc: "457690",
};

// Sender identity for transactional mail.
export const MAIL_FROM = `${BRAND.name} <${COMPANY.email}>`;

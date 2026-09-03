// Lifecycle statuses for B2B "request a business account" inquiries
// (dealers / repair shops / fleet). Kept separate from the quote-lead
// lifecycle so the two worklists don't get confused.
export const BIZ_STATUSES = ["new", "contacted", "in_progress", "won", "lost"];

export function isBizStatus(s) {
  return BIZ_STATUSES.includes(s);
}

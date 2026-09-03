// Tile-grid layout of the 50 states + DC (row/col, 0-indexed), the same
// style of simplified "cartogram" grid used by NPR/Datawrapper-style state
// maps — every state gets an equal-size clickable tile positioned to
// roughly match its real position, without needing precise SVG border
// paths. Used by components/USStateMap.js.
export const US_STATE_GRID = [
  { abbr: "AK", name: "Alaska", row: 0, col: 0 },
  { abbr: "ME", name: "Maine", row: 0, col: 12 },

  { abbr: "VT", name: "Vermont", row: 1, col: 11 },
  { abbr: "NH", name: "New Hampshire", row: 1, col: 12 },

  { abbr: "WA", name: "Washington", row: 2, col: 1 },
  { abbr: "MT", name: "Montana", row: 2, col: 3 },
  { abbr: "ND", name: "North Dakota", row: 2, col: 4 },
  { abbr: "MN", name: "Minnesota", row: 2, col: 5 },
  { abbr: "WI", name: "Wisconsin", row: 2, col: 7 },
  { abbr: "MI", name: "Michigan", row: 2, col: 8 },
  { abbr: "NY", name: "New York", row: 2, col: 10 },
  { abbr: "MA", name: "Massachusetts", row: 2, col: 12 },

  { abbr: "OR", name: "Oregon", row: 3, col: 1 },
  { abbr: "ID", name: "Idaho", row: 3, col: 2 },
  { abbr: "WY", name: "Wyoming", row: 3, col: 3 },
  { abbr: "SD", name: "South Dakota", row: 3, col: 4 },
  { abbr: "IA", name: "Iowa", row: 3, col: 5 },
  { abbr: "IL", name: "Illinois", row: 3, col: 6 },
  { abbr: "IN", name: "Indiana", row: 3, col: 7 },
  { abbr: "OH", name: "Ohio", row: 3, col: 8 },
  { abbr: "PA", name: "Pennsylvania", row: 3, col: 9 },
  { abbr: "NJ", name: "New Jersey", row: 3, col: 10 },
  { abbr: "CT", name: "Connecticut", row: 3, col: 11 },
  { abbr: "RI", name: "Rhode Island", row: 3, col: 12 },

  { abbr: "CA", name: "California", row: 4, col: 1 },
  { abbr: "NV", name: "Nevada", row: 4, col: 2 },
  { abbr: "UT", name: "Utah", row: 4, col: 3 },
  { abbr: "CO", name: "Colorado", row: 4, col: 4 },
  { abbr: "NE", name: "Nebraska", row: 4, col: 5 },
  { abbr: "MO", name: "Missouri", row: 4, col: 6 },
  { abbr: "KY", name: "Kentucky", row: 4, col: 7 },
  { abbr: "WV", name: "West Virginia", row: 4, col: 8 },
  { abbr: "VA", name: "Virginia", row: 4, col: 9 },
  { abbr: "MD", name: "Maryland", row: 4, col: 10 },
  { abbr: "DE", name: "Delaware", row: 4, col: 11 },

  { abbr: "AZ", name: "Arizona", row: 5, col: 3 },
  { abbr: "NM", name: "New Mexico", row: 5, col: 4 },
  { abbr: "KS", name: "Kansas", row: 5, col: 5 },
  { abbr: "AR", name: "Arkansas", row: 5, col: 6 },
  { abbr: "TN", name: "Tennessee", row: 5, col: 7 },
  { abbr: "NC", name: "North Carolina", row: 5, col: 8 },
  { abbr: "SC", name: "South Carolina", row: 5, col: 9 },
  { abbr: "DC", name: "District of Columbia", row: 5, col: 10 },

  { abbr: "OK", name: "Oklahoma", row: 6, col: 5 },
  { abbr: "LA", name: "Louisiana", row: 6, col: 6 },
  { abbr: "MS", name: "Mississippi", row: 6, col: 7 },
  { abbr: "AL", name: "Alabama", row: 6, col: 8 },
  { abbr: "GA", name: "Georgia", row: 6, col: 9 },

  { abbr: "HI", name: "Hawaii", row: 7, col: 0 },
  { abbr: "TX", name: "Texas", row: 7, col: 5 },
  { abbr: "FL", name: "Florida", row: 7, col: 10 },
];

/* ==========================================================
   Shared configuration: color scales, field mapping, helpers
   ========================================================== */
const CONFIG = {
  dataUrl: "data/grid.geojson",

  // Edit this whenever the underlying grid/analysis data is refreshed.
  lastUpdated: "July 2026",

  // Google Apps Script Web App bound to the private reports Sheet.
  // doPost() appends a row + emails a notification; doGet() returns
  // the full history as flat {gridId, landUse, date} objects.
  reportsApiUrl: "https://script.google.com/macros/s/AKfycbz3qWoJ4RQ8Y7k3ynLa_jjMfYgUbdTON51Up2-qoq5PNt5BFPjNFSfUuwhVHzC2yX1x/exec",

  pressureColors: {
    "Low": "#3F6B47",
    "Moderate": "#C08A28",
    "High": "#B54A2C"
  },
  riskColors: {
    "None": "#C7CBB8",
    "Low": "#3F6B47",
    "Moderate": "#C08A28",
    "High": "#B54A2C"
  },

  pressureOrder: ["Low", "Moderate", "High"],
  riskOrder: ["None", "Low", "Moderate", "High"],

  // --- New layers: Land Use, Roads, GN Divisions, Land Cover, Agriculture ---
  landuseUrl: "data/landuse.geojson",
  roadsUrl: "data/roads.geojson",
  gnsUrl: "data/gns.geojson",

  landcoverImage: "images/landcover.png",
  landcoverBounds: [[6.588423956789395, 79.91996672461941], [6.762517458851757, 80.07366846973225]],
  landcoverLegend: [
    { label: "Agriculture", color: "#C08A28" },
    { label: "Built-up / Urban", color: "#B54A2C" },
    { label: "Forest / Vegetation", color: "#2F5233" },
    { label: "Water / Wetland", color: "#3E6E8E" },
    { label: "Bare / Other", color: "#C9BFA5" }
  ],

  agricultureImage: "images/agriculture.png",
  agricultureBounds: [[6.588399043227527, 79.91782565491508], [6.762672208346714, 80.07161723155635]],

  landuseColors: {
    "Cultivation area": "#C08A28",
    "Built up area": "#B54A2C",
    "Forest area": "#2F5233",
    "Water area": "#3E6E8E",
    "Bare area": "#C9BFA5",
    "Boggy area": "#5B8A8A",
    "Rock area": "#6B6B63"
  },

  roadStyles: {
    major: { color: "#B54A2C", weight: 2.4, classes: ["motorway", "motorway_link", "trunk", "primary"] },
    mid:   { color: "#C08A28", weight: 1.6, classes: ["secondary", "tertiary"] },
    local: { color: "#8B8F7A", weight: 1,   classes: ["residential", "living_street", "unclassified", "service"] },
    minor: { color: "#B4B2A9", weight: 0.6, classes: ["track", "footway", "path", "steps", "track_grade3", "track_grade4", "track_grade5"] }
  }
};

// Shared in-memory store so map.js / dashboard.js / report.js don't
// each re-fetch or re-parse the 6MB grid file.
const STORE = {
  geojson: null,
  loaded: false,
  listeners: [],
  onReady(fn){
    if (this.loaded) fn(this.geojson);
    else this.listeners.push(fn);
  },
  setData(data){
    this.geojson = data;
    this.loaded = true;
    this.listeners.forEach(fn => fn(data));
    this.listeners = [];
  }
};

function loadGridData(){
  if (STORE.loaded || STORE._fetching) return;
  STORE._fetching = true;
  fetch(CONFIG.dataUrl)
    .then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(data => STORE.setData(data))
    .catch(err => {
      console.error("Failed to load grid data:", err);
      const el = document.getElementById("map-loading");
      if (el) el.innerHTML = "<p>Couldn't load the grid data. Check that data/grid.geojson is present and you're serving this over a local server (not file://).</p>";
    });
}

function fmtNum(v, digits = 2){
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Number(v).toFixed(digits);
}
function fmtPct(v){
  if (v === null || v === undefined) return "—";
  return Math.round(v) + "%";
}

// Fetches the full report history from the Apps Script doGet() endpoint.
// Returns a Promise<Array<{gridId, landUse, date}>>, resolving to [] on failure
// so callers never have to special-case a network error.
function fetchLiveReports(){
  return fetch(CONFIG.reportsApiUrl)
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .catch(err => { console.error("Couldn't load live reports:", err); return []; });
}

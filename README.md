# AgriShield – Bandaragama

A participatory Planning Support System for monitoring agricultural land and
urban conversion pressure in Bandaragama DSD, built on the 100 m grid you
produced from GEE + QGIS (`UPI`, `Pressure`, `Con_Ris`, `Ag_Vuln`, etc.).

**Full name:** AgriShield – Bandaragama — Participatory Web GIS for Monitoring
Agricultural Lands and Urban Conversion Pressure

## Avoiding stale-cache issues after updates

`index.html` loads `css/style.css` and the `js/*.js` files with a `?v=3`
version marker. Browsers (and GitHub Pages' CDN) aggressively cache files by
their exact URL — without this marker, visitors can end up seeing an old
cached CSS/JS file paired with your newly-pushed HTML, causing broken-looking
layouts right after a deploy.

**Whenever you push a CSS or JS change, bump the number** (`?v=3` → `?v=4`)
in `index.html` on all the `<link>`/`<script>` tags that changed, so browsers
are forced to fetch the fresh version instead of reusing a cached one.

## Layout

The site opens directly on the **Map** page (not Home) — since the map is the
primary artifact, it loads immediately rather than requiring a click through
a landing page. Navigation is a top bar (logo + wordmark on the left, page
links on the right), replacing the earlier left sidebar. An "About this
project" link sits in the bottom corner of the map's left panel for anyone
who wants the fuller context (methodology, data sources) without it blocking
the map on arrival.

## Fonts

Manrope (headings) + Inter (body) + IBM Plex Mono (data/stats), loaded from
Google Fonts. Update the `--font-display` / `--font-body` variables at the
top of `css/style.css` to change these.

## Layers

Beyond the pressure grid, the Map page includes:

- **Land cover** — a colorized image overlay (`images/landcover.png`), reclassified from an 8-class WorldCover-derived raster down to 5 groups relevant to this study: Agriculture, Built-up/Urban, Forest/Vegetation, Water/Wetland, Bare/Other. Positioned via `CONFIG.landcoverBounds` in `config.js` — no tile server needed since it's one static image anchored to real-world coordinates.
- **Land use** — vector polygons (`data/landuse.geojson`) colored by the 7 broad classes in `landuse_cl` (Cultivation, Built-up, Water, Bare, Boggy, Rock, Forest), with the detailed subtype (`landuse__1`, e.g. Paddy, Coconut, Rubber) shown in the popup.
- **Agriculture mask** — a semi-transparent green overlay (`images/agriculture.png`) showing the binary agriculture mask directly, for cases where seeing raw agricultural extent is more useful than the derived Ag_Per percentage already in the grid.
- **Roads** — vector lines (`data/roads.geojson`) styled by class hierarchy (motorway/trunk/primary heavier, footways/tracks lighter) — see `CONFIG.roadStyles`.
- **GN Divisions** — boundary outlines (`data/gns.geojson`) from 139 named GN Divisions. Loaded quietly in the background regardless of whether the layer checkbox is on, since it also powers search.

All five are off by default and lazy-loaded — nothing fetches until its checkbox is checked (except GN Divisions, whose data is small and needed immediately for search).

## Search

The search box tries, in order: **Grid ID** → **GN Division name** (instant, local, powers the type-ahead suggestions as you type) → an external OpenStreetMap place-name lookup restricted to the Bandaragama area. No API key needed for any of it.

## Running it locally

Browsers block `fetch()` of local files under `file://`, so the grid data
won't load if you just double-click `index.html`. Serve the folder instead:

```bash
cd UrbanPressureWebMap
python3 -m http.server 8000
# then open http://localhost:8000
```

(Any static server works — `npx serve`, VS Code's Live Server, etc.)

## Folder structure

```
UrbanPressureWebMap/
├── index.html          single-page app: Home / Map / Dashboard / Report / About
├── css/style.css        design system
├── js/
│   ├── config.js        colour scales, thresholds, shared data loader
│   ├── nav.js            page switching + home hero stats/swatch
│   ├── map.js            Leaflet grid layer, legend, search, filters, popups
│   ├── dashboard.js      Chart.js summary stats and charts
│   └── report.js         citizen reporting form (see below)
└── data/grid.geojson     your 14,293-cell UPI grid (coordinates rounded to 6dp)
```

## Data notes

- `data/grid.geojson` is your original `Bandaragama_UrbanPressure.geojson`
  with coordinate precision rounded to 6 decimal places (~11 cm) to cut file
  size from 8.2 MB to 5.9 MB with no visible loss of accuracy at any zoom
  level you'd actually use.
- Pressure thresholds used throughout (legend, dashboard footnote): UPI < 0.20
  → Low, 0.20–0.30 → Moderate, > 0.30 → High. This matches the class
  boundaries already present in your data — adjust `CONFIG` in `config.js`
  if your methodology changes.
- The `output_files.zip` you uploaded (shapefiles, rasters, intermediate
  layers) wasn't needed for the web app itself since the final grid GeoJSON
  already carries the computed scores — keep it as your QGIS/analysis
  archive.

## Public reporting: swapping in a real backend

`js/report.js` currently writes submissions to `localStorage` so the form is
fully demoable with no backend. Every submission is a flat JSON object:

```json
{
  "id": 1731000000000,
  "name": "Jane Silva",
  "email": "",
  "gridId": "4021",
  "landUse": "Paddy field being filled",
  "date": "2026-07-15",
  "remarks": "Filling started this week near the temple road",
  "submittedAt": "2026-07-15T09:00:00.000Z"
}
```

To go live, replace the `localStorage` lines inside `submitReport()` with
either:

- **Google Sheets** — a Google Apps Script Web App bound to a Sheet,
  `POST`ed to with `fetch()` (a stub is already commented in the file), or
- **Firebase** — a Firestore `addDoc()` call.

Photo uploads aren't wired to storage yet (the file input is present in the
form but not persisted) — add Firebase Storage or a Google Drive upload step
alongside whichever backend you choose.

## Search: Grid ID or place name

The search box on the Map page tries a Grid ID match first. If the text
doesn't match any cell, it falls back to a free OpenStreetMap (Nominatim)
place-name lookup, restricted to a bounding box around Bandaragama DSD so
results stay local (a search for "Colombo" won't fly you across the
country). A temporary marker drops at the matched location — from there,
just click nearby cells to see their data. No API key or account needed,
but Nominatim is rate-limited to about 1 request/second, which is well
within what this app needs.

## Dashboard report breakdown

Alongside the summary stats and charts, the Dashboard cross-references live
citizen reports against the grid cell they were filed against, showing counts
like "3 reports in High-pressure cells" and "1 report in Moderate-risk cells"
— a quick way to see whether citizen observations line up with, or diverge
from, the modelled pressure/risk classification.

## Deploying

Push this folder to a GitHub repo and enable GitHub Pages on it (Settings →
Pages → deploy from the `main` branch, root folder). No build step required
— it's static HTML/CSS/JS plus one CDN load each for Leaflet and Chart.js.

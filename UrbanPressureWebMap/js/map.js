/* ==========================================================
   Interactive map: Leaflet grid, legend, search, filters,
   plus Land Use / Roads / GN Divisions / Land Cover / Agriculture
   ========================================================== */
(function(){
  let map, gridLayer, osmLayer, satLayer, reportsCluster;
  let landuseLayer, roadsLayer, gnLayer, landcoverOverlay, agricultureOverlay;
  let colourMode = "Pressure";
  let activeFilters = new Set(["Low", "Moderate", "High"]);
  const idIndex = new Map();      // Grid_ID -> layer
  const gnIndex = [];             // [{name, layer}] for search + autocomplete
  let initialized = false;
  let searchMarker = null;

  // Bandaragama DSD bounding box, padded slightly, used to keep place-name
  // search results local instead of returning matches anywhere on earth.
  // Nominatim viewbox order is: left(minLon), top(maxLat), right(maxLon), bottom(minLat)
  const STUDY_VIEWBOX = "79.897,6.783,80.092,6.568";

  window.initMapOnce = function(){
    if (initialized) return;
    initialized = true;
    buildMap();
  };

  function buildMap(){
    map = L.map("leaflet-map", { preferCanvas: true, zoomControl: true }).setView([6.6757, 79.9948], 13);

    osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors", maxZoom: 19
    }).addTo(map);

    satLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Esri World Imagery", maxZoom: 19
    });

    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);

    const coordEl = document.getElementById("coord-readout");
    map.on("mousemove", (e) => {
      coordEl.textContent = `Lat: ${e.latlng.lat.toFixed(5)} · Lng: ${e.latlng.lng.toFixed(5)}`;
    });

    document.querySelectorAll("#basemap-mode .seg-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#basemap-mode .seg-btn").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        if (btn.dataset.basemap === "satellite"){
          map.removeLayer(osmLayer);
          satLayer.addTo(map);
        } else {
          map.removeLayer(satLayer);
          osmLayer.addTo(map);
        }
      });
    });

    document.getElementById("layer-grid").addEventListener("change", (e) => {
      if (!gridLayer) return;
      if (e.target.checked) gridLayer.addTo(map);
      else map.removeLayer(gridLayer);
    });

    document.getElementById("layer-reports").addEventListener("change", (e) => {
      if (e.target.checked) loadReportsLayer();
      else if (reportsCluster) map.removeLayer(reportsCluster);
    });

    document.getElementById("layer-landuse").addEventListener("change", (e) => {
      if (e.target.checked) loadLanduseLayer();
      else if (landuseLayer) map.removeLayer(landuseLayer);
      syncExtraLegend();
    });

    document.getElementById("layer-roads").addEventListener("change", (e) => {
      if (e.target.checked) loadRoadsLayer();
      else if (roadsLayer) map.removeLayer(roadsLayer);
    });

    document.getElementById("layer-gns").addEventListener("change", (e) => {
      if (e.target.checked && gnLayer) gnLayer.addTo(map);
      else if (gnLayer) map.removeLayer(gnLayer);
    });

    document.getElementById("layer-landcover").addEventListener("change", (e) => {
      if (e.target.checked) loadLandcoverOverlay();
      else if (landcoverOverlay) map.removeLayer(landcoverOverlay);
      syncExtraLegend();
    });

    document.getElementById("layer-agriculture").addEventListener("change", (e) => {
      if (e.target.checked) loadAgricultureOverlay();
      else if (agricultureOverlay) map.removeLayer(agricultureOverlay);
      syncExtraLegend();
    });

    document.querySelectorAll("#colour-mode .seg-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#colour-mode .seg-btn").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        colourMode = btn.dataset.mode;
        document.getElementById("legend-title").textContent =
          "Legend — " + (colourMode === "Pressure" ? "Urban Pressure" : "Conversion Risk");
        buildLegend();
        if (gridLayer) gridLayer.setStyle(styleFeature);
      });
    });

    document.querySelectorAll(".filter-cb").forEach(cb => {
      cb.addEventListener("change", () => {
        activeFilters = new Set(
          Array.from(document.querySelectorAll(".filter-cb:checked")).map(c => c.value)
        );
        if (gridLayer) gridLayer.setStyle(styleFeature);
      });
    });

    document.getElementById("search-btn").addEventListener("click", () => { doSearch(); hideSuggestions(); });
    const searchInput = document.getElementById("search-input");
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter"){ doSearch(); hideSuggestions(); }
      if (e.key === "Escape") hideSuggestions();
    });
    searchInput.addEventListener("input", () => updateSuggestions(searchInput.value));
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-row")) hideSuggestions();
    });

    buildLegend();
    STORE.onReady(renderGrid);
    loadGnIndex(); // small file, load early so search + autocomplete work immediately
  }

  /* ---------------------------------------------------------
     Pressure grid (existing)
     --------------------------------------------------------- */
  function loadReportsLayer(){
    if (reportsCluster){ reportsCluster.addTo(map); return; }
    fetchLiveReports().then(reports => {
      reportsCluster = L.markerClusterGroup({ maxClusterRadius: 40 });
      reports.forEach(r => {
        const cellLayer = idIndex.get(String(r.gridId));
        if (!cellLayer) return;
        const center = cellLayer.getBounds().getCenter();
        const marker = L.marker(center).bindPopup(
          `<div class="grid-popup"><h4>Grid ${r.gridId}</h4>` +
          `<p style="margin-bottom:6px;">${r.landUse || "Observation"}</p>` +
          `<p style="font-size:0.75rem;color:#5C6B60;">Reported ${r.date || "date unknown"}</p></div>`
        );
        reportsCluster.addLayer(marker);
      });
      reportsCluster.addTo(map);
    });
  }

  function styleFeature(feature){
    const p = feature.properties;
    const pressureVal = p.Pressure;
    const visible = activeFilters.has(pressureVal);
    const key = colourMode === "Pressure" ? p.Pressure : p.Con_Ris;
    const palette = colourMode === "Pressure" ? CONFIG.pressureColors : CONFIG.riskColors;
    const color = palette[key] || "#999";
    return {
      color: "#ffffff", weight: 0.3, fillColor: color,
      fillOpacity: visible ? 0.75 : 0, opacity: visible ? 0.5 : 0, interactive: visible
    };
  }

  function popupHtml(p){
    const palette = CONFIG.pressureColors;
    const pillColor = palette[p.Pressure] || "#999";
    const rows = [
      ["Agricultural cover", fmtPct(p.Ag_Per)],
      ["Built-up cover", fmtPct(p.Builtup_Pe)],
      ["Urban growth", fmtPct(p.Growth_Per)],
      ["Urban Pressure Index", fmtNum(p.UPI)],
      ["Conversion risk", p.Con_Ris ?? "—"],
      ["Ag. vulnerability", fmtNum(p.Ag_Vuln)]
    ];
    const rowsHtml = rows.map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join("");
    return `
      <div class="grid-popup">
        <h4>Grid ${p.Grid_ID}</h4>
        <span class="pill" style="background:${pillColor}">${p.Pressure} pressure</span>
        <table>${rowsHtml}</table>
        <a class="report-link" href="#" data-grid="${p.Grid_ID}">Report a change here</a>
      </div>`;
  }

  function renderGrid(data){
    gridLayer = L.geoJSON(data, {
      renderer: L.canvas({ padding: 0.3 }),
      style: styleFeature,
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        idIndex.set(String(p.Grid_ID), layer);
        layer.bindPopup(() => popupHtml(p), { maxWidth: 260 });
        layer.on("popupopen", (e) => {
          const el = e.popup.getElement().querySelector(".report-link");
          if (el) el.addEventListener("click", (ev) => {
            ev.preventDefault();
            document.getElementById("report-grid-id").value = ev.target.dataset.grid;
            window.appGoTo("report");
          });
        });
      }
    }).addTo(map);

    document.getElementById("map-loading").style.opacity = "0";
    setTimeout(() => { document.getElementById("map-loading").style.display = "none"; }, 300);
  }

  function buildLegend(){
    const legend = document.getElementById("legend");
    const order = colourMode === "Pressure" ? CONFIG.pressureOrder : CONFIG.riskOrder;
    const palette = colourMode === "Pressure" ? CONFIG.pressureColors : CONFIG.riskColors;
    legend.innerHTML = order.map(cls => `
      <div class="legend-row">
        <span class="legend-swatch" style="background:${palette[cls]}"></span>
        <span>${cls}</span>
      </div>`).join("");
  }

  /* ---------------------------------------------------------
     Land Use (polygons, colored by broad class)
     --------------------------------------------------------- */
  function loadLanduseLayer(){
    if (landuseLayer){ landuseLayer.addTo(map); return; }
    fetch(CONFIG.landuseUrl).then(r => r.json()).then(data => {
      landuseLayer = L.geoJSON(data, {
        renderer: L.canvas({ padding: 0.3 }),
        style: (f) => ({
          color: "#ffffff", weight: 0.2,
          fillColor: CONFIG.landuseColors[f.properties.landuse_cl] || "#999",
          fillOpacity: 0.65
        }),
        onEachFeature: (f, layer) => {
          const p = f.properties;
          layer.bindPopup(
            `<div class="grid-popup"><h4>${p.landuse_cl}</h4>` +
            `<table><tr><td class="k">Detail</td><td class="v">${p.landuse__1 || "—"}</td></tr></table></div>`
          );
        }
      }).addTo(map);
    }).catch(err => console.error("Land use load failed:", err));
  }

  /* ---------------------------------------------------------
     Roads (lines, styled by class hierarchy)
     --------------------------------------------------------- */
  function roadStyleFor(fclass){
    for (const key in CONFIG.roadStyles){
      const s = CONFIG.roadStyles[key];
      if (s.classes.includes(fclass)) return { color: s.color, weight: s.weight, opacity: 0.85 };
    }
    return { color: "#B4B2A9", weight: 0.6, opacity: 0.7 };
  }

  function loadRoadsLayer(){
    if (roadsLayer){ roadsLayer.addTo(map); return; }
    fetch(CONFIG.roadsUrl).then(r => r.json()).then(data => {
      roadsLayer = L.geoJSON(data, {
        renderer: L.canvas({ padding: 0.3 }),
        style: (f) => roadStyleFor(f.properties.fclass),
        onEachFeature: (f, layer) => {
          const p = f.properties;
          if (p.name) layer.bindPopup(`<div class="grid-popup"><h4>${p.name}</h4><p>${p.fclass}</p></div>`);
        }
      }).addTo(map);
    }).catch(err => console.error("Roads load failed:", err));
  }

  /* ---------------------------------------------------------
     GN Divisions (boundaries + search index)
     --------------------------------------------------------- */
  function loadGnIndex(){
    fetch(CONFIG.gnsUrl).then(r => r.json()).then(data => {
      gnLayer = L.geoJSON(data, {
        style: { color: "#24402A", weight: 1, fill: false, dashArray: "3,3" },
        onEachFeature: (f, layer) => {
          const name = f.properties.ADM4_EN;
          gnIndex.push({ name, layer });
          layer.bindPopup(`<div class="grid-popup"><h4>${name}</h4><p>GN Division</p></div>`);
        }
      });
      // Not added to the map by default — only when the checkbox is checked —
      // but the index above is ready immediately for search/autocomplete.
    }).catch(err => console.error("GN Divisions load failed:", err));
  }

  /* ---------------------------------------------------------
     Land Cover / Agriculture (static colorized image overlays)
     --------------------------------------------------------- */
  function loadLandcoverOverlay(){
    if (landcoverOverlay){ landcoverOverlay.addTo(map); return; }
    landcoverOverlay = L.imageOverlay(CONFIG.landcoverImage, CONFIG.landcoverBounds, { opacity: 0.8 }).addTo(map);
  }

  function loadAgricultureOverlay(){
    if (agricultureOverlay){ agricultureOverlay.addTo(map); return; }
    agricultureOverlay = L.imageOverlay(CONFIG.agricultureImage, CONFIG.agricultureBounds, { opacity: 0.85 }).addTo(map);
  }

  function syncExtraLegend(){
    const anyOn = ["layer-landcover", "layer-landuse", "layer-agriculture"]
      .some(id => document.getElementById(id).checked);
    document.getElementById("extra-legend-block").style.display = anyOn ? "block" : "none";

    const rows = [];
    if (document.getElementById("layer-landcover").checked){
      rows.push(`<p class="ts" style="font-size:0.72rem;font-weight:600;margin:6px 0 2px;">Land cover</p>`);
      CONFIG.landcoverLegend.forEach(c => rows.push(
        `<div class="legend-row"><span class="legend-swatch" style="background:${c.color}"></span><span>${c.label}</span></div>`
      ));
    }
    if (document.getElementById("layer-landuse").checked){
      rows.push(`<p style="font-size:0.72rem;font-weight:600;margin:10px 0 2px;">Land use</p>`);
      Object.entries(CONFIG.landuseColors).forEach(([label, color]) => rows.push(
        `<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span><span>${label}</span></div>`
      ));
    }
    if (document.getElementById("layer-agriculture").checked){
      rows.push(`<p style="font-size:0.72rem;font-weight:600;margin:10px 0 2px;">Agriculture mask</p>`);
      rows.push(`<div class="legend-row"><span class="legend-swatch" style="background:#3F6B47"></span><span>Agricultural land</span></div>`);
    }
    document.getElementById("extra-legend").innerHTML = rows.join("");
  }

  /* ---------------------------------------------------------
     Search: Grid ID -> GN Division (local) -> place name (online)
     --------------------------------------------------------- */
  function doSearch(){
    const val = document.getElementById("search-input").value.trim();
    const msg = document.getElementById("search-msg");
    if (!val){ msg.textContent = ""; return; }

    const cellLayer = idIndex.get(val);
    if (cellLayer){
      msg.textContent = "";
      clearSearchMarker();
      map.fitBounds(cellLayer.getBounds(), { maxZoom: 17 });
      cellLayer.openPopup();
      return;
    }

    const gnMatch = gnIndex.find(g => g.name.toLowerCase() === val.toLowerCase())
      || gnIndex.find(g => g.name.toLowerCase().includes(val.toLowerCase()));
    if (gnMatch){
      msg.textContent = "";
      clearSearchMarker();
      map.fitBounds(gnMatch.layer.getBounds(), { maxZoom: 15 });
      gnMatch.layer.openPopup();
      return;
    }

    msg.textContent = "Looking up that location…";
    geocodePlace(val)
      .then(result => {
        if (!result){
          msg.textContent = `No grid cell, GN Division, or place found for "${val}".`;
          return;
        }
        msg.textContent = `Showing "${result.label}" — click a cell nearby for its data.`;
        map.setView([result.lat, result.lon], 16);
        dropSearchMarker(result.lat, result.lon, result.label);
      })
      .catch(err => {
        console.error("Geocoding failed:", err);
        msg.textContent = "Location search failed — check your connection and try again.";
      });
  }

  function updateSuggestions(text){
    const list = document.getElementById("suggest-list");
    const q = text.trim().toLowerCase();
    if (q.length < 1 || !gnIndex.length){ hideSuggestions(); return; }

    const matches = gnIndex.filter(g => g.name.toLowerCase().includes(q)).slice(0, 6);
    if (!matches.length){ hideSuggestions(); return; }

    list.innerHTML = matches.map((g, i) =>
      `<div class="suggest-item" data-idx="${i}">${g.name}</div>`
    ).join("");
    list.classList.add("is-open");

    list.querySelectorAll(".suggest-item").forEach((el, i) => {
      el.addEventListener("click", () => {
        document.getElementById("search-input").value = matches[i].name;
        hideSuggestions();
        document.getElementById("search-msg").textContent = "";
        clearSearchMarker();
        map.fitBounds(matches[i].layer.getBounds(), { maxZoom: 15 });
        matches[i].layer.openPopup();
      });
    });
  }

  function hideSuggestions(){
    const list = document.getElementById("suggest-list");
    list.classList.remove("is-open");
    list.innerHTML = "";
  }

  function geocodePlace(query){
    const url = "https://nominatim.openstreetmap.org/search"
      + "?format=json&limit=1&bounded=1&viewbox=" + STUDY_VIEWBOX
      + "&q=" + encodeURIComponent(query + ", Bandaragama, Sri Lanka");
    return fetch(url, { headers: { "Accept-Language": "en" } })
      .then(r => r.json())
      .then(arr => {
        if (!arr || !arr.length) return null;
        return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon), label: arr[0].display_name.split(",")[0] };
      });
  }

  function dropSearchMarker(lat, lon, label){
    clearSearchMarker();
    searchMarker = L.marker([lat, lon]).addTo(map).bindPopup(label).openPopup();
  }

  function clearSearchMarker(){
    if (searchMarker){ map.removeLayer(searchMarker); searchMarker = null; }
  }
})();

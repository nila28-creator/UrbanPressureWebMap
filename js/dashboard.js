/* ==========================================================
   Dashboard: summary stat cards + Chart.js visualisations
   ========================================================== */
(function(){
  let built = false;

  window.initDashboardOnce = function(){
    if (built) return;
    built = true;
    STORE.onReady(renderDashboard);
  };

  function renderDashboard(data){
    const feats = data.features.map(f => f.properties);
    const total = feats.length;

    const counts = { Low: 0, Moderate: 0, High: 0 };
    feats.forEach(p => { if (counts[p.Pressure] !== undefined) counts[p.Pressure]++; });

    const riskCounts = { None: 0, Low: 0, Moderate: 0, High: 0 };
    feats.forEach(p => { const r = p.Con_Ris || "None"; if (riskCounts[r] !== undefined) riskCounts[r]++; });

    const agCells = feats.filter(p => p.Ag_Per >= 50).length;
    const upiVals = feats.map(p => p.UPI).filter(v => v !== null && v !== undefined);
    const meanUpi = upiVals.reduce((a, b) => a + b, 0) / upiVals.length;
    const flagged = riskCounts.Moderate + riskCounts.High;

    const cards = [
      { n: total.toLocaleString(), l: "Grid cells analysed" },
      { n: counts.High.toLocaleString(), l: "High urban pressure cells", flag: true },
      { n: meanUpi.toFixed(2), l: "Mean urban pressure index" },
      { n: "…", l: "Citizen reports received", id: "reports-count-card" }
    ];
    document.getElementById("dash-cards").innerHTML = cards.map(c =>
      `<div class="stat-card${c.flag ? " stat-card-flag" : ""}"><div class="n" ${c.id ? `id="${c.id}"` : ""}>${c.n}</div><div class="l">${c.l}</div></div>`
    ).join("");

    const chips = [
      { n: agCells.toLocaleString(), l: "predominantly agricultural cells (\u226550%)" },
      { n: flagged.toLocaleString(), l: "cells flagged for conversion risk" },
      { n: pct(counts.Moderate, total), l: "of cells under moderate pressure" }
    ];
    document.getElementById("dash-chips").innerHTML = chips.map(c =>
      `<span class="dash-chip"><strong>${c.n}</strong> ${c.l}</span>`
    ).join("");

    fetchLiveReports().then(reports => {
      const el = document.getElementById("reports-count-card");
      if (el) el.textContent = reports.length.toLocaleString();
      renderReportBreakdown(reports, feats);
    });

    try {
      new Chart(document.getElementById("chart-pressure"), {
        type: "doughnut",
        data: {
          labels: CONFIG.pressureOrder,
          datasets: [{
            data: CONFIG.pressureOrder.map(k => counts[k]),
            backgroundColor: CONFIG.pressureOrder.map(k => CONFIG.pressureColors[k]),
            borderWidth: 0
          }]
        },
        options: { plugins: { legend: { position: "bottom", labels: { font: { family: "Inter" } } } } }
      });

      new Chart(document.getElementById("chart-risk"), {
        type: "doughnut",
        data: {
          labels: CONFIG.riskOrder,
          datasets: [{
            data: CONFIG.riskOrder.map(k => riskCounts[k]),
            backgroundColor: CONFIG.riskOrder.map(k => CONFIG.riskColors[k]),
            borderWidth: 0
          }]
        },
        options: { plugins: { legend: { position: "bottom", labels: { font: { family: "Inter" } } } } }
      });
    } catch (err) { console.error("Pressure/risk charts failed:", err); }

    const avgByClass = CONFIG.pressureOrder.map(cls => {
      const sub = feats.filter(p => p.Pressure === cls);
      const avg = (key) => sub.reduce((a, p) => a + (p[key] || 0), 0) / sub.length;
      return { cls, ag: avg("Ag_Per"), urban: avg("Builtup_Pe"), growth: avg("Growth_Per") };
    });

    try {
      new Chart(document.getElementById("chart-cover"), {
        type: "bar",
        data: {
          labels: avgByClass.map(d => d.cls),
          datasets: [
            { label: "Agricultural %", data: avgByClass.map(d => d.ag), backgroundColor: CONFIG.pressureColors.Low },
            { label: "Built-up %", data: avgByClass.map(d => d.urban), backgroundColor: "#8B8F7A" },
            { label: "Urban growth %", data: avgByClass.map(d => d.growth), backgroundColor: CONFIG.pressureColors.High }
          ]
        },
        options: {
          scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true, title: { display: true, text: "% of cell" } }
          },
          plugins: { legend: { position: "bottom", labels: { font: { family: "Inter" } } } }
        }
      });
    } catch (err) { console.error("Land cover chart failed:", err); }

    renderCropChart();
    renderScatterChart(feats);
    renderPopulationSection();
  }

  /* ---------------------------------------------------------
     Major crop distribution — area-weighted, from the Land Use
     layer's detailed subtypes, restricted to CONFIG.cropTypes.
     --------------------------------------------------------- */
  function ringArea(ring){
    // Shoelace formula on raw lon/lat — fine for relative comparison
    // over an area this small (~15 km across), not survey-grade.
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++){
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum / 2);
  }
  function polygonArea(geom){
    if (geom.type === "Polygon"){
      return geom.coordinates.reduce((a, ring, i) => i === 0 ? a + ringArea(ring) : a - ringArea(ring), 0);
    }
    if (geom.type === "MultiPolygon"){
      return geom.coordinates.reduce((a, poly) => a + polygonArea({ type: "Polygon", coordinates: poly }), 0);
    }
    return 0;
  }

  function renderCropChart(){
    fetch(CONFIG.landuseUrl).then(r => r.json()).then(data => {
      const totals = {};
      data.features.forEach(f => {
        const type = f.properties.landuse__1;
        if (!CONFIG.cropTypes.includes(type)) return;
        totals[type] = (totals[type] || 0) + polygonArea(f.geometry);
      });
      const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      const sumArea = entries.reduce((a, [, v]) => a + v, 0);

      new Chart(document.getElementById("chart-crops"), {
        type: "bar",
        data: {
          labels: entries.map(([k]) => k),
          datasets: [{
            label: "Share of mapped crop area",
            data: entries.map(([, v]) => Math.round(1000 * v / sumArea) / 10),
            backgroundColor: CONFIG.pressureColors.Low
          }]
        },
        options: {
          indexAxis: "y",
          scales: { x: { beginAtZero: true, title: { display: true, text: "% of mapped crop area" } } },
          plugins: { legend: { display: false } }
        }
      });
    }).catch(err => console.error("Crop chart failed to load:", err));
  }

  /* ---------------------------------------------------------
     UPI vs. Agricultural Vulnerability scatter (sampled for
     rendering performance — every 7th cell, ~2,000 points).
     --------------------------------------------------------- */
  function renderScatterChart(feats){
    const points = feats
      .filter((p, i) => i % 7 === 0 && p.UPI !== null && p.Ag_Vuln !== null)
      .map(p => ({ x: p.UPI, y: p.Ag_Vuln, pressure: p.Pressure }));

    try {
      new Chart(document.getElementById("chart-scatter"), {
        type: "scatter",
        data: {
          datasets: CONFIG.pressureOrder.map(cls => ({
            label: cls,
            data: points.filter(p => p.pressure === cls).map(p => ({ x: p.x, y: p.y })),
            backgroundColor: CONFIG.pressureColors[cls],
            pointRadius: 2.5
          }))
        },
        options: {
          scales: {
            x: { title: { display: true, text: "Urban Pressure Index" } },
            y: { title: { display: true, text: "Agricultural Vulnerability" } }
          },
          plugins: { legend: { position: "bottom", labels: { font: { family: "Inter" } } } }
        }
      });
    } catch (err) { console.error("Scatter chart failed:", err); }
  }

  /* ---------------------------------------------------------
     Population context — Bandaragama DSD, separate data source
     from the grid analysis (see CONFIG.population).
     --------------------------------------------------------- */
  function renderPopulationSection(){
    const p = CONFIG.population;
    const cards = [
      { n: p.values[2].toLocaleString(), l: "Population (2024)" },
      { n: p.density2024.toLocaleString(undefined, { maximumFractionDigits: 0 }), l: "Density (people / km²)" },
      { n: p.growthPA + "%", l: "Annual growth rate" },
      { n: p.areaSqKm + " km²", l: "Official DSD area" }
    ];
    document.getElementById("population-cards").innerHTML = cards.map(c =>
      `<div class="stat-card"><div class="n">${c.n}</div><div class="l">${c.l}</div></div>`
    ).join("");

    const splitIdx = p.years.indexOf(p.projectedFrom);
    const censusData = p.values.map((v, i) => i <= splitIdx ? v : null);
    const projectedData = p.values.map((v, i) => i >= splitIdx ? v : null);

    try {
      new Chart(document.getElementById("chart-population"), {
        type: "line",
        data: {
          labels: p.years,
          datasets: [
            { label: "Census", data: censusData, borderColor: "#24402A", backgroundColor: "#24402A", tension: 0.15 },
            { label: "Projected", data: projectedData, borderColor: "#24402A", borderDash: [6, 4], backgroundColor: "#24402A", tension: 0.15 }
          ]
        },
        options: {
          scales: { y: { beginAtZero: false, title: { display: true, text: "Population" } } },
          plugins: { legend: { position: "bottom", labels: { font: { family: "Inter" } } } }
        }
      });
    } catch (err) { console.error("Population chart failed:", err); }
  }

  function renderReportBreakdown(reports, feats){
    // Grid_ID -> {Pressure, Con_Ris}, so we can look up which class each
    // reported cell actually falls under.
    const gridLookup = new Map();
    feats.forEach(p => gridLookup.set(String(p.Grid_ID), p));

    const byPressure = { Low: 0, Moderate: 0, High: 0 };
    const byRisk = { None: 0, Low: 0, Moderate: 0, High: 0 };
    let unmatched = 0;

    reports.forEach(r => {
      const cell = gridLookup.get(String(r.gridId));
      if (!cell){ unmatched++; return; }
      if (byPressure[cell.Pressure] !== undefined) byPressure[cell.Pressure]++;
      const risk = cell.Con_Ris || "None";
      if (byRisk[risk] !== undefined) byRisk[risk]++;
    });

    const pressureHtml = CONFIG.pressureOrder.map(cls =>
      `<div class="mini-stat-card"><strong>${byPressure[cls]}</strong> report${byPressure[cls] === 1 ? "" : "s"} in <strong>${cls}</strong>-pressure cells</div>`
    ).join("");
    document.getElementById("reports-by-pressure").innerHTML = pressureHtml ||
      `<p class="reports-empty">No reports yet.</p>`;

    const riskHtml = CONFIG.riskOrder.map(cls =>
      `<div class="mini-stat-card"><strong>${byRisk[cls]}</strong> report${byRisk[cls] === 1 ? "" : "s"} in <strong>${cls}</strong>-risk cells</div>`
    ).join("");
    document.getElementById("reports-by-risk").innerHTML = riskHtml ||
      `<p class="reports-empty">No reports yet.</p>`;
  }

  function pct(n, total){ return Math.round((n / total) * 100) + "%"; }
})();

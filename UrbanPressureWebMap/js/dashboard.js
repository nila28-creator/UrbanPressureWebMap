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
      { n: agCells.toLocaleString(), l: "Predominantly agricultural cells (≥50%)" },
      { n: counts.High.toLocaleString(), l: "High urban pressure cells" },
      { n: flagged.toLocaleString(), l: "Cells flagged for conversion risk" },
      { n: meanUpi.toFixed(2), l: "Mean urban pressure index" },
      { n: pct(counts.Moderate, total), l: "Share under moderate pressure" },
      { n: "…", l: "Citizen reports received", id: "reports-count-card" }
    ];
    document.getElementById("dash-cards").innerHTML = cards.map(c =>
      `<div class="stat-card"><div class="n" ${c.id ? `id="${c.id}"` : ""}>${c.n}</div><div class="l">${c.l}</div></div>`
    ).join("");

    fetchLiveReports().then(reports => {
      const el = document.getElementById("reports-count-card");
      if (el) el.textContent = reports.length.toLocaleString();
    });

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
      options: { plugins: { legend: { position: "bottom", labels: { font: { family: "Work Sans" } } } } }
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
      options: { plugins: { legend: { position: "bottom", labels: { font: { family: "Work Sans" } } } } }
    });

    const avgByClass = CONFIG.pressureOrder.map(cls => {
      const sub = feats.filter(p => p.Pressure === cls);
      const avg = (key) => sub.reduce((a, p) => a + (p[key] || 0), 0) / sub.length;
      return { cls, ag: avg("Ag_Per"), urban: avg("Builtup_Pe"), growth: avg("Growth_Per") };
    });

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
        scales: { y: { beginAtZero: true, title: { display: true, text: "% of cell" } } },
        plugins: { legend: { position: "bottom", labels: { font: { family: "Work Sans" } } } }
      }
    });
  }

  function pct(n, total){ return Math.round((n / total) * 100) + "%"; }
})();

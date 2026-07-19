/* ==========================================================
   Navigation between pages + Home page hero content
   ========================================================== */
(function(){
  const navBtns = document.querySelectorAll(".nav-btn");
  const pages = document.querySelectorAll(".page");

  function goTo(pageId){
    pages.forEach(p => p.classList.toggle("is-active", p.id === "page-" + pageId));
    navBtns.forEach(b => b.classList.toggle("is-active", b.dataset.page === pageId));
    if (pageId === "map" && window.initMapOnce) window.initMapOnce();
    if (pageId === "dashboard" && window.initDashboardOnce) window.initDashboardOnce();
  }

  navBtns.forEach(b => b.addEventListener("click", () => goTo(b.dataset.page)));
  document.querySelectorAll("[data-nav]").forEach(b =>
    b.addEventListener("click", () => goTo(b.dataset.nav))
  );

  window.appGoTo = goTo;
  document.getElementById("data-currency-date").textContent = CONFIG.lastUpdated;
  loadGridData();
  fetchLiveReports().then(reports => buildTicker(reports.slice().reverse()));

  STORE.onReady(data => {
    const feats = data.features;
    const total = feats.length;
    const high = feats.filter(f => f.properties.Pressure === "High").length;
    const upiVals = feats.map(f => f.properties.UPI).filter(v => v !== null && v !== undefined);
    const meanUpi = upiVals.reduce((a, b) => a + b, 0) / upiVals.length;

    document.getElementById("hs-total").textContent = total.toLocaleString();
    document.getElementById("hs-high").textContent = high.toLocaleString();
    document.getElementById("hs-upi").textContent = meanUpi.toFixed(2);

    buildSwatch(feats);
  });

  function buildSwatch(feats){
    const grid = document.getElementById("swatch-grid");
    const cells = 108; // 18x6
    const counts = { Low: 0, Moderate: 0, High: 0 };
    feats.forEach(f => { const p = f.properties.Pressure; if (counts[p] !== undefined) counts[p]++; });
    const total = counts.Low + counts.Moderate + counts.High;

    const bag = [];
    CONFIG.pressureOrder.forEach(cls => {
      const n = Math.round((counts[cls] / total) * cells);
      for (let i = 0; i < n; i++) bag.push(cls);
    });
    while (bag.length < cells) bag.push("Low");
    // shuffle for a natural sampled look
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }

    grid.innerHTML = "";
    bag.slice(0, cells).forEach((cls, i) => {
      const d = document.createElement("div");
      d.style.background = CONFIG.pressureColors[cls];
      d.style.opacity = "0";
      d.style.transition = `opacity .4s ease ${i * 4}ms`;
      grid.appendChild(d);
      requestAnimationFrame(() => { d.style.opacity = "1"; });
    });
  }
  function buildTicker(reports){
    const el = document.getElementById("hero-ticker");
    const recent = reports.slice(0, 3);
    if (!recent.length){
      el.innerHTML = `<p class="ticker-empty">No reports yet &mdash; be the first to flag something.</p>`;
      return;
    }
    el.innerHTML = recent.map(r => `
      <div class="ticker-item">
        <p class="ti-type">${r.landUse || "Observation"}</p>
        <p class="ti-meta">Grid ${r.gridId || "—"} &middot; ${r.date || "no date"}</p>
      </div>`).join("");
  }
})();

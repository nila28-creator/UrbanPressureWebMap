/* ==========================================================
   Public reporting module.
   Submissions POST to the Google Apps Script Web App (see
   CONFIG.reportsApiUrl), which appends a row to the private
   Sheet and emails a notification. The "recent reports" panel
   reads back the same endpoint's doGet() feed, so every visitor
   sees the same shared history — not just their own submissions.
   ========================================================== */
(function(){
  const form = document.getElementById("report-form");
  const msg = document.getElementById("report-msg");
  const log = document.getElementById("reports-log");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const report = {
      name: fd.get("name") || "Anonymous",
      email: fd.get("email") || "",
      gridId: fd.get("gridId") || "",
      landUse: fd.get("landUse"),
      date: fd.get("date"),
      remarks: fd.get("remarks") || ""
    };
    submitReport(report);
    form.reset();
    msg.textContent = "Thanks — your report has been logged.";
    setTimeout(() => { msg.textContent = ""; }, 4000);
  });

  function submitReport(report){
    // Photo uploads aren't wired to storage yet — the field is present in
    // the form but not persisted. Add Firebase Storage or a Drive upload
    // step here if you need that later.

    // text/plain avoids a CORS preflight (Apps Script doesn't handle
    // OPTIONS requests), while doPost() still parses the body as JSON.
    fetch(CONFIG.reportsApiUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(report)
    }).catch(err => console.error("Report submission failed:", err));

    // Optimistic UI: show it locally right away without waiting on a
    // refetch of the whole sheet (which also wouldn't have this row yet —
    // Apps Script writes are near-instant but not synchronous with this
    // no-cors fire-and-forget call).
    prependToLog({ gridId: report.gridId, landUse: report.landUse, date: report.date });
  }

  function renderLog(reports){
    if (!reports || !reports.length){
      log.innerHTML = `<p class="reports-empty">No reports yet — be the first to flag something.</p>`;
      return;
    }
    log.innerHTML = reports.slice(0, 25).map(r => `
      <div class="report-entry">
        <div class="re-type">${r.landUse || "Observation"}</div>
        <div class="re-meta">Grid ${r.gridId || "—"} · ${r.date || "no date"}</div>
      </div>`).join("");
  }

  function prependToLog(entry){
    const empty = log.querySelector(".reports-empty");
    const wrap = document.createElement("div");
    wrap.className = "report-entry";
    wrap.innerHTML = `<div class="re-type">${entry.landUse || "Observation"}</div>
      <div class="re-meta">Grid ${entry.gridId || "—"} · ${entry.date || "no date"}</div>`;
    if (empty) log.innerHTML = "";
    log.prepend(wrap);
  }

  fetchLiveReports().then(reports => renderLog(reports.reverse()));
})();

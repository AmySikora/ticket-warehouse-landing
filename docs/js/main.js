// ===== Helper: safe IIFE so one error doesn't kill everything =====
function tvgSafe(name, fn) {
  try {
    fn();
  } catch (e) {
    console.error(`[TicketVeriGuard] ${name} error:`, e);
  }
}

// ===== Footer Year (all pages) =====
tvgSafe("footer-year", () => {
  const y = document.getElementById("y");
  if (y) y.textContent = new Date().getFullYear();
});

// ===== Nav Toggle (all pages) =====
tvgSafe("nav-toggle", () => {
  const hdr = document.querySelector("header.nav");
  const btn = document.querySelector(".nav-toggle");
  const nav = document.getElementById("primary-nav");
  if (!btn || !hdr || !nav) return;

  function closeMenu() {
    nav.classList.remove("is-open");
    hdr.classList.remove("nav-open");
    document.body.classList.remove("menu-open");
    btn.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    nav.classList.add("is-open");
    hdr.classList.add("nav-open");
    document.body.classList.add("menu-open");
    btn.setAttribute("aria-expanded", "true");
  }

  function toggleMenu() {
    const isOpen = nav.classList.contains("is-open");
    isOpen ? closeMenu() : openMenu();
  }

  btn.addEventListener("click", toggleMenu);
  nav.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", closeMenu)
  );

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
});

// ===== Toast Utility (global) =====
function showToast(message, type = "success", ttl = 4000) {
  const root = document.getElementById("toast-root");
  if (!root) return;

  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.role = "status";
  el.innerHTML = `
    <div>${message}</div>
    <button aria-label="Dismiss">✕</button>
  `;

  const close = () => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 180);
  };

  const btn = el.querySelector("button");
  if (btn) btn.addEventListener("click", close);

  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(close, ttl);
}

// ===== Index: Contact Form =====
tvgSafe("contact-form", () => {
  const form = document.getElementById("contact-form");
  if (!form) return;

  const btn = document.getElementById("contact-submit");
  const status = document.getElementById("contact-status");
  const API_URL =
    "https://tvg-contact-f9046a-5bc794bd5ce3.herokuapp.com/api/contact";

  const withTimeout = (ms, promise) =>
    Promise.race([
      promise,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("timeout")), ms)
      ),
    ]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!btn || !status) return;

    status.textContent = "";
    btn.disabled = true;
    btn.textContent = "Sending...";

    const data = {
      email: form.email.value.trim(),
      message: form.message.value.trim(),
      website: form.website ? form.website.value : "",
    };

    try {
      const res = await withTimeout(
        10000,
        fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
      );
      if (!res.ok) throw new Error("Request failed");
      window.location.href = "thanks.html";
    } catch (err) {
      status.textContent =
        "Sorry, we could not send right now. Please email hello@ticketveriguard.com.";
      showToast("Send failed", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Request demo";
    }
  });
});

// ===== Brokers: Embedded Widget =====
tvgSafe("brokers-widget", () => {
  const target = document.getElementById("tvg-widget");
  if (!target) return;

  function mountWidget() {
    if (!window.TVGWidget || typeof window.TVGWidget.mount !== "function") {
      console.error("TVGWidget not loaded");
      return;
    }
    if (target.dataset.mounted === "1") return;
    window.TVGWidget.mount("#tvg-widget", {
      whiteLabel: true,
      accent: "#22d3ee",
    });
    target.dataset.mounted = "1";
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    mountWidget();
  } else {
    document.addEventListener("DOMContentLoaded", mountWidget);
  }
});

// ===== Verify: CSV Checking =====
tvgSafe("verify-csv", () => {
  const fileInput = document.getElementById("tvg-file-input");
  const analyzeBtn = document.getElementById("tvg-analyze-btn");
  const sampleBtn = document.getElementById("tvg-sample-btn");
  const fileLabel = document.getElementById("tvg-file-label");
  const summaryStrip = document.getElementById("tvg-summary");
  const table = document.getElementById("tvg-results-table");
  const filterDecision = document.getElementById("tvg-filter-decision");
  const filterMarketplace = document.getElementById("tvg-filter-marketplace");
  const resetFiltersBtn = document.getElementById("tvg-reset-filters");
  const downloadBtn = document.getElementById("tvg-download-clean");
  const thumbUp = document.getElementById("tvg-thumb-up");
  const thumbDown = document.getElementById("tvg-thumb-down");
  const feedbackLabel = document.getElementById("tvg-feedback-label");

  if (!fileInput || !analyzeBtn || !sampleBtn || !table) return;

  const tableBody = table.querySelector("tbody");

  let allRows = [];
  let sortState = { key: null, dir: 1 };
  let conflictGroups = [];
  let conflictLookup = {};

  const normalizeHeader = (h) =>
    (h || "").toString().trim().toLowerCase();

  function onFileChange() {
    if (fileInput.files && fileInput.files[0]) {
      fileLabel.textContent = fileInput.files[0].name;
      analyzeBtn.disabled = false;
    } else {
      fileLabel.textContent = "No file selected.";
      analyzeBtn.disabled = true;
    }
  }

  function handleSampleClick() {
    if (!window.Papa) {
      alert("Parser not loaded yet. Please try again.");
      return;
    }
    fetch("./sample_listings.csv")
      .then((res) => {
        if (!res.ok) throw new Error("Sample CSV not found");
        return res.text();
      })
      .then((text) => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) =>
            runAnalysis(results.data || [], "Sample CSV"),
        });
      })
      .catch(() => {
        alert(
          "Could not load sample_listings.csv. Please add it or upload your own file."
        );
      });
  }

  function parseAndAnalyze() {
    const file = fileInput.files[0];
    if (!file || !window.Papa) return;

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analyzing...";

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        runAnalysis(results.data || [], file.name || "Your CSV");
        analyzeBtn.textContent = "Analyze CSV";
        analyzeBtn.disabled = false;
      },
      error: () => {
        analyzeBtn.textContent = "Analyze CSV";
        analyzeBtn.disabled = false;
        alert("Sorry, there was a problem reading that file.");
      },
    });
  }

  function buildRows(data) {
    return data
      .map((row, idx) => {
        const headers = Object.keys(row).reduce((acc, key) => {
          acc[normalizeHeader(key)] = row[key];
          return acc;
        }, {});

        const pick = (...names) => {
          for (const n of names) {
            const v = headers[normalizeHeader(n)];
            if (v !== undefined && v !== "") return v;
          }
          return "";
        };

        const event = pick("event", "event name", "event_name");
        const section = pick("section", "sec");
        const r = pick("row");
        const seat = pick("seat", "seat number", "seat_no", "seat #");
        const mp = pick("marketplace", "source", "channel", "site");
        const id =
          pick("id", "listing_id", "external_id") || String(idx + 1);
        const when = pick("when", "timestamp", "time", "created_at");

        const key = [event, section, r, seat]
          .map((v) => (v || "").toString().trim())
          .join("|");

        return {
          _index: idx,
          id,
          event,
          marketplace: mp,
          section,
          row: r,
          seat,
          when,
          decision: "Approved",
          _key: key,
        };
      })
      .filter((r) =>
        Object.values(r).some(
          (v) => (v || "").toString().trim() !== ""
        )
      );
  }

  function hasRequiredColumns(rows) {
    if (!rows.length) return false;
    const s = rows[0];
    return !!(s.event || s.section || s.row || s.seat);
  }

  function assignConflicts(rows) {
    const byKey = {};
    rows.forEach((r) => {
      if (!r._key || r._key === "|||") return;
      (byKey[r._key] ||= []).push(r);
    });

    const groups = [];
    const lookup = {};
    let riskyCount = 0;
    let groupId = 1;

    Object.entries(byKey).forEach(([key, list]) => {
      if (list.length > 1) {
        const [event, section, row, seat] = key.split("|");
        groups.push({
          id: groupId,
          event,
          section,
          row,
          seat,
          size: list.length,
        });

        list.forEach((r, idx) => {
          if (idx === 0) {
            r.decision = "Approved";
          } else {
            r.decision = "Blocked";
            riskyCount++;
          }
          lookup[r._index] = groupId;
        });

        groupId++;
      }
    });

    return { groups, lookup, riskyCount };
  }

  function populateMarketplaceFilter() {
    const seen = new Set();
    allRows.forEach((r) => r.marketplace && seen.add(r.marketplace));
    if (!filterMarketplace) return;
    filterMarketplace.innerHTML =
      '<option value="all">All marketplaces</option>';
    Array.from(seen)
      .sort()
      .forEach((mp) => {
        const opt = document.createElement("option");
        opt.value = mp;
        opt.textContent = mp;
        filterMarketplace.appendChild(opt);
      });
  }

  function getFilteredRows() {
    const d = filterDecision ? filterDecision.value : "all";
    const mp = filterMarketplace ? filterMarketplace.value : "all";
    return allRows.filter((r) => {
      if (d !== "all" && r.decision !== d) return false;
      if (mp !== "all" && r.marketplace !== mp) return false;
      return true;
    });
  }

  function escapeHTML(str) {
    return (str || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderSummary({ scannedCount, conflictGroupCount, riskyCount, source }) {
    if (!summaryStrip) return;
    summaryStrip.innerHTML = "";
    summaryStrip.classList.add("is-visible");

    const pill = (text) => {
      const span = document.createElement("span");
      span.className = "tvg-summary-pill";
      span.textContent = text;
      return span;
    };

    const strong = document.createElement("strong");
    strong.textContent = `${scannedCount.toLocaleString()} listings scanned`;
    summaryStrip.appendChild(strong);
    summaryStrip.appendChild(
      pill(
        `${conflictGroupCount} conflict group${
          conflictGroupCount === 1 ? "" : "s"
        }`
      )
    );
    summaryStrip.appendChild(
      pill(
        `${riskyCount} risky listing${
          riskyCount === 1 ? "" : "s"
        }`
      )
    );
    summaryStrip.appendChild(pill(`Source: ${source}`));
    summaryStrip.appendChild(
      pill(
        riskyCount > 0
          ? "These are the seats we’d sync across marketplaces."
          : "No duplicates found with this rule set."
      )
    );
  }

  function renderEmpty(message) {
    tableBody.innerHTML = `
      <tr class="tvg-empty-row">
        <td colspan="8">${message}</td>
      </tr>`;
  }

  function renderTable() {
    const rows = getFilteredRows().slice();
    tableBody.innerHTML = "";

    if (!rows.length) {
      renderEmpty("No rows to display with the current filters.");
      return;
    }

    if (sortState.key) {
      rows.sort((a, b) => {
        const va = (a[sortState.key] || "").toString().toLowerCase();
        const vb = (b[sortState.key] || "").toString().toLowerCase();
        if (va < vb) return -1 * sortState.dir;
        if (va > vb) return 1 * sortState.dir;
        return 0;
      });
    }

    const groupMeta = {};
    conflictGroups.forEach((g) => (groupMeta[g.id] = g));
    const inserted = new Set();

    rows.forEach((r) => {
      const gid = conflictLookup[r._index];
      if (gid && !inserted.has(gid) && groupMeta[gid]) {
        inserted.add(gid);
        const g = groupMeta[gid];
        const labelTr = document.createElement("tr");
        labelTr.className = "tvg-group-label-row";
        labelTr.innerHTML = `
          <td colspan="8">
            Conflict group #${g.id} — ${g.size} listings share the same seat
            (${escapeHTML(g.event)} • Sec ${escapeHTML(
              g.section
            )} • Row ${escapeHTML(g.row)} • Seat ${escapeHTML(g.seat)})
          </td>`;
        tableBody.appendChild(labelTr);
      }

      const tr = document.createElement("tr");
      const isBlocked = r.decision === "Blocked";
      tr.className =
        "tvg-row " +
        (gid ? "tvg-conflict-row" : "tvg-clean-row");

      tr.innerHTML = `
        <td>${escapeHTML(r.id)}</td>
        <td>${
          isBlocked
            ? '<span class="tvg-status-pill tvg-status-risk">Duplicate seat</span>'
            : '<span class="tvg-status-pill tvg-status-ok">OK</span>'
        }</td>
        <td>${escapeHTML(r.marketplace || "—")}</td>
        <td>${escapeHTML(r.event)}</td>
        <td>${escapeHTML(r.section)}</td>
        <td>${escapeHTML(r.row)}</td>
        <td>${escapeHTML(r.seat)}</td>
        <td>${escapeHTML(r.when)}</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  function runAnalysis(data, sourceLabel) {
    const mapped = buildRows(data);
    if (!mapped.length) {
      renderEmpty(
        "We couldn’t find any listings in that file. Please check your CSV and try again."
      );
      if (summaryStrip) {
        summaryStrip.innerHTML = "";
        summaryStrip.classList.remove("is-visible");
      }
      return;
    }
    if (!hasRequiredColumns(mapped)) {
      renderEmpty(
        "This demo expects columns for Event, Section, Row, and Seat. Optional: Marketplace. Try the sample CSV to see the expected format."
      );
      if (summaryStrip) {
        summaryStrip.innerHTML = "";
        summaryStrip.classList.remove("is-visible");
      }
      return;
    }

    const conflicts = assignConflicts(mapped);
    allRows = mapped;
    conflictGroups = conflicts.groups;
    conflictLookup = conflicts.lookup;

    populateMarketplaceFilter();
    renderSummary({
      scannedCount: mapped.length,
      conflictGroupCount: conflictGroups.length,
      riskyCount: conflicts.riskyCount,
      source: sourceLabel,
    });
    renderTable();
    if (downloadBtn) downloadBtn.disabled = allRows.length === 0;
  }

  function onHeaderClick(e) {
    const th = e.target.closest('th[data-key]');
    if (!th) return;
    const key = th.getAttribute('data-key');
    if (!key) return;
  
    // Update sort direction
    if (sortState.key === key) {
      sortState.dir = -sortState.dir;
    } else {
      sortState.key = key;
      sortState.dir = 1;
    }
  
    // Remove sort indicators from all headers
    table.querySelectorAll('thead th').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
    });
  
    // Add new indicator
    th.classList.add(sortState.dir === 1 ? 'sort-asc' : 'sort-desc');
  
    renderTable();
  }
  

  function resetFilters() {
    if (filterDecision) filterDecision.value = "all";
    if (filterMarketplace) filterMarketplace.value = "all";
    renderTable();
  }

  function downloadCleanedCSV() {
    if (!allRows.length) return;
    const headers = [
      "id",
      "decision",
      "marketplace",
      "event",
      "section",
      "row",
      "seat",
      "when",
    ];
    const lines = [headers.join(",")];
    allRows.forEach((r) => {
      const vals = headers.map((h) =>
        `"${(r[h] || "").toString().replace(/"/g, '""')}"`
      );
      lines.push(vals.join(","));
    });
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ticket-veriguard-cleaned.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleThumb(up) {
    if (!feedbackLabel) return;
    feedbackLabel.textContent = up
      ? "Thanks — glad it helped!"
      : "Thanks — your feedback helps us improve.";
  }

  // Wire up
  fileInput.addEventListener("change", onFileChange);
  analyzeBtn.addEventListener("click", parseAndAnalyze);
  sampleBtn.addEventListener("click", handleSampleClick);
  table
    .querySelector("thead")
    .addEventListener("click", onHeaderClick);
  if (filterDecision)
    filterDecision.addEventListener("change", renderTable);
  if (filterMarketplace)
    filterMarketplace.addEventListener("change", renderTable);
  if (resetFiltersBtn)
    resetFiltersBtn.addEventListener("click", resetFilters);
  if (downloadBtn)
    downloadBtn.addEventListener("click", downloadCleanedCSV);
  if (thumbUp)
    thumbUp.addEventListener("click", () => handleThumb(true));
  if (thumbDown)
    thumbDown.addEventListener("click", () => handleThumb(false));
});

// ===== Prototype: MetaSearch =====
tvgSafe("prototype-metaSearch", () => {
  const form = document.getElementById("metaSearch");
  if (!form) return;

  const $ = (s, r = document) => r.querySelector(s);

  const iEvent = $("#ms-event");
  const iCity = $("#ms-city");
  const iSRS = $("#ms-srs");
  const linksWrap = $("#ms-links");

  if (!iEvent || !linksWrap) return;

  const sites = {
    google: $("#site-google"),
    seatgeek: $("#site-seatgeek"),
    vivid: $("#site-vivid"),
    stubhub: $("#site-stubhub"),
    ticketmaster: $("#site-ticketmaster"),
  };

  const buildQuery = () =>
    [iEvent.value.trim(), iCity.value.trim(), iSRS.value.trim()]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  const enc = (s) => encodeURIComponent(s);

  function urlMap(q) {
    const e = enc(q);
    return {
      google:
        `https://www.google.com/search?q="%22${e}%22"+site%3Aviagogo.com+OR+site%3Astubhub.com+OR+site%3Avividseats.com+OR+site%3Aseatgeek.com`,
      seatgeek: `https://seatgeek.com/search?search=${e}`,
      vivid: `https://www.vividseats.com/concerts/${e}`,
      stubhub: `https://www.stubhub.com/find?q=${e}`,
      ticketmaster: `https://www.ticketmaster.com/search?q=${e}`,
    };
  }

  function renderPreview() {
    const q = buildQuery();
    linksWrap.innerHTML = "";
    if (!q) return;
    const urls = urlMap(q);
    for (const [key, el] of Object.entries(sites)) {
      if (!el || !el.checked) continue;
      const a = document.createElement("a");
      a.className = "btn";
      a.target = "_blank";
      a.rel = "noopener";
      a.href = urls[key];
      a.textContent =
        {
          google: "Google",
          seatgeek: "SeatGeek",
          vivid: "Vivid Seats",
          stubhub: "StubHub",
          ticketmaster: "Ticketmaster",
        }[key] || key;
      linksWrap.appendChild(a);
    }
  }

  let t = null;
  const debounce = (fn) => {
    clearTimeout(t);
    t = setTimeout(fn, 200);
  };

  const KEY = "tvg.metaSearch";

  function loadSaved() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      iEvent.value = s.event || "";
      if (iCity) iCity.value = s.city || "";
      if (iSRS) iSRS.value = s.srs || "";
      for (const k of Object.keys(sites)) {
        if (s.sites && typeof s.sites[k] === "boolean" && sites[k]) {
          sites[k].checked = s.sites[k];
        }
      }
    } catch {
      // ignore
    }
  }

  function saveNow() {
    try {
      const data = {
        event: iEvent.value,
        city: iCity ? iCity.value : "",
        srs: iSRS ? iSRS.value : "",
        sites: Object.fromEntries(
          Object.entries(sites)
            .filter(([, el]) => !!el)
            .map(([k, el]) => [k, el.checked])
        ),
      };
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  form.addEventListener("input", () => {
    debounce(() => {
      saveNow();
      renderPreview();
    });
  });

  Object.values(sites)
    .filter(Boolean)
    .forEach((el) =>
      el.addEventListener("change", () => {
        saveNow();
        renderPreview();
      })
    );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = buildQuery();
    if (!q) {
      iEvent.focus();
      return;
    }
    const urls = urlMap(q);
    Object.entries(sites)
      .filter(([, el]) => el && el.checked)
      .forEach(([k]) => {
        window.open(urls[k], "_blank", "noopener");
      });
  });

  const copyBtn = $("#ms-copy");
  const resetBtn = $("#ms-reset");

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const q = buildQuery();
      if (!q) return;
      try {
        await navigator.clipboard.writeText(q);
      } catch {
        // ignore
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      iEvent.value = "";
      if (iCity) iCity.value = "";
      if (iSRS) iSRS.value = "";
      Object.values(sites)
        .filter(Boolean)
        .forEach((el) => (el.checked = true));
      saveNow();
      renderPreview();
      iEvent.focus();
    });
  }

  loadSaved();
  renderPreview();
});
// ====== Shared footer year ======
(function(){
    const y = document.getElementById('y');
    if (y) y.textContent = new Date().getFullYear();
  })();
  
  // ====== Mobile nav toggle (works if markup exists) ======
  (function(){
    const header = document.querySelector('header.nav, header');
    const btn = document.querySelector('.nav-toggle');
    const nav = document.getElementById('primary-nav');
    if(!header || !btn || !nav) return;
    const toggle = () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isOpen));
      header.classList.toggle('nav-open', !isOpen);
    };
    btn.addEventListener('click', toggle);
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      btn.setAttribute('aria-expanded','false'); header.classList.remove('nav-open');
    }));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        btn.setAttribute('aria-expanded','false');
        header.classList.remove('nav-open');
      }
    });
  })();
  
  // ====== Search/Embed page behavior (runs only if elements exist) ======
  (function(){
    const fileInput = document.getElementById('tvg-file-input');
    const analyzeBtn = document.getElementById('tvg-analyze-btn');
    const fileLabel = document.getElementById('tvg-file-label');
    const uploadCountEl = document.getElementById('tvg-upload-count');
    const conflictCountEl = document.getElementById('tvg-conflict-count');
    const tableBody = document.querySelector('#tvg-results-table tbody');
    const filterDecision = document.getElementById('tvg-filter-decision');
    const filterMarketplace = document.getElementById('tvg-filter-marketplace');
    const resetFiltersBtn = document.getElementById('tvg-reset-filters');
    const brandSlot = document.getElementById('tvg-embed-brand');
  
    if (!fileInput || !analyzeBtn || !tableBody) return; // Not on search.html
  
    // White-label + accent via URL params
    (function(){
      const params = new URLSearchParams(window.location.search);
      const wl = params.get('whiteLabel');
      const accent = params.get('accent');
      if (wl === 'true' && brandSlot) brandSlot.style.display = 'none';
      if (accent) document.documentElement.style.setProperty('--brand-2', accent);
    })();
  
    let allRows = [];
    let sortState = { key: null, dir: 1 };
    let uploadCount = 0;
  
    function normalizeHeader(h){ return (h || '').toString().trim().toLowerCase(); }
  
    function onFileChange(){
      if (fileInput.files && fileInput.files[0]) {
        fileLabel.textContent = fileInput.files[0].name;
        analyzeBtn.disabled = false;
      } else {
        fileLabel.textContent = 'No file selected.';
        analyzeBtn.disabled = true;
      }
    }
  
    function parseAndAnalyze(){
      const file = fileInput.files[0];
      if (!file || !window.Papa) return;
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = 'Analyzing...';
  
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          uploadCount++; uploadCountEl.textContent = String(uploadCount);
          const data = results.data || [];
          const mapped = data.map((row, idx) => {
            const headers = Object.keys(row).reduce((acc, key) => {
              acc[normalizeHeader(key)] = row[key]; return acc;
            }, {});
            const pick = (...names) => {
              for (const n of names){ const v = headers[normalizeHeader(n)]; if (v) return v; }
              return '';
            };
            const event = pick('event','event_id');
            const section = pick('section');
            const r = pick('row');
            const seat = pick('seat');
            const mp = pick('marketplace','source','channel');
            const id = pick('id','listing_id') || (idx + 1);
            const when = pick('when','timestamp','time','created_at');
            return {
              id: id.toString(),
              event,
              marketplace: mp,
              section,
              row: r,
              seat,
              when,
              decision: 'Approved',
              _key: [event,section,r,seat].join('|')
            };
          });
  
          const byKey = {};
          mapped.forEach(row => {
            if (!row._key || row._key === '|||') return;
            if (!byKey[row._key]) byKey[row._key] = [];
            byKey[row._key].push(row);
          });
  
          let conflicts = 0;
          Object.values(byKey).forEach(list => {
            if (list.length > 1) {
              list.forEach((row, i) => {
                if (i === 0) row.decision = 'Approved';
                else { row.decision = 'Blocked'; conflicts++; }
              });
            }
          });
  
          conflictCountEl.textContent = String(conflicts);
          allRows = mapped;
          populateMarketplaceFilter();
          renderTable();
  
          analyzeBtn.textContent = 'Analyze CSV';
          analyzeBtn.disabled = false;
        },
        error: () => {
          analyzeBtn.textContent = 'Analyze CSV';
          analyzeBtn.disabled = false;
          alert('Sorry, there was a problem reading that file.');
        }
      });
    }
  
    function populateMarketplaceFilter(){
      const seen = new Set();
      allRows.forEach(r => { if (r.marketplace) seen.add(r.marketplace); });
      filterMarketplace.innerHTML = '<option value="all">All marketplaces</option>';
      Array.from(seen).sort().forEach(mp => {
        const opt = document.createElement('option');
        opt.value = mp; opt.textContent = mp;
        filterMarketplace.appendChild(opt);
      });
    }
  
    function getFilteredRows(){
      const d = filterDecision.value;
      const mp = filterMarketplace.value;
      return allRows.filter(r => {
        if (d !== 'all' && r.decision !== d) return false;
        if (mp !== 'all' && r.marketplace !== mp) return false;
        return true;
      });
    }
  
    function renderTable(){
      const rows = getFilteredRows().slice();
      if (sortState.key) {
        rows.sort((a,b)=>{
          const va=(a[sortState.key]||'').toString().toLowerCase();
          const vb=(b[sortState.key]||'').toString().toLowerCase();
          if(va<vb) return -1*sortState.dir;
          if(va>vb) return 1*sortState.dir;
          return 0;
        });
      }
      tableBody.innerHTML='';
      rows.forEach(r=>{
        const tr=document.createElement('tr');
        if (r.decision==='Blocked') tr.className='tvg-row--blocked';
        else if (r.decision==='Approved') tr.className='tvg-row--approved';
        else tr.className='tvg-row--default';
        tr.innerHTML=`
          <td>${r.id||''}</td>
          <td>${r.decision||''}</td>
          <td>${r.marketplace||''}</td>
          <td>${r.event||''}</td>
          <td>${r.section||''}</td>
          <td>${r.row||''}</td>
          <td>${r.seat||''}</td>
          <td>${r.when||''}</td>
        `;
        tableBody.appendChild(tr);
      });
    }
  
    function onHeaderClick(e){
      const th=e.target.closest('th[data-key]'); if(!th) return;
      const key=th.getAttribute('data-key');
      if(sortState.key===key) sortState.dir=-sortState.dir;
      else { sortState.key=key; sortState.dir=1; }
      renderTable();
    }
  
    function resetFilters(){
      filterDecision.value='all';
      filterMarketplace.value='all';
      renderTable();
    }
  
    document.getElementById('tvg-results-table').querySelector('thead')
      .addEventListener('click', onHeaderClick);
    fileInput.addEventListener('change', onFileChange);
    analyzeBtn.addEventListener('click', parseAndAnalyze);
    filterDecision.addEventListener('change', renderTable);
    filterMarketplace.addEventListener('change', renderTable);
    resetFiltersBtn.addEventListener('click', resetFilters);
  })();

  // ===== TixMarketSearch (search.html) =====
(function () {
  const form = document.getElementById('tixSearch');
  if (!form) return; // only run on search.html

  const queryEl    = document.getElementById('tms-query');
  const linksWrap  = document.getElementById('tms-links');
  const btnCopy    = document.getElementById('tms-copy');
  const btnReset   = document.getElementById('tms-reset');
  const infoToggle = document.getElementById('tms-info-toggle');
  const explainer  = document.getElementById('tms-explainer');

  const siteConfigs = [
    { id: 'site-seatgeek',     label: 'SeatGeek',     domain: 'seatgeek.com' },
    { id: 'site-vivid',        label: 'Vivid Seats',  domain: 'vividseats.com' },
    { id: 'site-stubhub',      label: 'StubHub',      domain: 'stubhub.com' },
    { id: 'site-ticketmaster', label: 'Ticketmaster', domain: 'ticketmaster.com' },
    { id: 'site-tickpick',     label: 'TickPick',     domain: 'tickpick.com' },
    { id: 'site-viagogo',      label: 'Viagogo',      domain: 'viagogo.com' }
  ];
  const googleCheckboxId = 'site-google';

  function baseQuery(raw) {
    return (raw || '').replace(/\s+/g, ' ').trim();
  }

  function buildUrls() {
    const raw = baseQuery(queryEl ? queryEl.value : '');
    if (!raw) return [];

    const urls = [];
    const selectedDomains = [];

    // Per-site Google searches: "<raw> site:domain"
    siteConfigs.forEach(cfg => {
      const cb = document.getElementById(cfg.id);
      if (!cb || !cb.checked) return;

      const g = new URL('https://www.google.com/search');
      g.searchParams.set('q', `${raw} site:${cfg.domain}`);
      urls.push({ label: cfg.label, href: g.toString() });
      selectedDomains.push(`site:${cfg.domain}`);
    });

    // Combined Google tab: add "tickets" if not present
    const googleCb = document.getElementById(googleCheckboxId);
    if (googleCb && googleCb.checked && selectedDomains.length) {
      let qTickets = raw;
      if (!/ticket/i.test(qTickets)) {
        qTickets += ' tickets';
      }
      const g = new URL('https://www.google.com/search');
      g.searchParams.set('q', `${qTickets} ${selectedDomains.join(' OR ')}`);
      urls.unshift({ label: 'Google (all selected)', href: g.toString() });
    }

    return urls;
  }

  function renderPreview() {
    const urls = buildUrls();
    linksWrap.innerHTML = '';
    if (!urls.length) return;

    urls.forEach(u => {
      const a = document.createElement('a');
      a.href = u.href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `${u.label}: ${u.href}`;
      linksWrap.appendChild(a);
    });
  }

  function openAll(event) {
    event.preventDefault();
    if (!queryEl.checkValidity()) {
      queryEl.reportValidity();
      return;
    }

    const urls = buildUrls();
    if (!urls.length) return;

    const first = window.open(urls[0].href, '_blank', 'noopener');
    let blocked = !first || first.closed;

    for (let i = 1; i < urls.length; i++) {
      const w = window.open(urls[i].href, '_blank', 'noopener');
      if (!w || w.closed) blocked = true;
    }

    if (blocked) {
      const note = document.createElement('div');
      note.className = 'muted';
      note.style.marginTop = '8px';
      note.textContent = 'If only one tab opened, allow pop-ups for this site so all markets can open.';
      linksWrap.appendChild(note);
    }
  }

  function copyAll() {
    const urls = buildUrls();
    if (!urls.length) return;

    const text = urls.map(u => u.href).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      const old = btnCopy.textContent;
      btnCopy.textContent = 'Copied!';
      setTimeout(() => { btnCopy.textContent = old; }, 900);
    }).catch(() => {
      // ignore clipboard failures
    });
  }

  function resetForm() {
    form.reset();
    linksWrap.innerHTML = '';
  }

  // Info toggle for explainer card (for hover/tap)
  function toggleExplainer() {
    if (!explainer || !infoToggle) return;
    const isOpen = infoToggle.getAttribute('aria-expanded') === 'true';
    infoToggle.setAttribute('aria-expanded', String(!isOpen));
    explainer.classList.toggle('is-collapsed', isOpen);
    explainer.setAttribute('aria-hidden', String(isOpen));
  }

  // Wire up events
  form.addEventListener('submit', openAll);
  if (queryEl) queryEl.addEventListener('input', renderPreview);

  siteConfigs.forEach(cfg => {
    const cb = document.getElementById(cfg.id);
    if (cb) cb.addEventListener('change', renderPreview);
  });

  const googleCb = document.getElementById(googleCheckboxId);
  if (googleCb) googleCb.addEventListener('change', renderPreview);

  if (btnCopy)  btnCopy.addEventListener('click', copyAll);
  if (btnReset) btnReset.addEventListener('click', resetForm);
  if (infoToggle) infoToggle.addEventListener('click', toggleExplainer);

  // Optional: open explainer on desktop hover
  if (infoToggle && explainer && window.matchMedia('(hover:hover)').matches) {
    infoToggle.addEventListener('mouseenter', () => {
      infoToggle.setAttribute('aria-expanded', 'true');
      explainer.classList.remove('is-collapsed');
      explainer.setAttribute('aria-hidden', 'false');
    });
  }

  // Initial preview (empty)
  renderPreview();
})();

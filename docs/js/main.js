// =====================================================
// Ticket VeriGuard - main.js
// Shared behavior for:
// - all pages: footer year, mobile nav, toasts
// - index.html: contact form
// - search.html: marketplace search + snapshot capture
// - duplicate-check.html: CSV duplicate exposure checker
// =====================================================

// =====================================================
// Safe runner
// =====================================================
function tvgSafe(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`[TicketVeriGuard] ${name} error:`, error);
  }
}

// =====================================================
// Small helpers
// =====================================================
function $(selector, scope = document) {
  return scope.querySelector(selector);
}

function $all(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeText(value, fallback = "") {
  const str = String(value ?? "").trim();
  return str || fallback;
}

function withTimeout(ms, promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("timeout")));
    }),
  ]);
}

function copyToClipboard(text) {
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
    return Promise.reject(new Error("Clipboard API unavailable"));
  }
  return navigator.clipboard.writeText(text);
}

function downloadTextFile(filename, text, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

// Shared seat parser for BOTH duplicate check and snapshots
function parseSeatTokens(raw) {
  const errors = [];

  if (!raw || !String(raw).trim()) {
    return { seats: [], errors, deduped: false };
  }

  let s = String(raw)
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/[ \t]+/g, ",")
    .replace(/,+/g, ",")
    .replace(/^,|,$/g, "");

  const parts = s.split(",");
  const out = [];

  for (const part of parts) {
    if (!part) continue;

    if (/^\d+-\d+$/.test(part)) {
      const [aStr, bStr] = part.split("-");
      const a = parseInt(aStr, 10);
      const b = parseInt(bStr, 10);

      if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
        errors.push(`Bad range "${part}"`);
        continue;
      }

      if (a > b) {
        errors.push(`Range start > end in "${part}"`);
        continue;
      }

      for (let n = a; n <= b; n += 1) {
        out.push(String(n));
      }
      continue;
    }

    if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10);
      if (n <= 0) {
        errors.push(`Seat must be positive in "${part}"`);
      } else {
        out.push(String(n));
      }
      continue;
    }

    errors.push(`Unrecognized token "${part}"`);
  }

  const uniq = Array.from(new Set(out)).sort((a, b) => Number(a) - Number(b));
  return { seats: uniq, errors, deduped: uniq.length !== out.length };
}

// =====================================================
// Toast utility
// =====================================================
function showToast(message, type = "success", ttl = 4000) {
  const root = document.getElementById("toast-root");
  if (!root) return;

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.role = "status";
  toast.innerHTML = `
    <div>${escapeHTML(message)}</div>
    <button type="button" aria-label="Dismiss">✕</button>
  `;

  const close = () => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 180);
  };

  const dismissBtn = $("button", toast);
  if (dismissBtn) dismissBtn.addEventListener("click", close);

  root.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(close, ttl);
}

// =====================================================
// Footer year
// =====================================================
tvgSafe("footer-year", () => {
  const yearEl = document.getElementById("y");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});

// =====================================================
// Mobile nav
// =====================================================
tvgSafe("nav-toggle", () => {
  const header = $("header.nav, header");
  const toggleBtn = $(".nav-toggle");
  const nav = document.getElementById("primary-nav");

  if (!header || !toggleBtn || !nav) return;

  function closeMenu() {
    nav.classList.remove("is-open");
    header.classList.remove("nav-open");
    document.body.classList.remove("menu-open");
    toggleBtn.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    nav.classList.add("is-open");
    header.classList.add("nav-open");
    document.body.classList.add("menu-open");
    toggleBtn.setAttribute("aria-expanded", "true");
  }

  function toggleMenu() {
    const isOpen =
      header.classList.contains("nav-open") || nav.classList.contains("is-open");

    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  toggleBtn.addEventListener("click", toggleMenu);
  $all("a", nav).forEach((link) => link.addEventListener("click", closeMenu));

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
});

// =====================================================
// Index page: contact form
// =====================================================
tvgSafe("contact-form", () => {
  const form = document.getElementById("contact-form");
  const submitBtn = document.getElementById("contact-submit");
  const statusEl = document.getElementById("contact-status");

  if (!form || !submitBtn || !statusEl) return;

  const API_URL =
    "https://tvg-contact-f9046a-5bc794bd5ce3.herokuapp.com/api/contact";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    statusEl.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    const payload = {
      email: safeText(form.email?.value),
      message: safeText(form.message?.value),
      website: form.website?.value || "",
    };

    try {
      const response = await withTimeout(
        10000,
        fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      );

      if (!response.ok) {
        throw new Error("Request failed");
      }

      window.location.href = "thanks.html";
    } catch (error) {
      statusEl.textContent =
        "Sorry, we could not send right now. Please email hello@ticketveriguard.com.";
      showToast("Send failed", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send message";
    }
  });
});

// =====================================================
// Brokers page: embedded widget
// =====================================================
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWidget);
  } else {
    mountWidget();
  }
});

// =====================================================
// Duplicate exposure checker page
// =====================================================
tvgSafe("verify-csv", () => {
  const SNAPSHOT_STORAGE_KEY = "tti_snapshots_v0";
  const DUPLICATE_AUTO_RUN_KEY = "tti_duplicate_autorun_v1";
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
  const runSnapshotsBtn = document.getElementById("tvg-run-snapshots-btn");
  const currentContextEl = document.getElementById("tvg-current-context");

  if (!fileInput || !analyzeBtn || !sampleBtn || !table) return;

  const tableBody = $("tbody", table);

  let allRows = [];
  let conflictGroups = [];
  let conflictLookup = {};
  let sortState = { key: null, dir: 1 };

  const normalizeHeader = (header) =>
    String(header || "").trim().toLowerCase();

  const setAnalyzeReadyState = (ready) => {
    analyzeBtn.disabled = !ready;
    analyzeBtn.classList.toggle("btn-active", ready);
  };

  function updateFileLabel(name = "No file selected.") {
    if (fileLabel) fileLabel.textContent = name;
  }

  function renderEmpty(message) {
    if (!tableBody) return;
    tableBody.innerHTML = `
      <tr class="tvg-empty-row">
        <td colspan="8">${escapeHTML(message)}</td>
      </tr>
    `;
  }

  function loadSavedSnapshots() {
    try {
      const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("Could not load saved snapshots:", error);
      return [];
    }
  }

  function updateCurrentContext() {
    if (!currentContextEl) return;

    const items = loadSavedSnapshots();
    if (!items.length) {
      currentContextEl.textContent = "No saved snapshots found in this browser.";
      return;
    }

    const latest = items[items.length - 1];
    const parts = [
      latest.event_name,
      latest.event_location,
      latest.event_dates,
    ].filter(Boolean);

    currentContextEl.textContent = parts.length
      ? `Analyzing: ${parts.join(" · ")}`
      : "Using saved snapshots from this browser.";
  }

  function mapSnapshotsToRows(items) {
    return items.map((item, index) => ({
      id: item.id || String(index + 1),
      event: item.event_name || "",
      section: item.section || "",
      row: item.row || "",
      seat: item.seat || "",
      marketplace: item.marketplace || "",
      created_at: item.captured_at || "",
      when: item.captured_at || "",
    }));
  }

  function renderSummary({ scannedCount, conflictGroupCount, riskyCount, source }) {
    if (!summaryStrip) return;

    summaryStrip.innerHTML = "";
    summaryStrip.classList.add("is-visible");

    const makePill = (text) => {
      const pill = document.createElement("span");
      pill.className = "tvg-summary-pill";
      pill.textContent = text;
      return pill;
    };

    const strong = document.createElement("strong");
    strong.textContent = `${scannedCount.toLocaleString()} listings scanned`;

    summaryStrip.appendChild(strong);
    summaryStrip.appendChild(
      makePill(`${conflictGroupCount} possible match group${conflictGroupCount === 1 ? "" : "s"}`)
    );
    summaryStrip.appendChild(
      makePill(`${riskyCount} possible same-seat listing${riskyCount === 1 ? "" : "s"}`)
    );
    summaryStrip.appendChild(makePill(`Source: ${source}`));
    summaryStrip.appendChild(
      makePill(
        riskyCount > 0
          ? "Review the possible same-seat matches below."
          : "No possible same-seat matches found."
      )
    );
  }

  function clearSummary() {
    if (!summaryStrip) return;
    summaryStrip.innerHTML = "";
    summaryStrip.classList.remove("is-visible");
  }

  function runSavedSnapshotScan() {
    const snapshots = loadSavedSnapshots();

    if (!snapshots.length) {
      renderEmpty("No saved snapshots were found in this browser.");
      clearSummary();
      if (downloadBtn) downloadBtn.disabled = true;
      showToast("No saved snapshots found", "error");
      updateCurrentContext();
      return;
    }

    try {
      updateFileLabel("Saved snapshots");
      setAnalyzeReadyState(true);
      updateCurrentContext();

      const rows = mapSnapshotsToRows(snapshots);
      runAnalysis(rows, "Saved snapshots");
    } catch (error) {
      console.error("Saved snapshot scan failed:", error);
      renderEmpty("Something went wrong while scanning saved snapshots.");
      clearSummary();
      showToast("Snapshot scan failed", "error");
    }
  }

  function buildRows(data) {
    const expandedRows = [];

    data.forEach((row, index) => {
      const normalized = Object.keys(row).reduce((acc, key) => {
        acc[normalizeHeader(key)] = row[key];
        return acc;
      }, {});

      const pick = (...names) => {
        for (const name of names) {
          const value = normalized[normalizeHeader(name)];
          if (value !== undefined && value !== "") return value;
        }
        return "";
      };

      const event = pick("event", "event name", "event_name");
      const section = pick("section", "sec");
      const rowValue = pick("row");
      const seatRaw = pick("seat", "seat number", "seat_no", "seat #");
      const marketplace = pick("marketplace", "source", "channel", "site");
      const id = pick("id", "listing_id", "external_id") || String(index + 1);
      const when = pick("when", "timestamp", "time", "created_at");

      const parsedSeats = parseSeatTokens(seatRaw);
      const seats = parsedSeats.seats.length
        ? parsedSeats.seats
        : [String(seatRaw || "").trim()];

      seats.forEach((seat) => {
        const key = [event, section, rowValue, seat]
          .map((value) => String(value || "").trim())
          .join("|");

        expandedRows.push({
          _index: `${index}-${seat}`,
          _sourceIndex: index,
          _key: key,
          id,
          event,
          marketplace,
          section,
          row: rowValue,
          seat,
          when,
          decision: "Approved",
        });
      });
    });

    return expandedRows.filter((row) =>
      [row.event, row.section, row.row, row.seat, row.marketplace, row.when]
        .some((value) => String(value || "").trim() !== "")
    );
  }

  function hasRequiredColumns(rows) {
    if (!rows.length) return false;
    const sample = rows[0];
    return Boolean(sample.event || sample.section || sample.row || sample.seat);
  }

  function assignConflicts(rows) {
    const byKey = {};
    const groups = [];
    const lookup = {};
    let riskyCount = 0;
    let groupId = 1;

    rows.forEach((row) => {
      if (!row._key || row._key === "|||") return;
      if (!byKey[row._key]) byKey[row._key] = [];
      byKey[row._key].push(row);
    });

    Object.entries(byKey).forEach(([key, matches]) => {
      if (matches.length <= 1) return;

      const [event, section, rowValue, seat] = key.split("|");

      groups.push({
        id: groupId,
        event,
        section,
        row: rowValue,
        seat,
        size: matches.length,
      });

      matches.forEach((row, index) => {
        if (index > 0) {
          row.decision = "Blocked";
          riskyCount += 1;
        }
        lookup[row._index] = groupId;
      });

      groupId += 1;
    });

    return { groups, lookup, riskyCount };
  }
  
  function populateMarketplaceFilter() {
    if (!filterMarketplace) return;

    const marketplaces = Array.from(
      new Set(allRows.map((row) => row.marketplace).filter(Boolean))
    ).sort();

    filterMarketplace.innerHTML = `<option value="all">All marketplaces</option>`;

    marketplaces.forEach((marketplace) => {
      const option = document.createElement("option");
      option.value = marketplace;
      option.textContent = marketplace;
      filterMarketplace.appendChild(option);
    });
  }

  function getFilteredRows() {
    const decisionValue = filterDecision ? filterDecision.value : "all";
    const marketplaceValue = filterMarketplace ? filterMarketplace.value : "all";

    return allRows.filter((row) => {
      if (decisionValue !== "all" && row.decision !== decisionValue) return false;
      if (marketplaceValue !== "all" && row.marketplace !== marketplaceValue) return false;
      return true;
    });
  }

  function renderTable() {
    if (!tableBody) return;

    const rows = getFilteredRows().slice();
    tableBody.innerHTML = "";

    if (!rows.length) {
      renderEmpty("No rows to display with the current filters.");
      return;
    }

    if (sortState.key) {
      rows.sort((a, b) => {
        const aValue = safeText(a[sortState.key]).toLowerCase();
        const bValue = safeText(b[sortState.key]).toLowerCase();

        if (aValue < bValue) return -1 * sortState.dir;
        if (aValue > bValue) return 1 * sortState.dir;
        return 0;
      });
    }

    const groupMeta = Object.fromEntries(conflictGroups.map((group) => [group.id, group]));
    const insertedGroupHeaders = new Set();

    rows.forEach((row) => {
      const groupId = conflictLookup[row._index];

      if (groupId && !insertedGroupHeaders.has(groupId) && groupMeta[groupId]) {
        insertedGroupHeaders.add(groupId);

        const group = groupMeta[groupId];
        const labelRow = document.createElement("tr");
        labelRow.className = "tvg-group-label-row";
        labelRow.innerHTML = `
          <td colspan="8">
            Possible match group #${group.id} — ${group.size} listings may share the same seat
            (${escapeHTML(group.event)} • Sec ${escapeHTML(group.section)} • Row ${escapeHTML(group.row)} • Seat ${escapeHTML(group.seat)})
          </td>
        `;
        tableBody.appendChild(labelRow);
      }

      const isBlocked = row.decision === "Blocked";
      const tr = document.createElement("tr");
      tr.className = isBlocked ? "tvg-row tvg-conflict-row" : "tvg-row tvg-clean-row";
      tr.dataset.decision = isBlocked ? "Blocked" : "Approved";

      tr.innerHTML = `
        <td>${escapeHTML(row.id)}</td>
        <td>
          ${
            isBlocked
              ? '<span class="tvg-status-pill tvg-status-risk">Possible same seat</span>'
              : '<span class="tvg-status-pill tvg-status-ok">Looks fine</span>'
          }
        </td>
        <td>${escapeHTML(row.marketplace || "—")}</td>
        <td>${escapeHTML(row.event)}</td>
        <td>${escapeHTML(row.section)}</td>
        <td>${escapeHTML(row.row)}</td>
        <td>${escapeHTML(row.seat)}</td>
        <td>${escapeHTML(row.when)}</td>
      `;

      tableBody.appendChild(tr);
    });
  }

  function runAnalysis(data, sourceLabel) {
    const mappedRows = buildRows(data);

    if (!mappedRows.length) {
      renderEmpty("We couldn’t find any listings in that file. Please check your CSV and try again.");
      clearSummary();
      if (downloadBtn) downloadBtn.disabled = true;
      return;
    }

    if (!hasRequiredColumns(mappedRows)) {
      renderEmpty(
        "This demo expects columns for Event, Section, Row, and Seat. Optional: Marketplace. Try the sample CSV to see the expected format."
      );
      clearSummary();
      if (downloadBtn) downloadBtn.disabled = true;
      return;
    }

    const conflicts = assignConflicts(mappedRows);

    allRows = mappedRows;
    conflictGroups = conflicts.groups;
    conflictLookup = conflicts.lookup;

    populateMarketplaceFilter();

    renderSummary({
      scannedCount: mappedRows.length,
      conflictGroupCount: conflictGroups.length,
      riskyCount: conflicts.riskyCount,
      source: sourceLabel,
    });

    renderTable();

    if (downloadBtn) {
      downloadBtn.disabled = allRows.length === 0;
    }
  }

  function parseAndAnalyzeFile() {
    const file = fileInput.files?.[0];
    if (!file || !window.Papa) return;

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Running...";

    window.Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        try {
          runAnalysis(results.data || [], file.name || "Your CSV");
        } catch (error) {
          console.error("Duplicate scan failed:", error);
          renderEmpty("Something went wrong while scanning this file.");
          clearSummary();
          showToast("Scan failed", "error");
        } finally {
          analyzeBtn.disabled = false;
          analyzeBtn.textContent = "Run scan";
        }
      },
      error(error) {
        console.error("PapaParse error:", error);
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "Run scan";
        alert("Sorry, there was a problem reading that file.");
      },
    });
  }

  function loadSampleCsv(event) {
    if (event) event.preventDefault();

    fetch("./sample_listings.csv")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      })
      .then((text) => {
        if (!window.Papa) {
          throw new Error("PapaParse is not loaded");
        }

        window.Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete(results) {
            try {
              updateFileLabel("sample_listings.csv");
              setAnalyzeReadyState(true);
              runAnalysis(results.data || [], "sample_listings.csv");
            } catch (error) {
              console.error("Sample scan failed:", error);
              renderEmpty("Something went wrong while scanning the sample file.");
              clearSummary();
              showToast("Sample scan failed", "error");
            }
          },
          error(error) {
            console.error("Sample parse error:", error);
            alert("There was a problem parsing sample_listings.csv.");
          },
        });
      })
      .catch((error) => {
        alert(`Could not load sample_listings.csv: ${error.message}`);
      });
  }

  function onHeaderClick(event) {
    const headerCell = event.target.closest("th[data-key]");
    if (!headerCell) return;

    const key = headerCell.getAttribute("data-key");
    if (!key) return;

    if (sortState.key === key) {
      sortState.dir *= -1;
    } else {
      sortState.key = key;
      sortState.dir = 1;
    }

    $all("thead th", table).forEach((th) => {
      th.classList.remove("sort-asc", "sort-desc");
    });

    headerCell.classList.add(sortState.dir === 1 ? "sort-asc" : "sort-desc");
    renderTable();
  }

  function resetFilters() {
    if (filterDecision) filterDecision.value = "all";
    if (filterMarketplace) filterMarketplace.value = "all";
    renderTable();
  }

  function downloadFilteredCsv() {
    const rows = getFilteredRows();
    if (!rows.length) return;

    const headers = ["id", "decision", "marketplace", "event", "section", "row", "seat", "when"];
    const lines = [headers.join(",")];

    rows.forEach((row) => {
      const values = headers.map((header) =>
        `"${String(row[header] || "").replace(/"/g, '""')}"`
      );
      lines.push(values.join(","));
    });

    downloadTextFile(
      "ticket-veriguard-cleaned.csv",
      lines.join("\n"),
      "text/csv;charset=utf-8;"
    );
  }

  function handleFeedback(isPositive) {
    if (!feedbackLabel) return;
    feedbackLabel.textContent = isPositive
      ? "Thanks — glad it helped!"
      : "Thanks — your feedback helps us improve.";
  }

  fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    updateFileLabel(file ? file.name : "No file selected.");
    setAnalyzeReadyState(Boolean(file));
  });

  analyzeBtn.addEventListener("click", parseAndAnalyzeFile);
  sampleBtn.addEventListener("click", loadSampleCsv);
  $("thead", table)?.addEventListener("click", onHeaderClick);

  if (filterDecision) filterDecision.addEventListener("change", renderTable);
  if (filterMarketplace) filterMarketplace.addEventListener("change", renderTable);
  if (resetFiltersBtn) resetFiltersBtn.addEventListener("click", resetFilters);
  if (downloadBtn) downloadBtn.addEventListener("click", downloadFilteredCsv);
  if (thumbUp) thumbUp.addEventListener("click", () => handleFeedback(true));
  if (thumbDown) thumbDown.addEventListener("click", () => handleFeedback(false));
  if (runSnapshotsBtn) {
    runSnapshotsBtn.addEventListener("click", runSavedSnapshotScan);

    updateCurrentContext();

    const autoRunMode = sessionStorage.getItem(DUPLICATE_AUTO_RUN_KEY);
    if (autoRunMode === "snapshots") {
      sessionStorage.removeItem(DUPLICATE_AUTO_RUN_KEY);
      runSavedSnapshotScan();
    }
  }
});

// =====================================================
// Search page: marketplace search + snapshot capture
// =====================================================
tvgSafe("search-workflow", () => {
  const form = document.getElementById("tixSearch");
  if (!form) return;

  const savePresetBtn = document.getElementById("tms-save-preset");
  const presetsWrap = document.getElementById("tms-presets");
  const PRESETS_KEY = "tvg_search_presets_v1";
  const queryEl = document.getElementById("tms-query");
  const linksWrap = document.getElementById("tms-links");
  const copyLinksBtn = document.getElementById("tms-copy");
  const copyTemplateBtn = document.getElementById("tms-copy-template");
  const resetBtn = document.getElementById("tms-reset");
  const infoToggle = document.getElementById("tms-info-toggle");
  const explainer = document.getElementById("tms-explainer");
  const DUPLICATE_AUTO_RUN_KEY = "tti_duplicate_autorun_v1";
  const openDuplicateCheckBtn = document.getElementById("tti-open-duplicate-check");

  const searchSites = [
    { id: "site-seatgeek", label: "SeatGeek", domain: "seatgeek.com" },
    { id: "site-vivid", label: "Vivid Seats", domain: "vividseats.com" },
    { id: "site-stubhub", label: "StubHub", domain: "stubhub.com" },
    { id: "site-etix", label: "Etix", domain: "etix.com" },
    { id: "site-ticketmaster", label: "Ticketmaster", domain: "ticketmaster.com" },
    { id: "site-tickpick", label: "TickPick", domain: "tickpick.com" },
    { id: "site-viagogo", label: "Viagogo", domain: "viagogo.com" },
  ];

  const googleCheckboxId = "site-google";
  const STORAGE_KEY = "tti_snapshots_v0";
  const BACKEND_BASE = "http://127.0.0.1:5001";

  const snapshotForm = document.getElementById("tti-snapshot-form");
  const snapshotBody = document.getElementById("tti-snapshots-body");
  const snapshotStatus = document.getElementById("tti-status");
  const snapshotExportBtn = document.getElementById("tti-export-csv");
  const snapshotClearBtn = document.getElementById("tti-clear-session");
  const snapshotSaveBtn = document.getElementById("tti-save-snapshot");
  const cancelEditBtn = document.getElementById("tti-cancel-edit");
  const eventSummaryEl = document.getElementById("tti-event-summary");
  const editBannerEl = document.getElementById("tti-edit-banner");

  const marketplaceEl = document.getElementById("tti-marketplace");
  const priceEl = document.getElementById("tti-price");
  const feesEl = document.getElementById("tti-fees");
  const urlEl = document.getElementById("tti-url");
  const notesEl = document.getElementById("tti-notes");
  const eventNameEl = document.getElementById("tti-event-name");
  const eventLocationEl = document.getElementById("tti-event-location");
  const eventDatesEl = document.getElementById("tti-event-dates");

  const sectionEl = document.getElementById("tti-section");
  const rowEl = document.getElementById("tti-row");
  const seatEl = document.getElementById("tti-seat");
  
  const searchBtn = document.getElementById("tms-search");
    if (searchBtn) {
    searchBtn.addEventListener("click", (event) => {
      event.preventDefault();
      openSelectedLinks();
    });
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      openSelectedLinks();
    });
  }

  const marketplaceLabels = {
    stubhub: "StubHub",
    seatgeek: "SeatGeek",
    vivid: "Vivid Seats",
    etix: "Etix",
    ticketmaster: "Ticketmaster",
    tickpick: "TickPick",
    viagogo: "Viagogo",
  };

  const ctx = document.getElementById("tvg-current-context");
  let editingId = null;

  function buildOutboundUrl(rawUrl, meta = {}) {
    if (!rawUrl) return "";

    const params = new URLSearchParams({
      url: rawUrl,
      event: meta.event || "",
      section: meta.section || "",
      row: meta.row || "",
      source: meta.source || "",
    });

    return `${BACKEND_BASE}/out?${params.toString()}`;
  }

  function normalizeQuery(raw) {
    return String(raw || "").replace(/\s+/g, " ").trim();
  }

  function loadSnapshots() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveSnapshots(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function setSnapshotStatus(message) {
    if (snapshotStatus) snapshotStatus.textContent = message || "";
  }

  function updateContextFromSnapshots() {
    const items = loadSnapshots();
    const latest = items[items.length - 1];

    if (!ctx) return;

    if (!latest) {
      ctx.textContent = "";
      return;
    }

    const parts = [
      latest.event_name,
      latest.event_location,
      latest.event_dates,
    ].filter(Boolean);

    ctx.textContent = parts.length
      ? `Analyzing: ${parts.join(" · ")}`
      : "Using saved snapshots";
  }

  function setEditingVisualState(isEditing) {
    if (snapshotForm) {
      snapshotForm.classList.toggle("is-editing", isEditing);
    }

    if (editBannerEl) {
      editBannerEl.hidden = !isEditing;
    }
  }

  function highlightEditingRow() {
    if (!snapshotBody) return;

    $all("tr", snapshotBody).forEach((row) => {
      const rowId = row.getAttribute("data-snapshot-id");
      row.classList.toggle("is-editing-row", Boolean(editingId && rowId === editingId));
    });
  }

  function openDuplicateCheckFromSnapshots() {
    const items = loadSnapshots();

    if (!items.length) {
      setSnapshotStatus("Save at least one snapshot before running duplicate check.");
      showToast("No saved snapshots yet", "error");
      return;
    }

    sessionStorage.setItem(DUPLICATE_AUTO_RUN_KEY, "snapshots");
    window.location.href = "duplicate-check.html";
  }

  function getSelectedSearchUrls() {
    const raw = normalizeQuery(queryEl?.value);
    if (!raw) return [];

    const urls = [];
    const selectedDomains = [];

    searchSites.forEach((site) => {
      const checkbox = document.getElementById(site.id);
      if (!checkbox || !checkbox.checked) return;

      const url = new URL("https://www.google.com/search");
      url.searchParams.set("q", `${raw} site:${site.domain}`);

      urls.push({
        label: site.label,
        href: url.toString(),
        source: site.label,
      });

      selectedDomains.push(`site:${site.domain}`);
    });

    const googleCheckbox = document.getElementById(googleCheckboxId);
    if (googleCheckbox && googleCheckbox.checked && selectedDomains.length) {
      let combinedQuery = raw;
      if (!/ticket/i.test(combinedQuery)) {
        combinedQuery += " tickets";
      }

      const url = new URL("https://www.google.com/search");
      url.searchParams.set("q", `${combinedQuery} ${selectedDomains.join(" OR ")}`);

      urls.unshift({
        label: "Google (all selected)",
        href: url.toString(),
        source: "Google",
      });
    }

    return urls;
  }

  function renderPreviewLinks() {
    if (!linksWrap) return;

    const urls = getSelectedSearchUrls();
    linksWrap.innerHTML = "";

    if (!urls.length) return;

    urls.forEach((item) => {
      const link = document.createElement("a");
      link.href = buildOutboundUrl(item.href, {
        source: item.source || "",
      });
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = `${item.label}: ${item.href}`;
      linksWrap.appendChild(link);
    });
  }

  function openSelectedLinks() {
    const urls = getSelectedSearchUrls();
    if (!urls.length) return;

    const firstUrl = buildOutboundUrl(urls[0].href, {
      source: urls[0].source || "",
    });

    const firstWindow = window.open(firstUrl, "_blank", "noopener");
    let blocked = !firstWindow || firstWindow.closed;

    for (let i = 1; i < urls.length; i += 1) {
      const wrappedUrl = buildOutboundUrl(urls[i].href, {
        source: urls[i].source || "",
      });

      const popup = window.open(wrappedUrl, "_blank", "noopener");
      if (!popup || popup.closed) blocked = true;
    }

    if (blocked && linksWrap) {
      const note = document.createElement("div");
      note.className = "muted";
      note.style.marginTop = "8px";
      note.textContent =
        "If only one tab opened, allow pop-ups for this site so all selected markets can open.";
      linksWrap.appendChild(note);
    }
  }

  function copyAllLinks() {
    const urls = getSelectedSearchUrls();
    if (!urls.length || !copyLinksBtn) return;

    copyToClipboard(urls.map((item) => item.href).join("\n"))
      .then(() => {
        const oldText = copyLinksBtn.textContent;
        copyLinksBtn.textContent = "Copied!";
        setTimeout(() => {
          copyLinksBtn.textContent = oldText;
        }, 900);
      })
      .catch(() => {
        showToast("Could not copy links", "error");
      });
  }

  function copySnapshotTemplate() {
    if (!copyTemplateBtn) return;

    const raw = normalizeQuery(queryEl?.value);
    const selectedMarkets = searchSites
      .filter((site) => document.getElementById(site.id)?.checked)
      .map((site) => site.label);

    const template = [
      "Ticket Transparency Index — Snapshot (v0)",
      "----------------------------------------",
      `Search query: ${raw || "—"}`,
      `Marketplaces selected: ${selectedMarkets.length ? selectedMarkets.join(", ") : "—"}`,
      `Captured at (ISO): ${new Date().toISOString()}`,
      "",
      "Per-marketplace entries:",
      "- Marketplace:",
      "  Lowest listed price (USD):",
      "  All-in price (optional):",
      "  URL used:",
      "  Notes:",
      "",
      "- Marketplace:",
      "  Lowest listed price (USD):",
      "  All-in price (optional):",
      "  URL used:",
      "  Notes:",
      "",
      "(Add or remove blocks as needed.)",
    ].join("\n");

    copyToClipboard(template)
      .then(() => {
        const oldText = copyTemplateBtn.textContent;
        copyTemplateBtn.textContent = "Copied!";
        setTimeout(() => {
          copyTemplateBtn.textContent = oldText;
        }, 900);
      })
      .catch(() => {
        showToast("Could not copy template", "error");
      });
  }

  function resetSearchForm() {
    form.reset();
    if (linksWrap) linksWrap.innerHTML = "";
    renderPreviewLinks();
  }

  function toggleExplainer() {
    if (!infoToggle || !explainer) return;

    const isOpen = infoToggle.getAttribute("aria-expanded") === "true";
    infoToggle.setAttribute("aria-expanded", String(!isOpen));
    explainer.classList.toggle("is-collapsed", isOpen);
    explainer.setAttribute("aria-hidden", String(isOpen));
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "";
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : "";
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function escapeCsv(value) {
    const str = String(value ?? "");
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  function setUrlAuto(value) {
    if (!urlEl) return;
    urlEl.value = value || "";
    urlEl.dataset.autofill = "1";
  }

  function suggestedUrlForMarketplace(marketplaceKey) {
    const urls = getSelectedSearchUrls();
    const label = marketplaceLabels[marketplaceKey] || marketplaceKey;
    const match = urls.find((item) => item.label === label);
    return match ? match.href : "";
  }

  function startEdit(snapshot) {
    editingId = snapshot.id;

    if (eventNameEl) eventNameEl.value = snapshot.event_name || "";
    if (eventLocationEl) eventLocationEl.value = snapshot.event_location || "";
    if (eventDatesEl) eventDatesEl.value = snapshot.event_dates || "";
    if (marketplaceEl) marketplaceEl.value = snapshot.marketplace || "";
    if (priceEl) priceEl.value = snapshot.price ?? "";
    if (feesEl) feesEl.value = snapshot.fees ?? "";
    if (urlEl) {
      urlEl.value = snapshot.url || "";
      urlEl.dataset.autofill = "0";
    }
    if (notesEl) notesEl.value = snapshot.notes || "";

    if (sectionEl) sectionEl.value = snapshot.section || "";
    if (rowEl) rowEl.value = snapshot.row || "";
    if (seatEl) seatEl.value = snapshot.seat || "";

    if (snapshotSaveBtn) snapshotSaveBtn.textContent = "Update ticket";
    if (cancelEditBtn) cancelEditBtn.hidden = false;

    setEditingVisualState(true);
    highlightEditingRow();

    setSnapshotStatus('Editing snapshot. Update fields and click "Update ticket".');

    if (snapshotForm) {
      snapshotForm.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  function cancelEdit() {
    editingId = null;

    if (snapshotForm) snapshotForm.reset();

    if (snapshotSaveBtn) snapshotSaveBtn.textContent = "Save ticket";
    if (cancelEditBtn) cancelEditBtn.hidden = true;

    setEditingVisualState(false);
    highlightEditingRow();
    setSnapshotStatus("");
  }

  function seedEventContextFromLastSnapshot() {
    const items = loadSnapshots();
    const last = items[items.length - 1];
    if (!last) return;

    if (eventNameEl && !eventNameEl.value.trim()) {
      eventNameEl.value = last.event_name || "";
    }

    if (eventLocationEl && !eventLocationEl.value.trim()) {
      eventLocationEl.value = last.event_location || "";
    }

    if (eventDatesEl && !eventDatesEl.value.trim()) {
      eventDatesEl.value = last.event_dates || "";
    }
  }

  function renderSnapshots() {
    if (!snapshotBody) return;

    const items = loadSnapshots();
    snapshotBody.innerHTML = "";

    updateContextFromSnapshots();

    if (eventSummaryEl) {
      const latest = items[items.length - 1];
      if (latest?.event_name) {
        const parts = [latest.event_name, latest.event_location, latest.event_dates].filter(Boolean);
        eventSummaryEl.textContent = parts.length ? `Tracking: ${parts.join(" · ")}` : "";
      } else {
        eventSummaryEl.textContent = "";
      }
    }

    if (!items.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td colspan="10" class="muted">
          No saved tickets yet. Save a few listings to compare prices, seats, and links in one place.
        </td>
      `;
      snapshotBody.appendChild(tr);
      return;
    }

    const sortEl = document.getElementById("tti-sort");
    const sortValue = sortEl?.value || "price-asc";

    const getNumeric = (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    const priceValues = items
      .map((item) => getNumeric(item.price))
      .filter((value) => value !== null);

    const allInValues = items
      .map((item) => getNumeric(item.fees))
      .filter((value) => value !== null);

    const lowestPrice = priceValues.length ? Math.min(...priceValues) : null;
    const lowestAllIn = allInValues.length ? Math.min(...allInValues) : null;

    const sorted = items.slice().sort((a, b) => {
      const aPrice = getNumeric(a.price);
      const bPrice = getNumeric(b.price);
      const aAllIn = getNumeric(a.fees);
      const bAllIn = getNumeric(b.fees);
      const aTime = a.captured_at || "";
      const bTime = b.captured_at || "";
      const aMarketplace = (marketplaceLabels[a.marketplace] || a.marketplace || "").toLowerCase();
      const bMarketplace = (marketplaceLabels[b.marketplace] || b.marketplace || "").toLowerCase();

      switch (sortValue) {
        case "price-desc":
          return (bPrice ?? -Infinity) - (aPrice ?? -Infinity);

        case "allin-asc":
          if (aAllIn === null && bAllIn === null) return 0;
          if (aAllIn === null) return 1;
          if (bAllIn === null) return -1;
          return aAllIn - bAllIn;

        case "oldest":
          return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;

        case "newest":
          return aTime < bTime ? 1 : aTime > bTime ? -1 : 0;

        case "marketplace":
          return aMarketplace.localeCompare(bMarketplace);

        case "price-asc":
        default:
          if (aPrice === null && bPrice === null) return 0;
          if (aPrice === null) return 1;
          if (bPrice === null) return -1;
          return aPrice - bPrice;
      }
    });

    sorted.forEach((snapshot) => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-snapshot-id", snapshot.id);

      if (editingId && snapshot.id === editingId) {
        tr.classList.add("is-editing-row");
      }

      const priceNumber = getNumeric(snapshot.price);
      const allInNumber = getNumeric(snapshot.fees);

      const isLowestPrice = lowestPrice !== null && priceNumber === lowestPrice;
      const isLowestAllIn = lowestAllIn !== null && allInNumber === lowestAllIn;

      if (isLowestPrice) {
        tr.classList.add("is-lowest-price-row");
      }

      if (isLowestAllIn) {
        tr.classList.add("is-lowest-allin-row");
      }

      const eventText = [
        snapshot.event_name,
        snapshot.event_location,
        snapshot.event_dates,
      ]
        .filter(Boolean)
        .join(" · ");

      const urlCell = snapshot.url
        ? `<a href="${escapeHTML(snapshot.url)}" target="_blank" rel="noopener noreferrer">view</a>`
        : "";

      const priceBadge = isLowestPrice
        ? `<span class="tti-price-badge">Lowest price</span>`
        : "";

      const allInBadge = isLowestAllIn
        ? `<span class="tti-price-badge tti-price-badge-allin">Lowest all-in</span>`
        : "";

      tr.innerHTML = `
        <td>${escapeHTML(formatTime(snapshot.captured_at))}</td>
        <td>${escapeHTML(eventText)}</td>
        <td>${escapeHTML(snapshot.section || "")}</td>
        <td>${escapeHTML(snapshot.row || "")}</td>
        <td>${escapeHTML(snapshot.seat || "")}</td>
        <td>${escapeHTML(marketplaceLabels[snapshot.marketplace] || snapshot.marketplace)}</td>
        <td>
          $${escapeHTML(formatMoney(snapshot.price))}
          ${priceBadge}
        </td>
        <td>
          ${snapshot.fees !== null && snapshot.fees !== "" ? `$${escapeHTML(formatMoney(snapshot.fees))}` : ""}
          ${allInBadge}
        </td>
        <td>${urlCell}</td>
        <td>
          <button type="button" class="btn tti-mini" data-edit="${escapeHTML(snapshot.id)}">Edit</button>
          <button type="button" class="btn tti-mini btn-ghost" data-del="${escapeHTML(snapshot.id)}">Remove</button>
        </td>
      `;

      snapshotBody.appendChild(tr);
    });
  }

  function saveSnapshot(event) {
    event.preventDefault();

    const section = safeText(sectionEl?.value);
    const row = safeText(rowEl?.value);
    const seat = safeText(seatEl?.value);
    const eventName = safeText(eventNameEl?.value);
    const eventLocation = safeText(eventLocationEl?.value);
    const eventDates = safeText(eventDatesEl?.value);
    const marketplace = safeText(marketplaceEl?.value);
    const price = priceEl?.value ?? "";
    const fees = feesEl?.value ?? "";
    const url = safeText(urlEl?.value);
    const notes = safeText(notesEl?.value);

    if (!eventName) return setSnapshotStatus("Enter the event name.");
    if (!marketplace) return setSnapshotStatus("Pick a marketplace.");
    if (price === "" || !Number.isFinite(Number(price))) {
      return setSnapshotStatus("Enter a valid price.");
    }
    if (!url) return setSnapshotStatus("Paste the URL you used.");

    const items = loadSnapshots();

    if (editingId) {
      const index = items.findIndex((item) => item.id === editingId);

      if (index !== -1) {
        items[index] = {
          ...items[index],
          event_name: eventName,
          event_location: eventLocation,
          event_dates: eventDates,
          search_query: normalizeQuery(queryEl?.value),
          marketplace,
          price: Number(price),
          fees: fees === "" ? null : Number(fees),
          currency: "USD",
          url,
          notes,
          section,
          row,
          seat,
        };

        saveSnapshots(items);
        renderSnapshots();
        cancelEdit();
        setSnapshotStatus("Updated snapshot.");
        return;
      }

      editingId = null;
    }

    const entry = {
      id:
        window.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      captured_at: new Date().toISOString(),
      event_name: eventName,
      event_location: eventLocation,
      event_dates: eventDates,
      search_query: normalizeQuery(queryEl?.value),
      marketplace,
      price: Number(price),
      fees: fees === "" ? null : Number(fees),
      currency: "USD",
      url,
      notes,
      section,
      row,
      seat,
    };

    items.push(entry);
    saveSnapshots(items);
    renderSnapshots();

    if (priceEl) priceEl.value = "";
    if (feesEl) feesEl.value = "";
    if (notesEl) notesEl.value = "";

    setSnapshotStatus("Saved ticket.");
  }

  function exportSnapshotsCsv() {
    const items = loadSnapshots();

    if (!items.length) {
      setSnapshotStatus("No snapshots to export yet.");
      return;
    }

    const headers = [
      "captured_at",
      "event_name",
      "event_location",
      "event_dates",
      "section",
      "row",
      "seat",
      "search_query",
      "marketplace",
      "price",
      "fees",
      "currency",
      "url",
      "notes",
    ];

    const rows = [
      headers.join(","),
      ...items
        .slice()
        .sort((a, b) => (a.captured_at < b.captured_at ? -1 : 1))
        .map((item) => headers.map((header) => escapeCsv(item[header])).join(",")),
    ];

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadTextFile(`tti-snapshots-${stamp}.csv`, rows.join("\n"), "text/csv;charset=utf-8");
    setSnapshotStatus("Exported CSV.");
  }

  function clearSnapshots() {
    localStorage.removeItem(STORAGE_KEY);

    cancelEdit();
    renderSnapshots();

    if (eventSummaryEl) {
      eventSummaryEl.textContent = "";
    }

    setSnapshotStatus("Cleared saved snapshots from this browser.");
  }

  function loadPresets() {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function savePresets(items) {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(items));
  }

  function getSelectedSiteIds() {
    return searchSites
      .filter((site) => document.getElementById(site.id)?.checked)
      .map((site) => site.id);
  }

  function getSelectedSiteLabels(siteIds) {
    return searchSites
      .filter((site) => siteIds.includes(site.id))
      .map((site) => site.label);
  }

  function renderPresets() {
    if (!presetsWrap) return;

    const presets = loadPresets();
    presetsWrap.innerHTML = "";

    if (!presets.length) {
      presetsWrap.innerHTML = `<p class="muted" style="margin:0;">No saved searches yet.</p>`;
      return;
    }

    const list = document.createElement("div");
    list.className = "tms-preset-list";

    presets.forEach((preset) => {
      const card = document.createElement("div");
      card.className = "tms-preset-card";

      const selectedLabels = getSelectedSiteLabels(preset.siteIds || []);
      const details = [
        preset.query || "No query",
        selectedLabels.length ? `Markets: ${selectedLabels.join(", ")}` : "No markets selected",
      ].join(" · ");

      card.innerHTML = `
        <div class="tms-preset-meta">
          <div class="tms-preset-name">${escapeHTML(preset.name)}</div>
          <div class="tms-preset-details">${escapeHTML(details)}</div>
        </div>
        <div class="tms-preset-actions">
          <button type="button" class="btn" data-load-preset="${escapeHTML(preset.id)}">Load</button>
          <button type="button" class="btn btn-ghost" data-delete-preset="${escapeHTML(preset.id)}">Delete</button>
        </div>
      `;

      list.appendChild(card);
    });

    presetsWrap.appendChild(list);

    $all("[data-load-preset]", presetsWrap).forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-load-preset");
        loadPresetIntoForm(id);
      });
    });

    $all("[data-delete-preset]", presetsWrap).forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-delete-preset");
        deletePreset(id);
      });
    });
  }

  function saveCurrentPreset() {
    const query = normalizeQuery(queryEl?.value);
    const siteIds = getSelectedSiteIds();
    const googleChecked = Boolean(document.getElementById(googleCheckboxId)?.checked);

    if (!query) {
      showToast("Enter a search before saving a preset", "error");
      return;
    }

    const name = window.prompt("Name this saved search:", query);
    if (!name) return;

    const presets = loadPresets();

    const preset = {
      id:
        window.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: name.trim(),
      query,
      siteIds,
      googleChecked,
      createdAt: new Date().toISOString(),
    };

    presets.unshift(preset);
    savePresets(presets.slice(0, 12));
    renderPresets();
    showToast("Saved search preset");
    setSnapshotStatus("Snapshot saved ✔");
    setTimeout(() => setSnapshotStatus(""), 1500);

    document.getElementById("step-3-title")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function loadPresetIntoForm(id) {
    const preset = loadPresets().find((item) => item.id === id);
    if (!preset) {
      showToast("Could not find that preset", "error");
      return;
    }

    if (queryEl) {
      queryEl.value = preset.query || "";
    }

    searchSites.forEach((site) => {
      const checkbox = document.getElementById(site.id);
      if (checkbox) {
        checkbox.checked = (preset.siteIds || []).includes(site.id);
      }
    });

    const googleCheckbox = document.getElementById(googleCheckboxId);
    if (googleCheckbox) {
      googleCheckbox.checked = Boolean(preset.googleChecked);
    }

    renderPreviewLinks();
    showToast("Preset loaded");
  }

  function deletePreset(id) {
    const next = loadPresets().filter((item) => item.id !== id);
    savePresets(next);
    renderPresets();
    showToast("Preset removed");
  }

  const snapshotSortEl = document.getElementById("tti-sort");
  if (snapshotSortEl) {
    snapshotSortEl.addEventListener("change", renderSnapshots);
  }

  searchSites.forEach((site) => {
    const checkbox = document.getElementById(site.id);
    if (checkbox) checkbox.addEventListener("change", renderPreviewLinks);
  });

  const googleCheckbox = document.getElementById(googleCheckboxId);
  if (googleCheckbox) googleCheckbox.addEventListener("change", renderPreviewLinks);

  if (queryEl) {
    queryEl.addEventListener("input", renderPreviewLinks);
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      openSelectedLinks();
    });
  }

  if (copyLinksBtn) copyLinksBtn.addEventListener("click", copyAllLinks);

  if (openDuplicateCheckBtn) {
    openDuplicateCheckBtn.addEventListener("click", (event) => {
      event.preventDefault();
      openDuplicateCheckFromSnapshots();
    });
  }

  if (copyTemplateBtn) copyTemplateBtn.addEventListener("click", copySnapshotTemplate);
  if (resetBtn) resetBtn.addEventListener("click", resetSearchForm);
  if (infoToggle) infoToggle.addEventListener("click", toggleExplainer);

  if (infoToggle && explainer && window.matchMedia("(hover:hover)").matches) {
    infoToggle.addEventListener("mouseenter", () => {
      infoToggle.setAttribute("aria-expanded", "true");
      explainer.classList.remove("is-collapsed");
      explainer.setAttribute("aria-hidden", "false");
    });

    infoToggle.addEventListener("mouseleave", () => {
      infoToggle.setAttribute("aria-expanded", "false");
      explainer.classList.add("is-collapsed");
      explainer.setAttribute("aria-hidden", "true");
    });
  }

  if (urlEl) {
    urlEl.addEventListener("input", () => {
      urlEl.dataset.autofill = "0";
    });
  }

  if (marketplaceEl && urlEl) {
    marketplaceEl.addEventListener("change", () => {
      const isEmpty = !urlEl.value.trim();
      const wasAutoFilled = urlEl.dataset.autofill !== "0";

      if (isEmpty || wasAutoFilled) {
        const suggested = suggestedUrlForMarketplace(marketplaceEl.value);
        if (suggested) setUrlAuto(suggested);
      }
    });
  }

  if (snapshotForm) snapshotForm.addEventListener("submit", saveSnapshot);
  if (cancelEditBtn) cancelEditBtn.addEventListener("click", cancelEdit);
  if (snapshotExportBtn) snapshotExportBtn.addEventListener("click", exportSnapshotsCsv);
  if (snapshotClearBtn) snapshotClearBtn.addEventListener("click", clearSnapshots);
  if (savePresetBtn) savePresetBtn.addEventListener("click", saveCurrentPreset);

  seedEventContextFromLastSnapshot();
  renderSnapshots();
  renderPreviewLinks();
  renderPresets();

  if (snapshotBody) {
    snapshotBody.addEventListener("click", (event) => {
      const editBtn = event.target.closest("[data-edit]");
      if (editBtn) {
        const id = editBtn.getAttribute("data-edit");
        const snapshot = loadSnapshots().find((item) => item.id === id);

        if (!snapshot) {
          setSnapshotStatus("Couldn’t find that snapshot.");
          return;
        }

        startEdit(snapshot);
        return;
      }

      const deleteBtn = event.target.closest("[data-del]");
      if (deleteBtn) {
        const id = deleteBtn.getAttribute("data-del");
        const next = loadSnapshots().filter((item) => item.id !== id);
        saveSnapshots(next);

        if (editingId === id) {
          cancelEdit();
        }

        renderSnapshots();
        setSnapshotStatus("Removed snapshot.");
      }
    });
  }
});
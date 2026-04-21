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

  function bindSearchInputs() {
  const fields = [
    queryEl,
    document.getElementById("site-google"),
    document.getElementById("site-seatgeek"),
    document.getElementById("site-vivid"),
    document.getElementById("site-stubhub"),
    document.getElementById("site-ticketmaster"),
    document.getElementById("site-tickpick")
  ].filter(Boolean);

  fields.forEach((field) => {
    field.addEventListener("input", renderPreviewLinks);
    field.addEventListener("change", renderPreviewLinks);
  });
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

  function normalizeGroupValue(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

  const PRESETS_KEY = "tvg_search_presets_v1";
  const STORAGE_KEY = "tti_snapshots_v0";
  const DUPLICATE_AUTO_RUN_KEY = "tti_duplicate_autorun_v1";

  const queryEl = document.getElementById("tms-query");
  const linksWrap = document.getElementById("tms-links");
  const savePresetBtn = document.getElementById("tms-save-preset");
  const presetsWrap = document.getElementById("tms-presets");
  const copyLinksBtn = document.getElementById("tms-copy");
  const copyTemplateBtn = document.getElementById("tms-copy-template");
  const resetBtn = document.getElementById("tms-reset");
  const infoToggle = document.getElementById("tms-info-toggle");
  const explainer = document.getElementById("tms-explainer");
  const openDuplicateCheckBtn = document.getElementById("tti-open-duplicate-check");

  const eventSortEl = document.getElementById("tti-event-sort");
  const snapshotSortEl = document.getElementById("tti-sort");
  const expandAllBtn = document.getElementById("tti-expand-all");
  const collapseAllBtn = document.getElementById("tti-collapse-all");

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

  const collapsedEventKeys = new Set();
  let editingId = null;

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

  const marketplaceLabels = {
    stubhub: "StubHub",
    seatgeek: "SeatGeek",
    vivid: "Vivid Seats",
    etix: "Etix",
    ticketmaster: "Ticketmaster",
    tickpick: "TickPick",
    viagogo: "Viagogo",
  };

  const ENABLE_OUTBOUND_LOGGING =
    window.APP_CONFIG?.enableOutboundLogging ?? false;

  function canUseBackendLogging() {
  const config = window.APP_CONFIG || {};
  const backendBase = String(config.backendBase || "").trim();
  return Boolean(config.enableOutboundLogging && backendBase);
}

function extractRealUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    // Handle Google ad redirect links
    if (url.hostname.includes("google.com")) {
      // Case 1: adurl param
      if (url.searchParams.has("adurl")) {
        return url.searchParams.get("adurl");
      }

      // Case 2: fallback to data-pcu style URLs if you ever capture them
      if (url.searchParams.has("url")) {
        return url.searchParams.get("url");
      }
    }

    return rawUrl;
  } catch (e) {
    return rawUrl;
  }
}

function buildOutboundUrl(rawUrl, meta = {}) {
  const cleanUrl = extractRealUrl(rawUrl);

  const config = window.APP_CONFIG || {};
  const base = (config.backendBase || "").replace(/\/$/, "");

  if (!config.enableOutboundLogging || !base) {
    return cleanUrl;
  }

  const params = new URLSearchParams({
    url: cleanUrl
  });

  if (meta.source) params.set("source", meta.source);

  return `${base}/out?${params.toString()}`;
}

  function normalizeQuery(value) {
    return safeText(value).replace(/\s+/g, " ");
  }

  function formatMoney(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "";
    return num.toFixed(2);
  }

  function formatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function escapeCsv(value) {
    const str = String(value ?? "");
    return `"${str.replace(/"/g, '""')}"`;
  }

  function totalCost(item) {
    const price = Number(item.price);
    const fees = Number(item.fees);
    return price + (Number.isFinite(fees) ? fees : 0);
  }

  function loadSnapshots() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveSnapshots(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function setSnapshotStatus(message, type = "success") {
    if (!snapshotStatus) return;
    snapshotStatus.textContent = message || "";
    snapshotStatus.dataset.state = type;
  }

  function setEditingVisualState(isEditing) {
    if (snapshotSaveBtn) {
      snapshotSaveBtn.textContent = isEditing ? "Update ticket" : "Save ticket";
    }

    if (cancelEditBtn) {
      cancelEditBtn.hidden = !isEditing;
    }

    if (editBannerEl) {
      editBannerEl.hidden = !isEditing;
    }
  }

  function clearSnapshotForm() {
    editingId = null;

    if (snapshotForm) snapshotForm.reset();
    if (marketplaceEl) marketplaceEl.selectedIndex = 0;

    setEditingVisualState(false);
  }

  function cancelEdit() {
    clearSnapshotForm();
    setSnapshotStatus("Edit canceled.");
    renderSnapshots();
  }

  function fillFormFromSnapshot(item) {
    if (!item) return;

    if (eventNameEl) eventNameEl.value = item.event_name || "";
    if (eventLocationEl) eventLocationEl.value = item.event_location || "";
    if (eventDatesEl) eventDatesEl.value = item.event_dates || "";
    if (sectionEl) sectionEl.value = item.section || "";
    if (rowEl) rowEl.value = item.row || "";
    if (seatEl) seatEl.value = item.seat || "";
    if (marketplaceEl) marketplaceEl.value = item.marketplace || "";
    if (priceEl) priceEl.value = item.price ?? "";
    if (feesEl) feesEl.value = item.fees ?? "";
    if (urlEl) urlEl.value = item.url || "";
    if (notesEl) notesEl.value = item.notes || "";

    editingId = item.id;
    setEditingVisualState(true);
    setSnapshotStatus("Editing saved ticket.");
  }

  function normalizeEventText(value) {
  return safeText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’'`]/g, "")
    .replace(/[.,/#!$%^*;:{}=\-_~()]/g, " ")
    .replace(/\bst\b/g, "street")
    .replace(/\bave\b/g, "avenue")
    .replace(/\bblvd\b/g, "boulevard")
    .replace(/\brd\b/g, "road")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEventDate(value) {
  const raw = safeText(value).trim();
  if (!raw) return "";

  const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);

  if (match) {
    let [, month, day, year] = match;
    month = month.padStart(2, "0");
    day = day.padStart(2, "0");

    if (year.length === 2) {
      year = `20${year}`;
    }

    return `${year}-${month}-${day}`;
  }

  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

function groupSnapshotsByEvent(items) {
  const groups = new Map();

  const eventDefaults = new Map();

  items.forEach((item) => {
    const normalizedName = normalizeEventText(item.event_name);
    const normalizedLocation = normalizeEventText(item.event_location);
    const normalizedDate = normalizeEventDate(item.event_dates);

    if (!normalizedName) return;

    if (!eventDefaults.has(normalizedName)) {
      eventDefaults.set(normalizedName, {
        location: normalizedLocation,
        date: normalizedDate,
        rawLocation: safeText(item.event_location),
        rawDate: safeText(item.event_dates),
      });
      return;
    }

    const current = eventDefaults.get(normalizedName);

    if (!current.location && normalizedLocation) {
      current.location = normalizedLocation;
      current.rawLocation = safeText(item.event_location);
    }

    if (!current.date && normalizedDate) {
      current.date = normalizedDate;
      current.rawDate = safeText(item.event_dates);
    }
  });

  items.forEach((item) => {
    const normalizedName = normalizeEventText(item.event_name);
    if (!normalizedName) return;

    const defaults = eventDefaults.get(normalizedName) || {};

    const normalizedLocation =
      normalizeEventText(item.event_location) || defaults.location || "";

    const normalizedDate =
      normalizeEventDate(item.event_dates) || defaults.date || "";

    const key = [normalizedName, normalizedLocation, normalizedDate].join("|||");

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        event_name: safeText(item.event_name, "Untitled event"),
        event_location: safeText(item.event_location) || defaults.rawLocation || "",
        event_dates: safeText(item.event_dates) || defaults.rawDate || "",
        items: [],
      });
    }

    groups.get(key).items.push(item);
  });

  return Array.from(groups.values());
}
  function sortSnapshotsForView(items, sortValue) {
    const list = items.slice();

    switch (sortValue) {
      case "allin-asc":
        list.sort((a, b) => totalCost(a) - totalCost(b));
        break;
      case "marketplace":
        list.sort((a, b) => {
          const aLabel = marketplaceLabels[a.marketplace] || a.marketplace || "";
          const bLabel = marketplaceLabels[b.marketplace] || b.marketplace || "";
          return aLabel.localeCompare(bLabel);
        });
        break;
      case "newest":
        list.sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
        break;
      case "price-asc":
      default:
        list.sort((a, b) => Number(a.price) - Number(b.price));
        break;
    }

    return list;
  }

  function sortEventGroups(groups, sortValue) {
    const list = groups.slice();

    function groupLowestPrice(group) {
      return Math.min(...group.items.map((item) => Number(item.price)));
    }

    function groupLowestTotal(group) {
      return Math.min(...group.items.map((item) => totalCost(item)));
    }

    function groupMostRecent(group) {
      return Math.max(...group.items.map((item) => new Date(item.captured_at).getTime() || 0));
    }

    switch (sortValue) {
      case "lowest-total":
        list.sort((a, b) => groupLowestTotal(a) - groupLowestTotal(b));
        break;
      case "event-name":
        list.sort((a, b) => a.event_name.localeCompare(b.event_name));
        break;
      case "most-recent":
        list.sort((a, b) => groupMostRecent(b) - groupMostRecent(a));
        break;
      case "lowest-price":
      default:
        list.sort((a, b) => groupLowestPrice(a) - groupLowestPrice(b));
        break;
    }

    return list;
  }

  function toggleEventCollapsed(eventKey) {
    if (!eventKey) return;
    if (collapsedEventKeys.has(eventKey)) {
      collapsedEventKeys.delete(eventKey);
    } else {
      collapsedEventKeys.add(eventKey);
    }
    renderSnapshots();
  }

  function expandAllEvents() {
    collapsedEventKeys.clear();
    renderSnapshots();
  }

  function collapseAllEvents() {
    const groups = groupSnapshotsByEvent(loadSnapshots());
    collapsedEventKeys.clear();
    groups.forEach((group) => collapsedEventKeys.add(group.key));
    renderSnapshots();
  }

  function getSelectedSearchUrls() {
    const raw = normalizeQuery(queryEl?.value);
    if (!raw) return [];

    const urls = [];
    const googleChecked = Boolean(document.getElementById(googleCheckboxId)?.checked);

    if (googleChecked) {
      urls.push({
        source: "google",
        href: `https://www.google.com/search?q=${encodeURIComponent(raw + " tickets")}`,
      });
    }

    searchSites.forEach((site) => {
      const checked = document.getElementById(site.id)?.checked;
      if (!checked) return;

      urls.push({
        source: site.label,
        href: `https://www.google.com/search?q=${encodeURIComponent(raw + " site:" + site.domain)}`,
      });
    });

    return urls;
  }

  function renderPreviewLinks() {
    if (!linksWrap) return;

    const urls = getSelectedSearchUrls();
    linksWrap.innerHTML = "";

    if (!urls.length) {
      linksWrap.innerHTML = `<p class="muted" style="margin:0;">Choose sites to preview search links.</p>`;
      return;
    }

    const list = document.createElement("div");
    list.className = "ms-link-list";

    urls.forEach((item) => {
      const a = document.createElement("a");
      a.className = "ms-link";
      a.href = buildOutboundUrl(item.href, { source: item.source });
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = item.source;
      list.appendChild(a);
    });

    linksWrap.appendChild(list);
  }

  function clearOpenAllNote() {
    const note = $(".tvg-open-note", linksWrap);
    if (note) note.remove();
  }

  function showOpenAllNote(message) {
    if (!linksWrap) return;
    clearOpenAllNote();

    const note = document.createElement("div");
    note.className = "muted tvg-open-note";
    note.style.marginTop = "8px";
    note.textContent = message;
    linksWrap.appendChild(note);
  }

  function openAllResults(event) {
    event.preventDefault();
    clearOpenAllNote();

    if (!queryEl?.value.trim()) {
      queryEl?.focus();
      showToast("Enter a search first.", "error");
      return;
    }

    const urls = getSelectedSearchUrls();
    if (!urls.length) {
      showToast("Select at least one marketplace.", "error");
      return;
    }

    let blocked = false;

    urls.forEach((item) => {
      const popup = window.open(
        buildOutboundUrl(item.href, { source: item.source }),
        "_blank",
        "noopener"
      );

      if (!popup || popup.closed) {
        blocked = true;
      }
    });

    if (blocked) {
      showOpenAllNote(
        "If only one tab opened, allow pop-ups for this site so all selected markets can open."
      );
    }
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

  function loadPresets() {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function savePresets(items) {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(items));
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
      const selectedLabels = getSelectedSiteLabels(preset.siteIds || []);
      const card = document.createElement("div");
      card.className = "tms-preset-card";

      card.innerHTML = `
        <div class="tms-preset-meta">
          <div class="tms-preset-name">${escapeHTML(preset.name)}</div>
          <div class="tms-preset-details">
            ${escapeHTML(
              [
                preset.query || "No query",
                selectedLabels.length
                  ? `Markets: ${selectedLabels.join(", ")}`
                  : "No markets selected",
              ].join(" · ")
            )}
          </div>
        </div>
        <div class="tms-preset-actions">
          <button type="button" class="btn" data-load-preset="${escapeHTML(preset.id)}">Load</button>
          <button type="button" class="btn btn-ghost" data-delete-preset="${escapeHTML(preset.id)}">Delete</button>
        </div>
      `;

      list.appendChild(card);
    });

    presetsWrap.appendChild(list);
  }

  function saveCurrentPreset() {
    const query = normalizeQuery(queryEl?.value);
    const siteIds = getSelectedSiteIds();
    const googleChecked = Boolean(document.getElementById(googleCheckboxId)?.checked);

    if (!query) {
      showToast("Enter a search before saving a preset.", "error");
      return;
    }

    const name = window.prompt("Name this saved search:", query);
    if (!name) return;

    const presets = loadPresets();
    presets.push({
      id: window.crypto?.randomUUID?.() ?? `${Date.now()}`,
      name: safeText(name),
      query,
      siteIds,
      googleChecked,
    });

    savePresets(presets);
    renderPresets();
    showToast("Preset saved");
  }

  function loadPresetIntoForm(id) {
    const preset = loadPresets().find((item) => item.id === id);
    if (!preset) return;

    if (queryEl) queryEl.value = preset.query || "";

    searchSites.forEach((site) => {
      const checkbox = document.getElementById(site.id);
      if (checkbox) checkbox.checked = (preset.siteIds || []).includes(site.id);
    });

    const googleBox = document.getElementById(googleCheckboxId);
    if (googleBox) googleBox.checked = Boolean(preset.googleChecked);

    renderPreviewLinks();
    showToast("Preset loaded");
  }

  function deletePreset(id) {
    const next = loadPresets().filter((item) => item.id !== id);
    savePresets(next);
    renderPresets();
    showToast("Preset deleted");
  }

  function copySearchLinks() {
    const urls = getSelectedSearchUrls();
    if (!urls.length) {
      showToast("No links to copy.", "error");
      return;
    }

    const text = urls.map((item) => item.href).join("\n");

    copyToClipboard(text)
      .then(() => showToast("Search links copied"))
      .catch(() => showToast("Could not copy links", "error"));
  }

  function copySnapshotTemplate() {
    const template = [
      `Event: ${safeText(eventNameEl?.value)}`,
      `Venue: ${safeText(eventLocationEl?.value)}`,
      `Date: ${safeText(eventDatesEl?.value)}`,
      `Section: ${safeText(sectionEl?.value)}`,
      `Row: ${safeText(rowEl?.value)}`,
      `Seat: ${safeText(seatEl?.value)}`,
      `Price: ${safeText(priceEl?.value)}`,
      `Fees: ${safeText(feesEl?.value)}`,
      `URL: ${safeText(urlEl?.value)}`,
      `Notes: ${safeText(notesEl?.value)}`,
    ].join("\n");

    copyToClipboard(template)
      .then(() => showToast("Ticket template copied"))
      .catch(() => showToast("Could not copy template", "error"));
  }

  function resetSearchForm() {
    form.reset();
    renderPreviewLinks();
    clearOpenAllNote();
  }

  function toggleExplainer(event) {
    event.preventDefault();
    if (!explainer) return;
    explainer.hidden = !explainer.hidden;
  }

  function updateEventSummary() {
    if (!eventSummaryEl) return;
    const grouped = groupSnapshotsByEvent(loadSnapshots());
    eventSummaryEl.textContent = `${grouped.length} event${grouped.length === 1 ? "" : "s"}`;
  }

  function renderSnapshots() {
    if (!snapshotBody) return;

    const items = loadSnapshots();
    snapshotBody.innerHTML = "";

    if (!items.length) {
      snapshotBody.innerHTML = `<div class="muted">No saved tickets yet.</div>`;
      updateEventSummary();
      return;
    }

    const eventSortValue = eventSortEl?.value || "lowest-price";
    const listingSortValue = snapshotSortEl?.value || "price-asc";

    const grouped = sortEventGroups(
      groupSnapshotsByEvent(items).map((group) => ({
        ...group,
        items: sortSnapshotsForView(group.items, listingSortValue),
      })),
      eventSortValue
    );

    grouped.forEach((group) => {
      const isCollapsed = collapsedEventKeys.has(group.key);
      const listingCount = group.items.length;
      const lowestPrice = Math.min(...group.items.map((item) => Number(item.price)));
      const lowestAllIn = Math.min(...group.items.map((item) => totalCost(item)));
      const eventMeta = [group.event_location, group.event_dates].filter(Boolean).join(" · ");

      const card = document.createElement("section");
      card.className = "tti-event-card";
      card.dataset.eventKey = group.key;

      const rowsHtml = group.items
        .map((snapshot) => {
          const snapshotTotal = totalCost(snapshot);
          const isLowestPrice = Number(snapshot.price) === lowestPrice;
          const isLowestAllIn = snapshotTotal === lowestAllIn;
          const rowClasses = [
            editingId === snapshot.id ? "is-editing-row" : "",
            isLowestPrice ? "is-lowest-price-row" : "",
            isLowestAllIn ? "is-lowest-allin-row" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const urlCell = snapshot.url
            ? `<a href="${escapeHTML(snapshot.url)}" target="_blank" rel="noopener noreferrer">Open</a>`
            : "";

          return `
            <tr data-snapshot-id="${escapeHTML(snapshot.id)}" class="${rowClasses}">
              <td>${escapeHTML(formatTime(snapshot.captured_at))}</td>
              <td>${escapeHTML(snapshot.section || "")}</td>
              <td>${escapeHTML(snapshot.row || "")}</td>
              <td>${escapeHTML(snapshot.seat || "")}</td>
              <td>${escapeHTML(
                marketplaceLabels[snapshot.marketplace] || snapshot.marketplace || ""
              )}</td>
              <td>
                $${escapeHTML(formatMoney(snapshot.price))}
                ${isLowestPrice ? `<span class="tti-price-badge">Lowest price</span>` : ""}
              </td>
              <td>
                $${escapeHTML(formatMoney(snapshotTotal))}
                ${isLowestAllIn ? `<span class="tti-price-badge tti-price-badge-allin">Lowest total</span>` : ""}
              </td>
              <td>${urlCell}</td>
              <td>
                <button type="button" class="btn tti-mini" data-edit="${escapeHTML(snapshot.id)}">Edit</button>
                <button type="button" class="btn tti-mini btn-ghost" data-del="${escapeHTML(snapshot.id)}">Remove</button>
              </td>
            </tr>
          `;
        })
        .join("");

      card.innerHTML = `
        <div class="tti-event-card__header">
          <div class="tti-event-card__title-wrap">
            <h3 class="tti-event-card__title">${escapeHTML(group.event_name)}</h3>
            <p class="tti-event-card__meta">${escapeHTML(eventMeta)}</p>
          </div>

          <div class="tti-event-card__badges">
            <span class="tti-price-badge">Lowest price: $${escapeHTML(formatMoney(lowestPrice))}</span>
            <span class="tti-price-badge tti-price-badge-allin">Lowest total: $${escapeHTML(formatMoney(lowestAllIn))}</span>
            <span class="tti-price-badge">${listingCount} listing${listingCount === 1 ? "" : "s"}</span>
            <button
              type="button"
              class="btn btn-ghost tti-mini"
              data-toggle-event="${escapeHTML(group.key)}"
            >
              ${isCollapsed ? "Expand" : "Collapse"}
            </button>
          </div>
        </div>

        ${
          isCollapsed
            ? ""
            : `
              <div class="tti-event-card__table-wrap">
                <table class="tti-event-table">
                  <thead>
                    <tr>
                      <th>Saved</th>
                      <th>Section</th>
                      <th>Row</th>
                      <th>Seat</th>
                      <th>Site</th>
                      <th>Price</th>
                      <th>Total</th>
                      <th>Link</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsHtml}
                  </tbody>
                </table>
              </div>
            `
        }
      `;

      snapshotBody.appendChild(card);
    });

    updateEventSummary();
  }

  function saveSnapshot(event) {
    event.preventDefault();

    const eventName = safeText(eventNameEl?.value);
    const eventLocation = safeText(eventLocationEl?.value);
    const eventDates = safeText(eventDatesEl?.value);
    const section = safeText(sectionEl?.value);
    const row = safeText(rowEl?.value);
    const seat = safeText(seatEl?.value);
    const marketplace = safeText(marketplaceEl?.value);
    const price = priceEl?.value ?? "";
    const fees = feesEl?.value ?? "";
    const url = safeText(urlEl?.value);
    const notes = safeText(notesEl?.value);

    if (!eventName) return setSnapshotStatus("Enter the event name.", "error");
    if (!marketplace) return setSnapshotStatus("Pick a marketplace.", "error");
    if (price === "" || !Number.isFinite(Number(price))) {
      return setSnapshotStatus("Enter a valid price.", "error");
    }
    if (!url) return setSnapshotStatus("Paste the URL you used.", "error");

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
        clearSnapshotForm();
        renderSnapshots();
        setSnapshotStatus("Updated snapshot.");
        showToast("Snapshot updated");
        return;
      }

      editingId = null;
    }

    items.push({
      id: window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
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
    });

    saveSnapshots(items);
    renderSnapshots();

    if (priceEl) priceEl.value = "";
    if (feesEl) feesEl.value = "";
    if (notesEl) notesEl.value = "";

    setSnapshotStatus("Saved ticket.");
    showToast("Snapshot saved");
  }

  function exportSnapshotsCsv(event) {
    if (event) event.preventDefault();

    const items = loadSnapshots();
    if (!items.length) {
      setSnapshotStatus("No snapshots to export yet.", "error");
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
        .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
        .map((item) => headers.map((header) => escapeCsv(item[header])).join(",")),
    ];

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadTextFile(
      `tti-snapshots-${stamp}.csv`,
      rows.join("\n"),
      "text/csv;charset=utf-8;"
    );

    setSnapshotStatus("Exported CSV.");
  }

  function clearSnapshots(event) {
    if (event) event.preventDefault();

    localStorage.removeItem(STORAGE_KEY);
    clearSnapshotForm();
    collapsedEventKeys.clear();
    renderSnapshots();
    setSnapshotStatus("Cleared saved snapshots from this browser.");
    showToast("Snapshots cleared");
  }

  function openDuplicateCheckFromSnapshots() {
    const items = loadSnapshots();

    if (!items.length) {
      setSnapshotStatus("Save at least one snapshot before running duplicate check.", "error");
      showToast("No saved snapshots yet", "error");
      return;
    }

    sessionStorage.setItem(DUPLICATE_AUTO_RUN_KEY, "snapshots");
    window.location.href = "duplicate-check.html";
  }

  function bindSearchInputs() {
    const fields = [
      queryEl,
      ...searchSites.map((site) => document.getElementById(site.id)),
      document.getElementById(googleCheckboxId),
    ].filter(Boolean);

    fields.forEach((field) => {
      field.addEventListener("input", renderPreviewLinks);
      field.addEventListener("change", renderPreviewLinks);
    });
  }

  if (snapshotBody) {
    snapshotBody.addEventListener("click", (event) => {
      const toggleBtn = event.target.closest("[data-toggle-event]");
      if (toggleBtn) {
        toggleEventCollapsed(toggleBtn.getAttribute("data-toggle-event"));
        return;
      }

      const editBtn = event.target.closest("[data-edit]");
        if (editBtn) {
          const id = editBtn.getAttribute("data-edit");
          const item = loadSnapshots().find((snapshot) => snapshot.id === id);

          fillFormFromSnapshot(item);
          renderSnapshots();

          // 👇 scroll to the form
          const formEl = document.getElementById("tti-snapshot-form");
          if (formEl) {
          
          const y = formEl.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top: y, behavior: "smooth" });

          if (eventNameEl) {
              eventNameEl.focus();
            }
}
          return;
        }

      const deleteBtn = event.target.closest("[data-del]");
      if (deleteBtn) {
        const id = deleteBtn.getAttribute("data-del");
        const next = loadSnapshots().filter((snapshot) => snapshot.id !== id);
        saveSnapshots(next);

        if (editingId === id) {
          clearSnapshotForm();
        }

        renderSnapshots();
        setSnapshotStatus("Removed snapshot.");
        showToast("Snapshot removed");
      }
    });
  }

  if (presetsWrap) {
    presetsWrap.addEventListener("click", (event) => {
      const loadBtn = event.target.closest("[data-load-preset]");
      if (loadBtn) {
        loadPresetIntoForm(loadBtn.getAttribute("data-load-preset"));
        return;
      }

      const deleteBtn = event.target.closest("[data-delete-preset]");
      if (deleteBtn) {
        deletePreset(deleteBtn.getAttribute("data-delete-preset"));
      }
    });
  }

  form.addEventListener("submit", openAllResults);

  if (savePresetBtn) savePresetBtn.addEventListener("click", saveCurrentPreset);
  if (copyLinksBtn) copyLinksBtn.addEventListener("click", copySearchLinks);
  if (copyTemplateBtn) copyTemplateBtn.addEventListener("click", copySnapshotTemplate);
  if (resetBtn) resetBtn.addEventListener("click", resetSearchForm);
  if (infoToggle) infoToggle.addEventListener("click", toggleExplainer);
  if (openDuplicateCheckBtn) {
    openDuplicateCheckBtn.addEventListener("click", (event) => {
      event.preventDefault();
      openDuplicateCheckFromSnapshots();
    });
  }

  if (snapshotForm) snapshotForm.addEventListener("submit", saveSnapshot);
  if (snapshotSaveBtn) snapshotSaveBtn.addEventListener("click", saveSnapshot);
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", (event) => {
      event.preventDefault();
      cancelEdit();
    });
  }
  if (snapshotExportBtn) snapshotExportBtn.addEventListener("click", exportSnapshotsCsv);
  if (snapshotClearBtn) snapshotClearBtn.addEventListener("click", clearSnapshots);

  if (eventSortEl) eventSortEl.addEventListener("change", renderSnapshots);
  if (snapshotSortEl) snapshotSortEl.addEventListener("change", renderSnapshots);
  if (expandAllBtn) expandAllBtn.addEventListener("click", expandAllEvents);
  if (collapseAllBtn) collapseAllBtn.addEventListener("click", collapseAllEvents);

  [eventNameEl, eventLocationEl, eventDatesEl]
    .filter(Boolean)
    .forEach((el) => el.addEventListener("input", updateEventSummary));

  bindSearchInputs();
  renderPreviewLinks();
  renderPresets();
  renderSnapshots();
  updateEventSummary();
  setEditingVisualState(false);
});

  
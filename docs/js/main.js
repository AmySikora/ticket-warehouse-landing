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
      setTimeout(() => reject(new Error("timeout")), ms);
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
      makePill(`${conflictGroupCount} conflict group${conflictGroupCount === 1 ? "" : "s"}`)
    );
    summaryStrip.appendChild(
      makePill(`${riskyCount} risky listing${riskyCount === 1 ? "" : "s"}`)
    );
    summaryStrip.appendChild(makePill(`Source: ${source}`));
    summaryStrip.appendChild(
      makePill(
        riskyCount > 0
          ? "These are the seats we’d sync across marketplaces."
          : "No duplicates found with this rule set."
      )
    );
  }

  function clearSummary() {
    if (!summaryStrip) return;
    summaryStrip.innerHTML = "";
    summaryStrip.classList.remove("is-visible");
  }

  function buildRows(data) {
    return data
      .map((row, index) => {
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
        const seat = pick("seat", "seat number", "seat_no", "seat #");
        const marketplace = pick("marketplace", "source", "channel", "site");
        const id = pick("id", "listing_id", "external_id") || String(index + 1);
        const when = pick("when", "timestamp", "time", "created_at");

        const key = [event, section, rowValue, seat]
          .map((value) => String(value || "").trim())
          .join("|");

        return {
          _index: index,
          _key: key,
          id,
          event,
          marketplace,
          section,
          row: rowValue,
          seat,
          when,
          decision: "Approved",
        };
      })
      .filter((row) =>
        Object.values(row).some((value) => String(value || "").trim() !== "")
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
            Conflict group #${group.id} — ${group.size} listings share the same seat
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
              ? '<span class="tvg-status-pill tvg-status-risk">Duplicate seat</span>'
              : '<span class="tvg-status-pill tvg-status-ok">OK</span>'
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
      downloadBtn && (downloadBtn.disabled = true);
      return;
    }

    if (!hasRequiredColumns(mappedRows)) {
      renderEmpty(
        "This demo expects columns for Event, Section, Row, and Seat. Optional: Marketplace. Try the sample CSV to see the expected format."
      );
      clearSummary();
      downloadBtn && (downloadBtn.disabled = true);
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
        runAnalysis(results.data || [], file.name || "Your CSV");
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "Run scan";
      },
      error() {
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
            updateFileLabel("sample_listings.csv");
            setAnalyzeReadyState(true);
            runAnalysis(results.data || [], "sample_listings.csv");
          },
          error() {
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
    if (!allRows.length) return;

    const headers = ["id", "decision", "marketplace", "event", "section", "row", "seat", "when"];
    const lines = [headers.join(",")];

    allRows.forEach((row) => {
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
});

// =====================================================
// Search page: marketplace search + snapshot capture
// =====================================================
tvgSafe("search-workflow", () => {
  const form = document.getElementById("tixSearch");
  if (!form) return;

  const queryEl = document.getElementById("tms-query");
  const linksWrap = document.getElementById("tms-links");
  const copyLinksBtn = document.getElementById("tms-copy");
  const copyTemplateBtn = document.getElementById("tms-copy-template");
  const resetBtn = document.getElementById("tms-reset");
  const infoToggle = document.getElementById("tms-info-toggle");
  const explainer = document.getElementById("tms-explainer");

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

  const snapshotForm = document.getElementById("tti-snapshot-form");
  const snapshotBody = document.getElementById("tti-snapshots-body");
  const snapshotStatus = document.getElementById("tti-status");
  const snapshotExportBtn = document.getElementById("tti-export-csv");
  const snapshotClearBtn = document.getElementById("tti-clear-session");
  const snapshotSaveBtn = document.getElementById("tti-save-snapshot");
  const cancelEditBtn = document.getElementById("tti-cancel-edit");
  const eventSummaryEl = document.getElementById("tti-event-summary");

  const marketplaceEl = document.getElementById("tti-marketplace");
  const priceEl = document.getElementById("tti-price");
  const feesEl = document.getElementById("tti-fees");
  const urlEl = document.getElementById("tti-url");
  const notesEl = document.getElementById("tti-notes");
  const eventNameEl = document.getElementById("tti-event-name");
  const eventLocationEl = document.getElementById("tti-event-location");
  const eventDatesEl = document.getElementById("tti-event-dates");

  const marketplaceLabels = {
    stubhub: "StubHub",
    seatgeek: "SeatGeek",
    vivid: "Vivid Seats",
    etix: "Etix",
    ticketmaster: "Ticketmaster",
    tickpick: "TickPick",
    viagogo: "Viagogo",
  };

  let editingId = null;

  function normalizeQuery(raw) {
    return String(raw || "").replace(/\s+/g, " ").trim();
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
      link.href = item.href;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = `${item.label}: ${item.href}`;
      linksWrap.appendChild(link);
    });
  }

  function openAllResults(event) {
    event.preventDefault();

    if (!queryEl?.checkValidity()) {
      queryEl?.reportValidity();
      return;
    }

    const urls = getSelectedSearchUrls();
    if (!urls.length) return;

    const firstWindow = window.open(urls[0].href, "_blank", "noopener");
    let blocked = !firstWindow || firstWindow.closed;

    for (let i = 1; i < urls.length; i += 1) {
      const popup = window.open(urls[i].href, "_blank", "noopener");
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

    if (snapshotSaveBtn) snapshotSaveBtn.textContent = "Update snapshot";
    if (cancelEditBtn) cancelEditBtn.hidden = false;

    setSnapshotStatus('Editing snapshot. Update fields and click "Update snapshot".');
  }

  function cancelEdit() {
    editingId = null;

    if (snapshotSaveBtn) snapshotSaveBtn.textContent = "Save snapshot";
    if (cancelEditBtn) cancelEditBtn.hidden = true;
    if (priceEl) priceEl.value = "";
    if (feesEl) feesEl.value = "";
    if (notesEl) notesEl.value = "";

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
      tr.innerHTML = `<td colspan="7" class="muted">No snapshots saved yet.</td>`;
      snapshotBody.appendChild(tr);
      return;
    }

    const sorted = items
      .slice()
      .sort((a, b) => (a.captured_at < b.captured_at ? 1 : -1));

    sorted.forEach((snapshot) => {
      const tr = document.createElement("tr");
      const eventText = [
        snapshot.event_name,
        snapshot.event_location,
        snapshot.event_dates,
      ]
        .filter(Boolean)
        .join(" · ");

      const urlCell = snapshot.url
        ? `<a href="${escapeHTML(snapshot.url)}" target="_blank" rel="noopener noreferrer">link</a>`
        : "";

      tr.innerHTML = `
        <td>${escapeHTML(formatTime(snapshot.captured_at))}</td>
        <td>${escapeHTML(eventText)}</td>
        <td>${escapeHTML(marketplaceLabels[snapshot.marketplace] || snapshot.marketplace)}</td>
        <td>$${escapeHTML(formatMoney(snapshot.price))}</td>
        <td>${snapshot.fees !== null && snapshot.fees !== "" ? `$${escapeHTML(formatMoney(snapshot.fees))}` : ""}</td>
        <td>${urlCell}</td>
        <td>
          <button type="button" class="btn tti-mini" data-edit="${escapeHTML(snapshot.id)}">Edit</button>
          <button type="button" class="btn tti-mini btn-ghost" data-del="${escapeHTML(snapshot.id)}">Remove</button>
        </td>
      `;

      snapshotBody.appendChild(tr);
    });

    $all("[data-edit]", snapshotBody).forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-edit");
        const snapshot = loadSnapshots().find((item) => item.id === id);
        if (!snapshot) {
          setSnapshotStatus("Couldn’t find that snapshot.");
          return;
        }
        startEdit(snapshot);
      });
    });

    $all("[data-del]", snapshotBody).forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-del");
        const next = loadSnapshots().filter((item) => item.id !== id);
        saveSnapshots(next);
        renderSnapshots();
        setSnapshotStatus("Removed snapshot.");
      });
    });
  }

  function saveSnapshot(event) {
    event.preventDefault();

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
    };

    items.push(entry);
    saveSnapshots(items);
    renderSnapshots();

    if (priceEl) priceEl.value = "";
    if (feesEl) feesEl.value = "";
    if (notesEl) notesEl.value = "";

    setSnapshotStatus("Saved snapshot to this browser.");
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
    renderSnapshots();
    setSnapshotStatus("Cleared saved snapshots from this browser.");
  }

  form.addEventListener("submit", openAllResults);

  if (queryEl) {
    queryEl.addEventListener("input", renderPreviewLinks);
    queryEl.addEventListener("blur", () => {
      if (eventNameEl && !eventNameEl.value.trim()) {
        eventNameEl.value = normalizeQuery(queryEl.value);
      }
    });
  }

  searchSites.forEach((site) => {
    const checkbox = document.getElementById(site.id);
    if (checkbox) checkbox.addEventListener("change", renderPreviewLinks);
  });

  const googleCheckbox = document.getElementById(googleCheckboxId);
  if (googleCheckbox) googleCheckbox.addEventListener("change", renderPreviewLinks);

  if (copyLinksBtn) copyLinksBtn.addEventListener("click", copyAllLinks);
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

  seedEventContextFromLastSnapshot();
  renderSnapshots();
  renderPreviewLinks();
});
// ===== Footer Year (all pages) =====
(function () {
    const y = document.getElementById('y');
    if (y) {
      y.textContent = new Date().getFullYear();
    }
  })();
  
  // ===== Nav Toggle (all pages) =====
  (function () {
    const hdr = document.querySelector('header.nav');
    const btn = document.querySelector('.nav-toggle');
    const nav = document.getElementById('primary-nav');
  
    if (!btn || !hdr || !nav) return;
  
    function closeMenu() {
      nav.classList.remove('is-open');
      hdr.classList.remove('nav-open');
      document.body.classList.remove('menu-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  
    function openMenu() {
      nav.classList.add('is-open');
      hdr.classList.add('nav-open');
      document.body.classList.add('menu-open');
      btn.setAttribute('aria-expanded', 'true');
    }
  
    function toggleMenu() {
      const isOpen = nav.classList.contains('is-open');
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    }
  
    btn.addEventListener('click', toggleMenu);
  
    nav.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', closeMenu)
    );
  
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) {
        closeMenu();
      }
    });
  
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    });
  })();
  
  // ===== Toast Utility (global, used on index etc.) =====
  function showToast(message, type = 'success', ttl = 4000) {
    const root = document.getElementById('toast-root');
    if (!root) return;
  
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.role = 'status';
    el.innerHTML = `
      <div>${message}</div>
      <button aria-label="Dismiss">✕</button>
    `;
  
    const close = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 180);
    };
  
    el.querySelector('button').addEventListener('click', close);
  
    root.appendChild(el);
  
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(close, ttl);
  }
  
  // ===== Contact Form Handler (index page only) =====
  (function () {
    const form = document.getElementById('contact-form');
    if (!form) return;
  
    const btn = document.getElementById('contact-submit');
    const status = document.getElementById('contact-status');
    const API_URL =
      'https://tvg-contact-f9046a-5bc794bd5ce3.herokuapp.com/api/contact';
  
    const withTimeout = (ms, promise) =>
      Promise.race([
        promise,
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('timeout')), ms)
        ),
      ]);
  
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!btn || !status) return;
  
      status.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Sending...';
  
      const data = {
        email: form.email.value.trim(),
        message: form.message.value.trim(),
        website: form.website ? form.website.value : '',
      };
  
      try {
        const res = await withTimeout(
          10000,
          fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          })
        );
  
        if (!res.ok) throw new Error('Request failed');
  
        window.location.href = 'thanks.html';
      } catch (err) {
        status.textContent =
          'Sorry, we could not send right now. Please email hello@ticketveriguard.com.';
        if (typeof showToast === 'function') {
          showToast('Send failed', 'error');
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Request demo';
      }
    });
  })();
  
  // ===== TVG Widget Mount (brokers page only) =====
  (function () {
    function mountWidget() {
      const target = document.getElementById('tvg-widget');
      if (!target) return;
  
      if (!window.TVGWidget || typeof window.TVGWidget.mount !== 'function') {
        console.error('TVGWidget not loaded');
        return;
      }
  
      if (target.dataset.mounted === '1') return;
  
      window.TVGWidget.mount('#tvg-widget', {
        whiteLabel: true,
        accent: '#22d3ee',
      });
  
      target.dataset.mounted = '1';
    }
  
    if (document.getElementById('tvg-widget')) {
      if (
        document.readyState === 'complete' ||
        document.readyState === 'interactive'
      ) {
        mountWidget();
      } else {
        document.addEventListener('DOMContentLoaded', mountWidget);
      }
    }
  })();
  
  // ===== VERIFY PAGE: CSV Checking Logic =====
  (function () {
    const fileInput = document.getElementById('tvg-file-input');
    const analyzeBtn = document.getElementById('tvg-analyze-btn');
    const sampleBtn = document.getElementById('tvg-sample-btn');
    const fileLabel = document.getElementById('tvg-file-label');
    const summaryStrip = document.getElementById('tvg-summary');
    const table = document.getElementById('tvg-results-table');
    const filterDecision = document.getElementById('tvg-filter-decision');
    const filterMarketplace = document.getElementById('tvg-filter-marketplace');
    const resetFiltersBtn = document.getElementById('tvg-reset-filters');
    const downloadBtn = document.getElementById('tvg-download-clean');
    const thumbUp = document.getElementById('tvg-thumb-up');
    const thumbDown = document.getElementById('tvg-thumb-down');
    const feedbackLabel = document.getElementById('tvg-feedback-label');
  
    if (!fileInput || !analyzeBtn || !sampleBtn || !table) return; // not on verify page
  
    const tableBody = table.querySelector('tbody');
  
    let allRows = [];
    let sortState = { key: null, dir: 1 };
    let conflictGroups = [];
    let conflictLookup = {};
    let lastSourceLabel = '';
  
    function normalizeHeader(h) {
      return (h || '').toString().trim().toLowerCase();
    }
  
    function onFileChange() {
      if (fileInput.files && fileInput.files[0]) {
        fileLabel.textContent = fileInput.files[0].name;
        analyzeBtn.disabled = false;
      } else {
        fileLabel.textContent = 'No file selected.';
        analyzeBtn.disabled = true;
      }
    }
  
    function handleSampleClick() {
      if (!window.Papa) {
        alert('Parser not loaded yet. Please try again.');
        return;
      }
      fetch('./sample_listings.csv')
        .then((res) => {
          if (!res.ok) throw new Error('Sample CSV not found');
          return res.text();
        })
        .then((text) => {
          Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            complete: (results) =>
              runAnalysis(results.data || [], 'Sample CSV'),
          });
        })
        .catch(() => {
          alert(
            'Could not load sample_listings.csv. Please add it to your repo or upload your own file.'
          );
        });
    }
  
    function parseAndAnalyze() {
      const file = fileInput.files[0];
      if (!file || !window.Papa) return;
  
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = 'Analyzing...';
  
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          runAnalysis(results.data || [], file.name || 'Your CSV');
          analyzeBtn.textContent = 'Analyze CSV';
          analyzeBtn.disabled = false;
        },
        error: () => {
          analyzeBtn.textContent = 'Analyze CSV';
          analyzeBtn.disabled = false;
          alert('Sorry, there was a problem reading that file.');
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
              if (v !== undefined && v !== '') return v;
            }
            return '';
          };
  
          const event = pick('event', 'event name', 'event_name');
          const section = pick('section', 'sec');
          const r = pick('row');
          const seat = pick('seat', 'seat number', 'seat_no', 'seat #');
          const mp = pick('marketplace', 'source', 'channel', 'site');
          const id =
            pick('id', 'listing_id', 'external_id') || (idx + 1).toString();
          const when = pick('when', 'timestamp', 'time', 'created_at');
  
          const key = [event, section, r, seat]
            .map((v) => (v || '').toString().trim())
            .join('|');
  
          return {
            _index: idx,
            id,
            event,
            marketplace: mp,
            section,
            row: r,
            seat,
            when,
            decision: 'Approved',
            _key: key,
          };
        })
        .filter((r) =>
          Object.values(r).some(
            (v) => (v || '').toString().trim() !== ''
          )
        );
    }
  
    function hasRequiredColumns(rows) {
      if (!rows.length) return false;
      const sample = rows[0];
      return !!(sample.event || sample.section || sample.row || sample.seat);
    }
  
    function assignConflicts(rows) {
      const byKey = {};
      rows.forEach((r) => {
        if (!r._key || r._key === '|||') return;
        if (!byKey[r._key]) byKey[r._key] = [];
        byKey[r._key].push(r);
      });
  
      const groups = [];
      const lookup = {};
      let riskyCount = 0;
      let groupId = 1;
  
      Object.entries(byKey).forEach(([key, list]) => {
        if (list.length > 1) {
          const [event, section, row, seat] = key.split('|');
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
              r.decision = 'Approved';
            } else {
              r.decision = 'Blocked';
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
      allRows.forEach((r) => {
        if (r.marketplace) seen.add(r.marketplace);
      });
      filterMarketplace.innerHTML =
        '<option value="all">All marketplaces</option>';
      Array.from(seen)
        .sort()
        .forEach((mp) => {
          const opt = document.createElement('option');
          opt.value = mp;
          opt.textContent = mp;
          filterMarketplace.appendChild(opt);
        });
    }
  
    function getFilteredRows() {
      const d = filterDecision.value;
      const mp = filterMarketplace.value;
      return allRows.filter((r) => {
        if (d !== 'all' && r.decision !== d) return false;
        if (mp !== 'all' && r.marketplace !== mp) return false;
        return true;
      });
    }
  
    function renderSummary({
      scannedCount,
      conflictGroupCount,
      riskyCount,
      source,
    }) {
      summaryStrip.innerHTML = '';
      summaryStrip.classList.add('is-visible');
  
      const strong = document.createElement('strong');
      strong.textContent = `${scannedCount.toLocaleString()} listings scanned`;
      summaryStrip.appendChild(strong);
  
      const cg = document.createElement('span');
      cg.className = 'tvg-summary-pill';
      cg.textContent = `${conflictGroupCount} conflict group${
        conflictGroupCount === 1 ? '' : 's'
      }`;
      summaryStrip.appendChild(cg);
  
      const risky = document.createElement('span');
      risky.className = 'tvg-summary-pill';
      risky.textContent = `${riskyCount} risky listing${
        riskyCount === 1 ? '' : 's'
      }`;
      summaryStrip.appendChild(risky);
  
      const src = document.createElement('span');
      src.className = 'tvg-summary-pill';
      src.textContent = `Source: ${source}`;
      summaryStrip.appendChild(src);
  
      const note = document.createElement('span');
      note.className = 'tvg-summary-pill';
      note.textContent =
        riskyCount > 0
          ? 'These are the seats we’d sync across marketplaces.'
          : 'No duplicates found with this rule set.';
      summaryStrip.appendChild(note);
    }
  
    function clearSummary() {
      summaryStrip.innerHTML = '';
      summaryStrip.classList.remove('is-visible');
    }
  
    function renderEmpty(message) {
      tableBody.innerHTML = `
        <tr class="tvg-empty-row">
          <td colspan="8">${message}</td>
        </tr>`;
    }
  
    function escapeHTML(str) {
      return (str || '')
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  
    function renderTable() {
      const rows = getFilteredRows().slice();
      tableBody.innerHTML = '';
  
      if (!rows.length) {
        renderEmpty('No rows to display with the current filters.');
        return;
      }
  
      if (sortState.key) {
        rows.sort((a, b) => {
          const va = (a[sortState.key] || '').toString().toLowerCase();
          const vb = (b[sortState.key] || '').toString().toLowerCase();
          if (va < vb) return -1 * sortState.dir;
          if (va > vb) return 1 * sortState.dir;
          return 0;
        });
      }
  
      const groupMeta = {};
      conflictGroups.forEach((g) => {
        groupMeta[g.id] = g;
      });
  
      const inserted = new Set();
  
      rows.forEach((r) => {
        const gid = conflictLookup[r._index];
  
        if (gid && !inserted.has(gid) && groupMeta[gid]) {
          inserted.add(gid);
          const g = groupMeta[gid];
          const labelTr = document.createElement('tr');
          labelTr.className = 'tvg-group-label-row';
          labelTr.innerHTML = `
            <td colspan="8">
              Conflict group #${g.id} — ${g.size} listings share the same seat
              (${escapeHTML(g.event)} • Sec ${escapeHTML(
            g.section
          )} • Row ${escapeHTML(g.row)} • Seat ${escapeHTML(g.seat)})
            </td>`;
          tableBody.appendChild(labelTr);
        }
  
        const tr = document.createElement('tr');
        const isBlocked = r.decision === 'Blocked';
  
        tr.className =
          'tvg-row ' +
          (gid ? 'tvg-conflict-row' : 'tvg-clean-row');
  
        tr.innerHTML = `
          <td>${escapeHTML(r.id)}</td>
          <td>
            ${
              isBlocked
                ? '<span class="tvg-status-pill tvg-status-risk">Duplicate seat</span>'
                : '<span class="tvg-status-pill tvg-status-ok">OK</span>'
            }
          </td>
          <td>${escapeHTML(r.marketplace || '—')}</td>
          <td>${escapeHTML(r.event)}</td>
          <td>${escapeHTML(r.section)}</td>
          <td>${escapeHTML(r.row)}</td>
          <td>${escapeHTML(r.seat)}</td>
          <td>${escapeHTML(r.when)}</td>
        `;
        tableBody.appendChild(tr);
      });
    }
  
    function onHeaderClick(e) {
      const th = e.target.closest('th[data-key]');
      if (!th) return;
      const key = th.getAttribute('data-key');
      if (!key) return;
      if (sortState.key === key) {
        sortState.dir = -sortState.dir;
      } else {
        sortState.key = key;
        sortState.dir = 1;
      }
      renderTable();
    }
  
    function resetFilters() {
      filterDecision.value = 'all';
      filterMarketplace.value = 'all';
      renderTable();
    }
  
    function downloadCleanedCSV() {
      if (!allRows.length) return;
      const headers = [
        'id',
        'decision',
        'marketplace',
        'event',
        'section',
        'row',
        'seat',
        'when',
      ];
      const lines = [headers.join(',')];
      allRows.forEach((r) => {
        const vals = headers.map((h) =>
          `"${(r[h] || '').toString().replace(/"/g, '""')}"`
        );
        lines.push(vals.join(','));
      });
      const blob = new Blob([lines.join('\n')], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ticket-veriguard-cleaned.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  
    function handleThumb(up) {
      feedbackLabel.textContent = up
        ? 'Thanks — glad it helped!'
        : 'Thanks — your feedback helps us improve.';
    }
  
    // Wire up events
    fileInput.addEventListener('change', onFileChange);
    analyzeBtn.addEventListener('click', parseAndAnalyze);
    sampleBtn.addEventListener('click', handleSampleClick);
    table
      .querySelector('thead')
      .addEventListener('click', onHeaderClick);
    filterDecision.addEventListener('change', renderTable);
    filterMarketplace.addEventListener('change', renderTable);
    resetFiltersBtn.addEventListener('click', resetFilters);
    downloadBtn.addEventListener('click', downloadCleanedCSV);
    thumbUp.addEventListener('click', () => handleThumb(true));
    thumbDown.addEventListener('click', () => handleThumb(false));
  })();
  
  // ===== PROTOTYPE PAGE: MetaSearch Logic =====
  (function () {
    const form = document.getElementById('metaSearch');
    if (!form) return; // not on prototype page
  
    const $ = (s, r = document) => r.querySelector(s);
  
    const iEvent = $('#ms-event');
    const iCity = $('#ms-city');
    const iSRS = $('#ms-srs');
    const linksWrap = $('#ms-links');
  
    const sites = {
      google: $('#site-google'),
      seatgeek: $('#site-seatgeek'),
      vivid: $('#site-vivid'),
      stubhub: $('#site-stubhub'),
      ticketmaster: $('#site-ticketmaster'),
    };
  
    const buildQuery = () =>
      [iEvent.value.trim(), iCity.value.trim(), iSRS.value.trim()]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
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
      linksWrap.innerHTML = '';
      if (!q) return;
      const urls = urlMap(q);
      for (const [key, el] of Object.entries(sites)) {
        if (!el || !el.checked) continue;
        const a = document.createElement('a');
        a.className = 'btn';
        a.target = '_blank';
        a.rel = 'noopener';
        a.href = urls[key];
        a.textContent =
          {
            google: 'Google',
            seatgeek: 'SeatGeek',
            vivid: 'Vivid Seats',
            stubhub: 'StubHub',
            ticketmaster: 'Ticketmaster',
          }[key] || key;
        linksWrap.appendChild(a);
      }
    }
  
    let t = null;
    const debounce = (fn) => {
      clearTimeout(t);
      t = setTimeout(fn, 200);
    };
  
    const KEY = 'tvg.metaSearch';
  
    function loadSaved() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        iEvent.value = s.event || '';
        iCity.value = s.city || '';
        iSRS.value = s.srs || '';
        for (const k of Object.keys(sites)) {
          if (s.sites && typeof s.sites[k] === 'boolean' && sites[k]) {
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
          city: iCity.value,
          srs: iSRS.value,
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
  
    form.addEventListener('input', () => {
      debounce(() => {
        saveNow();
        renderPreview();
      });
    });
  
    Object.values(sites)
      .filter(Boolean)
      .forEach((el) =>
        el.addEventListener('change', () => {
          saveNow();
          renderPreview();
        })
      );
  
    form.addEventListener('submit', (e) => {
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
          window.open(urls[k], '_blank', 'noopener');
        });
    });
  
    $('#ms-copy').addEventListener('click', async () => {
      const q = buildQuery();
      if (!q) return;
      try {
        await navigator.clipboard.writeText(q);
      } catch {
        // ignore
      }
    });
  
    $('#ms-reset').addEventListener('click', () => {
      iEvent.value = '';
      iCity.value = '';
      iSRS.value = '';
      Object.values(sites)
        .filter(Boolean)
        .forEach((el) => (el.checked = true));
      saveNow();
      renderPreview();
      iEvent.focus();
    });
  
    loadSaved();
    renderPreview();
  })();
  
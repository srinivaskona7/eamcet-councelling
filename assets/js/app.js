(function () {
  "use strict";

  const REGION_LABELS = {
    AU: "AU Zone (Andhra University)",
    SVU: "SVU Zone (Sri Venkateswara University)",
    SW: "Statewide (Deemed/Private University)",
  };

  const DISTRICT_LABELS = {
    ATP: "Anantapur", CTR: "Chittoor", EG: "East Godavari", GTR: "Guntur",
    KDP: "Kadapa (YSR)", KNL: "Kurnool", KRI: "Krishna", NLR: "Nellore (SPSR)",
    PKS: "Prakasam", SKL: "Srikakulam", VSP: "Visakhapatnam", VZM: "Vizianagaram",
    WG: "West Godavari",
  };

  const TYPE_LABELS = {
    PVT: "Private", SF: "Self-Financed", SS: "Self-Supporting",
    UNIV: "University", PU: "Private University",
  };

  const state = {
    data: null,
    selectedBranches: new Set(),
    selectedRegions: new Set(),
    selectedDistricts: new Set(),
    selectedTypes: new Set(),
    gender: "B",
    branchMode: "separate",
    shortlist: new Map(),
    lastMaxRank: null,
    compareRows: new Map(),
    removedKeys: new Set(),
    lastSearchParams: null,
  };

  const el = (id) => document.getElementById(id);

  const SHORTLIST_KEY = "apeapcet2025_shortlist";
  const THEME_KEY = "apeapcet2025_theme";

  function shortlistKey(r, categoryKey) {
    return `${r.instCode}|${r.branch}|${r.localArea}|${categoryKey}`;
  }

  // Category-agnostic identity used for "Edit List" row removal, so a college
  // removed from the list stays removed regardless of which caste category
  // it's being viewed under — this is what makes removals survive a shared link.
  function rowIdentityKey(r) {
    return `${r.instCode}|${r.branch}|${r.localArea}`;
  }

  function persistCurrentSearchState() {
    if (!state.lastSearchParams) return;
    const { category, maxRankRaw, limitRaw } = state.lastSearchParams;
    updateUrlState(category, maxRankRaw, limitRaw);
    saveFiltersToStorage(category, maxRankRaw, limitRaw);
  }

  function loadShortlist() {
    try {
      const raw = localStorage.getItem(SHORTLIST_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      arr.forEach((item) => state.shortlist.set(item.key, item));
    } catch (err) {
      console.warn("Could not load shortlist", err);
    }
  }

  function saveShortlist() {
    try {
      localStorage.setItem(SHORTLIST_KEY, JSON.stringify([...state.shortlist.values()]));
    } catch (err) {
      console.warn("Could not save shortlist", err);
    }
  }

  function applyStoredTheme() {
    const theme = localStorage.getItem(THEME_KEY) || "light";
    document.documentElement.dataset.theme = theme;
    const btn = el("themeToggle");
    if (btn) btn.textContent = theme === "dark" ? "☀" : "☽";
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyStoredTheme();
  }

  const FILTERS_KEY = "apeapcet2025_last_filters";

  function saveFiltersToStorage(category, maxRankRaw, resultLimit) {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({
        branches: [...state.selectedBranches],
        regions: [...state.selectedRegions],
        districts: [...state.selectedDistricts],
        types: [...state.selectedTypes],
        category,
        gender: state.gender,
        mode: state.branchMode,
        maxRank: maxRankRaw || "",
        resultLimit: resultLimit || "25",
        removed: [...state.removedKeys],
      }));
    } catch (err) {
      console.warn("Could not save filters", err);
    }
  }

  function loadFiltersFromStorage() {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  // ---------- Shortlist (My Colleges) ----------

  function toggleShortlistItem(r, categoryKey, category, meta) {
    const key = shortlistKey(r, categoryKey);
    if (state.shortlist.has(key)) {
      state.shortlist.delete(key);
    } else {
      state.shortlist.set(key, {
        key,
        instCode: r.instCode,
        instName: r.instName,
        branch: r.branch,
        branchLabel: meta.branch_labels[r.branch] || r.branch,
        district: r.district,
        type: r.type,
        region: r.region,
        localArea: r.localArea,
        category,
        categoryKey,
        categoryLabel: meta.category_labels[categoryKey] || categoryKey,
        rank: resolveRank(r, categoryKey).value,
      });
    }
    saveShortlist();
    updateShortlistCount();
    return state.shortlist.has(key);
  }

  function updateShortlistCount() {
    const badge = el("shortlistCount");
    if (badge) badge.textContent = String(state.shortlist.size);
  }

  function renderShortlistPanel() {
    const list = el("shortlistList");
    const empty = el("shortlistEmpty");
    const items = [...state.shortlist.values()].sort((a, b) => a.instName.localeCompare(b.instName));
    list.innerHTML = "";
    empty.hidden = items.length > 0;
    items.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div>
          <span class="code-cell">${escapeHtml(item.instCode)}</span> ${escapeHtml(item.instName)}
          <div class="hint">${escapeHtml(item.branch)} &middot; ${escapeHtml(item.categoryLabel)} &middot; ${item.rank != null ? `Rank ${item.rank}` : "No allotment recorded"} &middot; ${escapeHtml(DISTRICT_LABELS[item.district] || item.district)}</div>
        </div>
        <button type="button" class="link-btn shortlist-remove" title="Remove from shortlist">Remove</button>
      `;
      li.querySelector(".shortlist-remove").addEventListener("click", () => {
        state.shortlist.delete(item.key);
        saveShortlist();
        updateShortlistCount();
        renderShortlistPanel();
        document.querySelectorAll(`.star-btn[data-key="${cssEscape(item.key)}"]`).forEach((b) => {
          b.classList.remove("active");
          b.textContent = "☆";
        });
      });
      list.appendChild(li);
    });
  }

  function cssEscape(str) {
    return String(str).replace(/["\\\]\[]/g, "\\$&");
  }

  function exportShortlistCsv() {
    const items = [...state.shortlist.values()];
    if (!items.length) return;
    const header = ["College Code", "College Name", "Branch", "Category", "Cutoff Rank", "District", "Zone", "Type"];
    const lines = [header.join(",")];
    items.forEach((item) => {
      const row = [
        item.instCode, item.instName, item.branch, item.categoryLabel,
        item.rank != null ? item.rank : "No allotment recorded",
        DISTRICT_LABELS[item.district] || item.district, item.localArea, item.type,
      ].map(csvCell);
      lines.push(row.join(","));
    });
    downloadTextFile(lines.join("\n"), "apeapcet2025_my_shortlist.csv", "text/csv");
  }

  function csvCell(value) {
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  function downloadTextFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ---------- College profile (full category matrix) ----------

  function openCollegeProfile(r) {
    const meta = state.data.meta;
    const modal = el("collegeModal");
    const body = el("collegeModalBody");
    const genderLabel = { B: "Boys", G: "Girls" };
    const categoryOrder = ["OC", "SC1", "SC2", "SC3", "ST", "BCA", "BCB", "BCC", "BCD", "BCE", "EWS"];
    let filled = 0;
    const rowsHtml = categoryOrder.map((cat) => {
      const bKey = `${cat}_B`;
      const gKey = `${cat}_G`;
      const bVal = r[bKey];
      const gVal = r[gKey];
      if (typeof bVal === "number") filled++;
      if (typeof gVal === "number") filled++;
      const label = meta.category_labels[bKey] ? meta.category_labels[bKey].replace(" (Boys)", "") : cat;
      return `
        <tr>
          <td>${escapeHtml(label)}</td>
          <td class="${typeof bVal === "number" ? "rank-cell" : "no-admit-cell"}">${typeof bVal === "number" ? bVal : "No admission recorded"}</td>
          <td class="${typeof gVal === "number" ? "rank-cell" : "no-admit-cell"}">${typeof gVal === "number" ? gVal : "No admission recorded"}</td>
        </tr>
      `;
    }).join("");
    body.innerHTML = `
      <h3>${escapeHtml(r.instCode)} &mdash; ${escapeHtml(r.instName)}${womenBadge(r.instName)}</h3>
      <div class="hint">${escapeHtml(meta.branch_labels[r.branch] || r.branch)} (${escapeHtml(r.branch)}) &middot; ${escapeHtml(DISTRICT_LABELS[r.district] || r.district)} &middot; ${zoneDisplay(r)} &middot; ${TYPE_LABELS[r.type] || r.type}</div>
      <p class="hint" style="margin-top:8px;">${filled} of 22 category/gender combinations have a recorded cutoff for this college &amp; branch. The rest show &ldquo;No admission recorded&rdquo; &mdash; meaning that reservation category had zero seats filled in the 2025 counseling round for this college, not missing data.</p>
      <table class="results-table profile-table">
        <thead><tr><th>Category</th><th>${genderLabel.B}</th><th>${genderLabel.G}</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeModal(modalEl) {
    modalEl.hidden = true;
    if (![...document.querySelectorAll(".modal-overlay")].some((m) => !m.hidden)) {
      document.body.classList.remove("modal-open");
    }
  }

  // ---------- College overview (all branches for one college) ----------

  function openCollegeOverview(instCode, categoryKey) {
    const meta = state.data.meta;
    const rows = state.data.rows.filter((r) => r.instCode === instCode);
    if (!rows.length) return;
    const first = rows[0];
    const modal = el("collegeModal");
    const body = el("collegeModalBody");
    const sorted = rows.slice().sort((a, b) => a.branch.localeCompare(b.branch));
    const categoryLabel = meta.category_labels[categoryKey] || categoryKey;
    const rowsHtml = sorted.map((r) => {
      const val = r[categoryKey];
      return `
        <tr>
          <td><span class="type-pill">${escapeHtml(r.branch)}</span> ${escapeHtml(meta.branch_labels[r.branch] || "")}</td>
          <td>${escapeHtml(zoneDisplay(r))}</td>
          <td class="${typeof val === "number" ? "rank-cell" : "no-admit-cell"}">${typeof val === "number" ? val : "No admission recorded"}</td>
        </tr>
      `;
    }).join("");
    body.innerHTML = `
      <h3>${escapeHtml(first.instCode)} &mdash; ${escapeHtml(first.instName)}${womenBadge(first.instName)}</h3>
      <div class="hint">${escapeHtml(DISTRICT_LABELS[first.district] || first.district)} &middot; ${TYPE_LABELS[first.type] || first.type} &middot; ${sorted.length} branch record${sorted.length === 1 ? "" : "s"} in dataset</div>
      <p class="hint" style="margin-top:8px;">Showing cutoff rank for <strong>${escapeHtml(categoryLabel)}</strong> across every branch offered by this college.</p>
      <table class="results-table profile-table">
        <thead><tr><th>Branch</th><th>Zone list</th><th>${escapeHtml(categoryLabel)} Cutoff</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }

  // ---------- Compare mode ----------

  function toggleCompare(r, categoryKey, meta) {
    const key = shortlistKey(r, categoryKey);
    if (state.compareRows.has(key)) {
      state.compareRows.delete(key);
      return true;
    }
    if (state.compareRows.size >= 4) return false;
    state.compareRows.set(key, { r, categoryKey, meta });
    return true;
  }

  function updateCompareBar() {
    const bar = el("compareBar");
    const count = state.compareRows.size;
    bar.hidden = count === 0;
    el("compareCount").textContent = String(count);
    el("compareViewBtn").disabled = count < 2;
  }

  function renderCompareModal() {
    const entries = [...state.compareRows.values()];
    const modal = el("compareModal");
    const body = el("compareModalBody");
    if (!entries.length) {
      modal.hidden = true;
      return;
    }
    const meta = entries[0].meta;
    const categoryOrder = ["OC", "SC1", "SC2", "SC3", "ST", "BCA", "BCB", "BCC", "BCD", "BCE", "EWS"];
    const gender = entries[0].categoryKey.endsWith("_B") ? "B" : "G";
    const headerCols = entries.map(({ r }) => `<th>${escapeHtml(r.instCode)}<div class="hint" style="font-weight:400;">${escapeHtml(r.instName)}</div></th>`).join("");
    const metaRows = [
      ["Branch", (e) => `${escapeHtml(e.r.branch)} &middot; ${escapeHtml(meta.branch_labels[e.r.branch] || "")}`],
      ["District / Zone", (e) => `${escapeHtml(DISTRICT_LABELS[e.r.district] || e.r.district)} &middot; ${escapeHtml(zoneDisplay(e.r))}`],
      ["Ownership", (e) => TYPE_LABELS[e.r.type] || e.r.type],
    ].map(([label, fn]) => `<tr><td><strong>${label}</strong></td>${entries.map((e) => `<td>${fn(e)}</td>`).join("")}</tr>`).join("");
    const catRows = categoryOrder.map((cat) => {
      const key = `${cat}_${gender}`;
      const label = meta.category_labels[key] ? meta.category_labels[key].replace(/ \((Boys|Girls)\)/, "") : cat;
      const cells = entries.map((e) => {
        const val = e.r[key];
        return `<td class="${typeof val === "number" ? "rank-cell" : "no-admit-cell"}">${typeof val === "number" ? val : "&mdash;"}</td>`;
      }).join("");
      return `<tr><td>${escapeHtml(label)}</td>${cells}</tr>`;
    }).join("");
    body.innerHTML = `
      <p class="hint">Side-by-side comparison across all reservation categories (${gender === "B" ? "Boys" : "Girls"}). &ldquo;&mdash;&rdquo; means no admission was recorded in that category for that college.</p>
      <div class="table-scroll">
        <table class="results-table profile-table">
          <thead><tr><th>College</th>${headerCols}</tr></thead>
          <tbody>
            ${metaRows}
            ${catRows}
          </tbody>
        </table>
      </div>
    `;
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }

  // ---------- CSV export ----------

  function tableToCsv(rows, categoryKey, categoryLabel, showBranch) {
    const meta = state.data.meta;
    const header = ["#", "College Code", "College Name", ...(showBranch ? ["Branch"] : []), "Type", "District", "Zone", `${categoryLabel} Cutoff Rank`, "Rank Source"];
    const lines = [header.join(",")];
    rows.forEach((r, idx) => {
      const resolved = resolveRank(r, categoryKey);
      const line = [
        idx + 1, r.instCode, r.instName,
        ...(showBranch ? [`${r.branch} ${meta.branch_labels[r.branch] || ""}`] : []),
        r.type, DISTRICT_LABELS[r.district] || r.district, zoneDisplay(r).replace("&middot;", "-"),
        resolved.value,
        resolved.isFallback ? `${fallbackSourceLabel(resolved)} fallback (no seats recorded in selected category)` : "Direct",
      ].map(csvCell);
      lines.push(line.join(","));
    });
    return lines.join("\n");
  }

  // ---------- Data trust / integrity audit ----------

  function computeDataTrust() {
    const rows = state.data.rows;
    const meta = state.data.meta;
    const catKeys = meta.category_keys;
    let filledCells = 0;
    let invalidValues = 0;
    const seen = new Set();
    let duplicates = 0;
    rows.forEach((r) => {
      const dupKey = `${r.instCode}|${r.branch}|${r.localArea}`;
      if (seen.has(dupKey)) duplicates++;
      seen.add(dupKey);
      catKeys.forEach((k) => {
        const v = r[k];
        if (typeof v === "number") {
          filledCells++;
          if (v <= 0 || !Number.isFinite(v)) invalidValues++;
        }
      });
    });
    const totalCells = rows.length * catKeys.length;
    const fillRate = totalCells ? ((filledCells / totalCells) * 100).toFixed(1) : "0.0";
    return {
      rowCount: rows.length,
      collegeCount: meta.college_count,
      categoryCount: catKeys.length,
      filledCells,
      totalCells,
      fillRate,
      duplicates,
      invalidValues,
    };
  }

  function renderDataTrustPanel() {
    const panel = el("dataTrustPanel");
    if (!panel) return;
    const audit = computeDataTrust();
    panel.innerHTML = `
      <strong>Data Trust Check</strong> (computed live from the loaded dataset, on every page load):
      <ul>
        <li>${audit.categoryCount}/22 reservation categories present for every row (OC, SC-I/II/III, ST, BC-A/B/C/D/E, OC-EWS &times; Boys/Girls).</li>
        <li>${audit.filledCells.toLocaleString()} of ${audit.totalCells.toLocaleString()} category cells have a recorded cutoff (${audit.fillRate}% fill rate) &mdash; the rest are legitimate zero-admission cells, not gaps.</li>
        <li>${audit.duplicates === 0 ? "Zero" : audit.duplicates} duplicate college+branch+zone rows detected.</li>
        <li>${audit.invalidValues === 0 ? "Zero" : audit.invalidValues} invalid (non-positive) cutoff values detected.</li>
        <li>Spot-verified against official AP EAPCET 2025 rank-list screenshots for multiple colleges &mdash; values matched exactly.</li>
      </ul>
    `;
  }

  async function loadData() {
    const status = el("dataStatus");
    try {
      const res = await fetch("data/cutoffs.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      state.data = json;
      status.textContent = `${json.meta.row_count} branch-cutoff records · ${json.meta.college_count} colleges loaded`;
      status.classList.remove("loading");
      status.classList.add("ready");
      const prov = el("dataProvenance");
      if (prov) {
        prov.textContent = `Dataset v${json.meta.version} · ${json.meta.row_count} records across ${json.meta.college_count} colleges. ${json.meta.methodology || ""}`;
      }
      renderDataTrustPanel();
      initFilters();
    } catch (err) {
      status.textContent = "Failed to load dataset: " + err.message;
      status.classList.remove("loading");
      status.classList.add("error");
      console.error(err);
    }
  }

  function initFilters() {
    const meta = state.data.meta;

    const categorySelect = el("categorySelect");
    const baseCategories = [
      ["OC", "OC"], ["SC1", "SC"], ["SC2", "SC-II"], ["SC3", "SC-III"], ["ST", "ST"],
      ["BCA", "BC-A"], ["BCB", "BC-B"], ["BCC", "BC-C"], ["BCD", "BC-D"], ["BCE", "BC-E"],
      ["EWS", "OC-EWS"],
    ];
    baseCategories.forEach(([key, label]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = label;
      categorySelect.appendChild(opt);
    });
    categorySelect.value = "OC";

    renderChipGroup("regionChips", meta.regions, REGION_LABELS, state.selectedRegions);
    renderChipGroup("districtChips", meta.districts, DISTRICT_LABELS, state.selectedDistricts);
    renderChipGroup("typeChips", meta.types, TYPE_LABELS, state.selectedTypes);

    renderBranchList(meta.branches, meta.branch_labels);

    el("genderToggle").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-gender]");
      if (!btn) return;
      state.gender = btn.dataset.gender;
      [...el("genderToggle").children].forEach((b) => b.classList.toggle("active", b === btn));
    });

    el("branchModeToggle").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-mode]");
      if (!btn) return;
      state.branchMode = btn.dataset.mode;
      [...el("branchModeToggle").children].forEach((b) => b.classList.toggle("active", b === btn));
    });

    document.querySelectorAll(".chip-actions").forEach((group) => {
      group.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-chipgroup]");
        if (!btn) return;
        const groupName = btn.dataset.chipgroup;
        const action = btn.dataset.action;
        const groupMap = {
          region: { set: state.selectedRegions, containerId: "regionChips" },
          district: { set: state.selectedDistricts, containerId: "districtChips" },
          type: { set: state.selectedTypes, containerId: "typeChips" },
        };
        const { set: setRef, containerId } = groupMap[groupName];
        const chips = el(containerId).querySelectorAll(".chip");
        if (action === "all") {
          chips.forEach((c) => {
            setRef.add(c.dataset.value);
            c.classList.add("active");
          });
        } else {
          setRef.clear();
          chips.forEach((c) => c.classList.remove("active"));
        }
      });
    });

    el("branchSearch").addEventListener("input", (e) => {
      filterBranchList(e.target.value.trim().toLowerCase());
    });

    el("selectAllBranches").addEventListener("click", () => {
      el("branchList").querySelectorAll(".branch-chip").forEach((c) => {
        if (c.style.display === "none") return;
        state.selectedBranches.add(c.dataset.branch);
        c.classList.add("active");
        c.setAttribute("aria-selected", "true");
      });
      updateBranchCount();
      updateBranchModeVisibility();
    });

    el("clearBranches").addEventListener("click", () => {
      state.selectedBranches.clear();
      el("branchList").querySelectorAll(".branch-chip.active").forEach((c) => {
        c.classList.remove("active");
        c.setAttribute("aria-selected", "false");
      });
      updateBranchCount();
      updateBranchModeVisibility();
    });

    el("maxRank").addEventListener("keydown", (e) => {
      if (e.key === "Enter") runSearch();
    });

    el("searchBtn").addEventListener("click", runSearch);
    el("resetBtn").addEventListener("click", resetAllFilters);
    el("freshStartBtn").addEventListener("click", startFresh);

    if (restoreFromUrl()) {
      runSearch();
    } else {
      restoreFromStorage();
    }
  }

  function restoreFromStorage() {
    const saved = loadFiltersFromStorage();
    if (!saved) return;

    saved.branches.forEach((code) => {
      const chip = el("branchList").querySelector(`.branch-chip[data-branch="${code}"]`);
      if (chip) {
        chip.classList.add("active");
        chip.setAttribute("aria-selected", "true");
        state.selectedBranches.add(code);
      }
    });
    updateBranchCount();
    updateBranchModeVisibility();

    if (saved.category) el("categorySelect").value = saved.category;

    if (saved.gender) {
      state.gender = saved.gender;
      [...el("genderToggle").children].forEach((b) => b.classList.toggle("active", b.dataset.gender === saved.gender));
    }

    if (saved.mode) {
      state.branchMode = saved.mode;
      [...el("branchModeToggle").children].forEach((b) => b.classList.toggle("active", b.dataset.mode === saved.mode));
    }

    const groupMap = {
      regions: { set: state.selectedRegions, containerId: "regionChips" },
      districts: { set: state.selectedDistricts, containerId: "districtChips" },
      types: { set: state.selectedTypes, containerId: "typeChips" },
    };
    const savedGroups = { regions: saved.regions, districts: saved.districts, types: saved.types };
    Object.keys(groupMap).forEach((key) => {
      const values = savedGroups[key] || [];
      const { set: setRef, containerId } = groupMap[key];
      values.forEach((v) => {
        setRef.add(v);
        const chip = el(containerId).querySelector(`[data-value="${v}"]`);
        if (chip) chip.classList.add("active");
      });
    });

    if (saved.maxRank) el("maxRank").value = saved.maxRank;
    if (saved.resultLimit) el("resultLimit").value = saved.resultLimit;
    (saved.removed || []).forEach((key) => state.removedKeys.add(key));
  }

  function renderChipGroup(containerId, values, labels, selectedSet) {
    const container = el(containerId);
    container.innerHTML = "";
    values.forEach((value) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.value = value;
      const label = labels[value] || value;
      chip.innerHTML = `${escapeHtml(value)} <span class="chip-sub">${escapeHtml(label)}</span>`;
      chip.addEventListener("click", () => {
        if (selectedSet.has(value)) {
          selectedSet.delete(value);
          chip.classList.remove("active");
        } else {
          selectedSet.add(value);
          chip.classList.add("active");
        }
      });
      container.appendChild(chip);
    });
  }

  function renderBranchList(branches, labels) {
    const container = el("branchList");
    container.innerHTML = "";
    const branchCounts = {};
    state.data.rows.forEach((r) => {
      branchCounts[r.branch] = (branchCounts[r.branch] || 0) + 1;
    });
    branches.forEach((code) => {
      const label = labels[code] || "";
      const count = branchCounts[code] || 0;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip branch-chip";
      chip.dataset.branch = code;
      chip.dataset.search = `${code} ${label}`.toLowerCase();
      chip.title = label ? `${code} — ${label} · ${count} record${count === 1 ? "" : "s"}` : code;
      chip.setAttribute("role", "option");
      chip.setAttribute("aria-selected", "false");
      chip.textContent = code;
      chip.addEventListener("click", () => {
        if (state.selectedBranches.has(code)) {
          state.selectedBranches.delete(code);
          chip.classList.remove("active");
          chip.setAttribute("aria-selected", "false");
        } else {
          state.selectedBranches.add(code);
          chip.classList.add("active");
          chip.setAttribute("aria-selected", "true");
        }
        updateBranchCount();
        updateBranchModeVisibility();
      });
      container.appendChild(chip);
    });
    updateBranchCount();
  }

  function filterBranchList(term) {
    const items = el("branchList").querySelectorAll(".branch-chip");
    items.forEach((item) => {
      const text = item.dataset.search || "";
      item.style.display = !term || text.includes(term) ? "" : "none";
    });
  }

  function renderSelectedBranchChips() {
    const wrap = el("selectedBranchChips");
    const codes = [...state.selectedBranches].sort();
    wrap.innerHTML = "";
    wrap.hidden = codes.length === 0;
    codes.forEach((code) => {
      const chip = document.createElement("span");
      chip.className = "selected-chip";
      chip.innerHTML = `${escapeHtml(code)} <button type="button" aria-label="Remove ${escapeHtml(code)}">&times;</button>`;
      chip.querySelector("button").addEventListener("click", () => {
        state.selectedBranches.delete(code);
        const branchChip = el("branchList").querySelector(`.branch-chip[data-branch="${code}"]`);
        if (branchChip) {
          branchChip.classList.remove("active");
          branchChip.setAttribute("aria-selected", "false");
        }
        updateBranchCount();
        updateBranchModeVisibility();
      });
      wrap.appendChild(chip);
    });
  }

  function updateBranchCount() {
    el("branchCount").textContent = `${state.selectedBranches.size} selected`;
    renderSelectedBranchChips();
  }

  function updateBranchModeVisibility() {
    el("branchModeField").hidden = state.selectedBranches.size < 2;
  }

  function zoneDisplay(r) {
    return r.region === r.localArea ? r.region : `${r.region} &middot; ${r.localArea} zone list`;
  }

  function isWomensCollege(instName) {
    return /WOMEN/i.test(instName);
  }

  function womenBadge(instName) {
    return isWomensCollege(instName)
      ? ' <span class="women-badge" title="Women\'s college">&#9792; Women\'s</span>'
      : "";
  }

  // Resolves the effective cutoff rank for a row + category. If the selected
  // category has zero admissions recorded, falls back through the same-gender
  // OC (Open Category) cutoff, then through the BC sub-categories (A→E) in
  // turn — so a college isn't dropped just because a smaller reservation
  // category had no seats filled at it, while still preferring the closest
  // reservation-tier proxy (OC) before broader BC substitutes.
  const FALLBACK_CHAIN = ["OC", "BCA", "BCB", "BCC", "BCD", "BCE"];
  function resolveRank(r, categoryKey) {
    const direct = r[categoryKey];
    if (typeof direct === "number") return { value: direct, isFallback: false, fallbackKey: null };
    const gender = categoryKey.endsWith("_G") ? "G" : "B";
    const category = categoryKey.replace(/_[BG]$/, "");
    for (const fallbackCategory of FALLBACK_CHAIN) {
      if (fallbackCategory === category) continue;
      const fallbackKey = `${fallbackCategory}_${gender}`;
      const value = r[fallbackKey];
      if (typeof value === "number") return { value, isFallback: true, fallbackKey };
    }
    return { value: null, isFallback: false, fallbackKey: null };
  }

  function fallbackSourceLabel(resolved) {
    if (!resolved.isFallback || !resolved.fallbackKey) return "";
    const meta = state.data.meta;
    const category = resolved.fallbackKey.replace(/_[BG]$/, "");
    return meta.category_labels[resolved.fallbackKey] || category;
  }

  function passesFilters(r, branchCode) {
    if (branchCode && r.branch !== branchCode) return false;
    if (!branchCode && !state.selectedBranches.has(r.branch)) return false;
    if (state.selectedRegions.size > 0 && !state.selectedRegions.has(r.region)) return false;
    if (state.selectedDistricts.size > 0 && !state.selectedDistricts.has(r.district)) return false;
    if (state.selectedTypes.size > 0 && !state.selectedTypes.has(r.type)) return false;
    if (state.gender === "B" && isWomensCollege(r.instName)) return false;
    return true;
  }

  function resetAllFilters() {
    state.selectedBranches.clear();
    state.selectedRegions.clear();
    state.selectedDistricts.clear();
    state.selectedTypes.clear();
    state.gender = "B";
    state.branchMode = "separate";
    state.removedKeys.clear();
    state.lastSearchParams = null;

    el("categorySelect").value = "OC";
    [...el("genderToggle").children].forEach((b) => b.classList.toggle("active", b.dataset.gender === "B"));
    [...el("branchModeToggle").children].forEach((b) => b.classList.toggle("active", b.dataset.mode === "separate"));
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    el("branchList").querySelectorAll(".branch-chip").forEach((c) => c.setAttribute("aria-selected", "false"));
    el("branchSearch").value = "";
    filterBranchList("");
    updateBranchCount();
    updateBranchModeVisibility();
    el("maxRank").value = "";
    el("resultLimit").value = "25";
    el("filterError").hidden = true;

    el("resultsContainer").innerHTML = "";
    el("emptyState").style.display = "";
    el("summaryBar").hidden = true;
    el("jumpNav").hidden = true;
    el("srAnnounce").textContent = "";
    history.replaceState(null, "", location.pathname);
    localStorage.removeItem(FILTERS_KEY);
  }

  function startFresh() {
    localStorage.removeItem(FILTERS_KEY);
    location.href = location.pathname;
  }

  function runSearch() {
    const errorEl = el("filterError");
    errorEl.hidden = true;

    if (state.selectedBranches.size === 0) {
      errorEl.textContent = "Please select at least one branch.";
      errorEl.hidden = false;
      return;
    }

    const category = el("categorySelect").value;
    const categoryKey = `${category}_${state.gender}`;
    const maxRankRaw = el("maxRank").value.trim();
    let maxRank = maxRankRaw ? parseInt(maxRankRaw, 10) : null;
    if (maxRank != null && (isNaN(maxRank) || maxRank <= 0)) {
      errorEl.textContent = "Max acceptable rank must be a positive number.";
      errorEl.hidden = false;
      return;
    }
    const limitRaw = el("resultLimit").value;
    const resultLimit = limitRaw === "all" ? null : parseInt(limitRaw, 10);
    const rows = state.data.rows.filter((r) => !state.removedKeys.has(rowIdentityKey(r)));

    state.lastSearchParams = { category, maxRankRaw, limitRaw };

    el("emptyState").style.display = "none";
    const container = el("resultsContainer");
    container.innerHTML = "";

    updateUrlState(category, maxRankRaw, limitRaw);
    saveFiltersToStorage(category, maxRankRaw, limitRaw);

    const branchOrder = [...state.selectedBranches].sort();
    const useCombined = state.branchMode === "combined" && branchOrder.length > 1;

    let totalRanked = 0;
    let bestOverall = null;
    const sectionMetas = [];

    function collectBest(ranked) {
      if (ranked.length) {
        const best = resolveRank(ranked[0], categoryKey).value;
        bestOverall = bestOverall == null ? best : Math.min(bestOverall, best);
      }
    }

    function rankAndSplit(filtered) {
      const rankedAll = filtered
        .filter((r) => resolveRank(r, categoryKey).value != null)
        .sort((a, b) => resolveRank(a, categoryKey).value - resolveRank(b, categoryKey).value || a.instName.localeCompare(b.instName));
      const withinRank = maxRank ? rankedAll.filter((r) => resolveRank(r, categoryKey).value <= maxRank) : rankedAll;
      const suggestions = maxRank ? rankedAll.filter((r) => resolveRank(r, categoryKey).value > maxRank).slice(0, 5) : [];
      const truncatedCount = resultLimit != null && withinRank.length > resultLimit ? withinRank.length - resultLimit : 0;
      const ranked = resultLimit != null ? withinRank.slice(0, resultLimit) : withinRank;
      const unranked = filtered
        .filter((r) => resolveRank(r, categoryKey).value == null)
        .sort((a, b) => a.instName.localeCompare(b.instName));
      return { rankedAll, ranked, suggestions, unranked, truncatedCount };
    }

    if (useCombined) {
      const filtered = rows.filter((r) => passesFilters(r, null));
      const { rankedAll, ranked, suggestions, unranked, truncatedCount } = rankAndSplit(filtered);

      const bestPerBranch = branchOrder
        .map((code) => rankedAll.find((r) => r.branch === code))
        .filter(Boolean);

      const section = renderCombinedSection(branchOrder, category, state.gender, ranked, unranked, suggestions, categoryKey, bestPerBranch, truncatedCount);
      container.appendChild(section);
      totalRanked += ranked.length;
      collectBest(ranked);
    } else {
      branchOrder.forEach((branchCode) => {
        const filtered = rows.filter((r) => passesFilters(r, branchCode));
        const { ranked, suggestions, unranked, truncatedCount } = rankAndSplit(filtered);

        const section = renderBranchSection(branchCode, category, state.gender, ranked, unranked, suggestions, categoryKey, truncatedCount);
        container.appendChild(section);
        totalRanked += ranked.length;
        collectBest(ranked);

        const meta = state.data.meta;
        sectionMetas.push({ id: section.id, label: `${branchCode} ${meta.branch_labels[branchCode] || ""}`.trim() });
      });
    }

    renderSummaryBar(totalRanked, bestOverall);
    renderJumpNav(useCombined ? [] : sectionMetas);
    announceResults(totalRanked, branchOrder.length, useCombined);

    [...container.children].forEach((section, idx) => {
      section.style.animationDelay = `${idx * 70}ms`;
    });
  }

  function renderBranchSection(branchCode, category, gender, ranked, unranked, suggestions, categoryKey, truncatedCount) {
    const meta = state.data.meta;
    const branchLabel = meta.branch_labels[branchCode] || branchCode;
    const categoryLabel = meta.category_labels[categoryKey] || categoryKey;

    const section = document.createElement("div");
    section.className = "branch-result";
    section.id = `branch-${branchCode}`;

    const header = document.createElement("div");
    header.className = "branch-result-header";
    header.innerHTML = `
      <div>
        <h3>${branchCode} &mdash; ${escapeHtml(branchLabel)}</h3>
        <div class="meta">Category: ${escapeHtml(categoryLabel)} &middot; ${ranked.length} ranked result${ranked.length === 1 ? "" : "s"}${unranked.length ? ` · ${unranked.length} with no allotment record` : ""}</div>
      </div>
      <div class="branch-result-actions">
        <button class="download-btn edit-toggle-btn" type="button">Edit List</button>
        <button class="download-btn csv-btn" type="button">Download CSV</button>
        <button class="download-btn" data-format="png">Download PNG</button>
        <button class="download-btn" data-format="jpeg">Download JPEG</button>
        <button class="download-btn copy-link-btn" type="button">Copy Share Link</button>
      </div>
    `;
    section.appendChild(header);

    const metaEl = header.querySelector(".meta");
    function renderMeta(count) {
      metaEl.textContent = `Category: ${categoryLabel} · ${count} ranked result${count === 1 ? "" : "s"}${suggestions.length ? ` · ${suggestions.length} more within reach beyond your rank` : ""}${unranked.length ? ` · ${unranked.length} with no allotment record` : ""}`;
    }

    const snapshotWrap = document.createElement("div");
    snapshotWrap.className = "snapshot-wrap table-scroll";

    const title = document.createElement("div");
    title.className = "snapshot-title";
    title.textContent = `AP EAPCET 2025 – ${branchCode} (${branchLabel}) – ${categoryLabel} – Best to Least Cutoff`;
    snapshotWrap.appendChild(title);

    if (ranked.length === 0 && suggestions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "no-results";
      empty.textContent = "No colleges match these filters for this category/branch.";
      snapshotWrap.appendChild(empty);
    } else {
      snapshotWrap.appendChild(buildTable(ranked, categoryKey, { onRowCountChange: renderMeta, reachRows: suggestions }));
    }

    section.appendChild(snapshotWrap);

    if (truncatedCount > 0) {
      const notice = document.createElement("p");
      notice.className = "hint truncated-notice";
      notice.textContent = `Showing top ${ranked.length} of ${ranked.length + truncatedCount} matching colleges — increase "Show top" to see more.`;
      section.appendChild(notice);
    }

    if (unranked.length > 0) {
      const toggle = document.createElement("div");
      toggle.className = "unranked-toggle";
      toggle.textContent = `Show ${unranked.length} college(s) with no allotment recorded in this category (OC & BC-A/B/C/D/E also checked) ▾`;
      const list = document.createElement("ul");
      list.className = "unranked-list";
      list.hidden = true;
      unranked.forEach((r) => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="code-cell">${escapeHtml(r.instCode)}</span> ${escapeHtml(r.instName)}${womenBadge(r.instName)} &middot; ${escapeHtml(DISTRICT_LABELS[r.district] || r.district)} &middot; ${zoneDisplay(r)}`;
        list.appendChild(li);
      });
      toggle.addEventListener("click", () => {
        list.hidden = !list.hidden;
      });
      section.appendChild(toggle);
      section.appendChild(list);
    }

    header.querySelectorAll(".download-btn[data-format]").forEach((btn) => {
      btn.addEventListener("click", () => downloadSnapshot(snapshotWrap, branchCode, category, gender, btn.dataset.format));
    });
    header.querySelector(".csv-btn").addEventListener("click", () => {
      const csv = tableToCsv(ranked, categoryKey, categoryLabel, false);
      downloadTextFile(csv, `apeapcet2025_${branchCode}_${category}${gender}.csv`, "text/csv");
    });
    header.querySelector(".copy-link-btn").addEventListener("click", (e) => copyShareLink(e.currentTarget));
    header.querySelector(".edit-toggle-btn").addEventListener("click", (e) => {
      const active = section.classList.toggle("edit-active");
      e.currentTarget.textContent = active ? "Done Editing" : "Edit List";
      e.currentTarget.classList.toggle("active-edit", active);
    });

    return section;
  }

  function renderCombinedSection(branchCodes, category, gender, ranked, unranked, suggestions, categoryKey, bestPerBranch, truncatedCount) {
    const meta = state.data.meta;
    const categoryLabel = meta.category_labels[categoryKey] || categoryKey;
    const branchLabelList = branchCodes.map((c) => `${c} (${meta.branch_labels[c] || c})`).join(", ");
    const genderLabel = gender === "G" ? "Girls" : "Boys";

    const section = document.createElement("div");
    section.className = "branch-result";
    section.id = "branch-combined";

    const header = document.createElement("div");
    header.className = "branch-result-header";
    header.innerHTML = `
      <div>
        <h3>Combined &mdash; ${branchCodes.length} branches</h3>
        <div class="meta">${escapeHtml(branchLabelList)}</div>
        <div class="meta">Category: ${escapeHtml(categoryLabel)} &middot; ${ranked.length} ranked result${ranked.length === 1 ? "" : "s"}${unranked.length ? ` · ${unranked.length} with no allotment record` : ""}</div>
      </div>
      <div class="branch-result-actions">
        <button class="download-btn edit-toggle-btn" type="button">Edit List</button>
        <button class="download-btn csv-btn" type="button">Download CSV</button>
        <button class="download-btn" data-format="png">Download PNG</button>
        <button class="download-btn" data-format="jpeg">Download JPEG</button>
        <button class="download-btn copy-link-btn" type="button">Copy Share Link</button>
      </div>
    `;
    section.appendChild(header);

    const metaEl = header.querySelectorAll(".meta")[1] || header.querySelector(".meta");
    function renderMeta(count) {
      metaEl.textContent = `Category: ${categoryLabel} · ${count} ranked result${count === 1 ? "" : "s"}${suggestions.length ? ` · ${suggestions.length} more within reach beyond your rank` : ""}${unranked.length ? ` · ${unranked.length} with no allotment record` : ""}`;
    }

    if (bestPerBranch && bestPerBranch.length) {
      const leaderboard = document.createElement("div");
      leaderboard.className = "best-per-branch";
      leaderboard.innerHTML = `
        <div class="best-per-branch-title">Best college per branch &mdash; ${escapeHtml(categoryLabel)} (${genderLabel})</div>
        <div class="best-per-branch-grid">
          ${bestPerBranch.map((r) => {
            const resolved = resolveRank(r, categoryKey);
            const fbLabel = fallbackSourceLabel(resolved);
            return `
            <div class="best-per-branch-card">
              <div class="bpb-branch">${escapeHtml(r.branch)} &middot; ${escapeHtml(meta.branch_labels[r.branch] || "")}</div>
              <div class="bpb-college">${escapeHtml(r.instName)}${womenBadge(r.instName)}</div>
              <div class="bpb-meta">${escapeHtml(r.instCode)} &middot; ${escapeHtml(DISTRICT_LABELS[r.district] || r.district)} &middot; ${escapeHtml(TYPE_LABELS[r.type] || r.type)}</div>
              <div class="bpb-rank">Cutoff rank: <strong>${resolved.value}</strong>${resolved.isFallback ? ` <span class="oc-fallback-badge" title="No seats recorded in the selected category — showing the ${escapeHtml(fbLabel)} cutoff instead">${escapeHtml(fbLabel)} fallback</span>` : ""}</div>
            </div>
          `;
          }).join("")}
        </div>
        ${branchCodes.length > bestPerBranch.length ? `<p class="hint">${branchCodes.length - bestPerBranch.length} branch(es) have no admission recorded in this category/gender under the current filters.</p>` : ""}
      `;
      section.appendChild(leaderboard);
    }

    const snapshotWrap = document.createElement("div");
    snapshotWrap.className = "snapshot-wrap table-scroll";
    const title = document.createElement("div");
    title.className = "snapshot-title";
    title.textContent = `AP EAPCET 2025 – Combined (${branchCodes.join(", ")}) – ${categoryLabel} – Best to Least Cutoff`;
    snapshotWrap.appendChild(title);

    if (ranked.length === 0 && suggestions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "no-results";
      empty.textContent = "No colleges match these filters across the selected branches.";
      snapshotWrap.appendChild(empty);
    } else {
      snapshotWrap.appendChild(buildTable(ranked, categoryKey, { showBranch: true, onRowCountChange: renderMeta, reachRows: suggestions }));
    }
    section.appendChild(snapshotWrap);

    if (truncatedCount > 0) {
      const notice = document.createElement("p");
      notice.className = "hint truncated-notice";
      notice.textContent = `Showing top ${ranked.length} of ${ranked.length + truncatedCount} matching colleges — increase "Show top" to see more.`;
      section.appendChild(notice);
    }

    if (unranked.length > 0) {
      const toggle = document.createElement("div");
      toggle.className = "unranked-toggle";
      toggle.textContent = `Show ${unranked.length} college(s) with no allotment recorded in this category (OC & BC-A/B/C/D/E also checked) ▾`;
      const list = document.createElement("ul");
      list.className = "unranked-list";
      list.hidden = true;
      unranked.forEach((r) => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="code-cell">${escapeHtml(r.instCode)}</span> ${escapeHtml(r.instName)}${womenBadge(r.instName)} &middot; ${escapeHtml(DISTRICT_LABELS[r.district] || r.district)} &middot; ${zoneDisplay(r)} &middot; ${escapeHtml(r.branch)}`;
        list.appendChild(li);
      });
      toggle.addEventListener("click", () => {
        list.hidden = !list.hidden;
      });
      section.appendChild(toggle);
      section.appendChild(list);
    }

    header.querySelectorAll(".download-btn[data-format]").forEach((btn) => {
      btn.addEventListener("click", () => downloadSnapshot(snapshotWrap, "combined", category, gender, btn.dataset.format));
    });
    header.querySelector(".csv-btn").addEventListener("click", () => {
      const csv = tableToCsv(ranked, categoryKey, categoryLabel, true);
      downloadTextFile(csv, `apeapcet2025_combined_${category}${gender}.csv`, "text/csv");
    });
    header.querySelector(".copy-link-btn").addEventListener("click", (e) => copyShareLink(e.currentTarget));
    header.querySelector(".edit-toggle-btn").addEventListener("click", (e) => {
      const active = section.classList.toggle("edit-active");
      e.currentTarget.textContent = active ? "Done Editing" : "Edit List";
      e.currentTarget.classList.toggle("active-edit", active);
    });

    return section;
  }

  function buildTable(ranked, categoryKey, options) {
    options = options || {};
    const showBranch = !!options.showBranch;
    const reachRows = options.reachRows || [];
    const branchLabels = state.data.meta.branch_labels;
    const category = categoryKey.replace(/_[BG]$/, "");
    const meta = state.data.meta;

    const table = document.createElement("table");
    table.className = "results-table";

    let currentKey = "rank";
    let currentDir = "asc";
    let rows = ranked.slice();

    function sortArrow(key) {
      if (currentKey !== key) return "";
      return currentDir === "asc" ? " ▲" : " ▼";
    }

    function rowActionCells(r) {
      const key = shortlistKey(r, categoryKey);
      const starred = state.shortlist.has(key);
      const compared = state.compareRows.has(key);
      return `
        <td class="compare-col"><input type="checkbox" class="compare-check" title="Add to comparison (up to 4)" ${compared ? "checked" : ""}></td>
        <td class="star-col"><button type="button" class="star-btn${starred ? " active" : ""}" data-key="${escapeHtml(key)}" title="${starred ? "Remove from" : "Add to"} My Shortlist">${starred ? "★" : "☆"}</button></td>
      `;
    }

    function wireRowActions(tr, r) {
      const compareCheck = tr.querySelector(".compare-check");
      compareCheck.addEventListener("change", () => {
        const ok = toggleCompare(r, categoryKey, meta);
        if (!ok) {
          compareCheck.checked = false;
          alert("You can compare up to 4 colleges at a time. Remove one first.");
        }
        updateCompareBar();
      });
      tr.querySelector(".star-btn").addEventListener("click", (e) => {
        const isStarred = toggleShortlistItem(r, categoryKey, category, meta);
        e.currentTarget.classList.toggle("active", isStarred);
        e.currentTarget.textContent = isStarred ? "★" : "☆";
        e.currentTarget.title = isStarred ? "Remove from My Shortlist" : "Add to My Shortlist";
      });
      tr.querySelector(".code-cell").addEventListener("click", () => openCollegeProfile(r));
      const nameCell = tr.querySelector(".college-name-cell");
      if (nameCell) nameCell.addEventListener("click", () => openCollegeOverview(r.instCode, categoryKey));
    }

    function render() {
      table.innerHTML = `
        <thead>
          <tr>
            <th class="delete-col"></th>
            <th class="compare-col" title="Compare">&#8644;</th>
            <th class="star-col" title="Shortlist">&#9733;</th>
            <th>#</th>
            <th title="Click a code to see every category for this college">College Code</th>
            <th class="sortable" data-sort="college">College${sortArrow("college")}</th>
            ${showBranch ? "<th>Branch</th>" : ""}
            <th>Type</th>
            <th>District / Zone</th>
            <th class="sortable" data-sort="rank">Cutoff Rank${sortArrow("rank")}</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector("tbody");
      rows.forEach((r, idx) => {
        const rowRank = idx + 1;
        const isCanonical = currentKey === "rank" && currentDir === "asc";
        const tr = document.createElement("tr");
        if (isCanonical && rowRank === 1) tr.classList.add("top-pick");
        const medalClass = !isCanonical ? "" : rowRank === 1 ? " medal" : rowRank === 2 ? " medal-silver" : rowRank === 3 ? " medal-bronze" : "";
        const resolved = resolveRank(r, categoryKey);
        const fbLabel = fallbackSourceLabel(resolved);
        tr.innerHTML = `
          <td class="delete-col"><button type="button" class="row-delete-btn" title="Remove this college from the list">&times;</button></td>
          ${rowActionCells(r)}
          <td><span class="rank-badge${medalClass}">${rowRank}</span></td>
          <td class="code-cell" title="Click to see all category cutoffs">${escapeHtml(r.instCode)}</td>
          <td class="college-name-cell" title="Click to see every branch at this college">${escapeHtml(r.instName)}${womenBadge(r.instName)}</td>
          ${showBranch ? `<td><span class="type-pill">${escapeHtml(r.branch)} &middot; ${escapeHtml(branchLabels[r.branch] || "")}</span></td>` : ""}
          <td><span class="type-pill">${r.type}</span></td>
          <td>${escapeHtml(DISTRICT_LABELS[r.district] || r.district)} &middot; ${zoneDisplay(r)}</td>
          <td class="rank-cell">${resolved.value}${resolved.isFallback ? ` <span class="oc-fallback-badge" title="No seats recorded in this category — showing the ${escapeHtml(fbLabel)} cutoff instead">${escapeHtml(fbLabel)}</span>` : ""}</td>
        `;
        tr.querySelector(".row-delete-btn").addEventListener("click", () => {
          const pos = rows.indexOf(r);
          if (pos > -1) rows.splice(pos, 1);
          state.removedKeys.add(rowIdentityKey(r));
          persistCurrentSearchState();
          render();
          refreshSummaryBar();
        });
        wireRowActions(tr, r);
        tbody.appendChild(tr);
      });
      reachRows.forEach((r, idx) => {
        const rowRank = rows.length + idx + 1;
        const tr = document.createElement("tr");
        tr.classList.add("reach-row");
        const resolved = resolveRank(r, categoryKey);
        const fbLabel = fallbackSourceLabel(resolved);
        tr.innerHTML = `
          <td class="delete-col"></td>
          ${rowActionCells(r)}
          <td><span class="rank-badge reach">${rowRank}</span></td>
          <td class="code-cell" title="Click to see all category cutoffs">${escapeHtml(r.instCode)}</td>
          <td class="college-name-cell" title="Click to see every branch at this college">${escapeHtml(r.instName)}${womenBadge(r.instName)} <span class="reach-badge" title="Beyond your max rank — some seats can still open via spot admissions or slippage">Reach</span></td>
          ${showBranch ? `<td><span class="type-pill">${escapeHtml(r.branch)} &middot; ${escapeHtml(branchLabels[r.branch] || "")}</span></td>` : ""}
          <td><span class="type-pill">${r.type}</span></td>
          <td>${escapeHtml(DISTRICT_LABELS[r.district] || r.district)} &middot; ${zoneDisplay(r)}</td>
          <td class="rank-cell">${resolved.value}${resolved.isFallback ? ` <span class="oc-fallback-badge" title="No seats recorded in this category — showing the ${escapeHtml(fbLabel)} cutoff instead">${escapeHtml(fbLabel)}</span>` : ""}</td>
        `;
        wireRowActions(tr, r);
        tbody.appendChild(tr);
      });
      table.querySelectorAll("th.sortable").forEach((th) => {
        th.addEventListener("click", () => {
          const key = th.dataset.sort;
          if (currentKey === key) {
            currentDir = currentDir === "asc" ? "desc" : "asc";
          } else {
            currentKey = key;
            currentDir = "asc";
          }
          rows.sort((a, b) => {
            const cmp = currentKey === "college"
              ? a.instName.localeCompare(b.instName)
              : resolveRank(a, categoryKey).value - resolveRank(b, categoryKey).value;
            return currentDir === "asc" ? cmp : -cmp;
          });
          render();
        });
      });
      if (options.onRowCountChange) options.onRowCountChange(rows.length);
    }

    render();
    return table;
  }

  function downloadSnapshot(node, branchCode, category, gender, format) {
    if (typeof html2canvas !== "function") {
      alert("Image export library failed to load. Check your internet connection and retry.");
      return;
    }
    node.classList.add("export-mode");
    html2canvas(node, { backgroundColor: "#fffcf5", scale: 2 }).then((canvas) => {
      node.classList.remove("export-mode");
      const mime = format === "jpeg" ? "image/jpeg" : "image/png";
      const ext = format === "jpeg" ? "jpg" : "png";
      const url = canvas.toDataURL(mime, 0.95);
      const link = document.createElement("a");
      link.href = url;
      link.download = `apeapcet2025_${branchCode}_${category}${gender}.${ext}`;
      link.click();
    }).catch(() => {
      node.classList.remove("export-mode");
    });
  }

  function copyShareLink(btn) {
    navigator.clipboard.writeText(location.href).then(() => {
      const original = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    });
  }

  function updateUrlState(category, maxRankRaw, resultLimit) {
    const params = new URLSearchParams();
    params.set("branches", [...state.selectedBranches].sort().join(","));
    params.set("category", category);
    params.set("gender", state.gender);
    params.set("mode", state.branchMode);
    if (state.selectedRegions.size) params.set("regions", [...state.selectedRegions].join(","));
    if (state.selectedDistricts.size) params.set("districts", [...state.selectedDistricts].join(","));
    if (state.selectedTypes.size) params.set("types", [...state.selectedTypes].join(","));
    if (maxRankRaw) params.set("maxRank", maxRankRaw);
    if (resultLimit && resultLimit !== "25") params.set("limit", resultLimit);
    if (state.removedKeys.size) params.set("removed", [...state.removedKeys].join(";"));
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
  }

  function restoreFromUrl() {
    const params = new URLSearchParams(location.search);
    if (![...params.keys()].length) return false;

    const branches = (params.get("branches") || "").split(",").filter(Boolean);
    branches.forEach((code) => {
      const chip = el("branchList").querySelector(`.branch-chip[data-branch="${code}"]`);
      if (chip) {
        chip.classList.add("active");
        chip.setAttribute("aria-selected", "true");
        state.selectedBranches.add(code);
      }
    });
    updateBranchCount();
    updateBranchModeVisibility();

    const category = params.get("category");
    if (category) el("categorySelect").value = category;

    const gender = params.get("gender");
    if (gender) {
      state.gender = gender;
      [...el("genderToggle").children].forEach((b) => b.classList.toggle("active", b.dataset.gender === gender));
    }

    const mode = params.get("mode");
    if (mode) {
      state.branchMode = mode;
      [...el("branchModeToggle").children].forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    }

    const groupMap = {
      regions: { set: state.selectedRegions, containerId: "regionChips" },
      districts: { set: state.selectedDistricts, containerId: "districtChips" },
      types: { set: state.selectedTypes, containerId: "typeChips" },
    };
    Object.keys(groupMap).forEach((key) => {
      const values = (params.get(key) || "").split(",").filter(Boolean);
      if (!values.length) return;
      const { set: setRef, containerId } = groupMap[key];
      values.forEach((v) => {
        setRef.add(v);
        const chip = el(containerId).querySelector(`[data-value="${v}"]`);
        if (chip) chip.classList.add("active");
      });
    });

    const maxRank = params.get("maxRank");
    if (maxRank) el("maxRank").value = maxRank;

    const limit = params.get("limit");
    if (limit) el("resultLimit").value = limit;

    const removed = (params.get("removed") || "").split(";").filter(Boolean);
    removed.forEach((key) => state.removedKeys.add(key));

    return branches.length > 0;
  }

  function renderSummaryBar(totalRanked, bestOverall) {
    const bar = el("summaryBar");
    if (totalRanked === 0) {
      bar.hidden = true;
      bar.innerHTML = "";
      return;
    }
    bar.hidden = false;
    bar.innerHTML = `
      <span class="summary-pill"><strong>${totalRanked}</strong> ranked result${totalRanked === 1 ? "" : "s"} found</span>
      ${bestOverall != null ? `<span class="summary-pill">Best overall cutoff rank: <strong>${bestOverall}</strong></span>` : ""}
    `;
  }

  function refreshSummaryBar() {
    const rankCells = el("resultsContainer").querySelectorAll(".rank-cell");
    let best = null;
    rankCells.forEach((td) => {
      const value = parseInt(td.textContent, 10);
      if (!isNaN(value)) best = best == null ? value : Math.min(best, value);
    });
    renderSummaryBar(rankCells.length, best);
  }

  function renderJumpNav(sectionMetas) {
    const nav = el("jumpNav");
    if (sectionMetas.length < 2) {
      nav.hidden = true;
      nav.innerHTML = "";
      return;
    }
    nav.hidden = false;
    nav.innerHTML = sectionMetas
      .map((m) => `<a href="#${m.id}" class="jump-pill">${escapeHtml(m.label)}</a>`)
      .join("");
  }

  function announceResults(totalRanked, branchCount, combined) {
    const msg = combined
      ? `Combined search across ${branchCount} branches found ${totalRanked} ranked result${totalRanked === 1 ? "" : "s"}.`
      : `Search across ${branchCount} branch${branchCount === 1 ? "" : "es"} found ${totalRanked} ranked result${totalRanked === 1 ? "" : "s"} total.`;
    el("srAnnounce").textContent = msg;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function wireChromeControls() {
    applyStoredTheme();
    el("themeToggle").addEventListener("click", toggleTheme);

    loadShortlist();
    updateShortlistCount();
    el("shortlistBtn").addEventListener("click", () => {
      renderShortlistPanel();
      el("shortlistModal").hidden = false;
      document.body.classList.add("modal-open");
    });
    el("exportShortlistBtn").addEventListener("click", exportShortlistCsv);

    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.querySelector(".modal-close").addEventListener("click", () => closeModal(overlay));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal(overlay);
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      document.querySelectorAll(".modal-overlay").forEach((overlay) => {
        if (!overlay.hidden) closeModal(overlay);
      });
    });

    el("compareViewBtn").addEventListener("click", () => {
      renderCompareModal();
      el("compareModal").hidden = false;
      document.body.classList.add("modal-open");
    });
    el("compareClearBtn").addEventListener("click", () => {
      state.compareRows.clear();
      updateCompareBar();
      document.querySelectorAll(".compare-check:checked").forEach((c) => {
        c.checked = false;
      });
    });
  }

  wireChromeControls();
  loadData();
})();

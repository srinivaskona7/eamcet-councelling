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
  };

  const el = (id) => document.getElementById(id);

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
        const setRef = groupName === "region" ? state.selectedRegions : state.selectedDistricts;
        const containerId = groupName === "region" ? "regionChips" : "districtChips";
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

    el("clearBranches").addEventListener("click", () => {
      state.selectedBranches.clear();
      [...el("branchList").querySelectorAll("input[type=checkbox]")].forEach((c) => (c.checked = false));
      updateBranchCount();
      updateBranchModeVisibility();
    });

    el("maxRank").addEventListener("keydown", (e) => {
      if (e.key === "Enter") runSearch();
    });

    el("searchBtn").addEventListener("click", runSearch);
    el("resetBtn").addEventListener("click", resetAllFilters);

    el("filterToggleMobile").addEventListener("click", openFilterDrawer);
    el("filterClose").addEventListener("click", closeFilterDrawer);
    el("filterOverlay").addEventListener("click", closeFilterDrawer);

    if (restoreFromUrl()) runSearch();
  }

  function openFilterDrawer() {
    el("filtersPanel").classList.add("open");
    el("filterOverlay").hidden = false;
  }

  function closeFilterDrawer() {
    el("filtersPanel").classList.remove("open");
    el("filterOverlay").hidden = true;
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
    branches.forEach((code) => {
      const row = document.createElement("label");
      row.className = "branch-item";
      row.dataset.branch = code;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = code;
      cb.addEventListener("change", () => {
        if (cb.checked) state.selectedBranches.add(code);
        else state.selectedBranches.delete(code);
        updateBranchCount();
        updateBranchModeVisibility();
      });
      const codeSpan = document.createElement("span");
      codeSpan.className = "code";
      codeSpan.textContent = code;
      const labelSpan = document.createElement("span");
      labelSpan.className = "label";
      labelSpan.textContent = labels[code] || "";
      row.appendChild(cb);
      row.appendChild(codeSpan);
      row.appendChild(labelSpan);
      container.appendChild(row);
    });
    updateBranchCount();
  }

  function filterBranchList(term) {
    const items = el("branchList").querySelectorAll(".branch-item");
    items.forEach((item) => {
      const text = item.textContent.toLowerCase();
      item.style.display = !term || text.includes(term) ? "" : "none";
    });
  }

  function updateBranchCount() {
    el("branchCount").textContent = `${state.selectedBranches.size} selected`;
  }

  function updateBranchModeVisibility() {
    el("branchModeField").hidden = state.selectedBranches.size < 2;
  }

  function isWomensCollege(instName) {
    return /WOMEN/i.test(instName);
  }

  function womenBadge(instName) {
    return isWomensCollege(instName)
      ? ' <span class="women-badge" title="Women\'s college">&#9792; Women\'s</span>'
      : "";
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

    el("categorySelect").value = "OC";
    [...el("genderToggle").children].forEach((b) => b.classList.toggle("active", b.dataset.gender === "B"));
    [...el("branchModeToggle").children].forEach((b) => b.classList.toggle("active", b.dataset.mode === "separate"));
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    [...el("branchList").querySelectorAll("input[type=checkbox]")].forEach((c) => (c.checked = false));
    el("branchSearch").value = "";
    filterBranchList("");
    updateBranchCount();
    updateBranchModeVisibility();
    el("maxRank").value = "";
    el("filterError").hidden = true;

    el("resultsContainer").innerHTML = "";
    el("emptyState").style.display = "";
    el("summaryBar").hidden = true;
    el("jumpNav").hidden = true;
    el("srAnnounce").textContent = "";
    history.replaceState(null, "", location.pathname);
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
    const maxRank = maxRankRaw ? parseInt(maxRankRaw, 10) : null;
    const rows = state.data.rows;

    el("emptyState").style.display = "none";
    const container = el("resultsContainer");
    container.innerHTML = "";

    updateUrlState(category, maxRankRaw);

    const branchOrder = [...state.selectedBranches].sort();
    const useCombined = state.branchMode === "combined" && branchOrder.length > 1;

    let totalRanked = 0;
    let bestOverall = null;
    const sectionMetas = [];

    function collectBest(ranked) {
      if (ranked.length) bestOverall = bestOverall == null ? ranked[0][categoryKey] : Math.min(bestOverall, ranked[0][categoryKey]);
    }

    if (useCombined) {
      const filtered = rows.filter((r) => passesFilters(r, null));
      const rankedAll = filtered
        .filter((r) => typeof r[categoryKey] === "number")
        .sort((a, b) => a[categoryKey] - b[categoryKey] || a.instName.localeCompare(b.instName));
      const ranked = maxRank ? rankedAll.filter((r) => r[categoryKey] <= maxRank) : rankedAll;
      const suggestions = maxRank ? rankedAll.filter((r) => r[categoryKey] > maxRank).slice(0, 5) : [];
      const unranked = filtered
        .filter((r) => typeof r[categoryKey] !== "number")
        .sort((a, b) => a.instName.localeCompare(b.instName));

      const section = renderCombinedSection(branchOrder, category, state.gender, ranked, unranked, suggestions, categoryKey);
      container.appendChild(section);
      totalRanked += ranked.length;
      collectBest(ranked);
    } else {
      branchOrder.forEach((branchCode) => {
        const filtered = rows.filter((r) => passesFilters(r, branchCode));
        const rankedAll = filtered
          .filter((r) => typeof r[categoryKey] === "number")
          .sort((a, b) => a[categoryKey] - b[categoryKey] || a.instName.localeCompare(b.instName));
        const ranked = maxRank ? rankedAll.filter((r) => r[categoryKey] <= maxRank) : rankedAll;
        const suggestions = maxRank ? rankedAll.filter((r) => r[categoryKey] > maxRank).slice(0, 5) : [];
        const unranked = filtered
          .filter((r) => typeof r[categoryKey] !== "number")
          .sort((a, b) => a.instName.localeCompare(b.instName));

        const section = renderBranchSection(branchCode, category, state.gender, ranked, unranked, suggestions, categoryKey);
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

    if (window.matchMedia("(max-width: 900px)").matches) closeFilterDrawer();
  }

  function renderSuggestions(suggestions, categoryKey, label) {
    const wrap = document.createElement("div");
    wrap.className = "reach-block";
    wrap.innerHTML = `<div class="reach-heading">Next best options beyond your rank &middot; ${escapeHtml(label)}</div>`;
    const list = document.createElement("ul");
    list.className = "reach-list";
    suggestions.forEach((r, idx) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="rank-badge">${idx + 1}</span> <span class="code-cell">${escapeHtml(r.instCode)}</span> ${escapeHtml(r.instName)}${womenBadge(r.instName)} &middot; ${escapeHtml(DISTRICT_LABELS[r.district] || r.district)} &middot; <span class="rank-cell">${r[categoryKey]}</span>`;
      list.appendChild(li);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function renderBranchSection(branchCode, category, gender, ranked, unranked, suggestions, categoryKey) {
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
        <button class="download-btn" data-format="png">Download PNG</button>
        <button class="download-btn" data-format="jpeg">Download JPEG</button>
        <button class="download-btn copy-link-btn" type="button">Copy Share Link</button>
      </div>
    `;
    section.appendChild(header);

    const metaEl = header.querySelector(".meta");
    function renderMeta(count) {
      metaEl.textContent = `Category: ${categoryLabel} · ${count} ranked result${count === 1 ? "" : "s"}${unranked.length ? ` · ${unranked.length} with no allotment record` : ""}`;
    }

    const snapshotWrap = document.createElement("div");
    snapshotWrap.className = "snapshot-wrap table-scroll";

    const title = document.createElement("div");
    title.className = "snapshot-title";
    title.textContent = `AP EAPCET 2025 – ${branchCode} (${branchLabel}) – ${categoryLabel} – Best to Least Cutoff`;
    snapshotWrap.appendChild(title);

    if (ranked.length === 0) {
      const empty = document.createElement("div");
      empty.className = "no-results";
      empty.textContent = "No colleges match these filters for this category/branch.";
      snapshotWrap.appendChild(empty);
    } else {
      snapshotWrap.appendChild(buildTable(ranked, categoryKey, { onRowCountChange: renderMeta }));
    }

    section.appendChild(snapshotWrap);

    if (suggestions.length > 0) {
      section.appendChild(renderSuggestions(suggestions, categoryKey, branchLabel));
    }

    if (unranked.length > 0) {
      const toggle = document.createElement("div");
      toggle.className = "unranked-toggle";
      toggle.textContent = `Show ${unranked.length} college(s) with no allotment recorded in this category ▾`;
      const list = document.createElement("ul");
      list.className = "unranked-list";
      list.hidden = true;
      unranked.forEach((r) => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="code-cell">${escapeHtml(r.instCode)}</span> ${escapeHtml(r.instName)}${womenBadge(r.instName)} &middot; ${escapeHtml(DISTRICT_LABELS[r.district] || r.district)}`;
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
    header.querySelector(".copy-link-btn").addEventListener("click", (e) => copyShareLink(e.currentTarget));
    header.querySelector(".edit-toggle-btn").addEventListener("click", (e) => {
      const active = section.classList.toggle("edit-active");
      e.currentTarget.textContent = active ? "Done Editing" : "Edit List";
      e.currentTarget.classList.toggle("active-edit", active);
    });

    return section;
  }

  function renderCombinedSection(branchCodes, category, gender, ranked, unranked, suggestions, categoryKey) {
    const meta = state.data.meta;
    const categoryLabel = meta.category_labels[categoryKey] || categoryKey;
    const branchLabelList = branchCodes.map((c) => `${c} (${meta.branch_labels[c] || c})`).join(", ");

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
        <button class="download-btn" data-format="png">Download PNG</button>
        <button class="download-btn" data-format="jpeg">Download JPEG</button>
        <button class="download-btn copy-link-btn" type="button">Copy Share Link</button>
      </div>
    `;
    section.appendChild(header);

    const metaEl = header.querySelectorAll(".meta")[1] || header.querySelector(".meta");
    function renderMeta(count) {
      metaEl.textContent = `Category: ${categoryLabel} · ${count} ranked result${count === 1 ? "" : "s"}${unranked.length ? ` · ${unranked.length} with no allotment record` : ""}`;
    }

    const snapshotWrap = document.createElement("div");
    snapshotWrap.className = "snapshot-wrap table-scroll";
    const title = document.createElement("div");
    title.className = "snapshot-title";
    title.textContent = `AP EAPCET 2025 – Combined (${branchCodes.join(", ")}) – ${categoryLabel} – Best to Least Cutoff`;
    snapshotWrap.appendChild(title);

    if (ranked.length === 0) {
      const empty = document.createElement("div");
      empty.className = "no-results";
      empty.textContent = "No colleges match these filters across the selected branches.";
      snapshotWrap.appendChild(empty);
    } else {
      snapshotWrap.appendChild(buildTable(ranked, categoryKey, { showBranch: true, onRowCountChange: renderMeta }));
    }
    section.appendChild(snapshotWrap);

    if (suggestions.length > 0) {
      section.appendChild(renderSuggestions(suggestions, categoryKey, "Combined"));
    }

    if (unranked.length > 0) {
      const toggle = document.createElement("div");
      toggle.className = "unranked-toggle";
      toggle.textContent = `Show ${unranked.length} college(s) with no allotment recorded in this category ▾`;
      const list = document.createElement("ul");
      list.className = "unranked-list";
      list.hidden = true;
      unranked.forEach((r) => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="code-cell">${escapeHtml(r.instCode)}</span> ${escapeHtml(r.instName)}${womenBadge(r.instName)} &middot; ${escapeHtml(DISTRICT_LABELS[r.district] || r.district)} &middot; ${escapeHtml(r.branch)}`;
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
    const branchLabels = state.data.meta.branch_labels;

    const table = document.createElement("table");
    table.className = "results-table";

    let currentKey = "rank";
    let currentDir = "asc";
    let rows = ranked.slice();

    function sortArrow(key) {
      if (currentKey !== key) return "";
      return currentDir === "asc" ? " ▲" : " ▼";
    }

    function render() {
      table.innerHTML = `
        <thead>
          <tr>
            <th class="delete-col"></th>
            <th>#</th>
            <th>College Code</th>
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
        tr.innerHTML = `
          <td class="delete-col"><button type="button" class="row-delete-btn" title="Remove this college from the list">&times;</button></td>
          <td><span class="rank-badge${isCanonical && rowRank === 1 ? " medal" : ""}">${rowRank}</span></td>
          <td class="code-cell">${escapeHtml(r.instCode)}</td>
          <td>${escapeHtml(r.instName)}${womenBadge(r.instName)}</td>
          ${showBranch ? `<td><span class="type-pill">${escapeHtml(r.branch)} &middot; ${escapeHtml(branchLabels[r.branch] || "")}</span></td>` : ""}
          <td><span class="type-pill">${r.type}</span></td>
          <td>${escapeHtml(DISTRICT_LABELS[r.district] || r.district)} &middot; ${r.region}</td>
          <td class="rank-cell">${r[categoryKey]}</td>
        `;
        tr.querySelector(".row-delete-btn").addEventListener("click", () => {
          const pos = rows.indexOf(r);
          if (pos > -1) rows.splice(pos, 1);
          render();
          refreshSummaryBar();
        });
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
              : a[categoryKey] - b[categoryKey];
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

  function updateUrlState(category, maxRankRaw) {
    const params = new URLSearchParams();
    params.set("branches", [...state.selectedBranches].sort().join(","));
    params.set("category", category);
    params.set("gender", state.gender);
    params.set("mode", state.branchMode);
    if (state.selectedRegions.size) params.set("regions", [...state.selectedRegions].join(","));
    if (state.selectedDistricts.size) params.set("districts", [...state.selectedDistricts].join(","));
    if (state.selectedTypes.size) params.set("types", [...state.selectedTypes].join(","));
    if (maxRankRaw) params.set("maxRank", maxRankRaw);
    history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
  }

  function restoreFromUrl() {
    const params = new URLSearchParams(location.search);
    if (![...params.keys()].length) return false;

    const branches = (params.get("branches") || "").split(",").filter(Boolean);
    branches.forEach((code) => {
      const cb = el("branchList").querySelector(`input[value="${code}"]`);
      if (cb) {
        cb.checked = true;
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

  loadData();
})();

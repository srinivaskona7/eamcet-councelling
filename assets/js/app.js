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

  const OWNERSHIP_GROUPS = {
    ALL: { label: "All Colleges", types: null },
    PRIVATE: { label: "Private Colleges", types: ["PVT", "SF", "SS"] },
    UNIVERSITY: { label: "Universities", types: ["UNIV", "PU"] },
  };

  const state = {
    data: null,
    selectedBranches: new Set(),
    gender: "B",
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
      status.classList.add("ready");
      initFilters();
    } catch (err) {
      status.textContent = "Failed to load dataset: " + err.message;
      status.classList.add("error");
      console.error(err);
    }
  }

  function initFilters() {
    const meta = state.data.meta;

    const categorySelect = el("categorySelect");
    const seenCategoryGroup = new Set();
    const baseCategories = [
      ["OC", "OC"], ["SC1", "SC"], ["SC2", "SC-II"], ["SC3", "SC-III"], ["ST", "ST"],
      ["BCA", "BC-A"], ["BCB", "BC-B"], ["BCC", "BC-C"], ["BCD", "BC-D"], ["BCE", "BC-E"],
      ["EWS", "OC-EWS"],
    ];
    baseCategories.forEach(([key, label]) => {
      if (seenCategoryGroup.has(key)) return;
      seenCategoryGroup.add(key);
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = label;
      categorySelect.appendChild(opt);
    });
    categorySelect.value = "OC";

    const regionSelect = el("regionSelect");
    regionSelect.appendChild(makeOption("ALL", "All Zones"));
    meta.regions.forEach((r) => regionSelect.appendChild(makeOption(r, REGION_LABELS[r] || r)));

    const districtSelect = el("districtSelect");
    districtSelect.appendChild(makeOption("ALL", "All Districts"));
    meta.districts.forEach((d) => districtSelect.appendChild(makeOption(d, DISTRICT_LABELS[d] || d)));

    const typeSelect = el("typeSelect");
    Object.entries(OWNERSHIP_GROUPS).forEach(([key, group]) => {
      typeSelect.appendChild(makeOption(key, group.label));
    });

    renderBranchList(meta.branches, meta.branch_labels);

    el("genderToggle").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-gender]");
      if (!btn) return;
      state.gender = btn.dataset.gender;
      [...el("genderToggle").children].forEach((b) => b.classList.toggle("active", b === btn));
    });

    el("branchSearch").addEventListener("input", (e) => {
      filterBranchList(e.target.value.trim().toLowerCase());
    });

    el("clearBranches").addEventListener("click", () => {
      state.selectedBranches.clear();
      [...el("branchList").querySelectorAll("input[type=checkbox]")].forEach((c) => (c.checked = false));
      updateBranchCount();
    });

    el("searchBtn").addEventListener("click", runSearch);
  }

  function makeOption(value, text) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    return o;
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
    const region = el("regionSelect").value;
    const district = el("districtSelect").value;
    const ownership = el("typeSelect").value;
    const maxRankRaw = el("maxRank").value.trim();
    const maxRank = maxRankRaw ? parseInt(maxRankRaw, 10) : null;

    const allowedTypes = OWNERSHIP_GROUPS[ownership].types;
    const rows = state.data.rows;

    el("emptyState").style.display = "none";
    const container = el("resultsContainer");
    container.innerHTML = "";

    const branchOrder = [...state.selectedBranches].sort();
    branchOrder.forEach((branchCode) => {
      const filtered = rows.filter((r) => {
        if (r.branch !== branchCode) return false;
        if (region !== "ALL" && r.region !== region) return false;
        if (district !== "ALL" && r.district !== district) return false;
        if (allowedTypes && !allowedTypes.includes(r.type)) return false;
        return true;
      });

      const ranked = filtered
        .filter((r) => typeof r[categoryKey] === "number")
        .filter((r) => (maxRank ? r[categoryKey] <= maxRank : true))
        .sort((a, b) => a[categoryKey] - b[categoryKey]);

      const unranked = filtered.filter((r) => typeof r[categoryKey] !== "number");

      container.appendChild(
        renderBranchSection(branchCode, category, state.gender, ranked, unranked, categoryKey)
      );
    });
  }

  function renderBranchSection(branchCode, category, gender, ranked, unranked, categoryKey) {
    const meta = state.data.meta;
    const branchLabel = meta.branch_labels[branchCode] || branchCode;
    const categoryLabel = meta.category_labels[categoryKey] || categoryKey;

    const section = document.createElement("div");
    section.className = "branch-result";

    const header = document.createElement("div");
    header.className = "branch-result-header";
    header.innerHTML = `
      <div>
        <h3>${branchCode} &mdash; ${escapeHtml(branchLabel)}</h3>
        <div class="meta">Category: ${escapeHtml(categoryLabel)} &middot; ${ranked.length} ranked result${ranked.length === 1 ? "" : "s"}${unranked.length ? ` · ${unranked.length} with no allotment record` : ""}</div>
      </div>
      <div class="branch-result-actions">
        <button class="download-btn" data-format="png">Download PNG</button>
        <button class="download-btn" data-format="jpeg">Download JPEG</button>
      </div>
    `;
    section.appendChild(header);

    const snapshotWrap = document.createElement("div");
    snapshotWrap.className = "snapshot-wrap";

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
      snapshotWrap.appendChild(buildTable(ranked, categoryKey));
    }

    section.appendChild(snapshotWrap);

    if (unranked.length > 0) {
      const toggle = document.createElement("div");
      toggle.className = "unranked-toggle";
      toggle.textContent = `Show ${unranked.length} college(s) with no allotment recorded in this category ▾`;
      const list = document.createElement("div");
      list.className = "unranked-list";
      list.hidden = true;
      list.innerHTML = unranked
        .map((r) => `${escapeHtml(r.instName)} (${r.instCode}, ${r.district})`)
        .join(", ");
      toggle.addEventListener("click", () => {
        list.hidden = !list.hidden;
      });
      section.appendChild(toggle);
      section.appendChild(list);
    }

    header.querySelectorAll(".download-btn").forEach((btn) => {
      btn.addEventListener("click", () => downloadSnapshot(snapshotWrap, branchCode, category, gender, btn.dataset.format));
    });

    return section;
  }

  function buildTable(ranked, categoryKey) {
    const table = document.createElement("table");
    table.className = "results-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>#</th>
          <th>College</th>
          <th>Type</th>
          <th>District / Zone</th>
          <th>Cutoff Rank</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");
    ranked.forEach((r, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${escapeHtml(r.instName)} <span class="hint">(${r.instCode})</span></td>
        <td><span class="type-pill">${r.type}</span></td>
        <td>${escapeHtml(DISTRICT_LABELS[r.district] || r.district)} &middot; ${r.region}</td>
        <td class="rank-cell"><span class="rank-badge">${idx + 1}</span>${r[categoryKey]}</td>
      `;
      tbody.appendChild(tr);
    });
    return table;
  }

  function downloadSnapshot(node, branchCode, category, gender, format) {
    if (typeof html2canvas !== "function") {
      alert("Image export library failed to load. Check your internet connection and retry.");
      return;
    }
    html2canvas(node, { backgroundColor: "#ffffff", scale: 2 }).then((canvas) => {
      const mime = format === "jpeg" ? "image/jpeg" : "image/png";
      const ext = format === "jpeg" ? "jpg" : "png";
      const url = canvas.toDataURL(mime, 0.95);
      const link = document.createElement("a");
      link.href = url;
      link.download = `apeapcet2025_${branchCode}_${category}${gender}.${ext}`;
      link.click();
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  loadData();
})();

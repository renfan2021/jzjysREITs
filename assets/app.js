(function () {
  const raw = window.REITS_DASHBOARD_DATA || { highlights: {}, metrics: {} };
  const state = {
    view: "overview",
    query: "",
    assetType: "全部",
    selected: [],
    historyMetric: "pnav",
    fundamentalMetric: "营业收入",
  };

  const nf = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function format(value, suffix = "") {
    const parsed = num(value);
    if (parsed === null) return "-";
    return `${nf.format(parsed)}${suffix}`;
  }

  function signed(value, suffix = "") {
    const parsed = num(value);
    if (parsed === null) return "-";
    return `${parsed > 0 ? "+" : ""}${nf.format(parsed)}${suffix}`;
  }

  function isPercentMetric(metric) {
    return metric.includes("率");
  }

  function fundamentalUnit(metric) {
    return isPercentMetric(metric) ? "%" : "万元";
  }

  function normalizeFundamentalValue(value, period) {
    const parsed = num(value);
    if (parsed === null) return null;
    return String(period || "").includes("[单位] 元") ? parsed / 10000 : parsed;
  }

  function formatFundamental(metric, value) {
    return format(value, fundamentalUnit(metric));
  }

  function fundamentalLabel(metric) {
    return `${metric}（${fundamentalUnit(metric)}）`;
  }

  function byCode(items) {
    const map = new Map();
    (items || []).forEach((item) => {
      if (item.code && !map.has(item.code)) map.set(item.code, item);
    });
    return map;
  }

  const lookup = {
    performance: byCode(raw.highlights.performance),
    pnav: byCode(raw.highlights.pnav),
    irr: byCode(raw.highlights.irr),
    dividend: byCode(raw.highlights.dividend),
  };

  function buildUniverse() {
    const map = new Map();
    function ensure(code, name, assetType) {
      if (!code) return null;
      const item = map.get(code) || {
        code,
        name: name || code,
        assetType: assetType || "未分类",
        fundamentals: {},
      };
      if (name && item.name === code) item.name = name;
      if (assetType) item.assetType = assetType;
      map.set(code, item);
      return item;
    }

    (raw.highlights.performance || []).forEach((item) => {
      const target = ensure(item.code, item.name, item.assetType);
      if (!target) return;
      target.change30 = num(item.change30);
      target.changeYtd = num(item.changeYtd);
      target.marketWeight = num(item.marketWeight);
    });

    ["pnav", "irr", "dividend"].forEach((key) => {
      (raw.highlights[key] || []).forEach((item) => {
        const target = ensure(item.code, item.name, item.assetType);
        if (!target) return;
        target[key] = num(item.value);
      });
    });

    Object.entries(raw.highlights.history || {}).forEach(([metric, histories]) => {
      Object.entries(histories || {}).forEach(([code, points]) => {
        const first = points[0] || {};
        const target = ensure(code, first.name, first.assetType);
        if (!target) return;
        target.history = target.history || {};
        target.history[metric] = points
          .map((point) => ({ date: point.date, value: num(point.value) }))
          .filter((point) => point.value !== null)
          .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      });
    });

    Object.entries(raw.highlights.fundamentals || {}).forEach(([metric, rows]) => {
      rows.forEach((item) => {
        const target = ensure(item.code, item.name, item.assetType);
        if (!target) return;
        target.fundamentals[metric] = {
          value: normalizeFundamentalValue(item.value, item.period),
          period: item.period,
          history: (item.history || [])
            .map((point) => ({ period: point.period, value: normalizeFundamentalValue(point.value, point.period) }))
            .filter((point) => point.value !== null),
        };
      });
    });

    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }

  const universe = buildUniverse();

  function assetTypes() {
    return ["全部", ...Array.from(new Set(universe.map((item) => item.assetType).filter(Boolean))).sort()];
  }

  function filteredUniverse() {
    const query = state.query.trim().toLowerCase();
    return universe.filter((item) => {
      const queryHit = !query || `${item.code} ${item.name}`.toLowerCase().includes(query);
      const assetHit = state.assetType === "全部" || item.assetType === state.assetType;
      return queryHit && assetHit;
    });
  }

  function selectedItems() {
    const selected = state.selected
      .map((code) => universe.find((item) => item.code === code))
      .filter(Boolean);
    return selected.length ? selected : filteredUniverse().slice(0, 8);
  }

  function normalizeCode(value) {
    return String(value || "").trim().toUpperCase();
  }

  function findReit(value) {
    const keyword = normalizeCode(value);
    if (!keyword) return null;
    return (
      universe.find((item) => item.code.toUpperCase() === keyword) ||
      universe.find((item) => item.code.toUpperCase().includes(keyword) || item.name.includes(String(value).trim()))
    );
  }

  function topBy(items, key, count = 8, desc = true) {
    return [...items]
      .filter((item) => num(item[key]) !== null)
      .sort((a, b) => (desc ? b[key] - a[key] : a[key] - b[key]))
      .slice(0, count);
  }

  function renderBars(id, items, key, options = {}) {
    const {
      suffix = "",
      limit = 10,
      signedValue = false,
      selectable = true,
      label = (item) => item.name,
      sub = (item) => item.code,
    } = options;
    const rows = items.slice(0, limit);
    if (!rows.length) {
      $(id).innerHTML = `<p class="empty">暂无可展示数据</p>`;
      return;
    }
    const max = Math.max(...rows.map((item) => Math.abs(num(item[key]) || 0)), 1);
    $(id).innerHTML = rows
      .map((item) => {
        const value = num(item[key]) || 0;
        const width = Math.max(4, (Math.abs(value) / max) * 100);
        return `
          <button class="bar-row" type="button" ${selectable ? `data-code="${escapeHtml(item.code)}"` : ""}>
            <span class="bar-label">
              <strong title="${escapeHtml(label(item))}">${escapeHtml(label(item))}</strong>
              <em>${escapeHtml(sub(item))}</em>
            </span>
            <span class="bar-track"><span class="bar-fill ${value < 0 ? "negative" : ""}" style="width:${width}%"></span></span>
            <strong class="bar-value">${escapeHtml(signedValue ? signed(value, suffix) : format(value, suffix))}</strong>
          </button>
        `;
      })
      .join("");
    $(id).querySelectorAll("[data-code]").forEach((button) => {
      button.addEventListener("click", () => selectOnly(button.dataset.code));
    });
  }

  function renderMetricTable(id, rows, columns) {
    if (!rows.length) {
      $(id).innerHTML = `<p class="empty">请选择 REITs 或调整筛选条件。</p>`;
      return;
    }
    const head = columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("");
    const body = rows
      .map(
        (row) => `
          <tr data-code="${escapeHtml(row.code)}">
            ${columns
              .map((col) => {
                const value = col.value(row);
                return `<td title="${escapeHtml(value)}">${escapeHtml(value)}</td>`;
              })
              .join("")}
          </tr>
        `
      )
      .join("");
    $(id).innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    $(id).querySelectorAll("[data-code]").forEach((row) => {
      row.addEventListener("click", () => selectOnly(row.dataset.code));
    });
  }

  function renderKpis() {
    const scoped = filteredUniverse();
    const withChange = scoped.filter((item) => num(item.change30) !== null);
    const avg30 = withChange.length ? withChange.reduce((sum, item) => sum + item.change30, 0) / withChange.length : null;
    const cards = [
      ["覆盖标的", `${scoped.length} 只`],
      ["资产类型", `${new Set(scoped.map((item) => item.assetType)).size} 类`],
      ["30日平均涨跌", signed(avg30, "%")],
      ["P/NAV 中位数", format(median(scoped.map((item) => item.pnav)), "")],
      ["IRR 中位数", format(median(scoped.map((item) => item.irr)), "%")],
      ["派息率中位数", format(median(scoped.map((item) => item.dividend)), "%")],
    ];
    $("overviewKpis").innerHTML = cards
      .map(([label, value]) => `<article class="kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
      .join("");
  }

  function median(values) {
    const list = values.map(num).filter((value) => value !== null).sort((a, b) => a - b);
    if (!list.length) return null;
    const middle = Math.floor(list.length / 2);
    return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
  }

  function renderAssetBars() {
    const counts = new Map();
    filteredUniverse().forEach((item) => counts.set(item.assetType, (counts.get(item.assetType) || 0) + 1));
    const rows = Array.from(counts, ([assetType, count]) => ({ code: assetType, name: assetType, count })).sort((a, b) => b.count - a.count);
    renderBars("assetBars", rows, "count", {
      suffix: " 只",
      sub: () => "资产类型",
      label: (item) => item.name,
      selectable: false,
      limit: 12,
    });
  }

  function renderOverview() {
    const scoped = filteredUniverse();
    renderKpis();
    renderFocusCards("focusCards");
    renderAssetBars();
    renderBars("overviewChangeBars", topBy(scoped, "change30", 10, true), "change30", {
      suffix: "%",
      signedValue: true,
      sub: (item) => `${item.code} · ${item.assetType}`,
      limit: 10,
    });
    renderMetricTable("valuationMatrix", topBy(scoped, "pnav", 12, true), metricColumns());
  }

  function latestFundamentalChange(item, metric) {
    const points = item.fundamentals[metric]?.history || [];
    if (points.length < 2) return null;
    const latest = points[points.length - 1].value;
    const previous = points[points.length - 2].value;
    if (num(latest) === null || num(previous) === null) return null;
    return latest - previous;
  }

  function signalScore(item) {
    let score = 0;
    const pnavPct = percentile(item, "pnav");
    const dividendRank = rankInPeer(item, "dividend", true);
    const irrRank = rankInPeer(item, "irr", true);
    const ebitdaChange = latestFundamentalChange(item, "EBITDA");
    const distributableChange = latestFundamentalChange(item, "可供分配金额");
    if (num(pnavPct) !== null && pnavPct <= 30) score += 3;
    if (dividendRank && dividendRank.rank <= Math.ceil(dividendRank.total * 0.25)) score += 2;
    if (irrRank && irrRank.rank <= Math.ceil(irrRank.total * 0.25)) score += 2;
    if (num(ebitdaChange) !== null && ebitdaChange > 0) score += 1;
    if (num(distributableChange) !== null && distributableChange > 0) score += 1;
    if (num(item.change30) !== null && item.change30 < -5 && num(ebitdaChange) !== null && ebitdaChange >= 0) score += 1;
    return score;
  }

  function riskScore(item) {
    let score = 0;
    const pnavPct = percentile(item, "pnav");
    const occupancyChange = latestFundamentalChange(item, "期末出租率");
    const ebitdaChange = latestFundamentalChange(item, "EBITDA");
    const distributableChange = latestFundamentalChange(item, "可供分配金额");
    if (num(pnavPct) !== null && pnavPct >= 80) score += 3;
    if (num(item.change30) !== null && item.change30 < -8) score += 2;
    if (num(occupancyChange) !== null && occupancyChange < 0) score += 1;
    if (num(ebitdaChange) !== null && ebitdaChange < 0) score += 1;
    if (num(distributableChange) !== null && distributableChange < 0) score += 1;
    return score;
  }

  function opportunityReason(item) {
    const parts = [];
    const pnavPct = percentile(item, "pnav");
    if (num(pnavPct) !== null && pnavPct <= 30) parts.push(`P/NAV分位${format(pnavPct, "%")}`);
    const dividendRank = rankInPeer(item, "dividend", true);
    if (dividendRank && dividendRank.rank <= Math.ceil(dividendRank.total * 0.25)) parts.push(`派息同类${rankText(dividendRank)}`);
    const irrRank = rankInPeer(item, "irr", true);
    if (irrRank && irrRank.rank <= Math.ceil(irrRank.total * 0.25)) parts.push(`IRR同类${rankText(irrRank)}`);
    const ebitdaChange = latestFundamentalChange(item, "EBITDA");
    if (num(ebitdaChange) !== null && ebitdaChange > 0) parts.push("EBITDA改善");
    return parts.join(" / ") || "综合指标靠前";
  }

  function riskReason(item) {
    const parts = [];
    const pnavPct = percentile(item, "pnav");
    if (num(pnavPct) !== null && pnavPct >= 80) parts.push(`P/NAV分位${format(pnavPct, "%")}`);
    if (num(item.change30) !== null && item.change30 < -8) parts.push(`30日${signed(item.change30, "%")}`);
    const occupancyChange = latestFundamentalChange(item, "期末出租率");
    if (num(occupancyChange) !== null && occupancyChange < 0) parts.push("出租率下行");
    const distributableChange = latestFundamentalChange(item, "可供分配金额");
    if (num(distributableChange) !== null && distributableChange < 0) parts.push("可供分配承压");
    return parts.join(" / ") || "综合风险靠前";
  }

  function opportunityItems(limit = 12) {
    return filteredUniverse()
      .map((item) => ({ ...item, signalScore: signalScore(item), reason: opportunityReason(item) }))
      .filter((item) => item.signalScore > 0)
      .sort((a, b) => b.signalScore - a.signalScore || (a.pnav ?? 99) - (b.pnav ?? 99))
      .slice(0, limit);
  }

  function riskItems(limit = 12) {
    return filteredUniverse()
      .map((item) => ({ ...item, riskScore: riskScore(item), reason: riskReason(item) }))
      .filter((item) => item.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore || (a.change30 ?? 0) - (b.change30 ?? 0))
      .slice(0, limit);
  }

  function renderFocusCards(id) {
    const scoped = filteredUniverse();
    const lowPnav = topBy(scoped, "pnav", 1, false)[0];
    const highDividend = topBy(scoped, "dividend", 1, true)[0];
    const worstChange = topBy(scoped, "change30", 1, false)[0];
    const opp = opportunityItems(1)[0];
    const risk = riskItems(1)[0];
    const cards = [
      ["低估关注", lowPnav, lowPnav ? `P/NAV ${format(lowPnav.pnav)}` : "-"],
      ["高派息关注", highDividend, highDividend ? `派息率 ${format(highDividend.dividend, "%")}` : "-"],
      ["短期承压", worstChange, worstChange ? `30日 ${signed(worstChange.change30, "%")}` : "-"],
      ["机会池首位", opp, opp ? opp.reason : "-"],
      ["风险池首位", risk, risk ? risk.reason : "-"],
    ];
    $(id).innerHTML = cards
      .map(
        ([label, item, detail]) => `
          <button class="signal-card" type="button" ${item ? `data-code="${escapeHtml(item.code)}"` : ""}>
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(item ? item.name : "-")}</strong>
            <em>${escapeHtml(item ? `${item.code} · ${detail}` : "暂无")}</em>
          </button>
        `
      )
      .join("");
    $(id).querySelectorAll("[data-code]").forEach((button) => {
      button.addEventListener("click", () => selectOnly(button.dataset.code));
    });
  }

  function renderSignals() {
    renderFocusCards("signalFocusCards");
    renderMetricTable("opportunityPool", opportunityItems(15), [
      { label: "代码", value: (row) => row.code },
      { label: "名称", value: (row) => row.name },
      { label: "资产类型", value: (row) => row.assetType },
      { label: "机会分", value: (row) => row.signalScore },
      { label: "P/NAV分位", value: (row) => format(percentile(row, "pnav"), "%") },
      { label: "派息率", value: (row) => format(row.dividend, "%") },
      { label: "理由", value: (row) => row.reason },
    ]);
    renderMetricTable("riskPool", riskItems(15), [
      { label: "代码", value: (row) => row.code },
      { label: "名称", value: (row) => row.name },
      { label: "资产类型", value: (row) => row.assetType },
      { label: "风险分", value: (row) => row.riskScore },
      { label: "30日涨跌", value: (row) => signed(row.change30, "%") },
      { label: "P/NAV分位", value: (row) => format(percentile(row, "pnav"), "%") },
      { label: "理由", value: (row) => row.reason },
    ]);
  }

  function sectorRows() {
    const groups = new Map();
    filteredUniverse().forEach((item) => {
      const key = item.assetType || "未分类";
      const row = groups.get(key) || { code: key, assetType: key, name: key, items: [] };
      row.items.push(item);
      groups.set(key, row);
    });
    return Array.from(groups.values())
      .map((row) => {
        const items = row.items;
        const avgChange = median(items.map((item) => item.change30));
        const pnavMedian = median(items.map((item) => item.pnav));
        const irrMedian = median(items.map((item) => item.irr));
        const dividendMedian = median(items.map((item) => item.dividend));
        const oppCount = items.filter((item) => signalScore(item) > 0).length;
        const riskCount = items.filter((item) => riskScore(item) > 0).length;
        return { ...row, count: items.length, avgChange, pnavMedian, irrMedian, dividendMedian, oppCount, riskCount };
      })
      .sort((a, b) => b.count - a.count);
  }

  function renderSectors() {
    const rows = sectorRows();
    $("sectorCards").innerHTML = rows
      .slice(0, 12)
      .map(
        (row) => `
          <article class="sector-card">
            <div>
              <span>${escapeHtml(row.assetType)}</span>
              <strong>${escapeHtml(`${row.count} 只`)}</strong>
            </div>
            <p>30日中位 ${escapeHtml(signed(row.avgChange, "%"))}</p>
            <p>P/NAV中位 ${escapeHtml(format(row.pnavMedian))} · 派息中位 ${escapeHtml(format(row.dividendMedian, "%"))}</p>
            <em>机会 ${escapeHtml(row.oppCount)} · 风险 ${escapeHtml(row.riskCount)}</em>
          </article>
        `
      )
      .join("");
    renderMetricTable("sectorTable", rows, [
      { label: "板块", value: (row) => row.assetType },
      { label: "数量", value: (row) => `${row.count} 只` },
      { label: "30日中位", value: (row) => signed(row.avgChange, "%") },
      { label: "P/NAV中位", value: (row) => format(row.pnavMedian) },
      { label: "IRR中位", value: (row) => format(row.irrMedian, "%") },
      { label: "派息率中位", value: (row) => format(row.dividendMedian, "%") },
      { label: "机会数", value: (row) => row.oppCount },
      { label: "风险数", value: (row) => row.riskCount },
    ]);
  }

  function renderPerformance() {
    const scoped = filteredUniverse();
    renderBars("changeBars", [...topBy(scoped, "change30", 6, true), ...topBy(scoped, "change30", 6, false)], "change30", {
      suffix: "%",
      signedValue: true,
      sub: (item) => `${item.code} · ${item.assetType}`,
      limit: 12,
    });
    renderBars("ytdBars", topBy(scoped, "changeYtd", 12, true), "changeYtd", {
      suffix: "%",
      signedValue: true,
      sub: (item) => `${item.code} · ${item.assetType}`,
      limit: 12,
    });
    renderMetricTable("selectedPerformance", selectedItems(), [
      { label: "代码", value: (row) => row.code },
      { label: "名称", value: (row) => row.name },
      { label: "资产类型", value: (row) => row.assetType },
      { label: "30日涨跌幅", value: (row) => signed(row.change30, "%") },
      { label: "年初以来", value: (row) => signed(row.changeYtd, "%") },
    ]);
  }

  function metricColumns() {
    return [
      { label: "代码", value: (row) => row.code },
      { label: "名称", value: (row) => row.name },
      { label: "资产类型", value: (row) => row.assetType },
      { label: "P/NAV", value: (row) => format(row.pnav) },
      { label: "P/NAV分位", value: (row) => format(percentile(row, "pnav"), "%") },
      { label: "IRR", value: (row) => format(row.irr, "%") },
      { label: "IRR分位", value: (row) => format(percentile(row, "irr"), "%") },
      { label: "派息率", value: (row) => format(row.dividend, "%") },
      { label: "派息率分位", value: (row) => format(percentile(row, "dividend"), "%") },
      { label: "30日涨跌", value: (row) => signed(row.change30, "%") },
    ];
  }

  function renderValuation() {
    const scoped = filteredUniverse();
    renderBars("pnavBars", topBy(scoped, "pnav", 12, true), "pnav", { sub: (item) => `${item.code} · ${item.assetType}` });
    renderBars("irrBars", topBy(scoped, "irr", 12, true), "irr", { suffix: "%", sub: (item) => `${item.code} · ${item.assetType}` });
    renderBars("dividendBars", topBy(scoped, "dividend", 12, true), "dividend", {
      suffix: "%",
      sub: (item) => `${item.code} · ${item.assetType}`,
    });
    renderMetricTable("selectedValuation", selectedItems(), metricColumns());
  }

  function renderFundamentals() {
    const metrics = ["营业收入", "EBITDA", "EBITDA利润率", "可供分配金额", "期末出租率", "租金收入"];
    $("fundamentalGrid").innerHTML = metrics
      .map(
        (metric) => `
          <article class="panel">
            <div class="panel-title">
              <div>
                <p class="section-label">基本面</p>
                <h3>${escapeHtml(metric)}</h3>
              </div>
            </div>
            <div class="bars" id="fund-${escapeHtml(metric)}"></div>
          </article>
        `
      )
      .join("");
    metrics.forEach((metric) => {
      const rows = filteredUniverse()
        .filter((item) => item.fundamentals[metric] && num(item.fundamentals[metric].value) !== null)
        .map((item) => ({ ...item, metricValue: item.fundamentals[metric].value, metricPeriod: item.fundamentals[metric].period }))
        .sort((a, b) => b.metricValue - a.metricValue);
      renderBars(`fund-${metric}`, rows, "metricValue", {
        sub: (item) => `${item.code} · ${String(item.metricPeriod || "").slice(0, 18)}`,
        suffix: fundamentalUnit(metric),
        limit: 10,
      });
    });
  }

  function primaryItem() {
    return universe.find((item) => item.code === state.selected[0]) || filteredUniverse()[0] || universe[0];
  }

  function renderProfile() {
    const item = primaryItem();
    if (!item) return;
    $("profileName").textContent = `${item.name} ${item.code}`;
    const cards = [
      ["资产类型", item.assetType],
      ["30日涨跌", signed(item.change30, "%")],
      ["年初以来", signed(item.changeYtd, "%")],
      ["P/NAV", format(item.pnav)],
      ["IRR", format(item.irr, "%")],
      ["派息率", format(item.dividend, "%")],
    ];
    $("profileKpis").innerHTML = cards
      .map(([label, value]) => `<div class="profile-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
      .join("");
    renderMetricTable("profileMetrics", [item], [
      ...metricColumns(),
      { label: fundamentalLabel("营业收入"), value: (row) => formatFundamental("营业收入", row.fundamentals["营业收入"]?.value) },
      { label: fundamentalLabel("EBITDA"), value: (row) => formatFundamental("EBITDA", row.fundamentals["EBITDA"]?.value) },
      { label: fundamentalLabel("可供分配金额"), value: (row) => formatFundamental("可供分配金额", row.fundamentals["可供分配金额"]?.value) },
      { label: fundamentalLabel("期末出租率"), value: (row) => formatFundamental("期末出租率", row.fundamentals["期末出租率"]?.value) },
    ]);
    renderPeerRanks(item);
    renderHistory(item);
    renderFundamentalTrend(item);
  }

  function percentile(item, metric) {
    const points = ((item.history || {})[metric] || []).map((point) => num(point.value)).filter((value) => value !== null);
    const current = num(item[metric]);
    if (!points.length || current === null) return null;
    const lowerOrEqual = points.filter((value) => value <= current).length;
    return (lowerOrEqual / points.length) * 100;
  }

  function percentileTone(value, lowerIsBetter = false) {
    const parsed = num(value);
    if (parsed === null) return "中性";
    if (lowerIsBetter) {
      if (parsed <= 30) return "偏低";
      if (parsed >= 70) return "偏高";
      return "中性";
    }
    if (parsed >= 70) return "偏高";
    if (parsed <= 30) return "偏低";
    return "中性";
  }

  function rankInPeer(item, metric, desc = true) {
    const peers = universe
      .filter((peer) => peer.assetType === item.assetType && num(peer[metric]) !== null)
      .sort((a, b) => (desc ? b[metric] - a[metric] : a[metric] - b[metric]));
    const index = peers.findIndex((peer) => peer.code === item.code);
    if (index < 0) return null;
    return { rank: index + 1, total: peers.length };
  }

  function fundamentalRankInPeer(item, metric, desc = true) {
    const peers = universe
      .filter((peer) => peer.assetType === item.assetType && num(peer.fundamentals[metric]?.value) !== null)
      .sort((a, b) => {
        const av = a.fundamentals[metric].value;
        const bv = b.fundamentals[metric].value;
        return desc ? bv - av : av - bv;
      });
    const index = peers.findIndex((peer) => peer.code === item.code);
    if (index < 0) return null;
    return { rank: index + 1, total: peers.length };
  }

  function rankText(rank) {
    return rank ? `${rank.rank}/${rank.total}` : "-";
  }

  function renderPeerRanks(item) {
    const cards = [
      ["30日涨跌", signed(item.change30, "%"), rankText(rankInPeer(item, "change30", true)), "高为佳"],
      ["P/NAV", format(item.pnav), rankText(rankInPeer(item, "pnav", false)), "低为佳"],
      ["IRR", format(item.irr, "%"), rankText(rankInPeer(item, "irr", true)), "高为佳"],
      ["派息率", format(item.dividend, "%"), rankText(rankInPeer(item, "dividend", true)), "高为佳"],
      ["营业收入", formatFundamental("营业收入", item.fundamentals["营业收入"]?.value), rankText(fundamentalRankInPeer(item, "营业收入", true)), "高为佳"],
      ["可供分配", formatFundamental("可供分配金额", item.fundamentals["可供分配金额"]?.value), rankText(fundamentalRankInPeer(item, "可供分配金额", true)), "高为佳"],
    ];
    $("peerRankCards").innerHTML = cards
      .map(
        ([label, value, rank, rule]) => `
          <div class="rank-card">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <em>同类排名 ${escapeHtml(rank)} · ${escapeHtml(rule)}</em>
          </div>
        `
      )
      .join("");
  }

  function historyLabel(metric) {
    return { pnav: "P/NAV", irr: "IRR", dividend: "派息率" }[metric] || metric;
  }

  function chartFrame(height = 290) {
    return {
      width: 980,
      height,
      pad: { top: 24, right: 104, bottom: 58, left: 106 },
    };
  }

  function axisTicks(min, max) {
    return [min, (min + max) / 2, max];
  }

  function renderHistory(item) {
    const metric = state.historyMetric;
    const points = ((item.history || {})[metric] || []).filter((point) => num(point.value) !== null);
    document.querySelectorAll("#historyMetricSwitch button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.metric === metric);
    });
    if (!points.length) {
      $("historyChart").innerHTML = `<p class="empty">该标的暂无 ${escapeHtml(historyLabel(metric))} 历史曲线。</p>`;
      $("historyTable").innerHTML = "";
      return;
    }
    const { width, height, pad } = chartFrame(292);
    const values = points.map((point) => point.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const x = (index) => pad.left + (index / Math.max(points.length - 1, 1)) * (width - pad.left - pad.right);
    const y = (value) => pad.top + ((max - value) / (max - min)) * (height - pad.top - pad.bottom);
    const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
    const latest = points[points.length - 1];
    const first = points[0];
    const change = latest.value - first.value;
    const ticks = axisTicks(min, max);
    $("historyChart").innerHTML = `
      <div class="chart-summary">
        <span>${escapeHtml(historyLabel(metric))}</span>
        <strong>${escapeHtml(format(latest.value, metric === "pnav" ? "" : "%"))}</strong>
        <em>${escapeHtml(first.date)} 至 ${escapeHtml(latest.date)} · 变化 ${escapeHtml(signed(change, metric === "pnav" ? "" : "%"))} · 历史分位 ${escapeHtml(format(percentile(item, metric), "%"))} · ${escapeHtml(percentileTone(percentile(item, metric), metric === "pnav"))}</em>
      </div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(item.name)} ${escapeHtml(historyLabel(metric))} 历史曲线">
        ${ticks
          .map(
            (tick) => `
              <line x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick).toFixed(2)}" y2="${y(tick).toFixed(2)}" class="grid-line"></line>
              <text x="${pad.left - 16}" y="${(y(tick) + 4).toFixed(2)}" class="axis-text y-axis">${escapeHtml(format(tick, metric === "pnav" ? "" : "%"))}</text>
            `
          )
          .join("")}
        <path d="${path}" class="line-path"></path>
        <circle cx="${x(points.length - 1).toFixed(2)}" cy="${y(latest.value).toFixed(2)}" r="4" class="line-dot"></circle>
        <line x1="${pad.left}" x2="${width - pad.right}" y1="${height - pad.bottom}" y2="${height - pad.bottom}" class="axis-line"></line>
        <text x="${pad.left}" y="${height - 20}" class="axis-text start">${escapeHtml(first.date)}</text>
        <text x="${width - pad.right}" y="${height - 20}" class="axis-text end">${escapeHtml(latest.date)}</text>
      </svg>
    `;
    renderMetricTable(
      "historyTable",
      points
        .slice(-12)
        .reverse()
        .map((point, index) => ({ code: item.code, rowIndex: index, ...point })),
      [
        { label: "日期", value: (row) => row.date },
        { label: historyLabel(metric), value: (row) => format(row.value, metric === "pnav" ? "" : "%") },
      ]
    );
  }

  function cleanPeriodLabel(period) {
    return String(period || "")
      .replace(/\s+/g, " ")
      .replace(/.*\\[报告期\\]\s*/, "")
      .replace(/\s*\\[单位\\].*/, "")
      .trim();
  }

  function renderFundamentalTrend(item) {
    const metric = state.fundamentalMetric;
    document.querySelectorAll("#fundamentalMetricSwitch button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.metric === metric);
    });
    const points = (item.fundamentals[metric]?.history || []).filter((point) => num(point.value) !== null);
    const suffix = fundamentalUnit(metric);
    if (!points.length) {
      $("fundamentalTrendChart").innerHTML = `<p class="empty">该标的暂无 ${escapeHtml(metric)} 趋势。</p>`;
      $("fundamentalTrendTable").innerHTML = "";
      return;
    }
    const { width, height, pad } = chartFrame(282);
    const values = points.map((point) => point.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const x = (index) => pad.left + (index / Math.max(points.length - 1, 1)) * (width - pad.left - pad.right);
    const y = (value) => pad.top + ((max - value) / (max - min)) * (height - pad.top - pad.bottom);
    const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
    const latest = points[points.length - 1];
    const previous = points[points.length - 2];
    const change = previous ? latest.value - previous.value : null;
    const first = points[0];
    const ticks = axisTicks(min, max);
    $("fundamentalTrendChart").innerHTML = `
      <div class="chart-summary">
        <span>${escapeHtml(metric)}</span>
        <strong>${escapeHtml(format(latest.value, suffix))}</strong>
        <em>${escapeHtml(cleanPeriodLabel(first.period))} 至 ${escapeHtml(cleanPeriodLabel(latest.period))} · 最新环比 ${escapeHtml(signed(change, suffix))}</em>
      </div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(item.name)} ${escapeHtml(metric)} 基本面趋势">
        ${ticks
          .map(
            (tick) => `
              <line x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick).toFixed(2)}" y2="${y(tick).toFixed(2)}" class="grid-line"></line>
              <text x="${pad.left - 16}" y="${(y(tick) + 4).toFixed(2)}" class="axis-text y-axis">${escapeHtml(format(tick, suffix))}</text>
            `
          )
          .join("")}
        <path d="${path}" class="line-path amber"></path>
        <circle cx="${x(points.length - 1).toFixed(2)}" cy="${y(latest.value).toFixed(2)}" r="4" class="line-dot"></circle>
        <line x1="${pad.left}" x2="${width - pad.right}" y1="${height - pad.bottom}" y2="${height - pad.bottom}" class="axis-line"></line>
        <text x="${pad.left}" y="${height - 20}" class="axis-text start">${escapeHtml(cleanPeriodLabel(first.period))}</text>
        <text x="${width - pad.right}" y="${height - 20}" class="axis-text end">${escapeHtml(cleanPeriodLabel(latest.period))}</text>
      </svg>
    `;
    renderMetricTable(
      "fundamentalTrendTable",
      points
        .slice()
        .reverse()
        .map((point, index) => ({ code: item.code, rowIndex: index, ...point })),
      [
        { label: "报告期", value: (row) => cleanPeriodLabel(row.period) },
        { label: fundamentalLabel(metric), value: (row) => format(row.value, suffix) },
      ]
    );
  }

  function renderCompare() {
    renderMetricTable("compareTable", selectedItems(), [
      ...metricColumns(),
      { label: fundamentalLabel("营业收入"), value: (row) => formatFundamental("营业收入", row.fundamentals["营业收入"]?.value) },
      { label: fundamentalLabel("EBITDA"), value: (row) => formatFundamental("EBITDA", row.fundamentals["EBITDA"]?.value) },
      { label: fundamentalLabel("EBITDA利润率"), value: (row) => formatFundamental("EBITDA利润率", row.fundamentals["EBITDA利润率"]?.value) },
      { label: fundamentalLabel("可供分配金额"), value: (row) => formatFundamental("可供分配金额", row.fundamentals["可供分配金额"]?.value) },
      { label: fundamentalLabel("期末出租率"), value: (row) => formatFundamental("期末出租率", row.fundamentals["期末出租率"]?.value) },
      { label: fundamentalLabel("租金收入"), value: (row) => formatFundamental("租金收入", row.fundamentals["租金收入"]?.value) },
    ]);
  }

  function renderPicker() {
    const rows = filteredUniverse();
    $("reitPicker").innerHTML = rows
      .map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.code)} · ${escapeHtml(item.name)}</option>`)
      .join("");
  }

  function renderChips() {
    const rows = state.selected.map((code) => universe.find((item) => item.code === code)).filter(Boolean);
    $("selectedChips").innerHTML = rows.length
      ? rows
          .map(
            (item) => `
              <button class="chip" type="button" data-remove="${escapeHtml(item.code)}">
                ${escapeHtml(item.name)} <span>${escapeHtml(item.code)}</span>
              </button>
            `
          )
          .join("")
      : `<em>未手动选择，当前看板展示筛选范围内代表标的</em>`;
    $("selectedChips").querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selected = state.selected.filter((code) => code !== button.dataset.remove);
        renderAll();
      });
    });
  }

  function selectOnly(code) {
    if (!universe.some((item) => item.code === code)) return;
    state.selected = [code];
    switchView("profile");
    window.location.hash = `profile=${encodeURIComponent(code)}`;
    renderAll();
  }

  function openProfileByInput(value) {
    const item = findReit(value);
    if (!item) {
      $("profileCodeHint").textContent = "没有找到对应 REITs，请检查代码或名称。";
      $("profileCodeHint").classList.add("is-error");
      return;
    }
    $("profileCodeHint").textContent = `${item.code} · ${item.name}`;
    $("profileCodeHint").classList.remove("is-error");
    $("profileCodeInput").value = item.code;
    selectOnly(item.code);
  }

  function addSelected(code) {
    if (!code || state.selected.includes(code)) return;
    state.selected.push(code);
    renderAll();
  }

  function switchView(view) {
    state.view = view;
    const titles = {
      overview: "市场总览",
      signals: "机会风险",
      sectors: "板块模块",
      performance: "涨跌表现",
      valuation: "估值比价",
      fundamental: "基本面业绩",
      profile: "单券画像",
      compare: "组合对比",
    };
    $("boardTitle").textContent = titles[view] || "市场总览";
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
    document.querySelectorAll(".board-view").forEach((section) => {
      section.classList.toggle("is-active", section.id === `${view}View`);
    });
  }

  function renderAll() {
    renderPicker();
    renderChips();
    renderOverview();
    renderSignals();
    renderSectors();
    renderPerformance();
    renderValuation();
    renderFundamentals();
    renderProfile();
    renderCompare();
  }

  function fillAssetFilter() {
    $("assetFilter").innerHTML = assetTypes().map((asset) => `<option value="${escapeHtml(asset)}">${escapeHtml(asset)}</option>`).join("");
  }

  function downloadCompare() {
    const rows = selectedItems();
    const headers = ["代码", "名称", "资产类型", "30日涨跌幅", "年初以来", "P/NAV", "IRR", "派息率", fundamentalLabel("营业收入"), fundamentalLabel("EBITDA"), fundamentalLabel("可供分配金额")];
    const lines = [
      headers,
      ...rows.map((row) => [
        row.code,
        row.name,
        row.assetType,
        row.change30 ?? "",
        row.changeYtd ?? "",
        row.pnav ?? "",
        row.irr ?? "",
        row.dividend ?? "",
        row.fundamentals["营业收入"]?.value ?? "",
        row.fundamentals["EBITDA"]?.value ?? "",
        row.fundamentals["可供分配金额"]?.value ?? "",
      ]),
    ];
    const csv = lines.map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reits_compare.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
    $("profileCodeForm").addEventListener("submit", (event) => {
      event.preventDefault();
      openProfileByInput($("profileCodeInput").value);
    });
    document.querySelectorAll("#historyMetricSwitch button").forEach((button) => {
      button.addEventListener("click", () => {
        state.historyMetric = button.dataset.metric;
        renderProfile();
      });
    });
    document.querySelectorAll("#fundamentalMetricSwitch button").forEach((button) => {
      button.addEventListener("click", () => {
        state.fundamentalMetric = button.dataset.metric;
        renderProfile();
      });
    });
    $("reitSearch").addEventListener("input", (event) => {
      state.query = event.target.value;
      renderAll();
    });
    $("assetFilter").addEventListener("change", (event) => {
      state.assetType = event.target.value;
      renderAll();
    });
    $("addReit").addEventListener("click", () => {
      addSelected($("reitPicker").value);
      switchView(state.selected.length > 1 ? "compare" : "profile");
    });
    $("clearSelection").addEventListener("click", () => {
      state.selected = [];
      renderAll();
    });
    $("downloadCompare").addEventListener("click", downloadCompare);
  }

  function init() {
    fillAssetFilter();
    bindEvents();
    const hashMatch = decodeURIComponent(window.location.hash || "").match(/profile=([^&]+)/);
    if (hashMatch) {
      const item = findReit(hashMatch[1]);
      if (item) {
        state.selected = [item.code];
        state.view = "profile";
        $("profileCodeInput").value = item.code;
      }
    }
    switchView(state.view);
    renderAll();
  }

  init();
})();

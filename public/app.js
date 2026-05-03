/* ═══════════════════════════════════════════════════════════
   StockPro  –  Main Application Logic
   ═══════════════════════════════════════════════════════════ */

const API = "/api";
let products = [];
let chartRevenue = null,
  chartTop = null,
  chartReport = null;

/* ─── HELPERS ───────────────────────────────────────────── */
const fmt = (n) =>
  Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

async function api(path, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Server error");
  return data;
}

function toast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => (t.className = "toast"), 3500);
}

function emptyState(msg = "No data found") {
  return `<div class="empty"><div class="empty-icon">🗂️</div>${msg}</div>`;
}

/* ─── SORT ENGINE ───────────────────────────────────────── */
// State: { wrapperId: { col, dir } }
const _sortState = {};

/**
 * Make a table sortable.
 * @param {string} wrapperId  - id of the .table-wrap div
 * @param {Array}  data       - original data array
 * @param {Array}  cols       - column definitions:
 *   { key, label, render?, numeric?, nosort? }
 *   render(row) → td innerHTML string
 * @param {Function} footerFn - optional fn(data) → tfoot html string
 */
function makeSortableTable(wrapperId, data, cols, footerFn = null) {
  const state = _sortState[wrapperId] || { col: null, dir: 1 };

  function sort(colKey) {
    if (state.col === colKey) {
      state.dir = -state.dir;
    } else {
      state.col = colKey;
      state.dir = 1;
    }
    _sortState[wrapperId] = state;
    render();
  }

  function render() {
    const el = document.getElementById(wrapperId);
    let sorted = [...data];
    if (state.col) {
      sorted.sort((a, b) => {
        let av = a[state.col],
          bv = b[state.col];
        if (av === undefined || av === null) av = "";
        if (bv === undefined || bv === null) bv = "";
        const numA = parseFloat(String(av).replace(/[^0-9.-]/g, ""));
        const numB = parseFloat(String(bv).replace(/[^0-9.-]/g, ""));
        if (!isNaN(numA) && !isNaN(numB)) return (numA - numB) * state.dir;
        return String(av).localeCompare(String(bv)) * state.dir;
      });
    }

    const theadCells = cols
      .map((c) => {
        if (c.nosort) return `<th>${c.label}</th>`;
        const active = state.col === c.key;
        const cls = active ? (state.dir === 1 ? "sort-asc" : "sort-desc") : "";
        return `<th class="sortable ${cls}" onclick="(()=>{window._sortCb_${wrapperId}('${c.key}')})()">${c.label}</th>`;
      })
      .join("");

    const tbodyRows = sorted
      .map(
        (row) =>
          `<tr>${cols.map((c) => `<td>${c.render ? c.render(row) : (row[c.key] ?? "—")}</td>`).join("")}</tr>`,
      )
      .join("");

    const tfoot = footerFn ? footerFn(sorted) : "";

    el.innerHTML = `<table>
      <thead><tr>${theadCells}</tr></thead>
      <tbody>${tbodyRows}</tbody>
      ${tfoot}
    </table>`;

    // register callback
    window[`_sortCb_${wrapperId}`] = sort;
  }

  window[`_sortCb_${wrapperId}`] = sort;
  render();
}

/* ─── NAVIGATION ────────────────────────────────────────── */
const pageTitles = {
  dashboard: "🏠 Dashboard",
  products: "🏷️ Products",
  purchases: "🛒 Purchases",
  sales: "💰 Sales",
  stock: "📊 Stock Levels",
  reports: "📈 Reports",
};

document.querySelectorAll(".nav-item").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const page = link.dataset.page;
    document.querySelectorAll(".nav-item").forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    document.getElementById(`page-${page}`).classList.add("active");
    document.getElementById("pageTitle").textContent = pageTitles[page];
    document.getElementById("sidebar").classList.remove("open");
    if (page === "dashboard") loadDashboard();
    if (page === "products") loadProductTable();
    if (page === "purchases") loadPurchases();
    if (page === "sales") loadSales();
    if (page === "stock") loadStock();
    if (page === "reports") loadReports();
  });
});

document.getElementById("hamburger").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

/* ─── DATE ──────────────────────────────────────────────── */
document.getElementById("topbarDate").textContent = new Date().toLocaleDateString("fr-FR", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/* ─── PRODUCTS ──────────────────────────────────────────── */
async function loadProducts() {
  products = await api("/products");
  return products;
}

async function loadProductTable() {
  await loadProducts();
  renderProductTable(products);
}

function renderProductTable(data) {
  const el = document.getElementById("productTable");
  if (!data.length) {
    el.innerHTML = emptyState("No products yet.");
    return;
  }
  makeSortableTable("productTable", data, [
    { key: "id", label: "#", render: (r) => `<span class="badge badge-green">${r.id}</span>` },
    { key: "name", label: "Name", render: (r) => `<strong>${r.name}</strong>` },
    { key: "unit", label: "Unit" },
    {
      key: "created_at",
      label: "Created",
      render: (r) => (r.created_at ? r.created_at.slice(0, 10) : ""),
    },
    {
      key: "_del",
      label: "",
      nosort: true,
      render: (r) =>
        `<button class="btn btn-danger btn-sm" onclick="deleteProduct('${r.id}')">🗑</button>`,
    },
  ]);
}

document.getElementById("searchProduct").addEventListener("input", function () {
  const q = this.value.toLowerCase();
  renderProductTable(products.filter((p) => p.name.toLowerCase().includes(q)));
});

document.getElementById("formProduct").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("pName").value;
  const unit = document.getElementById("pUnit").value;
  try {
    await api("/products", "POST", { name, unit });
    toast(`Product "${name}" added!`);
    e.target.reset();
    document.getElementById("pUnit").value = "unit";
    loadProductTable();
    loadProducts(); // refresh selects
  } catch (err) {
    toast(err.message, "error");
  }
});

async function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;
  await api(`/products/${id}`, "DELETE");
  toast("Product deleted", "warn");
  loadProductTable();
}

/* ─── FILL SELECTS ──────────────────────────────────────── */
function fillSelect(selectId, list, selected = null) {
  const el = document.getElementById(selectId);
  el.innerHTML =
    '<option value="">— Select product —</option>' +
    list
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id == selected ? "selected" : ""}>${p.name} (${p.unit})</option>`,
      )
      .join("");
}

/* ─── PURCHASES ─────────────────────────────────────────── */
async function loadPurchases() {
  await loadProducts();
  fillSelect("puProduct", products);
  // defaults
  const fromEl = document.getElementById("puFilterFrom");
  const toEl = document.getElementById("puFilterTo");
  if (!fromEl.value) {
    const d = new Date();
    d.setDate(1);
    fromEl.value = d.toISOString().slice(0, 10);
  }
  if (!toEl.value) toEl.value = today();

  const from = fromEl.value,
    to = toEl.value;
  const data = await api(`/purchases?from=${from}&to=${to}`);
  renderPurchaseTable(data);
}

function renderPurchaseTable(data) {
  const el = document.getElementById("purchaseTable");
  if (!data.length) {
    el.innerHTML = emptyState("No purchases in this period.");
    return;
  }
  const footer = (sorted) => {
    const total = sorted.reduce((s, r) => s + r.total_cost, 0);
    return `<tfoot><tr style="background:var(--surface2)">
      <td colspan="4" style="padding:10px 16px;font-weight:700">Total</td>
      <td style="padding:10px 16px;font-weight:700;color:var(--danger)">${fmt(total)}</td>
      <td colspan="2"></td>
    </tr></tfoot>`;
  };
  makeSortableTable(
    "purchaseTable",
    data,
    [
      { key: "date", label: "Date" },
      {
        key: "product_name",
        label: "Product",
        render: (r) => `<strong>${r.product_name}</strong>`,
      },
      { key: "quantity", label: "Qty", render: (r) => `${r.quantity} ${r.unit}`, numeric: true },
      { key: "unit_cost", label: "Unit Cost", render: (r) => fmt(r.unit_cost) },
      {
        key: "total_cost",
        label: "Total Cost",
        render: (r) => `<span class="badge badge-red">${fmt(r.total_cost)}</span>`,
      },
      { key: "supplier", label: "Supplier", render: (r) => r.supplier || "—" },
      {
        key: "_del",
        label: "",
        nosort: true,
        render: (r) =>
          `<button class="btn btn-danger btn-sm" onclick="deletePurchase('${r.id}')">🗑</button>`,
      },
    ],
    footer,
  );
}

// Live total calculation
["puQty", "puCost"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    const q = parseFloat(document.getElementById("puQty").value) || 0;
    const c = parseFloat(document.getElementById("puCost").value) || 0;
    document.getElementById("puTotal").textContent = fmt(q * c);
  });
});

document.getElementById("formPurchase").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/purchases", "POST", {
      product_id: document.getElementById("puProduct").value,
      date: document.getElementById("puDate").value,
      quantity: document.getElementById("puQty").value,
      unit_cost: document.getElementById("puCost").value,
      supplier: document.getElementById("puSupplier").value,
    });
    toast("Purchase saved! ✅");
    e.target.reset();
    document.getElementById("puDate").value = today();
    document.getElementById("puTotal").textContent = "0.00";
    loadPurchases();
  } catch (err) {
    toast(err.message, "error");
  }
});

async function deletePurchase(id) {
  if (!confirm("Delete this purchase?")) return;
  await api(`/purchases/${id}`, "DELETE");
  toast("Purchase deleted", "warn");
  loadPurchases();
}

/* ─── SALES ─────────────────────────────────────────────── */
async function loadSales() {
  await loadProducts();
  fillSelect("saProduct", products);
  const fromEl = document.getElementById("saFilterFrom");
  const toEl = document.getElementById("saFilterTo");
  if (!fromEl.value) {
    const d = new Date();
    d.setDate(1);
    fromEl.value = d.toISOString().slice(0, 10);
  }
  if (!toEl.value) toEl.value = today();

  const from = fromEl.value,
    to = toEl.value;
  const data = await api(`/sales?from=${from}&to=${to}`);
  renderSaleTable(data);
}

function renderSaleTable(data) {
  const el = document.getElementById("saleTable");
  if (!data.length) {
    el.innerHTML = emptyState("No sales in this period.");
    return;
  }
  const footer = (sorted) => {
    const total = sorted.reduce((s, r) => s + r.total_price, 0);
    return `<tfoot><tr style="background:var(--surface2)">
      <td colspan="4" style="padding:10px 16px;font-weight:700">Total</td>
      <td style="padding:10px 16px;font-weight:700;color:var(--success)">${fmt(total)}</td>
      <td colspan="2"></td>
    </tr></tfoot>`;
  };
  makeSortableTable(
    "saleTable",
    data,
    [
      { key: "date", label: "Date" },
      {
        key: "product_name",
        label: "Product",
        render: (r) => `<strong>${r.product_name}</strong>`,
      },
      { key: "quantity", label: "Qty", render: (r) => `${r.quantity} ${r.unit}` },
      { key: "unit_price", label: "Unit Price", render: (r) => fmt(r.unit_price) },
      {
        key: "total_price",
        label: "Revenue",
        render: (r) => `<span class="badge badge-green">${fmt(r.total_price)}</span>`,
      },
      { key: "client", label: "Client", render: (r) => r.client || "—" },
      {
        key: "_del",
        label: "",
        nosort: true,
        render: (r) =>
          `<button class="btn btn-danger btn-sm" onclick="deleteSale('${r.id}')">🗑</button>`,
      },
    ],
    footer,
  );
}

["saQty", "saPrice"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    const q = parseFloat(document.getElementById("saQty").value) || 0;
    const p = parseFloat(document.getElementById("saPrice").value) || 0;
    document.getElementById("saTotal").textContent = fmt(q * p);
  });
});

document.getElementById("formSale").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/sales", "POST", {
      product_id: document.getElementById("saProduct").value,
      date: document.getElementById("saDate").value,
      quantity: document.getElementById("saQty").value,
      unit_price: document.getElementById("saPrice").value,
      client: document.getElementById("saClient").value,
    });
    toast("Sale saved! 💰");
    e.target.reset();
    document.getElementById("saDate").value = today();
    document.getElementById("saTotal").textContent = "0.00";
    loadSales();
  } catch (err) {
    toast(err.message, "error");
  }
});

async function deleteSale(id) {
  if (!confirm("Delete this sale?")) return;
  await api(`/sales/${id}`, "DELETE");
  toast("Sale deleted", "warn");
  loadSales();
}

/* ─── STOCK ─────────────────────────────────────────────── */
async function loadStock() {
  const data = await api("/stock");
  renderStockTable(data);
  document.getElementById("searchStock").addEventListener("input", function () {
    const q = this.value.toLowerCase();
    renderStockTable(data.filter((r) => r.name.toLowerCase().includes(q)));
  });
}

function renderStockTable(data) {
  const el = document.getElementById("stockTable");
  if (!data.length) {
    el.innerHTML = emptyState("No stock data.");
    return;
  }
  makeSortableTable("stockTable", data, [
    { key: "name", label: "Product", render: (r) => `<strong>${r.name}</strong>` },
    { key: "unit", label: "Unit" },
    { key: "total_purchased", label: "Purchased" },
    { key: "total_sold", label: "Sold" },
    {
      key: "stock_remaining",
      label: "Remaining",
      render: (r) => `<strong>${r.stock_remaining}</strong>`,
    },
    {
      key: "total_cost_purchased",
      label: "Total Cost",
      render: (r) => fmt(r.total_cost_purchased),
    },
    {
      key: "stock_remaining",
      label: "Status",
      nosort: true,
      render: (r) => {
        const cls =
          r.stock_remaining <= 0
            ? "badge-red"
            : r.stock_remaining < 5
              ? "badge-yellow"
              : "badge-green";
        const text =
          r.stock_remaining <= 0
            ? "Out of stock"
            : r.stock_remaining < 5
              ? "Low stock"
              : "In stock";
        return `<span class="badge ${cls}">${text}</span>`;
      },
    },
  ]);
}

/* ─── DASHBOARD ─────────────────────────────────────────── */
async function loadDashboard() {
  const [dash, daily, top] = await Promise.all([
    api("/stats/dashboard"),
    api("/stats/daily-sales"),
    api("/stats/top-products"),
  ]);

  // KPI Cards
  document.getElementById("kpiGrid").innerHTML = `
    <div class="kpi-card green">
      <span class="kpi-label">Total Revenue</span>
      <span class="kpi-value">${fmt(dash.totalRevenue)}</span>
      <span class="kpi-icon">💰</span>
    </div>
    <div class="kpi-card red">
      <span class="kpi-label">Total Cost</span>
      <span class="kpi-value">${fmt(dash.totalCost)}</span>
      <span class="kpi-icon">🛒</span>
    </div>
    <div class="kpi-card blue">
      <span class="kpi-label">Net Profit</span>
      <span class="kpi-value" style="color:${dash.totalProfit >= 0 ? "var(--success)" : "var(--danger)"}">${fmt(dash.totalProfit)}</span>
      <span class="kpi-icon">📈</span>
    </div>
    <div class="kpi-card purple">
      <span class="kpi-label">Products</span>
      <span class="kpi-value">${dash.totalProducts}</span>
      <span class="kpi-icon">🏷️</span>
    </div>
    <div class="kpi-card teal">
      <span class="kpi-label">Today's Sales</span>
      <span class="kpi-value">${fmt(dash.todaySales)}</span>
      <span class="kpi-icon">📅</span>
    </div>
    <div class="kpi-card yellow">
      <span class="kpi-label">Today's Purchases</span>
      <span class="kpi-value">${fmt(dash.todayPurchases)}</span>
      <span class="kpi-icon">🏬</span>
    </div>
  `;

  // Revenue chart – last 14 days
  const last14 = daily.slice(0, 14).reverse();
  buildLineChart(
    "chartRevenue",
    chartRevenue,
    last14.map((d) => d.date),
    last14.map((d) => d.revenue),
    "Revenue",
    "#6c63ff",
  );

  // Top products doughnut
  buildDoughnut("chartTop", chartTop, top.slice(0, 6));

  // Low stock table
  const lowEl = document.getElementById("lowStockTable");
  if (!dash.lowStock.length) {
    lowEl.innerHTML = `<div class="empty"><div class="empty-icon">✅</div>All products have sufficient stock.</div>`;
  } else {
    lowEl.innerHTML = `<table>
      <thead><tr><th>Product</th><th>Remaining</th><th>Status</th></tr></thead>
      <tbody>${dash.lowStock
        .map(
          (r) => `<tr>
        <td><strong>${r.name}</strong></td>
        <td>${r.remaining}</td>
        <td><span class="badge ${r.remaining <= 0 ? "badge-red" : "badge-yellow"}">${r.remaining <= 0 ? "Out of stock" : "Low stock"}</span></td>
      </tr>`,
        )
        .join("")}</tbody>
    </table>`;
  }
}

/* ─── REPORTS ───────────────────────────────────────────── */
async function loadReports() {
  const fromEl = document.getElementById("rpFrom");
  const toEl = document.getElementById("rpTo");
  if (!fromEl.value) {
    const d = new Date();
    d.setDate(1);
    fromEl.value = d.toISOString().slice(0, 10);
  }
  if (!toEl.value) toEl.value = today();

  const [daily, purchases] = await Promise.all([
    api(`/stats/daily-sales?from=${fromEl.value}&to=${toEl.value}`),
    api(`/purchases?from=${fromEl.value}&to=${toEl.value}`),
  ]);

  // Build cost-per-day map
  const costMap = {};
  purchases.forEach((p) => {
    costMap[p.date] = (costMap[p.date] || 0) + p.total_cost;
  });

  renderReportTable(daily, costMap);
  buildReportChart(daily, costMap);
  loadProductProfitTable(fromEl.value, toEl.value);
}

function renderReportTable(daily, costMap) {
  const el = document.getElementById("reportTable");
  if (!daily.length) {
    el.innerHTML = emptyState("No sales in selected period.");
    return;
  }

  // Enrich data with cost & profit so sort engine can use them
  const enriched = daily.map((r) => {
    const cost = costMap[r.date] || 0;
    return { ...r, cost, profit: r.revenue - cost };
  });

  const totalRev = enriched.reduce((s, r) => s + r.revenue, 0);
  const totalUnits = enriched.reduce((s, r) => s + r.units_sold, 0);
  const allCosts = enriched.reduce((s, r) => s + r.cost, 0);

  const footer = () => `<tfoot><tr style="background:var(--surface2);font-weight:700">
    <td style="padding:10px 16px">TOTAL</td>
    <td></td>
    <td style="padding:10px 16px">${totalUnits}</td>
    <td style="padding:10px 16px;color:var(--success)">${fmt(totalRev)}</td>
    <td style="padding:10px 16px;color:var(--danger)">${fmt(allCosts)}</td>
    <td style="padding:10px 16px;color:${totalRev - allCosts >= 0 ? "var(--success)" : "var(--danger)"}">${fmt(totalRev - allCosts)}</td>
  </tr></tfoot>`;

  makeSortableTable(
    "reportTable",
    enriched,
    [
      { key: "date", label: "Date", render: (r) => `<strong>${r.date}</strong>` },
      { key: "transactions", label: "Transactions" },
      { key: "units_sold", label: "Units Sold" },
      {
        key: "revenue",
        label: "Revenue",
        render: (r) => `<span style="color:var(--success)">${fmt(r.revenue)}</span>`,
      },
      {
        key: "cost",
        label: "Cost",
        render: (r) => `<span style="color:var(--danger)">${fmt(r.cost)}</span>`,
      },
      {
        key: "profit",
        label: "Profit",
        render: (r) =>
          `<span style="color:${r.profit >= 0 ? "var(--success)" : "var(--danger)"};font-weight:700">${fmt(r.profit)}</span>`,
      },
    ],
    footer,
  );
}

/* ─── PRODUCT PROFITABILITY ─────────────────────────────── */
async function loadProductProfitTable(from, to) {
  const data = await api(`/stats/product-profit?from=${from}&to=${to}`);
  renderProductProfitTable(data);
}

function renderProductProfitTable(data) {
  const el = document.getElementById("productProfitTable");
  if (!data || !data.length) {
    el.innerHTML = emptyState("No sales in this period.");
    return;
  }
  const totRevenue = data.reduce((s, r) => s + r.revenue, 0);
  const totCost = data.reduce((s, r) => s + r.cost_of_sold, 0);
  const totProfit = data.reduce((s, r) => s + r.gross_profit, 0);
  const totUnits = data.reduce((s, r) => s + r.units_sold, 0);
  const avgMargin = totRevenue > 0 ? (totProfit / totRevenue) * 100 : 0;

  const footer = () => `<tfoot><tr style="background:var(--surface2);font-weight:700">
    <td style="padding:10px 16px">TOTAL</td>
    <td></td>
    <td style="padding:10px 16px">${totUnits}</td>
    <td></td>
    <td style="padding:10px 16px;color:var(--danger)">${fmt(totCost)}</td>
    <td style="padding:10px 16px;color:var(--success)">${fmt(totRevenue)}</td>
    <td style="padding:10px 16px;color:${totProfit >= 0 ? "var(--success)" : "var(--danger)"}">${fmt(totProfit)}</td>
    <td style="padding:10px 16px">${avgMargin.toFixed(1)}%</td>
  </tr></tfoot>`;

  makeSortableTable(
    "productProfitTable",
    data,
    [
      { key: "name", label: "Product", render: (r) => `<strong>${r.name}</strong>` },
      { key: "unit", label: "Unit" },
      { key: "units_sold", label: "Qty Sold" },
      { key: "avg_unit_cost", label: "Avg Cost/Unit", render: (r) => fmt(r.avg_unit_cost) },
      {
        key: "cost_of_sold",
        label: "Total Cost",
        render: (r) => `<span style="color:var(--danger)">${fmt(r.cost_of_sold)}</span>`,
      },
      {
        key: "revenue",
        label: "Revenue",
        render: (r) => `<span style="color:var(--success)">${fmt(r.revenue)}</span>`,
      },
      {
        key: "gross_profit",
        label: "Gross Profit",
        render: (r) =>
          `<span style="color:${r.gross_profit >= 0 ? "var(--success)" : "var(--danger)"};font-weight:700">${fmt(r.gross_profit)}</span>`,
      },
      {
        key: "margin",
        label: "Margin %",
        render: (r) => {
          const cls =
            r.margin >= 30 ? "badge-green" : r.margin >= 10 ? "badge-yellow" : "badge-red";
          return `<span class="badge ${cls}">${r.margin.toFixed(1)}%</span>`;
        },
      },
    ],
    footer,
  );
}

async function exportProductProfit() {
  const from = document.getElementById("rpFrom").value;
  const to = document.getElementById("rpTo").value;
  const data = await api(`/stats/product-profit?from=${from}&to=${to}`);
  if (!data.length) {
    toast("No data to export", "warn");
    return;
  }
  const rows = data.map((r) => ({
    Product: r.name,
    Unit: r.unit,
    "Qty Sold": r.units_sold,
    "Avg Cost/Unit": +r.avg_unit_cost.toFixed(4),
    "Total Cost": +r.cost_of_sold.toFixed(2),
    Revenue: +r.revenue.toFixed(2),
    "Gross Profit": +r.gross_profit.toFixed(2),
    "Margin %": +r.margin.toFixed(2),
  }));
  exportExcel(rows, `product_profit_${from}_${to}.xlsx`);
  toast("📥 Product profitability exported!");
}

/* ─── CHARTS ────────────────────────────────────────────── */
const chartDefaults = {
  color: "#e8eaf6",
  font: { family: "Segoe UI, system-ui, sans-serif", size: 12 },
};
Chart.defaults.color = chartDefaults.color;
Chart.defaults.font = chartDefaults.font;

function buildLineChart(canvasId, existingChart, labels, data, label, color) {
  if (existingChart) existingChart.destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 250);
  gradient.addColorStop(0, color + "55");
  gradient.addColorStop(1, color + "00");
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label,
          data,
          borderColor: color,
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: color,
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "#2e3347" } },
        y: { grid: { color: "#2e3347" }, beginAtZero: true },
      },
    },
  });
  if (canvasId === "chartRevenue") chartRevenue = chart;
  return chart;
}

function buildDoughnut(canvasId, existingChart, data) {
  if (existingChart) existingChart.destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  const colors = ["#6c63ff", "#00d4aa", "#ffb703", "#ff4d6d", "#a855f7", "#06d6a0"];
  const chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: data.map((d) => d.name),
      datasets: [
        {
          data: data.map((d) => d.revenue),
          backgroundColor: colors,
          borderColor: "#1a1d27",
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 12 } },
      },
    },
  });
  chartTop = chart;
}

function buildReportChart(daily, costMap) {
  if (chartReport) chartReport.destroy();
  const labels = [...daily].reverse().map((d) => d.date);
  const revenues = [...daily].reverse().map((d) => d.revenue);
  const costs = [...daily].reverse().map((d) => costMap[d.date] || 0);
  const ctx = document.getElementById("chartReport").getContext("2d");
  chartReport = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Revenue",
          data: revenues,
          backgroundColor: "#06d6a055",
          borderColor: "#06d6a0",
          borderWidth: 2,
        },
        {
          label: "Cost",
          data: costs,
          backgroundColor: "#ff4d6d55",
          borderColor: "#ff4d6d",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: true } },
      scales: {
        x: { grid: { color: "#2e3347" } },
        y: { grid: { color: "#2e3347" }, beginAtZero: true },
      },
    },
  });
}

/* ─── INIT ──────────────────────────────────────────────── */
window.addEventListener("DOMContentLoaded", () => {
  // Set today's date on forms
  document.getElementById("puDate").value = today();
  document.getElementById("saDate").value = today();
  loadDashboard();
});

/* ═══════════════════════════════════════════════════════════
   EXCEL EXPORT / IMPORT  (SheetJS)
   ═══════════════════════════════════════════════════════════ */

/* ── Generic export helper ─────────────────────────────── */
function exportExcel(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, filename);
}

/* ── EXPORT PURCHASES ───────────────────────────────────── */
async function exportPurchases() {
  const from = document.getElementById("puFilterFrom").value;
  const to = document.getElementById("puFilterTo").value;
  const data = await api(`/purchases?from=${from}&to=${to}`);
  if (!data.length) {
    toast("No data to export", "warn");
    return;
  }
  const rows = data.map((r) => ({
    Date: r.date,
    Product: r.product_name,
    Unit: r.unit,
    Quantity: r.quantity,
    "Unit Cost": r.unit_cost,
    "Total Cost": r.total_cost,
    Supplier: r.supplier || "",
  }));
  exportExcel(rows, `purchases_${from}_${to}.xlsx`);
  toast("📥 Purchases exported!");
}

/* ── EXPORT SALES ───────────────────────────────────────── */
async function exportSales() {
  const from = document.getElementById("saFilterFrom").value;
  const to = document.getElementById("saFilterTo").value;
  const data = await api(`/sales?from=${from}&to=${to}`);
  if (!data.length) {
    toast("No data to export", "warn");
    return;
  }
  const rows = data.map((r) => ({
    Date: r.date,
    Product: r.product_name,
    Unit: r.unit,
    Quantity: r.quantity,
    "Unit Price": r.unit_price,
    "Total Revenue": r.total_price,
    Client: r.client || "",
  }));
  exportExcel(rows, `sales_${from}_${to}.xlsx`);
  toast("📥 Sales exported!");
}

/* ── EXPORT STOCK ───────────────────────────────────────── */
async function exportStock() {
  const data = await api("/stock");
  if (!data.length) {
    toast("No data to export", "warn");
    return;
  }
  const rows = data.map((r) => ({
    Product: r.name,
    Unit: r.unit,
    Purchased: r.total_purchased,
    Sold: r.total_sold,
    Remaining: r.stock_remaining,
    "Total Cost Purchased": r.total_cost_purchased,
    Status:
      r.stock_remaining <= 0 ? "Out of stock" : r.stock_remaining < 5 ? "Low stock" : "In stock",
  }));
  exportExcel(rows, `stock_${today()}.xlsx`);
  toast("📥 Stock exported!");
}

/* ── EXPORT REPORTS ─────────────────────────────────────── */
let _lastReportData = null; // populated by loadReports

async function exportReports() {
  const from = document.getElementById("rpFrom").value;
  const to = document.getElementById("rpTo").value;
  const [daily, purchases] = await Promise.all([
    api(`/stats/daily-sales?from=${from}&to=${to}`),
    api(`/purchases?from=${from}&to=${to}`),
  ]);
  if (!daily.length) {
    toast("No data to export", "warn");
    return;
  }
  const costMap = {};
  purchases.forEach((p) => {
    costMap[p.date] = (costMap[p.date] || 0) + p.total_cost;
  });
  const rows = daily.map((r) => ({
    Date: r.date,
    Transactions: r.transactions,
    "Units Sold": r.units_sold,
    Revenue: r.revenue,
    Cost: costMap[r.date] || 0,
    Profit: r.revenue - (costMap[r.date] || 0),
  }));
  exportExcel(rows, `report_${from}_${to}.xlsx`);
  toast("📥 Report exported!");
}

/* ── IMPORT TEMPLATE DOWNLOADS ──────────────────────────── */
function downloadPurchaseTemplate() {
  const rows = [
    {
      product_name: "Example Product",
      date: today(),
      quantity: 10,
      unit_cost: 5.5,
      supplier: "Supplier A",
    },
  ];
  exportExcel(rows, "purchase_template.xlsx");
}

function downloadSaleTemplate() {
  const rows = [
    {
      product_name: "Example Product",
      date: today(),
      quantity: 5,
      unit_price: 12.0,
      client: "Client A",
    },
  ];
  exportExcel(rows, "sale_template.xlsx");
}

/* ── IMPORT PURCHASES ───────────────────────────────────── */
async function importPurchases(input) {
  const resultEl = document.getElementById("importPurchaseResult");
  resultEl.innerHTML = `<p class="import-progress">⏳ Reading file…</p>`;
  const file = input.files[0];
  if (!file) return;
  const data = await readExcelFile(file);
  if (!data.length) {
    resultEl.innerHTML = `<p class="import-error">❌ Empty file.</p>`;
    return;
  }

  await loadProducts();
  const productMap = {};
  products.forEach((p) => {
    productMap[p.name.toLowerCase().trim()] = p.id;
  });

  let ok = 0,
    errors = [];
  resultEl.innerHTML = `<p class="import-progress">⏳ Importing 0 / ${data.length}…</p>`;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const pName = String(row["product_name"] || row["Product"] || "").trim();
    const pid = productMap[pName.toLowerCase()];
    if (!pid) {
      errors.push(`Row ${i + 2}: product "${pName}" not found`);
      continue;
    }
    const date = formatExcelDate(row["date"] || row["Date"]);
    const quantity = parseFloat(row["quantity"] || row["Quantity"]);
    const unit_cost = parseFloat(row["unit_cost"] || row["Unit Cost"]);
    if (!date || isNaN(quantity) || isNaN(unit_cost)) {
      errors.push(`Row ${i + 2}: missing or invalid date / quantity / unit_cost`);
      continue;
    }
    try {
      await api("/purchases", "POST", {
        product_id: pid,
        date,
        quantity,
        unit_cost,
        supplier: String(row["supplier"] || row["Supplier"] || "").trim(),
      });
      ok++;
      resultEl.innerHTML = `<p class="import-progress">⏳ Importing ${ok} / ${data.length}…</p>`;
    } catch (e) {
      errors.push(`Row ${i + 2}: ${e.message}`);
    }
  }

  input.value = "";
  showImportResult(resultEl, ok, errors);
  if (ok > 0) loadPurchases();
}

/* ── IMPORT SALES ───────────────────────────────────────── */
async function importSales(input) {
  const resultEl = document.getElementById("importSaleResult");
  resultEl.innerHTML = `<p class="import-progress">⏳ Reading file…</p>`;
  const file = input.files[0];
  if (!file) return;
  const data = await readExcelFile(file);
  if (!data.length) {
    resultEl.innerHTML = `<p class="import-error">❌ Empty file.</p>`;
    return;
  }

  await loadProducts();
  const productMap = {};
  products.forEach((p) => {
    productMap[p.name.toLowerCase().trim()] = p.id;
  });

  let ok = 0,
    errors = [];
  resultEl.innerHTML = `<p class="import-progress">⏳ Importing 0 / ${data.length}…</p>`;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const pName = String(row["product_name"] || row["Product"] || "").trim();
    const pid = productMap[pName.toLowerCase()];
    if (!pid) {
      errors.push(`Row ${i + 2}: product "${pName}" not found`);
      continue;
    }
    const date = formatExcelDate(row["date"] || row["Date"]);
    const quantity = parseFloat(row["quantity"] || row["Quantity"]);
    const unit_price = parseFloat(row["unit_price"] || row["Unit Price"]);
    if (!date || isNaN(quantity) || isNaN(unit_price)) {
      errors.push(`Row ${i + 2}: missing or invalid date / quantity / unit_price`);
      continue;
    }
    try {
      await api("/sales", "POST", {
        product_id: pid,
        date,
        quantity,
        unit_price,
        client: String(row["client"] || row["Client"] || "").trim(),
      });
      ok++;
      resultEl.innerHTML = `<p class="import-progress">⏳ Importing ${ok} / ${data.length}…</p>`;
    } catch (e) {
      errors.push(`Row ${i + 2}: ${e.message}`);
    }
  }

  input.value = "";
  showImportResult(resultEl, ok, errors);
  if (ok > 0) loadSales();
}

/* ── IMPORT HELPERS ─────────────────────────────────────── */
function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      resolve(XLSX.utils.sheet_to_json(ws, { defval: "" }));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function formatExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

function showImportResult(el, ok, errors) {
  let html = `<p class="import-ok">✅ ${ok} row(s) imported successfully.</p>`;
  if (errors.length) {
    html += `<details class="import-errors"><summary>⚠️ ${errors.length} error(s)</summary><ul>${errors.map((e) => `<li>${e}</li>`).join("")}</ul></details>`;
  }
  el.innerHTML = html;
}

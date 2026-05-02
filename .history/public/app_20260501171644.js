/* ═══════════════════════════════════════════════════════════
   StockPro  –  Main Application Logic
   ═══════════════════════════════════════════════════════════ */

const API = 'http://localhost:3000/api';
let products = [];
let chartRevenue = null, chartTop = null, chartReport = null;

/* ─── HELPERS ───────────────────────────────────────────── */
const fmt  = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Server error');
  return data;
}

function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => (t.className = 'toast'), 3500);
}

function emptyState(msg = 'No data found') {
  return `<div class="empty"><div class="empty-icon">🗂️</div>${msg}</div>`;
}

/* ─── NAVIGATION ────────────────────────────────────────── */
const pageTitles = {
  dashboard: '🏠 Dashboard',
  products:  '🏷️ Products',
  purchases: '🛒 Purchases',
  sales:     '💰 Sales',
  stock:     '📊 Stock Levels',
  reports:   '📈 Reports'
};

document.querySelectorAll('.nav-item').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const page = link.dataset.page;
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.getElementById('pageTitle').textContent = pageTitles[page];
    document.getElementById('sidebar').classList.remove('open');
    if (page === 'dashboard') loadDashboard();
    if (page === 'products')  loadProductTable();
    if (page === 'purchases') loadPurchases();
    if (page === 'sales')     loadSales();
    if (page === 'stock')     loadStock();
    if (page === 'reports')   loadReports();
  });
});

document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

/* ─── DATE ──────────────────────────────────────────────── */
document.getElementById('topbarDate').textContent = new Date().toLocaleDateString('fr-FR', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

/* ─── PRODUCTS ──────────────────────────────────────────── */
async function loadProducts() {
  products = await api('/products');
  return products;
}

async function loadProductTable() {
  await loadProducts();
  renderProductTable(products);
}

function renderProductTable(data) {
  const el = document.getElementById('productTable');
  if (!data.length) { el.innerHTML = emptyState('No products yet.'); return; }
  el.innerHTML = `<table>
    <thead><tr>
      <th>#</th><th>Name</th><th>Unit</th><th>Created</th><th></th>
    </tr></thead>
    <tbody>
      ${data.map(p => `<tr>
        <td><span class="badge badge-green">${p.id}</span></td>
        <td><strong>${p.name}</strong></td>
        <td>${p.unit}</td>
        <td>${p.created_at ? p.created_at.slice(0,10) : ''}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">🗑</button></td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

document.getElementById('searchProduct').addEventListener('input', function () {
  const q = this.value.toLowerCase();
  renderProductTable(products.filter(p => p.name.toLowerCase().includes(q)));
});

document.getElementById('formProduct').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('pName').value;
  const unit = document.getElementById('pUnit').value;
  try {
    await api('/products', 'POST', { name, unit });
    toast(`Product "${name}" added!`);
    e.target.reset();
    document.getElementById('pUnit').value = 'unit';
    loadProductTable();
    loadProducts(); // refresh selects
  } catch (err) { toast(err.message, 'error'); }
});

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  await api(`/products/${id}`, 'DELETE');
  toast('Product deleted', 'warn');
  loadProductTable();
}

/* ─── FILL SELECTS ──────────────────────────────────────── */
function fillSelect(selectId, list, selected = null) {
  const el = document.getElementById(selectId);
  el.innerHTML = '<option value="">— Select product —</option>' +
    list.map(p => `<option value="${p.id}" ${p.id == selected ? 'selected' : ''}>${p.name} (${p.unit})</option>`).join('');
}

/* ─── PURCHASES ─────────────────────────────────────────── */
async function loadPurchases() {
  await loadProducts();
  fillSelect('puProduct', products);
  // defaults
  const fromEl = document.getElementById('puFilterFrom');
  const toEl   = document.getElementById('puFilterTo');
  if (!fromEl.value) { const d = new Date(); d.setDate(1); fromEl.value = d.toISOString().slice(0,10); }
  if (!toEl.value)   toEl.value = today();

  const from = fromEl.value, to = toEl.value;
  const data = await api(`/purchases?from=${from}&to=${to}`);
  renderPurchaseTable(data);
}

function renderPurchaseTable(data) {
  const el = document.getElementById('purchaseTable');
  if (!data.length) { el.innerHTML = emptyState('No purchases in this period.'); return; }
  const total = data.reduce((s, r) => s + r.total_cost, 0);
  el.innerHTML = `<table>
    <thead><tr>
      <th>Date</th><th>Product</th><th>Qty</th><th>Unit Cost</th>
      <th>Total Cost</th><th>Supplier</th><th></th>
    </tr></thead>
    <tbody>
      ${data.map(r => `<tr>
        <td>${r.date}</td>
        <td><strong>${r.product_name}</strong></td>
        <td>${r.quantity} ${r.unit}</td>
        <td>${fmt(r.unit_cost)}</td>
        <td><span class="badge badge-red">${fmt(r.total_cost)}</span></td>
        <td>${r.supplier || '—'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deletePurchase(${r.id})">🗑</button></td>
      </tr>`).join('')}
    </tbody>
    <tfoot><tr style="background:var(--surface2)">
      <td colspan="4" style="padding:10px 16px;font-weight:700">Total</td>
      <td style="padding:10px 16px;font-weight:700;color:var(--danger)">${fmt(total)}</td>
      <td colspan="2"></td>
    </tr></tfoot>
  </table>`;
}

// Live total calculation
['puQty','puCost'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    const q = parseFloat(document.getElementById('puQty').value) || 0;
    const c = parseFloat(document.getElementById('puCost').value) || 0;
    document.getElementById('puTotal').textContent = fmt(q * c);
  });
});

document.getElementById('formPurchase').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/purchases', 'POST', {
      product_id: document.getElementById('puProduct').value,
      date:       document.getElementById('puDate').value,
      quantity:   document.getElementById('puQty').value,
      unit_cost:  document.getElementById('puCost').value,
      supplier:   document.getElementById('puSupplier').value
    });
    toast('Purchase saved! ✅');
    e.target.reset();
    document.getElementById('puDate').value = today();
    document.getElementById('puTotal').textContent = '0.00';
    loadPurchases();
  } catch (err) { toast(err.message, 'error'); }
});

async function deletePurchase(id) {
  if (!confirm('Delete this purchase?')) return;
  await api(`/purchases/${id}`, 'DELETE');
  toast('Purchase deleted', 'warn');
  loadPurchases();
}

/* ─── SALES ─────────────────────────────────────────────── */
async function loadSales() {
  await loadProducts();
  fillSelect('saProduct', products);
  const fromEl = document.getElementById('saFilterFrom');
  const toEl   = document.getElementById('saFilterTo');
  if (!fromEl.value) { const d = new Date(); d.setDate(1); fromEl.value = d.toISOString().slice(0,10); }
  if (!toEl.value)   toEl.value = today();

  const from = fromEl.value, to = toEl.value;
  const data = await api(`/sales?from=${from}&to=${to}`);
  renderSaleTable(data);
}

function renderSaleTable(data) {
  const el = document.getElementById('saleTable');
  if (!data.length) { el.innerHTML = emptyState('No sales in this period.'); return; }
  const total = data.reduce((s, r) => s + r.total_price, 0);
  el.innerHTML = `<table>
    <thead><tr>
      <th>Date</th><th>Product</th><th>Qty</th><th>Unit Price</th>
      <th>Revenue</th><th>Client</th><th></th>
    </tr></thead>
    <tbody>
      ${data.map(r => `<tr>
        <td>${r.date}</td>
        <td><strong>${r.product_name}</strong></td>
        <td>${r.quantity} ${r.unit}</td>
        <td>${fmt(r.unit_price)}</td>
        <td><span class="badge badge-green">${fmt(r.total_price)}</span></td>
        <td>${r.client || '—'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteSale(${r.id})">🗑</button></td>
      </tr>`).join('')}
    </tbody>
    <tfoot><tr style="background:var(--surface2)">
      <td colspan="4" style="padding:10px 16px;font-weight:700">Total</td>
      <td style="padding:10px 16px;font-weight:700;color:var(--success)">${fmt(total)}</td>
      <td colspan="2"></td>
    </tr></tfoot>
  </table>`;
}

['saQty','saPrice'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    const q = parseFloat(document.getElementById('saQty').value) || 0;
    const p = parseFloat(document.getElementById('saPrice').value) || 0;
    document.getElementById('saTotal').textContent = fmt(q * p);
  });
});

document.getElementById('formSale').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/sales', 'POST', {
      product_id: document.getElementById('saProduct').value,
      date:       document.getElementById('saDate').value,
      quantity:   document.getElementById('saQty').value,
      unit_price: document.getElementById('saPrice').value,
      client:     document.getElementById('saClient').value
    });
    toast('Sale saved! 💰');
    e.target.reset();
    document.getElementById('saDate').value = today();
    document.getElementById('saTotal').textContent = '0.00';
    loadSales();
  } catch (err) { toast(err.message, 'error'); }
});

async function deleteSale(id) {
  if (!confirm('Delete this sale?')) return;
  await api(`/sales/${id}`, 'DELETE');
  toast('Sale deleted', 'warn');
  loadSales();
}

/* ─── STOCK ─────────────────────────────────────────────── */
async function loadStock() {
  const data = await api('/stock');
  renderStockTable(data);
  document.getElementById('searchStock').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    renderStockTable(data.filter(r => r.name.toLowerCase().includes(q)));
  });
}

function renderStockTable(data) {
  const el = document.getElementById('stockTable');
  if (!data.length) { el.innerHTML = emptyState('No stock data.'); return; }
  el.innerHTML = `<table>
    <thead><tr>
      <th>Product</th><th>Unit</th><th>Purchased</th><th>Sold</th>
      <th>Remaining</th><th>Total Cost</th><th>Status</th>
    </tr></thead>
    <tbody>
      ${data.map(r => {
        const pct = r.total_purchased > 0 ? (r.total_sold / r.total_purchased) * 100 : 0;
        const status = r.stock_remaining <= 0 ? 'badge-red' : r.stock_remaining < 5 ? 'badge-yellow' : 'badge-green';
        const statusText = r.stock_remaining <= 0 ? 'Out of stock' : r.stock_remaining < 5 ? 'Low stock' : 'In stock';
        return `<tr>
          <td><strong>${r.name}</strong></td>
          <td>${r.unit}</td>
          <td>${r.total_purchased}</td>
          <td>${r.total_sold}</td>
          <td><strong>${r.stock_remaining}</strong></td>
          <td>${fmt(r.total_cost_purchased)}</td>
          <td><span class="badge ${status}">${statusText}</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

/* ─── DASHBOARD ─────────────────────────────────────────── */
async function loadDashboard() {
  const [dash, daily, top] = await Promise.all([
    api('/stats/dashboard'),
    api('/stats/daily-sales'),
    api('/stats/top-products')
  ]);

  // KPI Cards
  document.getElementById('kpiGrid').innerHTML = `
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
      <span class="kpi-value" style="color:${dash.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmt(dash.totalProfit)}</span>
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
  buildLineChart('chartRevenue', chartRevenue,
    last14.map(d => d.date),
    last14.map(d => d.revenue),
    'Revenue',
    '#6c63ff'
  );

  // Top products doughnut
  buildDoughnut('chartTop', chartTop, top.slice(0, 6));

  // Low stock table
  const lowEl = document.getElementById('lowStockTable');
  if (!dash.lowStock.length) {
    lowEl.innerHTML = `<div class="empty"><div class="empty-icon">✅</div>All products have sufficient stock.</div>`;
  } else {
    lowEl.innerHTML = `<table>
      <thead><tr><th>Product</th><th>Remaining</th><th>Status</th></tr></thead>
      <tbody>${dash.lowStock.map(r => `<tr>
        <td><strong>${r.name}</strong></td>
        <td>${r.remaining}</td>
        <td><span class="badge ${r.remaining <= 0 ? 'badge-red' : 'badge-yellow'}">${r.remaining <= 0 ? 'Out of stock' : 'Low stock'}</span></td>
      </tr>`).join('')}</tbody>
    </table>`;
  }
}

/* ─── REPORTS ───────────────────────────────────────────── */
async function loadReports() {
  const fromEl = document.getElementById('rpFrom');
  const toEl   = document.getElementById('rpTo');
  if (!fromEl.value) { const d = new Date(); d.setDate(1); fromEl.value = d.toISOString().slice(0,10); }
  if (!toEl.value)   toEl.value = today();

  const [daily, purchases] = await Promise.all([
    api(`/stats/daily-sales?from=${fromEl.value}&to=${toEl.value}`),
    api(`/purchases?from=${fromEl.value}&to=${toEl.value}`)
  ]);

  // Build cost-per-day map
  const costMap = {};
  purchases.forEach(p => {
    costMap[p.date] = (costMap[p.date] || 0) + p.total_cost;
  });

  renderReportTable(daily, costMap);
  buildReportChart(daily, costMap);
}

function renderReportTable(daily, costMap) {
  const el = document.getElementById('reportTable');
  if (!daily.length) { el.innerHTML = emptyState('No sales in selected period.'); return; }

  const totalRev  = daily.reduce((s, r) => s + r.revenue, 0);
  const totalUnits = daily.reduce((s, r) => s + r.units_sold, 0);
  const allCosts  = Object.values(costMap).reduce((a, b) => a + b, 0);

  el.innerHTML = `<table>
    <thead><tr>
      <th>Date</th><th>Transactions</th><th>Units Sold</th>
      <th>Revenue</th><th>Cost (purchases)</th><th>Profit</th>
    </tr></thead>
    <tbody>
      ${daily.map(r => {
        const cost   = costMap[r.date] || 0;
        const profit = r.revenue - cost;
        return `<tr>
          <td><strong>${r.date}</strong></td>
          <td>${r.transactions}</td>
          <td>${r.units_sold}</td>
          <td style="color:var(--success)">${fmt(r.revenue)}</td>
          <td style="color:var(--danger)">${fmt(cost)}</td>
          <td style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700">${fmt(profit)}</td>
        </tr>`;
      }).join('')}
    </tbody>
    <tfoot><tr style="background:var(--surface2);font-weight:700">
      <td style="padding:10px 16px">TOTAL</td>
      <td></td>
      <td style="padding:10px 16px">${totalUnits}</td>
      <td style="padding:10px 16px;color:var(--success)">${fmt(totalRev)}</td>
      <td style="padding:10px 16px;color:var(--danger)">${fmt(allCosts)}</td>
      <td style="padding:10px 16px;color:${(totalRev - allCosts) >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmt(totalRev - allCosts)}</td>
    </tr></tfoot>
  </table>`;
}

/* ─── CHARTS ────────────────────────────────────────────── */
const chartDefaults = {
  color: '#e8eaf6',
  font: { family: 'Segoe UI, system-ui, sans-serif', size: 12 }
};
Chart.defaults.color = chartDefaults.color;
Chart.defaults.font  = chartDefaults.font;

function buildLineChart(canvasId, existingChart, labels, data, label, color) {
  if (existingChart) existingChart.destroy();
  const ctx = document.getElementById(canvasId).getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 250);
  gradient.addColorStop(0, color + '55');
  gradient.addColorStop(1, color + '00');
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: gradient,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: color,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#2e3347' } },
        y: { grid: { color: '#2e3347' }, beginAtZero: true }
      }
    }
  });
  if (canvasId === 'chartRevenue') chartRevenue = chart;
  return chart;
}

function buildDoughnut(canvasId, existingChart, data) {
  if (existingChart) existingChart.destroy();
  const ctx = document.getElementById(canvasId).getContext('2d');
  const colors = ['#6c63ff','#00d4aa','#ffb703','#ff4d6d','#a855f7','#06d6a0'];
  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.name),
      datasets: [{
        data: data.map(d => d.revenue),
        backgroundColor: colors,
        borderColor: '#1a1d27',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12 } }
      }
    }
  });
  chartTop = chart;
}

function buildReportChart(daily, costMap) {
  if (chartReport) chartReport.destroy();
  const labels = [...daily].reverse().map(d => d.date);
  const revenues = [...daily].reverse().map(d => d.revenue);
  const costs    = [...daily].reverse().map(d => costMap[d.date] || 0);
  const ctx = document.getElementById('chartReport').getContext('2d');
  chartReport = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Revenue', data: revenues, backgroundColor: '#06d6a055', borderColor: '#06d6a0', borderWidth: 2 },
        { label: 'Cost',    data: costs,    backgroundColor: '#ff4d6d55', borderColor: '#ff4d6d', borderWidth: 2 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: true } },
      scales: {
        x: { grid: { color: '#2e3347' } },
        y: { grid: { color: '#2e3347' }, beginAtZero: true }
      }
    }
  });
}

/* ─── INIT ──────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  // Set today's date on forms
  document.getElementById('puDate').value = today();
  document.getElementById('saDate').value = today();
  loadDashboard();
});

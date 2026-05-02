const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const path       = require('path');
const low        = require('lowdb');
const FileSync   = require('lowdb/adapters/FileSync');

const app  = express();
const PORT = 3000;

// ─── DATABASE ─────────────────────────────────────────────
const adapter = new FileSync('db.json');
const db      = low(adapter);

db.defaults({
  products:  [],
  purchases: [],
  sales:     [],
  _seq: { products: 0, purchases: 0, sales: 0 }
}).write();

function nextId(col) {
  const n = (db.get(`_seq.${col}`).value() || 0) + 1;
  db.set(`_seq.${col}`, n).write();
  return n;
}

// ─── MIDDLEWARE ────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── PRODUCTS ─────────────────────────────────────────────
app.get('/api/products', (req, res) => {
  res.json(db.get('products').sortBy('name').value());
});

app.post('/api/products', (req, res) => {
  const { name, unit } = req.body;
  if (!name) return res.status(400).json({ error: 'Product name is required' });
  const exists = db.get('products').find(p => p.name.toLowerCase() === name.trim().toLowerCase()).value();
  if (exists) return res.status(400).json({ error: 'Product already exists' });
  const product = {
    id: nextId('products'),
    name: name.trim(),
    unit: unit || 'unit',
    created_at: new Date().toISOString().slice(0, 10)
  };
  db.get('products').push(product).write();
  res.json(product);
});

app.delete('/api/products/:id', (req, res) => {
  db.get('products').remove({ id: parseInt(req.params.id) }).write();
  res.json({ success: true });
});

// ─── STOCK ────────────────────────────────────────────────
app.get('/api/stock', (req, res) => {
  const products  = db.get('products').value();
  const purchases = db.get('purchases').value();
  const sales     = db.get('sales').value();
  const stock = products.map(p => {
    const totalPurchased = purchases.filter(x => x.product_id === p.id).reduce((s, x) => s + x.quantity, 0);
    const totalSold      = sales.filter(x => x.product_id === p.id).reduce((s, x) => s + x.quantity, 0);
    const totalCost      = purchases.filter(x => x.product_id === p.id).reduce((s, x) => s + x.total_cost, 0);
    return { id: p.id, name: p.name, unit: p.unit, total_purchased: totalPurchased, total_sold: totalSold, stock_remaining: totalPurchased - totalSold, total_cost_purchased: totalCost };
  }).sort((a, b) => a.name.localeCompare(b.name));
  res.json(stock);
});

// ─── PURCHASES ────────────────────────────────────────────
app.get('/api/purchases', (req, res) => {
  const { from, to, product_id } = req.query;
  const products = db.get('products').value();
  let list = db.get('purchases').value();
  if (from)       list = list.filter(r => r.date >= from);
  if (to)         list = list.filter(r => r.date <= to);
  if (product_id) list = list.filter(r => r.product_id === parseInt(product_id));
  res.json(list.map(r => {
    const p = products.find(x => x.id === r.product_id) || {};
    return { ...r, product_name: p.name || '?', unit: p.unit || '' };
  }).sort((a, b) => b.date.localeCompare(a.date)));
});

app.post('/api/purchases', (req, res) => {
  const { product_id, quantity, unit_cost, supplier, date } = req.body;
  if (!product_id || !quantity || !unit_cost || !date)
    return res.status(400).json({ error: 'Missing required fields' });
  const total_cost = parseFloat(quantity) * parseFloat(unit_cost);
  const record = { id: nextId('purchases'), product_id: parseInt(product_id), quantity: parseFloat(quantity), unit_cost: parseFloat(unit_cost), total_cost, supplier: supplier || '', date, created_at: new Date().toISOString() };
  db.get('purchases').push(record).write();
  res.json(record);
});

app.delete('/api/purchases/:id', (req, res) => {
  db.get('purchases').remove({ id: parseInt(req.params.id) }).write();
  res.json({ success: true });
});

// ─── SALES ────────────────────────────────────────────────
app.get('/api/sales', (req, res) => {
  const { from, to, product_id } = req.query;
  const products = db.get('products').value();
  let list = db.get('sales').value();
  if (from)       list = list.filter(r => r.date >= from);
  if (to)         list = list.filter(r => r.date <= to);
  if (product_id) list = list.filter(r => r.product_id === parseInt(product_id));
  res.json(list.map(r => {
    const p = products.find(x => x.id === r.product_id) || {};
    return { ...r, product_name: p.name || '?', unit: p.unit || '' };
  }).sort((a, b) => b.date.localeCompare(a.date)));
});

app.post('/api/sales', (req, res) => {
  const { product_id, quantity, unit_price, client, date } = req.body;
  if (!product_id || !quantity || !unit_price || !date)
    return res.status(400).json({ error: 'Missing required fields' });
  const pid = parseInt(product_id);
  const qty = parseFloat(quantity);
  const purchases = db.get('purchases').value();
  const sales     = db.get('sales').value();
  const totalPurchased = purchases.filter(x => x.product_id === pid).reduce((s, x) => s + x.quantity, 0);
  const totalSold      = sales.filter(x => x.product_id === pid).reduce((s, x) => s + x.quantity, 0);
  const remaining = totalPurchased - totalSold;
  if (remaining < qty)
    return res.status(400).json({ error: `Insufficient stock. Available: ${remaining}` });
  const total_price = qty * parseFloat(unit_price);
  const record = { id: nextId('sales'), product_id: pid, quantity: qty, unit_price: parseFloat(unit_price), total_price, client: client || '', date, created_at: new Date().toISOString() };
  db.get('sales').push(record).write();
  res.json(record);
});

app.delete('/api/sales/:id', (req, res) => {
  db.get('sales').remove({ id: parseInt(req.params.id) }).write();
  res.json({ success: true });
});

// ─── STATS ────────────────────────────────────────────────
app.get('/api/stats/daily-sales', (req, res) => {
  const { from, to } = req.query;
  let list = db.get('sales').value();
  if (from) list = list.filter(r => r.date >= from);
  if (to)   list = list.filter(r => r.date <= to);
  const map = {};
  list.forEach(r => {
    if (!map[r.date]) map[r.date] = { date: r.date, transactions: 0, revenue: 0, units_sold: 0 };
    map[r.date].transactions++;
    map[r.date].revenue    += r.total_price;
    map[r.date].units_sold += r.quantity;
  });
  res.json(Object.values(map).sort((a, b) => b.date.localeCompare(a.date)));
});

app.get('/api/stats/top-products', (req, res) => {
  const products  = db.get('products').value();
  const sales     = db.get('sales').value();
  const purchases = db.get('purchases').value();
  const map = {};
  sales.forEach(r => {
    if (!map[r.product_id]) map[r.product_id] = { product_id: r.product_id, units_sold: 0, revenue: 0 };
    map[r.product_id].units_sold += r.quantity;
    map[r.product_id].revenue   += r.total_price;
  });
  res.json(Object.values(map).map(row => {
    const p    = products.find(x => x.id === row.product_id) || {};
    const cost = purchases.filter(x => x.product_id === row.product_id).reduce((s, x) => s + x.total_cost, 0);
    return { name: p.name || '?', units_sold: row.units_sold, revenue: row.revenue, total_cost: cost };
  }).sort((a, b) => b.revenue - a.revenue).slice(0, 10));
});

app.get('/api/stats/dashboard', (req, res) => {
  const sales     = db.get('sales').value();
  const purchases = db.get('purchases').value();
  const products  = db.get('products').value();
  const todayDate = new Date().toISOString().slice(0, 10);
  const totalRevenue   = sales.reduce((s, r) => s + r.total_price, 0);
  const totalCost      = purchases.reduce((s, r) => s + r.total_cost, 0);
  const todaySales     = sales.filter(r => r.date === todayDate).reduce((s, r) => s + r.total_price, 0);
  const todayPurchases = purchases.filter(r => r.date === todayDate).reduce((s, r) => s + r.total_cost, 0);
  const lowStock = products.map(p => {
    const tp = purchases.filter(x => x.product_id === p.id).reduce((s, x) => s + x.quantity, 0);
    const ts = sales.filter(x => x.product_id === p.id).reduce((s, x) => s + x.quantity, 0);
    return { name: p.name, remaining: tp - ts };
  }).filter(r => r.remaining < 5).sort((a, b) => a.remaining - b.remaining);
  res.json({ totalRevenue, totalCost, totalProfit: totalRevenue - totalCost, totalProducts: products.length, todaySales, todayPurchases, lowStock });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅  StockPro is running  →  http://localhost:${PORT}\n`);
});

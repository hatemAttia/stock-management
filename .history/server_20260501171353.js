const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new Database('stock.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    unit TEXT DEFAULT 'unit',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    unit_cost REAL NOT NULL,
    total_cost REAL NOT NULL,
    supplier TEXT,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    client TEXT,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`);

// ─── PRODUCTS ────────────────────────────────────────────────────────────────

app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY name').all();
  res.json(products);
});

app.post('/api/products', (req, res) => {
  const { name, unit } = req.body;
  if (!name) return res.status(400).json({ error: 'Product name is required' });
  try {
    const stmt = db.prepare('INSERT INTO products (name, unit) VALUES (?, ?)');
    const info = stmt.run(name.trim(), unit || 'unit');
    res.json({ id: info.lastInsertRowid, name, unit: unit || 'unit' });
  } catch (e) {
    res.status(400).json({ error: 'Product already exists' });
  }
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── STOCK (current levels) ───────────────────────────────────────────────────

app.get('/api/stock', (req, res) => {
  const stock = db.prepare(`
    SELECT 
      p.id,
      p.name,
      p.unit,
      COALESCE(SUM(pu.quantity), 0) AS total_purchased,
      COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.product_id = p.id), 0) AS total_sold,
      COALESCE(SUM(pu.quantity), 0) - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.product_id = p.id), 0) AS stock_remaining,
      COALESCE(SUM(pu.total_cost), 0) AS total_cost_purchased
    FROM products p
    LEFT JOIN purchases pu ON pu.product_id = p.id
    GROUP BY p.id
    ORDER BY p.name
  `).all();
  res.json(stock);
});

// ─── PURCHASES ───────────────────────────────────────────────────────────────

app.get('/api/purchases', (req, res) => {
  const { from, to, product_id } = req.query;
  let query = `
    SELECT pu.*, p.name AS product_name, p.unit
    FROM purchases pu
    JOIN products p ON p.id = pu.product_id
    WHERE 1=1
  `;
  const params = [];
  if (from)       { query += ' AND pu.date >= ?'; params.push(from); }
  if (to)         { query += ' AND pu.date <= ?'; params.push(to); }
  if (product_id) { query += ' AND pu.product_id = ?'; params.push(product_id); }
  query += ' ORDER BY pu.date DESC, pu.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

app.post('/api/purchases', (req, res) => {
  const { product_id, quantity, unit_cost, supplier, date } = req.body;
  if (!product_id || !quantity || !unit_cost || !date)
    return res.status(400).json({ error: 'Missing required fields' });
  const total_cost = quantity * unit_cost;
  const info = db.prepare(
    'INSERT INTO purchases (product_id, quantity, unit_cost, total_cost, supplier, date) VALUES (?,?,?,?,?,?)'
  ).run(product_id, quantity, unit_cost, total_cost, supplier || '', date);
  res.json({ id: info.lastInsertRowid, total_cost });
});

app.delete('/api/purchases/:id', (req, res) => {
  db.prepare('DELETE FROM purchases WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── SALES ───────────────────────────────────────────────────────────────────

app.get('/api/sales', (req, res) => {
  const { from, to, product_id } = req.query;
  let query = `
    SELECT s.*, p.name AS product_name, p.unit
    FROM sales s
    JOIN products p ON p.id = s.product_id
    WHERE 1=1
  `;
  const params = [];
  if (from)       { query += ' AND s.date >= ?'; params.push(from); }
  if (to)         { query += ' AND s.date <= ?'; params.push(to); }
  if (product_id) { query += ' AND s.product_id = ?'; params.push(product_id); }
  query += ' ORDER BY s.date DESC, s.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

app.post('/api/sales', (req, res) => {
  const { product_id, quantity, unit_price, client, date } = req.body;
  if (!product_id || !quantity || !unit_price || !date)
    return res.status(400).json({ error: 'Missing required fields' });

  // Check stock
  const stockRow = db.prepare(`
    SELECT 
      COALESCE(SUM(quantity), 0) - 
      COALESCE((SELECT SUM(quantity) FROM sales WHERE product_id = ?), 0) AS remaining
    FROM purchases WHERE product_id = ?
  `).get(product_id, product_id);

  if (stockRow.remaining < quantity)
    return res.status(400).json({ error: `Insufficient stock. Available: ${stockRow.remaining}` });

  const total_price = quantity * unit_price;
  const info = db.prepare(
    'INSERT INTO sales (product_id, quantity, unit_price, total_price, client, date) VALUES (?,?,?,?,?,?)'
  ).run(product_id, quantity, unit_price, total_price, client || '', date);
  res.json({ id: info.lastInsertRowid, total_price });
});

app.delete('/api/sales/:id', (req, res) => {
  db.prepare('DELETE FROM sales WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── STATS ───────────────────────────────────────────────────────────────────

// Daily sales summary
app.get('/api/stats/daily-sales', (req, res) => {
  const { from, to } = req.query;
  let query = `
    SELECT 
      s.date,
      COUNT(s.id) AS transactions,
      SUM(s.total_price) AS revenue,
      SUM(s.quantity) AS units_sold
    FROM sales s
    WHERE 1=1
  `;
  const params = [];
  if (from) { query += ' AND s.date >= ?'; params.push(from); }
  if (to)   { query += ' AND s.date <= ?'; params.push(to); }
  query += ' GROUP BY s.date ORDER BY s.date DESC';
  res.json(db.prepare(query).all(...params));
});

// Top products by revenue
app.get('/api/stats/top-products', (req, res) => {
  const rows = db.prepare(`
    SELECT 
      p.name,
      SUM(s.quantity) AS units_sold,
      SUM(s.total_price) AS revenue,
      SUM(pu.total_cost) AS total_cost
    FROM sales s
    JOIN products p ON p.id = s.product_id
    LEFT JOIN purchases pu ON pu.product_id = p.id
    GROUP BY p.id
    ORDER BY revenue DESC
    LIMIT 10
  `).all();
  res.json(rows);
});

// Global dashboard summary
app.get('/api/stats/dashboard', (req, res) => {
  const totalRevenue   = db.prepare('SELECT COALESCE(SUM(total_price),0) AS v FROM sales').get().v;
  const totalCost      = db.prepare('SELECT COALESCE(SUM(total_cost),0) AS v FROM purchases').get().v;
  const totalProfit    = totalRevenue - totalCost;
  const totalProducts  = db.prepare('SELECT COUNT(*) AS v FROM products').get().v;
  const todayDate      = new Date().toISOString().slice(0, 10);
  const todaySales     = db.prepare('SELECT COALESCE(SUM(total_price),0) AS v FROM sales WHERE date = ?').get(todayDate).v;
  const todayPurchases = db.prepare('SELECT COALESCE(SUM(total_cost),0) AS v FROM purchases WHERE date = ?').get(todayDate).v;
  const lowStock = db.prepare(`
    SELECT p.name,
      COALESCE(SUM(pu.quantity),0) - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.product_id=p.id),0) AS remaining
    FROM products p
    LEFT JOIN purchases pu ON pu.product_id = p.id
    GROUP BY p.id
    HAVING remaining < 5
    ORDER BY remaining
  `).all();

  res.json({ totalRevenue, totalCost, totalProfit, totalProducts, todaySales, todayPurchases, lowStock });
});

// Sales by product per day
app.get('/api/stats/sales-by-product', (req, res) => {
  const { from, to } = req.query;
  let query = `
    SELECT s.date, p.name AS product, SUM(s.quantity) AS qty, SUM(s.total_price) AS revenue
    FROM sales s JOIN products p ON p.id = s.product_id
    WHERE 1=1
  `;
  const params = [];
  if (from) { query += ' AND s.date >= ?'; params.push(from); }
  if (to)   { query += ' AND s.date <= ?'; params.push(to); }
  query += ' GROUP BY s.date, s.product_id ORDER BY s.date DESC';
  res.json(db.prepare(query).all(...params));
});

// Catch-all: serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅  Stock Management running → http://localhost:${PORT}`);
});

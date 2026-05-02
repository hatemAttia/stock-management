require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CONNECT TO MONGODB ───────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅  MongoDB connected"))
  .catch((err) => {
    console.error("❌  MongoDB error:", err.message);
    process.exit(1);
  });

// ─── SCHEMAS ─────────────────────────────────────────────
const productSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  unit: { type: String, default: "unit" },
  created_at: { type: String, default: () => new Date().toISOString().slice(0, 10) },
});

const purchaseSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, required: true },
  unit_cost: { type: Number, required: true },
  total_cost: { type: Number, required: true },
  supplier: { type: String, default: "" },
  date: { type: String, required: true },
  created_at: { type: String, default: () => new Date().toISOString() },
});

const saleSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, required: true },
  unit_price: { type: Number, required: true },
  total_price: { type: Number, required: true },
  client: { type: String, default: "" },
  date: { type: String, required: true },
  created_at: { type: String, default: () => new Date().toISOString() },
});

const Product = mongoose.model("Product", productSchema);
const Purchase = mongoose.model("Purchase", purchaseSchema);
const Sale = mongoose.model("Sale", saleSchema);

// ─── MIDDLEWARE ────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── PRODUCTS ─────────────────────────────────────────────
app.get("/api/products", async (req, res) => {
  const list = await Product.find().sort({ name: 1 }).lean();
  res.json(list.map((p) => ({ ...p, id: p._id })));
});

app.post("/api/products", async (req, res) => {
  const { name, unit } = req.body;
  if (!name) return res.status(400).json({ error: "Product name is required" });
  try {
    const p = await Product.create({ name: name.trim(), unit: unit || "unit" });
    res.json({ ...p.toObject(), id: p._id });
  } catch (e) {
    res.status(400).json({ error: "Product already exists" });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ─── STOCK ────────────────────────────────────────────────
app.get("/api/stock", async (req, res) => {
  const [products, purchases, sales] = await Promise.all([
    Product.find().sort({ name: 1 }).lean(),
    Purchase.find().lean(),
    Sale.find().lean(),
  ]);
  const stock = products.map((p) => {
    const id = String(p._id);
    const totalPurchased = purchases
      .filter((x) => String(x.product_id) === id)
      .reduce((s, x) => s + x.quantity, 0);
    const totalSold = sales
      .filter((x) => String(x.product_id) === id)
      .reduce((s, x) => s + x.quantity, 0);
    const totalCost = purchases
      .filter((x) => String(x.product_id) === id)
      .reduce((s, x) => s + x.total_cost, 0);
    return {
      id,
      name: p.name,
      unit: p.unit,
      total_purchased: totalPurchased,
      total_sold: totalSold,
      stock_remaining: totalPurchased - totalSold,
      total_cost_purchased: totalCost,
    };
  });
  res.json(stock);
});

// ─── PURCHASES ────────────────────────────────────────────
app.get("/api/purchases", async (req, res) => {
  const { from, to, product_id } = req.query;
  const filter = {};
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  if (product_id) filter.product_id = product_id;
  const list = await Purchase.find(filter)
    .populate("product_id", "name unit")
    .sort({ date: -1 })
    .lean();
  res.json(
    list.map((r) => ({
      ...r,
      id: r._id,
      product_name: r.product_id?.name || "?",
      unit: r.product_id?.unit || "",
    })),
  );
});

app.post("/api/purchases", async (req, res) => {
  const { product_id, quantity, unit_cost, supplier, date } = req.body;
  if (!product_id || !quantity || !unit_cost || !date)
    return res.status(400).json({ error: "Missing required fields" });
  const total_cost = parseFloat(quantity) * parseFloat(unit_cost);
  const r = await Purchase.create({
    product_id,
    quantity: parseFloat(quantity),
    unit_cost: parseFloat(unit_cost),
    total_cost,
    supplier: supplier || "",
    date,
  });
  res.json({ ...r.toObject(), id: r._id });
});

app.delete("/api/purchases/:id", async (req, res) => {
  await Purchase.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ─── SALES ────────────────────────────────────────────────
app.get("/api/sales", async (req, res) => {
  const { from, to, product_id } = req.query;
  const filter = {};
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  if (product_id) filter.product_id = product_id;
  const list = await Sale.find(filter)
    .populate("product_id", "name unit")
    .sort({ date: -1 })
    .lean();
  res.json(
    list.map((r) => ({
      ...r,
      id: r._id,
      product_name: r.product_id?.name || "?",
      unit: r.product_id?.unit || "",
    })),
  );
});

app.post("/api/sales", async (req, res) => {
  const { product_id, quantity, unit_price, client, date } = req.body;
  if (!product_id || !quantity || !unit_price || !date)
    return res.status(400).json({ error: "Missing required fields" });
  const qty = parseFloat(quantity);

  // Stock check
  const [purchases, sales] = await Promise.all([
    Purchase.find({ product_id }).lean(),
    Sale.find({ product_id }).lean(),
  ]);
  const remaining =
    purchases.reduce((s, x) => s + x.quantity, 0) - sales.reduce((s, x) => s + x.quantity, 0);
  if (remaining < qty)
    return res.status(400).json({ error: `Insufficient stock. Available: ${remaining}` });

  const total_price = qty * parseFloat(unit_price);
  const r = await Sale.create({
    product_id,
    quantity: qty,
    unit_price: parseFloat(unit_price),
    total_price,
    client: client || "",
    date,
  });
  res.json({ ...r.toObject(), id: r._id });
});

app.delete("/api/sales/:id", async (req, res) => {
  await Sale.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ─── STATS ────────────────────────────────────────────────
app.get("/api/stats/daily-sales", async (req, res) => {
  const { from, to } = req.query;
  const filter = {};
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  const sales = await Sale.find(filter).lean();
  const map = {};
  sales.forEach((r) => {
    if (!map[r.date]) map[r.date] = { date: r.date, transactions: 0, revenue: 0, units_sold: 0 };
    map[r.date].transactions++;
    map[r.date].revenue += r.total_price;
    map[r.date].units_sold += r.quantity;
  });
  res.json(Object.values(map).sort((a, b) => b.date.localeCompare(a.date)));
});

app.get("/api/stats/top-products", async (req, res) => {
  const [sales, purchases] = await Promise.all([
    Sale.find().populate("product_id", "name").lean(),
    Purchase.find().lean(),
  ]);
  const map = {};
  sales.forEach((r) => {
    const key = String(r.product_id?._id || r.product_id);
    if (!map[key])
      map[key] = { name: r.product_id?.name || "?", units_sold: 0, revenue: 0, pid: key };
    map[key].units_sold += r.quantity;
    map[key].revenue += r.total_price;
  });
  const result = Object.values(map)
    .map((row) => {
      const cost = purchases
        .filter((x) => String(x.product_id) === row.pid)
        .reduce((s, x) => s + x.total_cost, 0);
      return { name: row.name, units_sold: row.units_sold, revenue: row.revenue, total_cost: cost };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  res.json(result);
});

app.get("/api/stats/dashboard", async (req, res) => {
  const todayDate = new Date().toISOString().slice(0, 10);
  const [sales, purchases, products] = await Promise.all([
    Sale.find().lean(),
    Purchase.find().lean(),
    Product.find().lean(),
  ]);
  const totalRevenue = sales.reduce((s, r) => s + r.total_price, 0);
  const totalCost = purchases.reduce((s, r) => s + r.total_cost, 0);
  const todaySales = sales
    .filter((r) => r.date === todayDate)
    .reduce((s, r) => s + r.total_price, 0);
  const todayPurchases = purchases
    .filter((r) => r.date === todayDate)
    .reduce((s, r) => s + r.total_cost, 0);
  const lowStock = products
    .map((p) => {
      const id = String(p._id);
      const tp = purchases
        .filter((x) => String(x.product_id) === id)
        .reduce((s, x) => s + x.quantity, 0);
      const ts = sales
        .filter((x) => String(x.product_id) === id)
        .reduce((s, x) => s + x.quantity, 0);
      return { name: p.name, remaining: tp - ts };
    })
    .filter((r) => r.remaining < 5)
    .sort((a, b) => a.remaining - b.remaining);
  res.json({
    totalRevenue,
    totalCost,
    totalProfit: totalRevenue - totalCost,
    totalProducts: products.length,
    todaySales,
    todayPurchases,
    lowStock,
  });
});

// ─── CATCH-ALL ────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n✅  StockPro is running  →  http://localhost:${PORT}\n`);
});

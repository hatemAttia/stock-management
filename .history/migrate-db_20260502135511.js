/**
 * migrate-db.js
 * Imports all data from db.json into MongoDB via the running server API.
 * Run: node migrate-db.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://localhost:3000/api";
const DB_FILE = path.join(__dirname, "db.json");

// ── tiny http helper ──────────────────────────────────────
function request(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };
    const u = new URL(url);
    opts.hostname = u.hostname;
    opts.port = u.port;
    opts.path = u.pathname + u.search;

    const req = http.request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── main ──────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  StockPro  –  db.json  →  MongoDB");
  console.log("═══════════════════════════════════════════\n");

  // 1. Read db.json
  if (!fs.existsSync(DB_FILE)) {
    console.error("❌  db.json not found:", DB_FILE);
    process.exit(1);
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  const { products, purchases, sales } = db;
  console.log(
    `📂  Found: ${products.length} products, ${purchases.length} purchases, ${sales.length} sales\n`,
  );

  // 2. Import products – build old_id → new_id map
  console.log("── Importing Products ──────────────────────");
  const idMap = {}; // old numeric id → new MongoDB _id string
  let pOk = 0,
    pSkip = 0;

  for (const p of products) {
    const res = await request("POST", `${BASE_URL}/products`, {
      name: p.name,
      unit: p.unit || "unit",
    });
    if (res.status === 200 || res.status === 201) {
      idMap[p.id] = String(res.body._id || res.body.id);
      console.log(`  ✅  [${p.id}] ${p.name}  →  ${idMap[p.id]}`);
      pOk++;
    } else {
      // Product already exists – fetch its id from the list
      const listRes = await request("GET", `${BASE_URL}/products`);
      const existing = listRes.body.find(
        (x) => x.name.toLowerCase().trim() === p.name.toLowerCase().trim(),
      );
      if (existing) {
        idMap[p.id] = String(existing._id || existing.id);
        console.log(`  ⚠️   [${p.id}] ${p.name}  already exists  →  ${idMap[p.id]}`);
        pSkip++;
      } else {
        console.log(`  ❌  [${p.id}] ${p.name}  –  ${res.body.error || "unknown error"}`);
      }
    }
  }
  console.log(`\n  Products: ${pOk} created, ${pSkip} already existed\n`);

  // 3. Import purchases
  console.log("── Importing Purchases ─────────────────────");
  let puOk = 0,
    puFail = 0;
  for (const pu of purchases) {
    const newPid = idMap[pu.product_id];
    if (!newPid) {
      console.log(`  ❌  Purchase id=${pu.id}: product_id ${pu.product_id} not mapped`);
      puFail++;
      continue;
    }
    const res = await request("POST", `${BASE_URL}/purchases`, {
      product_id: newPid,
      quantity: pu.quantity,
      unit_cost: pu.unit_cost,
      supplier: pu.supplier || "",
      date: pu.date,
    });
    if (res.status === 200 || res.status === 201) {
      puOk++;
      process.stdout.write(`\r  ✅  ${puOk} / ${purchases.length} purchases imported…`);
    } else {
      console.log(`\n  ❌  Purchase id=${pu.id}: ${res.body.error || "error"}`);
      puFail++;
    }
  }
  console.log(`\n\n  Purchases: ${puOk} created, ${puFail} failed\n`);

  // 4. Import sales (empty in your case, but handles future use)
  if (sales && sales.length) {
    console.log("── Importing Sales ─────────────────────────");
    let saOk = 0,
      saFail = 0;
    for (const sa of sales) {
      const newPid = idMap[sa.product_id];
      if (!newPid) {
        saFail++;
        continue;
      }
      const res = await request("POST", `${BASE_URL}/sales`, {
        product_id: newPid,
        quantity: sa.quantity,
        unit_price: sa.unit_price,
        client: sa.client || "",
        date: sa.date,
      });
      if (res.status === 200 || res.status === 201) {
        saOk++;
        process.stdout.write(`\r  ✅  ${saOk} / ${sales.length} sales imported…`);
      } else {
        console.log(`\n  ❌  Sale id=${sa.id}: ${res.body.error || "error"}`);
        saFail++;
      }
    }
    console.log(`\n\n  Sales: ${saOk} created, ${saFail} failed\n`);
  } else {
    console.log("── Sales: none to import ──────────────────\n");
  }

  console.log("═══════════════════════════════════════════");
  console.log("  ✅  Migration complete!");
  console.log("═══════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("❌  Fatal error:", err.message);
  process.exit(1);
});

// ═══════════════════════════════════════════════════════════════════
//  Cafe Bloom POS — Central Cloud Server (Multi-Branch)
//  PostgreSQL + Socket.io Edition
//  Deploy: Railway (add PostgreSQL plugin → DATABASE_URL auto-set)
//  Start:  node server.js
// ═══════════════════════════════════════════════════════════════════
import http          from "http";
import fs            from "fs";
import path          from "path";
import crypto        from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require    = createRequire(import.meta.url);
const { Pool }   = require("pg");
const { Server } = require("socket.io");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env manually (no dotenv dep) ───────────────────────────
(function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
})();

const PORT           = process.env.PORT           || 5000;
const SESSION_HOURS  = parseInt(process.env.SESSION_EXPIRES_HOURS || "720", 10); // 30 days default
const DATABASE_URL   = process.env.DATABASE_URL;   // set by Railway PostgreSQL plugin
// JWT secret — stable across restarts (use env var or derive from DB URL)
const JWT_SECRET = process.env.JWT_SECRET || DATABASE_URL.slice(-32) || "cafe_bloom_secret_2025";

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL មិនទាន់​កំណត់! បន្ថែម PostgreSQL plugin នៅ Railway។");
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════
//  PostgreSQL POOL
// ═══════════════════════════════════════════════════════════════════
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },   // required for Railway / Render / Supabase
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => console.error("❌ PG Pool Error:", err.message));

// ── DB Init — Create tables if not exist ─────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS shared_data (
        key   TEXT PRIMARY KEY,
        value JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS branch_data (
        branch_id TEXT    NOT NULL,
        key       TEXT    NOT NULL,
        value     JSONB   NOT NULL,
        PRIMARY KEY (branch_id, key)
      );

      CREATE TABLE IF NOT EXISTS branches (
        branch_id   TEXT    PRIMARY KEY,
        branch_name TEXT    NOT NULL,
        address     TEXT    DEFAULT '',
        active      BOOLEAN DEFAULT TRUE
      );
    `);

    // Seed default branches if empty
    const { rowCount } = await client.query("SELECT 1 FROM branches LIMIT 1");
    if (rowCount === 0) {
      await client.query(`
        INSERT INTO branches (branch_id, branch_name) VALUES
          ('branch_1','តូប ១'),
          ('branch_2','តូប ២'),
          ('branch_3','តូប ៣'),
          ('branch_4','តូប ៤'),
          ('branch_5','តូប ៥')
        ON CONFLICT DO NOTHING;
      `);
    }

    // Seed default shared data if empty
    const { rowCount: sc } = await client.query("SELECT 1 FROM shared_data LIMIT 1");
    if (sc === 0) {
      for (const [k, v] of Object.entries(DEFAULT_SHARED)) {
        await client.query(
          "INSERT INTO shared_data(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [k, JSON.stringify(v)]
        );
      }
    }

    // ── Smart user migration (NEVER overwrite existing users) ────────
    // Only ensures default admin exists — all other users are preserved
    try {
      const { rows: uRows } = await client.query(
        "SELECT value FROM shared_data WHERE key='users'"
      );
      if (uRows.length > 0) {
        // Users exist in DB — only ensure default admin is present (by user_id=1)
        const dbUsers = Array.isArray(uRows[0].value) ? uRows[0].value : [];
        const defaultAdmin = DEFAULT_SHARED.users.find(u => u.username === "admin");
        const hasAdmin = dbUsers.some(u => u.username === "admin");
        if (!hasAdmin && defaultAdmin) {
          // Admin was deleted — restore it
          const merged = [...dbUsers, defaultAdmin];
          await client.query(
            "UPDATE shared_data SET value=$1 WHERE key='users'",
            [JSON.stringify(merged)]
          );
          console.log("[Migration] Restored missing admin user");
        } else {
          console.log(`[Migration] Users OK — ${dbUsers.length} users preserved`);
        }
      } else {
        // No users at all — seed defaults
        await client.query(
          "INSERT INTO shared_data(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING",
          ["users", JSON.stringify(DEFAULT_SHARED.users)]
        );
        console.log("[Migration] Seeded default users (first run)");
      }
    } catch (uErr) {
      console.warn("[Migration] User migration warning:", uErr.message);
    }

    // ── One-time migration: backfill branch_id into orders missing it ──
    try {
      const { rows: branchRows } = await client.query("SELECT branch_id FROM branches");
      for (const { branch_id } of branchRows) {
        const { rows: dataRows } = await client.query(
          "SELECT value FROM branch_data WHERE branch_id=$1 AND key='orders'", [branch_id]
        );
        if (!dataRows.length) continue;
        const orders = dataRows[0].value;
        if (!Array.isArray(orders)) continue;
        const needsFix = orders.some(o => o && !o.branch_id);
        if (!needsFix) continue;
        const fixed = orders.map(o => o && !o.branch_id ? { ...o, branch_id } : o);
        await client.query(
          "UPDATE branch_data SET value=$1 WHERE branch_id=$2 AND key='orders'",
          [JSON.stringify(fixed), branch_id]
        );
        console.log(`[Migration] Backfilled branch_id into ${fixed.filter(o=>o).length} orders for ${branch_id}`);
      }
    } catch (migErr) {
      console.warn("[Migration] branch_id backfill warning:", migErr.message);
    }

    // ── One-time migration: move recipes from shared_data → branch_data ──
    // recipes must be per-branch so each branch has its own ingredient mappings
    try {
      const { rows: sharedRecRows } = await client.query(
        "SELECT value FROM shared_data WHERE key='recipes'"
      );
      if (sharedRecRows.length > 0) {
        const sharedRecipes = Array.isArray(sharedRecRows[0].value) ? sharedRecRows[0].value : [];
        if (sharedRecipes.length > 0) {
          // Copy shared recipes to every branch that doesn't yet have branch-level recipes
          const { rows: branchList } = await client.query("SELECT branch_id FROM branches");
          for (const { branch_id } of branchList) {
            const { rows: existing } = await client.query(
              "SELECT 1 FROM branch_data WHERE branch_id=$1 AND key='recipes'", [branch_id]
            );
            if (existing.length === 0) {
              await client.query(
                "INSERT INTO branch_data(branch_id,key,value) VALUES($1,'recipes',$2) ON CONFLICT DO NOTHING",
                [branch_id, JSON.stringify(sharedRecipes)]
              );
              console.log(`[Migration] Copied ${sharedRecipes.length} shared recipes → ${branch_id}`);
            }
          }
        }
        // Remove recipes from shared_data (no longer shared)
        await client.query("DELETE FROM shared_data WHERE key='recipes'");
        console.log("[Migration] Removed recipes from shared_data (now per-branch)");
      }
    } catch (recMigErr) {
      console.warn("[Migration] recipes migration warning:", recMigErr.message);
    }

    console.log("✅ PostgreSQL tables ready");
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════
//  DEFAULT DATA  (seeds on first run)
// ═══════════════════════════════════════════════════════════════════
const DEFAULT_SHARED = {
  categories: [
    { category_id:1, category_name:"កាហ្វេក្តៅ",   emoji:"☕" },
    { category_id:2, category_name:"កាហ្វេត្រជាក់", emoji:"🧊" },
    { category_id:3, category_name:"តែ & ភេសជ្ជៈ",  emoji:"🍵" },
    { category_id:4, category_name:"អាហារ & នំ",    emoji:"🍰" },
  ],
  products: [
    { product_id:1,  category_id:1, product_name:"អាមេរិកាណូ",         base_price:2.50, emoji:"☕", is_active:true },
    { product_id:2,  category_id:1, product_name:"ឡាតេ",                base_price:3.50, emoji:"🥛", is_active:true },
    { product_id:3,  category_id:1, product_name:"កាព្វូស៊ីណូ",        base_price:3.00, emoji:"☕", is_active:true },
    { product_id:4,  category_id:1, product_name:"អេស្ប្រេស្សូ",       base_price:2.00, emoji:"☕", is_active:true },
    { product_id:5,  category_id:2, product_name:"អាម៉េរិកាណូត្រជាក់", base_price:3.00, emoji:"🧊", is_active:true },
    { product_id:6,  category_id:2, product_name:"ឡាតេត្រជាក់",        base_price:3.50, emoji:"🧊", is_active:true },
    { product_id:7,  category_id:2, product_name:"ម៉ូខា",               base_price:4.00, emoji:"🍫", is_active:true },
    { product_id:8,  category_id:3, product_name:"តែបៃតង",             base_price:2.00, emoji:"🍵", is_active:true },
    { product_id:9,  category_id:3, product_name:"ក្រូចឃ្មុំ",         base_price:2.50, emoji:"🍋", is_active:true },
    { product_id:10, category_id:4, product_name:"សាំងវិច",            base_price:3.50, emoji:"🥪", is_active:true },
    { product_id:11, category_id:4, product_name:"ខេក",                 base_price:2.50, emoji:"🍰", is_active:true },
    { product_id:12, category_id:4, product_name:"ដូណាត",              base_price:2.00, emoji:"🍩", is_active:true },
  ],
  recipes: [],
  options: [],
  users: [
    {
      user_id:1, username:"admin",
      password:"pbkdf2:6471abaa41f85fed180b35b407dabe8b:8b5cf4f8c6ed754edf7a6fae20c3a2f81ed7a78a65314ae49000ce92955929609c3d0ca8fb2dd7a823949f42a930a433b5f461e2000b821f67ac00e4814a3b2e",
      role:"admin", name:"Administrator", active:true, branch_id:"all"
    },
    {
      user_id:2, username:"staff1",
      password:"pbkdf2:a972d38e3671965c701732408c1b6469:b998f0db270d36269fcee6f1b6044191f8fd5463042ccaf5770bf599e04fbbdc1a46fbef972a82758a8ad391a40a755879cfa47103ff2e4fdec34635d915d38d",
      role:"staff", name:"បុគ្គលិក ១", active:true, branch_id:"branch_1"
    },
  ],
  theme: {
    bgMain:"#09080A", bgCard:"#120F13", bgHeader:"#0E0C0F",
    accent:"#E8A84B", accentDark:"#B8732A",
    textMain:"#EDE8E1", textDim:"#666666", borderCol:"#1E1B1F",
  },
};

const BRANCH_INGREDIENTS = [
  { ingredient_id:1, ingredient_name:"គ្រាប់កាហ្វេ",   current_stock:2000, unit:"g",   threshold:300  },
  { ingredient_id:2, ingredient_name:"ទឹកដោះគោខាប់",  current_stock:1500, unit:"ml",  threshold:400  },
  { ingredient_id:3, ingredient_name:"ទឹកដោះគោស្រស់", current_stock:4000, unit:"ml",  threshold:800  },
  { ingredient_id:4, ingredient_name:"ម្សៅកូកូអា",     current_stock:500,  unit:"g",   threshold:100  },
  { ingredient_id:5, ingredient_name:"ក្រែម Whip",      current_stock:300,  unit:"ml",  threshold:80   },
  { ingredient_id:6, ingredient_name:"ស្ករ",            current_stock:2000, unit:"g",   threshold:300  },
  { ingredient_id:7, ingredient_name:"តែបៃតង",         current_stock:400,  unit:"g",   threshold:80   },
  { ingredient_id:8, ingredient_name:"ទឹក",             current_stock:20000,unit:"ml",  threshold:2000 },
  { ingredient_id:9, ingredient_name:"ក្រូចឃ្មុំ",     current_stock:20,   unit:"pcs", threshold:5    },
];

const BRANCH_TABLES_DEF = Array.from({length:8},(_,i)=>({table_id:i+1,status:"free"}));

// ═══════════════════════════════════════════════════════════════════
//  DB HELPERS  (PostgreSQL JSONB)
// ═══════════════════════════════════════════════════════════════════

// ── Shared ─────────────────────────────────────────────
async function loadShared() {
  const { rows } = await pool.query("SELECT key, value FROM shared_data");
  const db = {};
  for (const r of rows) {
    // Normalize date fields in orders, logs, expenses arrays
    if (["orders","logs","expenses"].includes(r.key) && Array.isArray(r.value)) {
      db[r.key] = normalizeRows(r.value);
    } else {
      db[r.key] = r.value;
    }
  }
  // Fill missing keys with defaults
  for (const [k, v] of Object.entries(DEFAULT_SHARED)) {
    if (!(k in db)) {
      db[k] = v;
      await pool.query(
        "INSERT INTO shared_data(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [k, JSON.stringify(v)]
      );
    }
  }
  return db;
}

async function saveSharedKey(key, value) {
  await pool.query(
    "INSERT INTO shared_data(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2",
    [key, JSON.stringify(value)]
  );
}

// ── Branches ────────────────────────────────────────────
async function loadBranches() {
  const { rows } = await pool.query(
    "SELECT branch_id, branch_name, address, active FROM branches ORDER BY branch_id"
  );
  return rows;
}

async function saveBranchList(list) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const b of list) {
      await client.query(`
        INSERT INTO branches(branch_id, branch_name, address, active)
        VALUES($1,$2,$3,$4)
        ON CONFLICT(branch_id) DO UPDATE
          SET branch_name=$2, address=$3, active=$4
      `, [b.branch_id, b.branch_name, b.address||"", b.active!==false]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ── Branch Data (orders, tables, ingredients…) ──────────
async function loadBranch(bid) {
  const { rows } = await pool.query(
    "SELECT key, value FROM branch_data WHERE branch_id=$1", [bid]
  );
  const db = { branch_id: bid };
  for (const r of rows) {
    // Inject branch_id into orders/logs that are missing it (legacy data migration)
    if ((r.key === "orders" || r.key === "logs") && Array.isArray(r.value)) {
      db[r.key] = r.value.map(o => o && !o.branch_id ? { ...o, branch_id: bid } : o);
    } else {
      db[r.key] = r.value;
    }
  }

  // Fill defaults
  const def = {
    orders:      [],
    logs:        [],
    tables:      BRANCH_TABLES_DEF,
    ingredients: BRANCH_INGREDIENTS,
    expenses:    [],
    recipes:     [],   // recipes are per-branch (each branch has own ingredient mappings)
  };
  for (const [k, v] of Object.entries(def)) {
    if (!(k in db)) {
      db[k] = v;
      await pool.query(
        "INSERT INTO branch_data(branch_id,key,value) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [bid, k, JSON.stringify(v)]
      );
    }
  }
  return db;
}

async function saveBranchKey(bid, key, value) {
  await pool.query(`
    INSERT INTO branch_data(branch_id,key,value) VALUES($1,$2,$3)
    ON CONFLICT(branch_id,key) DO UPDATE SET value=$3
  `, [bid, key, JSON.stringify(value)]);
}

// Normalize order/expense dates — ensures created_at is always ISO string
// Fixes: "slice is not a function" crash when frontend receives numbers/objects
function normalizeRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    if (!row || typeof row !== "object") return row;
    const out = { ...row };
    // Normalize created_at
    if (out.created_at !== undefined) {
      if (out.created_at instanceof Date)   out.created_at = out.created_at.toISOString();
      else if (typeof out.created_at === "number") out.created_at = new Date(out.created_at).toISOString();
      else if (out.created_at === null)     out.created_at = new Date().toISOString();
    }
    // Normalize order_id (used as fallback date) — keep as string
    if (out.order_id !== undefined && typeof out.order_id === "number") {
      out.order_id = new Date(out.order_id).toISOString();
    }
    return out;
  });
}

// ═══════════════════════════════════════════════════════════════════
//  PASSWORD  (PBKDF2-SHA512)
// ═══════════════════════════════════════════════════════════════════
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(pw, salt, 100000, 64, "sha512").toString("hex");
  return "pbkdf2:" + salt + ":" + hash;
}

function verifyPassword(pw, stored) {
  if (!stored) return false;
  if (!stored.startsWith("pbkdf2:")) return stored === pw;
  const parts = stored.split(":");
  if (parts.length < 3) return false;
  const salt = parts[1];
  const hash = parts[2];
  if (!salt || !hash) return false;
  try {
    const check = crypto.pbkdf2Sync(pw, salt, 100000, 64, "sha512").toString("hex");
    // Ensure both buffers are same length before timingSafeEqual
    if (check.length !== hash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(hash, "hex"));
  } catch (e) {
    console.error("[verifyPassword] Error:", e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SESSIONS — Stateless HMAC tokens (survive server restarts!)
//  Format: base64url(payload_json) + "." + base64url(hmac_sha256)
// ═══════════════════════════════════════════════════════════════════
function b64u(buf) { return Buffer.from(buf).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,""); }
function fromb64u(s) { return Buffer.from(s.replace(/-/g,"+").replace(/_/g,"/"), "base64"); }

function createSession(user) {
  const payload = {
    user_id:user.user_id, username:user.username,
    role:user.role, name:user.name, branch_id:user.branch_id,
    exp: Date.now() + SESSION_HOURS * 3600 * 1000
  };
  const data = b64u(JSON.stringify(payload));
  const sig  = b64u(crypto.createHmac("sha256", JWT_SECRET).update(data).digest());
  return data + "." + sig;
}

function getSession(req) {
  const raw = (req.headers["authorization"]||"").replace("Bearer ","").trim();
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const data = raw.slice(0, dot);
  const sig  = raw.slice(dot + 1);
  // Verify signature
  const expected = b64u(crypto.createHmac("sha256", JWT_SECRET).update(data).digest());
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(fromb64u(data).toString());
    if (payload.exp < Date.now()) return null; // expired
    return payload;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════
//  HTTP + SOCKET.IO  SERVER
// ═══════════════════════════════════════════════════════════════════
const httpServer = http.createServer(handler);

// ── Socket.io setup ───────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET","POST"],
    allowedHeaders: ["Content-Type","Authorization","ngrok-skip-browser-warning"],
  },
  transports: ["websocket","polling"],
});

io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Client joins a branch "room" for targeted broadcasts
  socket.on("join_branch", (bid) => {
    socket.join(`branch:${bid}`);
    socket.join("all");
    console.log(`[Socket] ${socket.id} joined branch:${bid}`);
  });

  socket.on("disconnect", () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Helper: broadcast a data update to all clients in a branch room
function broadcastBranchUpdate(bid, table, data) {
  io.to(`branch:${bid}`).emit("branch_update", { branch_id:bid, table, data });
  io.to("all").emit("db_update", { scope:"branch", branch_id:bid, table });
}

function broadcastSharedUpdate(table, data) {
  io.emit("shared_update", { table, data });
  io.emit("db_update", { scope:"shared", table });
}

// ═══════════════════════════════════════════════════════════════════
//  HTTP HANDLER
// ═══════════════════════════════════════════════════════════════════
// recipes is PER-BRANCH: each branch has its own ingredient mappings
// (different branches may have different stock/ingredients)
const SHARED_TABLES = new Set(["categories","products","options","users","theme"]);
const BRANCH_TABLES = new Set(["orders","logs","tables","ingredients","expenses","recipes"]);

function readBody(req) {
  return new Promise((resolve,reject) => {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 50*1024*1024) reject(new Error("Too large")); });
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
    req.on("error", reject);
  });
}

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type,Authorization,ngrok-skip-browser-warning",
  });
  res.end(JSON.stringify(data));
}

function getBranch(req) {
  try { return new URL("http://x" + req.url).searchParams.get("branch") || null; }
  catch { return null; }
}

// Resolve branch: prefer URL param, then user session branch, then "branch_1"
function resolveBranch(req) {
  const urlBranch = getBranch(req);
  if (urlBranch) return urlBranch;
  const session = getSession(req);
  if (session && session.branch_id && session.branch_id !== "all") return session.branch_id;
  return "branch_1";
}

async function handler(req, res) {
  const url = req.url.split("?")[0];

  if (req.method === "OPTIONS") { send(res, 200, {}); return; }

  // ── Health ──────────────────────────────────────────────────────
  if (req.method === "GET" && url === "/api/ping") {
    const bs = await loadBranches();
    send(res, 200, { ok:true, time:new Date().toISOString(), branches:bs.length, db:"postgresql" });
    return;
  }

  // ── Full DB for branch ──────────────────────────────────────────
  if (req.method === "GET" && url === "/api/db") {
    const bid    = resolveBranch(req);   // uses session branch if no ?branch= param
    const shared = await loadShared();
    const branch = await loadBranch(bid);
    const safeShared = {
      ...shared,
      users: (shared.users||[]).map(({ password:_, ...u }) => u),
    };
    send(res, 200, { ...safeShared, ...branch, branch_id:bid });
    return;
  }

  // ── Branch list ─────────────────────────────────────────────────
  if (req.method === "GET" && url === "/api/branches") {
    send(res, 200, await loadBranches());
    return;
  }

  if (req.method === "POST" && url === "/api/branches") {
    const session = getSession(req);
    if (!session || session.role !== "admin" || session.branch_id !== "all") {
      send(res, 403, { error:"Super Admin only" }); return;
    }
    const body = await readBody(req);
    await saveBranchList(body);
    io.emit("shared_update", { table:"branches", data:body });
    send(res, 200, { ok:true });
    return;
  }

  // ── ADD single branch (super admin) ──────────────────────────────
  if (req.method === "POST" && url === "/api/branch/add") {
    const session = getSession(req);
    if (!session || session.role !== "admin" || session.branch_id !== "all") {
      send(res, 403, { error:"Super Admin only" }); return;
    }
    const { branch_id, branch_name, address } = await readBody(req);
    if (!branch_id || !branch_name) { send(res, 400, { error:"Missing branch_id or branch_name" }); return; }
    // Check duplicate
    const existing = await loadBranches();
    if (existing.find(b => b.branch_id === branch_id)) {
      send(res, 409, { error:"Branch ID already exists: " + branch_id }); return;
    }
    await pool.query(
      "INSERT INTO branches(branch_id,branch_name,address,active) VALUES($1,$2,$3,true)",
      [branch_id, branch_name, address||""]
    );
    // Initialize branch data (orders, tables, ingredients)
    await loadBranch(branch_id); // this seeds defaults
    const updated = await loadBranches();
    io.emit("shared_update", { table:"branches", data:updated });
    console.log(`[Branch] Added: ${branch_id} — ${branch_name}`);
    send(res, 200, { ok:true, branches:updated });
    return;
  }

  // ── DELETE branch (super admin, must be empty) ────────────────────
  if (req.method === "POST" && url === "/api/branch/delete") {
    const session = getSession(req);
    if (!session || session.role !== "admin" || session.branch_id !== "all") {
      send(res, 403, { error:"Super Admin only" }); return;
    }
    const { branch_id } = await readBody(req);
    if (!branch_id || branch_id === "branch_1") {
      send(res, 400, { error:"Cannot delete branch_1 (default)" }); return;
    }
    // Check if branch has orders
    const bd = await loadBranch(branch_id);
    if ((bd.orders||[]).length > 0) {
      send(res, 409, { error:"Branch has orders — clear data first" }); return;
    }
    await pool.query("DELETE FROM branches WHERE branch_id=$1", [branch_id]);
    await pool.query("DELETE FROM branch_data WHERE branch_id=$1", [branch_id]);
    const updated = await loadBranches();
    io.emit("shared_update", { table:"branches", data:updated });
    console.log(`[Branch] Deleted: ${branch_id}`);
    send(res, 200, { ok:true, branches:updated });
    return;
  }

  // ── All orders (admin multi-branch report) — ADMIN ONLY ─────────
  if (req.method === "GET" && url === "/api/all-orders") {
    const session = getSession(req);
    if (!session || session.role !== "admin") {
      send(res, 403, { error: "Admin only" });
      return;
    }
    const branches = (await loadBranches()).filter(b => b.active);
    const all = [];
    for (const b of branches) {
      const bd = await loadBranch(b.branch_id);
      normalizeRows(bd.orders||[]).forEach(o => all.push({ ...o, branch_id: o.branch_id || b.branch_id, branch_name:b.branch_name }));
    }
    all.sort((a,b) => new Date(b.order_id) - new Date(a.order_id));
    send(res, 200, all);
    return;
  }

  // ── LOGIN ───────────────────────────────────────────────────────
  if (req.method === "POST" && url === "/api/login") {
    const { username, password } = await readBody(req);
    if (!username || !password) { send(res, 400, { error:"Missing credentials" }); return; }

    const shared = await loadShared();
    const user   = (shared.users||[]).find(u => u.username === username.trim() && u.active);
    if (!user)                         { send(res, 401, { error:"Invalid username or password" }); return; }
    if (!verifyPassword(password, user.password)) { send(res, 401, { error:"Invalid username or password" }); return; }

    // Auto-migrate plain-text password
    if (!user.password.startsWith("pbkdf2:")) {
      user.password = hashPassword(password);
      shared.users  = shared.users.map(u => u.user_id === user.user_id ? user : u);
      await saveSharedKey("users", shared.users);
      console.log("[SECURITY] Migrated plain-text password:", username);
    }

    const token   = createSession(user);
    const safeUser = {
      user_id:user.user_id, username:user.username, role:user.role,
      name:user.name, branch_id:user.branch_id, active:user.active,
      permissions:user.permissions||{}
    };
    console.log(`[LOGIN] ${username} (${user.role})`);
    send(res, 200, { ok:true, token, user:safeUser });
    return;
  }

  // ── LOGOUT ──────────────────────────────────────────────────────
  if (req.method === "POST" && url === "/api/logout") {
    // JWT is stateless — client just discards the token
    // Optionally add a token blacklist here for extra security
    send(res, 200, { ok:true });
    return;
  }

  // ── CHANGE PASSWORD ─────────────────────────────────────────────
  if (req.method === "POST" && url === "/api/change-password") {
    const session = getSession(req);
    if (!session) { send(res, 401, { error:"Not authenticated" }); return; }

    const { oldPassword, newPassword } = await readBody(req);
    if (!oldPassword || !newPassword)  { send(res, 400, { error:"Missing fields" }); return; }
    if (newPassword.length < 6)        { send(res, 400, { error:"Password too short (min 6)" }); return; }

    const shared = await loadShared();
    const user   = (shared.users||[]).find(u => u.user_id === session.user_id);
    if (!user)                                 { send(res, 404, { error:"User not found" }); return; }
    if (!verifyPassword(oldPassword, user.password)) { send(res, 401, { error:"Current password is incorrect" }); return; }

    user.password  = hashPassword(newPassword);
    shared.users   = shared.users.map(u => u.user_id === user.user_id ? user : u);
    await saveSharedKey("users", shared.users);
    console.log(`[PASSWORD] Changed for: ${user.username}`);
    send(res, 200, { ok:true });
    return;
  }

  // ── ME (verify token) ───────────────────────────────────────────
  if (req.method === "GET" && url === "/api/me") {
    const session = getSession(req);
    if (!session) { send(res, 401, { error:"Not authenticated" }); return; }
    const shared  = await loadShared();
    const meUser  = (shared.users||[]).find(u => u.user_id === session.user_id);
    send(res, 200, {
      user_id:session.user_id, username:session.username,
      role:session.role, name:session.name, branch_id:session.branch_id,
      permissions:(meUser && meUser.permissions)||{}
    });
    return;
  }

  // ── SAVE TABLE ──────────────────────────────────────────────────
  if (req.method === "POST" && url.startsWith("/api/db/")) {
    const table = url.replace("/api/db/", "");
    const bid   = resolveBranch(req);   // uses session branch if no ?branch= param
    const body  = await readBody(req);

    if (SHARED_TABLES.has(table)) {
      // Special handling for users: restore passwords (client doesn't have them)
      if (table === "users" && Array.isArray(body)) {
        const existing = await loadShared();
        const existingUsers = existing.users || [];
        const merged = body.map(u => {
          const old = existingUsers.find(e => e.user_id === u.user_id);
          if (!old) return u; // new user - keep as-is
          // Restore password from existing record if client didn't send one
          const pw = u.password;
          if (!pw || pw === "") {
            return { ...u, password: old.password };
          }
          // If plain text (not hashed), hash it
          if (typeof pw === "string" && !pw.startsWith("pbkdf2:")) {
            return { ...u, password: hashPassword(pw) };
          }
          return u; // already hashed
        });
        await saveSharedKey("users", merged);
        // Broadcast without passwords
        const safeMerged = merged.map(({ password:_, ...u }) => u);
        broadcastSharedUpdate("users", safeMerged);
        console.log(`[SHARED] Saved: users (${merged.length} rows, passwords preserved)`);
        send(res, 200, { ok:true });
        return;
      }
      await saveSharedKey(table, body);
      broadcastSharedUpdate(table, body);
      console.log(`[SHARED] Saved: ${table}`);
      send(res, 200, { ok:true });
      return;
    }

    if (BRANCH_TABLES.has(table)) {
      // For ingredients: use timestamp-based conflict resolution
      // Only overwrite if incoming data is newer than stored (prevents stale socket overwrite)
      if (table === "ingredients" && Array.isArray(body)) {
        // Load current DB state
        const current = await loadBranch(bid);
        const currentIngs = current.ingredients || [];
        // Merge: for each ingredient in body, update only if body has lower or equal stock
        // (stock can only go down during checkout, or up during restock)
        // Just save as-is but add write timestamp
        const stamped = body.map(i => ({ ...i, _ts: Date.now() }));
        await saveBranchKey(bid, table, stamped);
        broadcastBranchUpdate(bid, table, stamped);
      } else {
        await saveBranchKey(bid, table, body);
        broadcastBranchUpdate(bid, table, body);
      }
      console.log(`[${bid}] Saved: ${table} ${Array.isArray(body) ? body.length + " rows" : ""}`);
      send(res, 200, { ok:true });
      return;
    }

    send(res, 404, { error:"Table not found: " + table });
    return;
  }

  // ── ALL STOCK (admin only) — ingredients per branch ─────────────
  if (req.method === "GET" && url === "/api/all-stock") {
    const session = getSession(req);
    if (!session || session.role !== "admin") {
      send(res, 403, { error:"Admin only" }); return;
    }
    const branches = (await loadBranches()).filter(b => b.active);
    const result = {};
    for (const b of branches) {
      const bd = await loadBranch(b.branch_id);
      result[b.branch_id] = {
        branch_name: b.branch_name,
        ingredients: bd.ingredients || [],
      };
    }
    send(res, 200, result);
    return;
  }

  // ── MIGRATE RECIPES — fix orphan recipe→ingredient mappings ───────
  // Removes recipe rows whose ingredient_id no longer exists in that branch's
  // ingredients list, and re-sequences ingredient_id + recipe_id integers so
  // they never collide with timestamp-based IDs.
  if (req.method === "POST" && url === "/api/migrate-recipes") {
    const session = getSession(req);
    if (!session || session.role !== "admin") {
      send(res, 403, { error:"Admin only" }); return;
    }
    try {
      const branches = (await loadBranches()).filter(b => b.active);
      const results  = [];
      // Shared recipes (if any) — skip (branch recipes only)
      for (const b of branches) {
        const bd = await loadBranch(b.branch_id);
        const ings    = bd.ingredients || [];
        const recipes = bd.recipes     || [];
        const ingIds  = new Set(ings.map(i => Number(i.ingredient_id)));

        // 1) Remove orphan mappings (ingredient no longer exists)
        const clean   = recipes.filter(r => ingIds.has(Number(r.ingredient_id)));
        const removed = recipes.length - clean.length;

        // 2) Re-sequence recipe_id (keep as small integers, avoid timestamp IDs)
        const reindexed = clean.map((r, idx) => ({ ...r, recipe_id: idx + 1 }));

        await saveBranchKey(b.branch_id, "recipes", reindexed);
        broadcastBranchUpdate(b.branch_id, "recipes", reindexed);

        results.push({
          branch_id: b.branch_id,
          before: recipes.length,
          after:  reindexed.length,
          removed,
        });
        console.log(`[migrate-recipes] ${b.branch_id}: removed=${removed}, kept=${reindexed.length}`);
      }
      send(res, 200, { ok:true, results });
    } catch(e) {
      console.error("[migrate-recipes]", e.message);
      send(res, 500, { error: e.message });
    }
    return;
  }

  // ── RESET DAILY ─────────────────────────────────────────────────
  if (req.method === "POST" && url.startsWith("/api/reset-daily")) {
    const bid = resolveBranch(req);
    await saveBranchKey(bid, "orders", []);
    await saveBranchKey(bid, "logs",   []);
    broadcastBranchUpdate(bid, "orders", []);
    broadcastBranchUpdate(bid, "logs",   []);
    console.log(`[${bid}] Reset daily`);
    send(res, 200, { ok:true });
    return;
  }

  // ── CLEAR ALL ORDERS (admin only) ────────────────────────────────
  if (req.method === "POST" && url === "/api/clear-all-orders") {
    const session = getSession(req);
    if (!session || session.role !== "admin") {
      send(res, 403, { error:"Admin only" }); return;
    }
    const scope = (new URL("http://x"+req.url).searchParams.get("scope")) || "all";
    const branches = (await loadBranches()).filter(b => b.active);
    const cleared = [];
    for (const b of branches) {
      if (scope !== "all" && scope !== b.branch_id) continue;
      await saveBranchKey(b.branch_id, "orders", []);
      await saveBranchKey(b.branch_id, "logs",   []);
      broadcastBranchUpdate(b.branch_id, "orders", []);
      broadcastBranchUpdate(b.branch_id, "logs",   []);
      cleared.push(b.branch_id);
    }
    console.log(`[ADMIN] Cleared orders for: ${cleared.join(", ")}`);
    send(res, 200, { ok:true, cleared });
    return;
  }

  // ── THERMAL PRINTER ─────────────────────────────────────────────
  if (req.method === "POST" && url.startsWith("/api/print")) {
    try {
      const body = await readBody(req);
      const r    = body.receipt;
      if (!r) { send(res, 400, { error:"Missing receipt" }); return; }

      const ESC=0x1B, GS=0x1D;
      const cmd=[];
      const b  =(...bytes)=>bytes.forEach(x=>cmd.push(x));
      const txt=(s)=>{ for(const c of s) cmd.push(c.charCodeAt(0)&0xFF); };
      const lf =()=>cmd.push(0x0A);
      const centerOn =()=>b(ESC,0x61,0x01);
      const centerOff=()=>b(ESC,0x61,0x00);
      const boldOn   =()=>b(ESC,0x45,0x01);
      const boldOff  =()=>b(ESC,0x45,0x00);
      const dblSize  =()=>b(GS,0x21,0x11);
      const normalSz =()=>b(GS,0x21,0x00);
      const cutPaper =()=>b(GS,0x56,0x41,0x03);
      const line  =(s="")=>{ txt(s); lf(); };
      const dashes=()=>line("--------------------------------");
      const rjust =(left,right,w=32)=>left+" ".repeat(Math.max(1,w-left.length-right.length))+right;

      b(ESC,0x40);
      centerOn(); boldOn(); dblSize();
      line("Cafe Bloom"); normalSz(); boldOff();
      line(""); centerOff(); centerOn();
      line("Tel: 012 XXX XXX");
      line(r.ts||new Date().toLocaleString());
      if(r.table) line(`Table: ${r.table}`);
      centerOff(); dashes();

      for(const i of r.items||[]) {
        const name  = (i.product_name||"").slice(0,20);
        const price = `$${(i.price*i.qty).toFixed(2)}`;
        line(rjust(`${i.qty}x ${name}`,price));
        const sub=[i.opts?.size,i.opts?.sugar].filter(Boolean).join(" ");
        if(sub){ txt("   "); line(sub); }
      }

      dashes();
      const method=r.method==="cash"?"Cash":r.method==="qr"?"QR Code":"Bank";
      line(rjust("Subtotal:",`$${Number(r.total).toFixed(2)}`));
      line(rjust("VAT 10%:",`$${Number(r.tax).toFixed(2)}`));
      dashes(); boldOn(); dblSize();
      line(rjust("TOTAL:",`$${(Number(r.total)+Number(r.tax)).toFixed(2)}`));
      normalSz(); boldOff(); dashes(); centerOn();
      line(`[${method}]`);
      lf(); line("Thank you! / Arkun!"); lf();
      line("Cafe Bloom - POS"); lf(); lf(); lf();
      cutPaper();

      const { spawnSync } = await import("child_process");
      let printerPath=null;
      for(const p of ["/dev/usb/lp0","/dev/usb/lp1","/dev/lp0","/dev/ttyUSB0","/dev/ttyUSB1"]) {
        try { fs.accessSync(p,fs.constants.W_OK); printerPath=p; break; } catch{}
      }
      if(!printerPath) {
        const lp=spawnSync("lp",["-o","raw","-"],{input:Buffer.from(cmd),timeout:5000});
        if(lp.status===0){ send(res,200,{ok:true,via:"cups"}); return; }
        send(res,503,{error:"No printer found. Check USB connection."}); return;
      }
      fs.writeFileSync(printerPath,Buffer.from(cmd));
      send(res,200,{ok:true,via:printerPath}); return;
    } catch(e) {
      console.error("[PRINT ERROR]",e.message);
      send(res,500,{error:e.message}); return;
    }
  }

  send(res, 404, { error:"Not found" });
}

// ═══════════════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════════════
initDB()
  .then(() => {
    httpServer.listen(PORT, "0.0.0.0", async () => {
      console.log("╔══════════════════════════════════════════════╗");
      console.log("║  Cafe Bloom POS — PostgreSQL + Socket.io     ║");
      console.log(`║  Port: ${PORT}  |  DB: PostgreSQL               ║`);
      console.log("╚══════════════════════════════════════════════╝");
      const bs = await loadBranches();
      bs.forEach(b => console.log(`  ✓ Branch: ${b.branch_name}`));
    });
  })
  .catch(err => {
    console.error("❌ DB Init failed:", err.message);
    process.exit(1);
  });

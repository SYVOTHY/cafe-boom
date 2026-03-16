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
const SESSION_HOURS  = parseInt(process.env.SESSION_EXPIRES_HOURS || "12", 10);
const DATABASE_URL   = process.env.DATABASE_URL;   // set by Railway PostgreSQL plugin

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

    // Force-fix users: always update users to ensure hashes are correct
    await client.query(
      "INSERT INTO shared_data(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2",
      ["users", JSON.stringify(DEFAULT_SHARED.users)]
    );

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
  for (const r of rows) db[r.key] = r.value;

  // Fill defaults
  const def = {
    orders:      [],
    logs:        [],
    tables:      BRANCH_TABLES_DEF,
    ingredients: BRANCH_INGREDIENTS,
    expenses:    [],
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
//  SESSIONS  (in-memory — acceptable: short-lived tokens)
// ═══════════════════════════════════════════════════════════════════
const sessions = new Map();

function createSession(user) {
  const token   = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
  sessions.set(token, {
    user_id:user.user_id, username:user.username,
    role:user.role, name:user.name, branch_id:user.branch_id, expires
  });
  for (const [t,s] of sessions) if (s.expires < Date.now()) sessions.delete(t);
  return token;
}

function getSession(req) {
  const token = (req.headers["authorization"]||"").replace("Bearer ","").trim();
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.expires < Date.now()) { sessions.delete(token); return null; }
  return s;
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
const SHARED_TABLES = new Set(["categories","products","recipes","options","users","theme"]);
const BRANCH_TABLES = new Set(["orders","logs","tables","ingredients","expenses"]);

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
  try { return new URL("http://x" + req.url).searchParams.get("branch") || "branch_1"; }
  catch { return "branch_1"; }
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
    const bid    = getBranch(req);
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
    const body = await readBody(req);
    await saveBranchList(body);
    io.emit("shared_update", { table:"branches", data:body });
    send(res, 200, { ok:true });
    return;
  }

  // ── All orders (admin multi-branch report) ──────────────────────
  if (req.method === "GET" && url === "/api/all-orders") {
    const branches = (await loadBranches()).filter(b => b.active);
    const all = [];
    for (const b of branches) {
      const bd = await loadBranch(b.branch_id);
      normalizeRows(bd.orders||[]).forEach(o => all.push({ ...o, branch_id:b.branch_id, branch_name:b.branch_name }));
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
    const auth = (req.headers["authorization"]||"").replace("Bearer ","").trim();
    if (auth) sessions.delete(auth);
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
    const bid   = getBranch(req);
    const body  = await readBody(req);

    if (SHARED_TABLES.has(table)) {
      await saveSharedKey(table, body);
      broadcastSharedUpdate(table, body);
      console.log(`[SHARED] Saved: ${table}`);
      send(res, 200, { ok:true });
      return;
    }

    if (BRANCH_TABLES.has(table)) {
      await saveBranchKey(bid, table, body);
      broadcastBranchUpdate(bid, table, body);
      console.log(`[${bid}] Saved: ${table} ${Array.isArray(body) ? body.length + " rows" : ""}`);
      send(res, 200, { ok:true });
      return;
    }

    send(res, 404, { error:"Table not found: " + table });
    return;
  }

  // ── RESET DAILY ─────────────────────────────────────────────────
  if (req.method === "POST" && url.startsWith("/api/reset-daily")) {
    const bid = getBranch(req);
    await saveBranchKey(bid, "orders", []);
    await saveBranchKey(bid, "logs",   []);
    broadcastBranchUpdate(bid, "orders", []);
    broadcastBranchUpdate(bid, "logs",   []);
    console.log(`[${bid}] Reset daily`);
    send(res, 200, { ok:true });
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

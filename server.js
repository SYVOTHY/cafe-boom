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

// ── Telegram config (MUST be set in Railway environment variables) ─
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || "";    // set in Railway env
const TG_CHAT_ID   = process.env.TG_CHAT_ID   || "";    // set in Railway env
const TG_ENABLED   = TG_BOT_TOKEN.length > 10 && TG_CHAT_ID.length > 3;
if (!TG_ENABLED) console.warn("[Telegram] TG_BOT_TOKEN or TG_CHAT_ID not set — notifications disabled");

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
//  PASSWORD  (PBKDF2-SHA512, 100k iterations, timing-safe compare)
// ═══════════════════════════════════════════════════════════════════
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(pw, salt, 100000, 64, "sha512").toString("hex");
  return "pbkdf2:" + salt + ":" + hash;
}

function verifyPassword(pw, stored) {
  if (!stored || typeof pw !== "string") return false;
  if (!stored.startsWith("pbkdf2:")) {
    // Legacy plain-text — constant-time compare to prevent timing attacks
    try {
      return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(pw));
    } catch { return stored === pw; }
  }
  const parts = stored.split(":");
  if (parts.length < 3) return false;
  const [, salt, hash] = parts;
  if (!salt || !hash) return false;
  try {
    const check = crypto.pbkdf2Sync(pw, salt, 100000, 64, "sha512").toString("hex");
    if (check.length !== hash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(hash, "hex"));
  } catch (e) {
    console.error("[verifyPassword]", e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  JWT  —  HS256 (standard 3-part: header.payload.signature)
//  Survives server restarts, validated with HMAC-SHA256.
//  Access token:  2h  (short-lived, sent on every request)
//  Refresh token: 30d (long-lived, stored in client localStorage)
// ═══════════════════════════════════════════════════════════════════
const JWT_ALG    = "HS256";
const ACCESS_EXP = 2 * 3600 * 1000;        // 2 hours in ms
const REFRESH_EXP = SESSION_HOURS * 3600 * 1000; // 30 days default

// Token blacklist — revoked tokens (logout, password change)
// In-memory; survives till server restart (acceptable for POS use case)
const _revokedTokens = new Set();
// Auto-clean expired entries every hour
setInterval(() => {
  const now = Date.now();
  for (const t of _revokedTokens) {
    try {
      const payload = _jwtDecodePayload(t);
      if (payload && payload.exp < now) _revokedTokens.delete(t);
    } catch { _revokedTokens.delete(t); }
  }
}, 3600 * 1000);

function _b64u(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function _fromb64u(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function _jwtSign(payload) {
  const header  = _b64u(JSON.stringify({ alg: JWT_ALG, typ: "JWT" }));
  const body    = _b64u(JSON.stringify(payload));
  const sig     = _b64u(crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

function _jwtVerify(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = _b64u(crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest());
  // Timing-safe compare
  try {
    if (sig.length !== expected.length) return null;
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  } catch { return null; }
  try {
    const payload = JSON.parse(_fromb64u(body).toString());
    if (payload.exp && payload.exp < Date.now()) return null; // expired
    return payload;
  } catch { return null; }
}

function _jwtDecodePayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(_fromb64u(parts[1]).toString());
  } catch { return null; }
}

// ── Create access token (short-lived, 2h) ────────────────────────
function createAccessToken(user) {
  return _jwtSign({
    jti:       crypto.randomBytes(8).toString("hex"), // unique token ID
    iss:       "cafe-bloom-pos",
    sub:       String(user.user_id),
    user_id:   user.user_id,
    username:  user.username,
    role:      user.role,
    name:      user.name,
    branch_id: user.branch_id,
    type:      "access",
    iat:       Date.now(),
    exp:       Date.now() + ACCESS_EXP,
  });
}

// ── Create refresh token (long-lived, 30d) ────────────────────────
function createRefreshToken(user) {
  return _jwtSign({
    jti:     crypto.randomBytes(8).toString("hex"),
    sub:     String(user.user_id),
    user_id: user.user_id,
    type:    "refresh",
    iat:     Date.now(),
    exp:     Date.now() + REFRESH_EXP,
  });
}

// ── Revoke a token (logout / password change) ─────────────────────
function revokeToken(token) {
  if (token) _revokedTokens.add(token);
}

// ── Parse & validate token from Authorization header ──────────────
// Returns payload or null
function getSession(req) {
  const authHeader = (req.headers["authorization"] || "").trim();
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  if (_revokedTokens.has(token)) return null; // blacklisted
  return _jwtVerify(token);
}

// ── Keep backward-compat alias ────────────────────────────────────
const createSession = createAccessToken;

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

// ── Presence tracking — user online/offline ──────────────────────
// Map: socket.id → { user_id, username, name, branch_id, joinedAt }
const onlineUsers = new Map();

function broadcastPresence() {
  const list = Array.from(onlineUsers.values());
  io.emit("presence_update", list);
}

io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Client joins a branch "room" for targeted broadcasts
  socket.on("join_branch", (bid) => {
    socket.join(`branch:${bid}`);
    socket.join("all");
    console.log(`[Socket] ${socket.id} joined branch:${bid}`);
  });

  // ── Presence: user comes online ────────────────────────────────
  socket.on("user_online", ({ user_id, username, name, branch_id }) => {
    onlineUsers.set(socket.id, {
      user_id, username, name: name || username,
      branch_id: branch_id || null,
      socket_id: socket.id,
      since: Date.now(),
    });
    broadcastPresence();
    console.log(`[Presence] + ${username} (${socket.id})`);
  });

  // ── Presence: heartbeat keeps user alive ──────────────────────
  socket.on("heartbeat", ({ user_id }) => {
    const u = onlineUsers.get(socket.id);
    if (u) { u.since = Date.now(); onlineUsers.set(socket.id, u); }
  });

  socket.on("disconnect", () => {
    const u = onlineUsers.get(socket.id);
    if (u) {
      console.log(`[Presence] - ${u.username} (${socket.id})`);
      onlineUsers.delete(socket.id);
      broadcastPresence();
    }
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

// ═══════════════════════════════════════════════════════════════════
//  AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════

// ── Rate limiting — simple in-memory per IP ──────────────────────
const _rateLimits = new Map(); // ip → { count, resetAt }
const RATE_WINDOW_MS  = 60 * 1000;  // 1 minute window
const RATE_MAX_LOGIN  = 10;          // max login attempts per window
const RATE_MAX_API    = 300;         // max general API calls per window

function rateCheck(ip, bucket, max) {
  const key = `${ip}:${bucket}`;
  const now = Date.now();
  let r = _rateLimits.get(key);
  if (!r || now > r.resetAt) {
    r = { count: 0, resetAt: now + RATE_WINDOW_MS };
    _rateLimits.set(key, r);
  }
  r.count++;
  if (r.count > max) return false; // blocked
  return true;
}

// Clean rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rateLimits) { if (now > v.resetAt) _rateLimits.delete(k); }
}, 5 * 60 * 1000);

// ── Auth: require valid session ───────────────────────────────────
function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    send(res, 401, { error:"Authentication required — please log in again" });
    return null;
  }
  return session;
}

// ── Auth: require admin role ──────────────────────────────────────
function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session)                     { send(res, 401, { error:"Authentication required" }); return null; }
  if (session.role !== "admin")     { send(res, 403, { error:"Admin access required" });   return null; }
  return session;
}

// ── Auth: require global (super) admin ───────────────────────────
function requireSuperAdmin(req, res) {
  const session = getSession(req);
  if (!session)                         { send(res, 401, { error:"Authentication required" }); return null; }
  if (session.role !== "admin")         { send(res, 403, { error:"Admin access required" });   return null; }
  if (session.branch_id !== "all")      { send(res, 403, { error:"Super Admin access required" }); return null; }
  return session;
}

// ── Auth: require access to a specific branch ─────────────────────
// Super admin → always allowed
// Branch admin/staff → only own branch
function requireBranchAccess(req, res, bid) {
  const session = getSession(req);
  if (!session) { send(res, 401, { error:"Authentication required" }); return null; }
  const isSuper = session.role === "admin" && session.branch_id === "all";
  if (!isSuper && session.branch_id !== bid) {
    send(res, 403, { error:`Access to branch '${bid}' denied` }); return null;
  }
  return session;
}

// ═══════════════════════════════════════════════════════════════════
//  VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════

// Validate string field: non-empty, optional max length
function valStr(val, name, { min=1, max=500, required=true } = {}) {
  if (required && (val === undefined || val === null || String(val).trim() === "")) {
    return `'${name}' is required`;
  }
  if (val !== undefined && val !== null) {
    const s = String(val).trim();
    if (s.length < min) return `'${name}' must be at least ${min} character(s)`;
    if (s.length > max) return `'${name}' must be at most ${max} character(s)`;
  }
  return null;
}

// Validate number: must be a finite number, optional range
function valNum(val, name, { min=-Infinity, max=Infinity, required=true } = {}) {
  if (required && (val === undefined || val === null)) return `'${name}' is required`;
  const n = Number(val);
  if (isNaN(n) || !isFinite(n)) return `'${name}' must be a valid number`;
  if (n < min) return `'${name}' must be ≥ ${min}`;
  if (n > max) return `'${name}' must be ≤ ${max}`;
  return null;
}

// Validate array is actually an array
function valArray(val, name) {
  if (!Array.isArray(val)) return `'${name}' must be an array`;
  return null;
}

// Collect errors and send 400 if any
function validate(res, checks) {
  const errors = checks.filter(Boolean);
  if (errors.length > 0) {
    send(res, 400, { error: errors[0], errors });
    return false;
  }
  return true;
}

// Sanitize branch_id: alphanumeric, underscores, dashes only
function sanitizeBranchId(bid) {
  if (!bid) return null;
  return String(bid).replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 50);
}

// Sanitize username: alphanumeric, underscores only
function sanitizeUsername(u) {
  if (!u) return "";
  return String(u).replace(/[^a-zA-Z0-9_\-\.@]/g, "").slice(0, 50).trim();
}

// Detect SQL injection / script injection patterns
const INJECT_PATTERN = /(<script|<\/script|javascript:|on\w+\s*=|';\s*--|;\s*DROP\s+TABLE|UNION\s+SELECT)/i;
function hasSQLInjection(str) {
  return typeof str === "string" && INJECT_PATTERN.test(str);
}

// Deep scan object for injection attempts (skip large data arrays for performance)
function scanForInjection(obj, depth = 0) {
  if (depth > 4) return false;
  if (typeof obj === "string") return hasSQLInjection(obj);
  if (Array.isArray(obj)) {
    // Only scan first 5 items for performance
    return obj.slice(0, 5).some(v => scanForInjection(v, depth + 1));
  }
  if (obj && typeof obj === "object") {
    return Object.values(obj).some(v => scanForInjection(v, depth + 1));
  }
  return false;
}

// IP extraction
function getIP(req) {
  return (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
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
  const ip  = getIP(req);

  if (req.method === "OPTIONS") { send(res, 200, {}); return; }

  // ── Global rate limit ──────────────────────────────────────────
  if (!rateCheck(ip, "api", RATE_MAX_API)) {
    console.warn(`[RateLimit] ${ip} exceeded API limit`);
    send(res, 429, { error:"Too many requests — please slow down" }); return;
  }

  // ── Health ──────────────────────────────────────────────────────
  if (req.method === "GET" && url === "/api/ping") {
    const bs = await loadBranches();
    send(res, 200, { ok:true, time:new Date().toISOString(), branches:bs.length, db:"postgresql" });
    return;
  }

  // ── Full DB for branch ──────────────────────────────────────────
  if (req.method === "GET" && url === "/api/db") {
    const session = requireAuth(req, res);
    if (!session) return;
    const bid     = sanitizeBranchId(resolveBranch(req)) || "branch_1";
    const isSuper = session.role === "admin" && session.branch_id === "all";
    if (!isSuper && session.branch_id !== bid) { send(res, 403, { error:"Branch access denied" }); return; }
    const shared = await loadShared();
    const branch = await loadBranch(bid);
    const safeShared = { ...shared, users: (shared.users||[]).map(({ password:_, ...u }) => u) };
    send(res, 200, { ...safeShared, ...branch, branch_id:bid });
    return;
  }

  // ── Branch list ─────────────────────────────────────────────────
  if (req.method === "GET" && url === "/api/branches") {
    const session = requireAuth(req, res);
    if (!session) return;
    send(res, 200, await loadBranches());
    return;
  }

  if (req.method === "POST" && url === "/api/branches") {
    const session = requireSuperAdmin(req, res);
    if (!session) return;
    const body = await readBody(req);
    if (!validate(res, [valArray(body, "branches")])) return;
    await saveBranchList(body);
    io.emit("shared_update", { table:"branches", data:body });
    send(res, 200, { ok:true });
    return;
  }

  // ── ADD single branch (super admin) ──────────────────────────────
  if (req.method === "POST" && url === "/api/branch/add") {
    const session = requireSuperAdmin(req, res);
    if (!session) return;
    const body = await readBody(req);
    if (scanForInjection(body)) { send(res, 400, { error:"Invalid input" }); return; }
    const { branch_id, branch_name, address } = body;
    if (!validate(res, [
      valStr(branch_id,   "branch_id",   { max:50 }),
      valStr(branch_name, "branch_name", { max:100 }),
    ])) return;
    const cleanBid = sanitizeBranchId(branch_id);
    if (!cleanBid) { send(res, 400, { error:"branch_id contains invalid characters" }); return; }
    const existing = await loadBranches();
    if (existing.find(b => b.branch_id === cleanBid)) {
      send(res, 409, { error:"Branch ID already exists: " + cleanBid }); return;
    }
    await pool.query(
      "INSERT INTO branches(branch_id,branch_name,address,active) VALUES($1,$2,$3,true)",
      [cleanBid, String(branch_name).trim().slice(0,100), String(address||"").slice(0,200)]
    );
    await loadBranch(cleanBid);
    const updated = await loadBranches();
    io.emit("shared_update", { table:"branches", data:updated });
    console.log(`[Branch] Added: ${cleanBid} by ${session.username}`);
    send(res, 200, { ok:true, branches:updated });
    return;
  }

  // ── DELETE branch (super admin) ───────────────────────────────────
  if (req.method === "POST" && url === "/api/branch/delete") {
    const session = requireSuperAdmin(req, res);
    if (!session) return;
    const { branch_id } = await readBody(req);
    const cleanBid = sanitizeBranchId(branch_id);
    if (!cleanBid || cleanBid === "branch_1") {
      send(res, 400, { error:"Cannot delete branch_1 (default)" }); return;
    }
    const bd = await loadBranch(cleanBid);
    if ((bd.orders||[]).length > 0) {
      send(res, 409, { error:"Branch has orders — clear data first" }); return;
    }
    await pool.query("DELETE FROM branches WHERE branch_id=$1",    [cleanBid]);
    await pool.query("DELETE FROM branch_data WHERE branch_id=$1", [cleanBid]);
    const updated = await loadBranches();
    io.emit("shared_update", { table:"branches", data:updated });
    console.log(`[Branch] Deleted: ${cleanBid} by ${session.username}`);
    send(res, 200, { ok:true, branches:updated });
    return;
  }

  // ── All orders (admin) ───────────────────────────────────────────
  if (req.method === "GET" && url === "/api/all-orders") {
    const session = requireAdmin(req, res);
    if (!session) return;
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
    // Strict rate limit on login (brute force protection)
    if (!rateCheck(ip, "login", RATE_MAX_LOGIN)) {
      console.warn(`[RateLimit] ${ip} exceeded login limit`);
      send(res, 429, { error:"Too many login attempts — wait 1 minute" }); return;
    }
    const body = await readBody(req);
    const { username, password } = body;
    if (!validate(res, [
      valStr(username, "username", { max:100 }),
      valStr(password, "password", { max:200 }),
    ])) return;
    const cleanUser = sanitizeUsername(username);
    const shared = await loadShared();
    const user   = (shared.users||[]).find(u => u.username === cleanUser && u.active);
    if (!user || !verifyPassword(password, user.password)) {
      console.warn(`[LOGIN FAIL] ${cleanUser} from ${ip}`);
      send(res, 401, { error:"Invalid username or password" }); return;
    }
    // Auto-migrate plain-text password
    if (!user.password.startsWith("pbkdf2:")) {
      user.password = hashPassword(password);
      shared.users  = shared.users.map(u => u.user_id === user.user_id ? user : u);
      await saveSharedKey("users", shared.users);
    }
    const token        = createAccessToken(user);
    const refreshToken = createRefreshToken(user);
    const safeUser = {
      user_id:user.user_id, username:user.username, role:user.role,
      name:user.name, branch_id:user.branch_id, active:user.active,
      permissions:user.permissions||{}, avatar:user.avatar||""
    };
    console.log(`[LOGIN] ${cleanUser} (${user.role}) from ${ip}`);
    send(res, 200, { ok:true, token, refreshToken, user:safeUser,
      tokenExpiresIn: ACCESS_EXP, refreshExpiresIn: REFRESH_EXP });
    return;
  }

  // ── LOGOUT — revoke token in blacklist ────────────────────────────
  if (req.method === "POST" && url === "/api/logout") {
    const authHeader = (req.headers["authorization"] || "").trim();
    if (authHeader.startsWith("Bearer ")) revokeToken(authHeader.slice(7).trim());
    try {
      const body = await readBody(req);
      if (body?.refreshToken) revokeToken(body.refreshToken);
    } catch {}
    console.log(`[LOGOUT] ${ip}`);
    send(res, 200, { ok:true });
    return;
  }

  // ── REFRESH TOKEN — rotate to new access + refresh pair ──────────
  if (req.method === "POST" && url === "/api/refresh") {
    let body = {};
    try { body = await readBody(req); } catch {}
    const rt = body?.refreshToken;
    if (!rt) { send(res, 400, { error:"refreshToken required" }); return; }
    if (_revokedTokens.has(rt)) { send(res, 401, { error:"Token revoked — log in again" }); return; }
    const payload = _jwtVerify(rt);
    if (!payload || payload.type !== "refresh") {
      send(res, 401, { error:"Invalid or expired refresh token" }); return;
    }
    const shared = await loadShared();
    const user   = (shared.users||[]).find(u => u.user_id === payload.user_id && u.active);
    if (!user) { send(res, 401, { error:"User not found or inactive" }); return; }
    revokeToken(rt); // rotate — old refresh token is now invalid
    const newToken   = createAccessToken(user);
    const newRefresh = createRefreshToken(user);
    console.log(`[REFRESH] user_id=${payload.user_id} from ${ip}`);
    send(res, 200, { ok:true, token:newToken, refreshToken:newRefresh, tokenExpiresIn:ACCESS_EXP });
    return;
  }

  // ── CHANGE PASSWORD ─────────────────────────────────────────────
  if (req.method === "POST" && url === "/api/change-password") {
    const session = requireAuth(req, res);
    if (!session) return;
    const { oldPassword, newPassword } = await readBody(req);
    if (!validate(res, [
      valStr(oldPassword, "oldPassword", { max:200 }),
      valStr(newPassword, "newPassword", { min:6, max:200 }),
    ])) return;
    const shared = await loadShared();
    const user   = (shared.users||[]).find(u => u.user_id === session.user_id);
    if (!user)                                       { send(res, 404, { error:"User not found" }); return; }
    if (!verifyPassword(oldPassword, user.password)) { send(res, 401, { error:"Current password is incorrect" }); return; }
    user.password  = hashPassword(newPassword);
    shared.users   = shared.users.map(u => u.user_id === user.user_id ? user : u);
    await saveSharedKey("users", shared.users);
    // Revoke current token — user must re-login with new password
    const authHeader = (req.headers["authorization"] || "").trim();
    if (authHeader.startsWith("Bearer ")) revokeToken(authHeader.slice(7).trim());
    // Issue new tokens immediately so client doesn't need to log in again
    const newToken   = createAccessToken(user);
    const newRefresh = createRefreshToken(user);
    console.log(`[PASSWORD] Changed: ${user.username} from ${ip}`);
    send(res, 200, { ok:true, token:newToken, refreshToken:newRefresh });
    return;
  }

  // ── ME ───────────────────────────────────────────────────────────
  if (req.method === "GET" && url === "/api/me") {
    const session = requireAuth(req, res);
    if (!session) return;
    const shared  = await loadShared();
    const meUser  = (shared.users||[]).find(u => u.user_id === session.user_id);
    if (!meUser || !meUser.active) { send(res, 401, { error:"Account not found or inactive" }); return; }
    send(res, 200, {
      user_id:session.user_id, username:session.username,
      role:session.role, name:session.name, branch_id:session.branch_id,
      avatar:meUser.avatar||"",
      permissions:(meUser.permissions)||{}
    });
    return;
  }

  // ── SAVE TABLE ──────────────────────────────────────────────────
  if (req.method === "POST" && url.startsWith("/api/db/")) {
    const session = requireAuth(req, res);
    if (!session) return;

    const table = url.replace("/api/db/", "").split("?")[0];
    const bid   = sanitizeBranchId(resolveBranch(req)) || "branch_1";
    const body  = await readBody(req);

    if (body === null || body === undefined) {
      send(res, 400, { error:"Request body required" }); return;
    }
    // Injection scan
    if (typeof body === "object" && scanForInjection(body)) {
      console.warn(`[SECURITY] Injection attempt on ${table} by ${session.username} from ${ip}`);
      send(res, 400, { error:"Invalid input detected" }); return;
    }

    if (SHARED_TABLES.has(table)) {
      if (session.role !== "admin") {
        send(res, 403, { error:"Admin required to modify shared data" }); return;
      }
      if (table === "users" && Array.isArray(body)) {
        const existing = await loadShared();
        const existingUsers = existing.users || [];
        const merged = body.map(u => {
          const old = existingUsers.find(e => e.user_id === u.user_id);
          if (!old) return u;
          const pw = u.password;
          if (!pw || pw === "") return { ...u, password: old.password };
          if (typeof pw === "string" && !pw.startsWith("pbkdf2:")) return { ...u, password: hashPassword(pw) };
          return u;
        });
        await saveSharedKey("users", merged);
        const safeMerged = merged.map(({ password:_, ...u }) => u);
        broadcastSharedUpdate("users", safeMerged);
        console.log(`[SHARED] Saved: users (${merged.length} rows) by ${session.username}`);
        send(res, 200, { ok:true }); return;
      }
      await saveSharedKey(table, body);
      broadcastSharedUpdate(table, body);
      console.log(`[SHARED] Saved: ${table} by ${session.username}`);
      send(res, 200, { ok:true }); return;
    }

    if (BRANCH_TABLES.has(table)) {
      // Verify session has access to this branch
      const isSuper = session.role === "admin" && session.branch_id === "all";
      if (!isSuper && session.branch_id !== bid) {
        send(res, 403, { error:`Access to branch '${bid}' denied` }); return;
      }
      if (table === "ingredients" && Array.isArray(body)) {
        const stamped = body.map(i => ({ ...i, _ts: Date.now() }));
        await saveBranchKey(bid, table, stamped);
        broadcastBranchUpdate(bid, table, stamped);
      } else {
        await saveBranchKey(bid, table, body);
        broadcastBranchUpdate(bid, table, body);
      }
      console.log(`[${bid}] Saved: ${table} ${Array.isArray(body)?body.length+" rows":""} by ${session.username}`);
      send(res, 200, { ok:true }); return;
    }

    send(res, 404, { error:"Table not found: " + table }); return;
  }

  // ── ALL STOCK ─────────────────────────────────────────────────────
  if (req.method === "GET" && url === "/api/all-stock") {
    const session = requireAdmin(req, res);
    if (!session) return;
    const branches = (await loadBranches()).filter(b => b.active);
    const result = {};
    for (const b of branches) {
      const bd = await loadBranch(b.branch_id);
      result[b.branch_id] = { branch_name:b.branch_name, ingredients:bd.ingredients||[] };
    }
    send(res, 200, result);
    return;
  }

  // ── MIGRATE RECIPES ───────────────────────────────────────────────
  if (req.method === "POST" && url === "/api/migrate-recipes") {
    const session = requireAdmin(req, res);
    if (!session) return;
    try {
      const branches = (await loadBranches()).filter(b => b.active);
      const results  = [];
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
    const session = requireAuth(req, res);
    if (!session) return;
    const bid = sanitizeBranchId(resolveBranch(req)) || "branch_1";
    const isSuper = session.role === "admin" && session.branch_id === "all";
    if (!isSuper && session.branch_id !== bid) { send(res, 403, { error:"Branch access denied" }); return; }
    await saveBranchKey(bid, "orders", []);
    await saveBranchKey(bid, "logs",   []);
    broadcastBranchUpdate(bid, "orders", []);
    broadcastBranchUpdate(bid, "logs",   []);
    console.log(`[${bid}] Reset daily by ${session.username}`);
    send(res, 200, { ok:true });
    return;
  }

  // ── CLEAR ALL ORDERS (admin only) ────────────────────────────────
  if (req.method === "POST" && url === "/api/clear-all-orders") {
    const session = requireAdmin(req, res);
    if (!session) return;
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
    console.log(`[ADMIN] Cleared orders for: ${cleared.join(", ")} by ${session.username}`);
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


// ═══════════════════════════════════════════════════════════════════
//  TELEGRAM HELPER  (server-side — token never exposed to client)
// ═══════════════════════════════════════════════════════════════════
async function tgSend(text) {
  if (!TG_ENABLED) return;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: "HTML" }),
    });
    const result = await r.json().catch(() => ({}));
    if (!r.ok) console.error("[Telegram]", result.description);
  } catch (e) { console.error("[Telegram]", e.message); }
}

async function tgNotifyOrder(rec, branchName) {
  const method = rec.method === "cash" ? "\u{1F4B5} \u179F\u17B6\u1785\u17CB\u1794\u17D2\u179A\u17B6\u1780"
    : rec.method === "qr" ? "\u{1F4F1} QR Code" : "\u{1F3E6} \u178A\u1793\u17B6\u1782\u17B6\u179A";
  const itemLines = (rec.items || [])
    .map(i => `  \u2022 ${i.emoji || "\u2615"} ${i.product_name} \xd7${i.qty}  =  $${(i.price * i.qty).toFixed(2)}`)
    .join("\n");
  const text = [
    `\u2615 <b>Cafe Bloom \u2014 \u1780\u17B6\u179A\u178F\u16B9\u178F\u17B6\u178F\u17CE\u1790\u17D2\u1798\u17B8!</b>`,
    `\u{1FA96} <b>\u179F\u17B6\u1781\u17B6:</b> ${branchName}`,
    ``,
    `\u{1F550} <b>\u1798\u17D2\u17A2\u1784:</b> ${rec.ts}`,
    rec.table ? `\u{1FA91} <b>\u178F\u17BB:</b> ${rec.table}` : `\u{1F961} Take Away`,
    ``,
    `\u{1F4CB} <b>\u1798\u17BB\u1781\u1798\u17D2\u17A0\u16B4\u1794:</b>`,
    itemLines,
    ``,
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
    `\u{1F4B0} <b>\u179F\u179A\u17BB\u1794:</b>  $${Number(rec.total).toFixed(2)}`,
    `\u{1F3DB} <b>VAT 10%:</b>  $${Number(rec.tax).toFixed(2)}`,
    `\u2705 <b>\u179F\u179A\u17BB\u1794\u179A\u17BD\u1798:</b>  <b>$${(Number(rec.total) + Number(rec.tax)).toFixed(2)}</b>`,
    `\u{1F4B3} <b>\u179C\u17B7\u1792\u17B9\u178F\u16B9\u178F\u17B6\u178F\u17CB:</b> ${method}`,
  ].join("\n");
  await tgSend(text);
}

async function tgNotifyShift(shiftId, orders, branchMap) {
  const shifts = { morning: { label: "\u{1F305} \u1796\u17D2\u179A\u17B9\u1780", start:5, end:13 },
                   afternoon: { label: "\u2600\uFE0F \u179A\u179F\u17B9\u1799", start:12, end:19 } };
  const shift = shifts[shiftId] || shifts.morning;
  const today = new Date().toISOString().slice(0,10);
  const shiftOrders = (orders||[]).filter(o => {
    try {
      const d = new Date(o.order_id);
      return d.toISOString().slice(0,10) === today && d.getHours() >= shift.start && d.getHours() < shift.end;
    } catch { return false; }
  });
  const totalRev   = shiftOrders.reduce((s,o)=>s+Number(o.total||0)+Number(o.tax||0),0);
  const totalItems = shiftOrders.reduce((s,o)=>s+(o.items||[]).reduce((ss,i)=>ss+(i.qty||1),0),0);
  const byBranch = {};
  shiftOrders.forEach(o => {
    const bid = o.branch_id || "?";
    if (!byBranch[bid]) byBranch[bid] = { rev:0, orders:0 };
    byBranch[bid].rev    += Number(o.total||0) + Number(o.tax||0);
    byBranch[bid].orders += 1;
  });
  const branchLines = Object.entries(byBranch).map(([bid, bd]) => {
    const name = branchMap[bid] || bid;
    return `  \u{1FA96} ${name}: <b>$${bd.rev.toFixed(2)}</b> \u00b7 ${bd.orders} Orders`;
  }).join("\n");
  const text = [
    `${shift.label} <b>Cafe Bloom \u2014 \u1794\u17D2\u178F\u17BC\u179C\u17C1\u1793!</b>`,
    `\u23F0 \u179C\u17C1\u1793: ${shift.start}:00 \u2192 ${shift.end}:00  \u00b7  ${today}`,
    ``,
    `\u{1F4CA} \u179F\u1784\u17D2\u1781\u17C1\u1794:  \u{1F4B0} $${totalRev.toFixed(2)}  \u00b7  \u{1F6D2} ${shiftOrders.length} Orders  \u00b7  \u{1F35D} ${totalItems} \u1798\u17BB\u1781`,
    ...(branchLines ? [``, `\u{1FA96} \u178F\u17B6\u1798\u179F\u17B6\u1781\u17B6:`, branchLines] : []),
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
    `\u2705 <b>\u1794\u17D2\u178F\u17BC\u179C\u17C1\u1793\u179A\u17BD\u1785\u179A\u17B6\u179B!</b>`,
  ].join("\n");
  await tgSend(text);
}

// ═══════════════════════════════════════════════════════════════════
//  CHECKOUT ENDPOINT — atomic stock deduction on server
//  POST /api/checkout
//  Body: { items:[{product_id,qty,product_name,price,emoji}],
//          method, table, branchId, cashier, total, tax }
//  Returns: { ok, order, newIngredients, logs }
// ═══════════════════════════════════════════════════════════════════
  // ── CHECKOUT ─────────────────────────────────────────────────────
  if (req.method === "POST" && url === "/api/checkout") {
    const session = requireAuth(req, res);
    if (!session) return;

    const body = await readBody(req);
    if (!validate(res, [
      valArray(body.items, "items"),
      valStr(body.method,   "method", { max:20 }),
    ])) return;

    const bid = sanitizeBranchId(body.branchId || session.branch_id || "branch_1");
    // Verify branch access
    const isSuper = session.role === "admin" && session.branch_id === "all";
    if (!isSuper && session.branch_id !== bid) {
      send(res, 403, { error:"Branch access denied" }); return;
    }

    const { items, method, table, cashier, total, tax } = body;

    // ── Load current branch data ──────────────────────────────────
    const bd      = await loadBranch(bid);
    let   ings    = bd.ingredients || [];
    const recipes = bd.recipes     || [];

    // ── Validate + deduct stock atomically ───────────────────────
    const logEntries  = [];
    const ts          = new Date().toLocaleString("km-KH");

    for (const item of items) {
      const pid       = Number(item.product_id);
      const qty       = Number(item.qty) || 1;
      const prodRecipes = recipes.filter(r => Number(r.product_id) === pid);

      // Check stock sufficiency
      for (const r of prodRecipes) {
        const ing  = ings.find(i => Number(i.ingredient_id) === Number(r.ingredient_id));
        if (!ing) continue;
        const need = Number(r.quantity_required) * qty;
        if (Number(ing.current_stock) < need) {
          send(res, 409, { error: `${ing.ingredient_name} \u179F\u17D2\u178F\u17BB\u1780\u1798\u17B7\u1793\u1782\u17D2\u179A\u1794!`, ingredient: ing.ingredient_name });
          return;
        }
      }

      // Deduct + collect logs
      ings = ings.map(ing => {
        const r = prodRecipes.find(r => Number(r.ingredient_id) === Number(ing.ingredient_id));
        if (!r) return ing;
        const need = Number(r.quantity_required) * qty;
        logEntries.push({
          log_id: Date.now() + "_" + ing.ingredient_id + "_" + Math.random().toString(36).slice(2,6),
          ts, product: item.product_name,
          ingredient: ing.ingredient_name,
          before:   String(Number(ing.current_stock).toFixed(1)),
          deducted: String(need.toFixed(1)),
          after:    String((Number(ing.current_stock) - need).toFixed(1)),
          unit:     ing.unit || "",
          branch_id: bid,
        });
        return { ...ing, current_stock: Number(ing.current_stock) - need };
      });
    }

    // ── Build order record ────────────────────────────────────────
    const order_id = Date.now();
    const rec = {
      order_id,
      items,
      table: table || null,
      total: Number(total) || 0,
      tax:   Number(tax)   || 0,
      method,
      ts,
      cashier: cashier || session.username,
      branch_id: bid,
    };

    // ── Stamp ingredients with timestamp ─────────────────────────
    const stamped = ings.map(i => ({ ...i, _ts: order_id }));

    // ── Persist: ingredients + orders + logs ─────────────────────
    const prevOrders = bd.orders || [];
    const prevLogs   = bd.logs   || [];
    const newOrders  = [rec, ...prevOrders];
    const newLogs    = [...logEntries, ...prevLogs];

    await saveBranchKey(bid, "ingredients", stamped);
    await saveBranchKey(bid, "orders",      newOrders);
    await saveBranchKey(bid, "logs",        newLogs);

    // ── Broadcast via socket ──────────────────────────────────────
    broadcastBranchUpdate(bid, "ingredients", stamped);
    broadcastBranchUpdate(bid, "orders",      newOrders);
    broadcastBranchUpdate(bid, "logs",        newLogs);

    console.log(`[CHECKOUT] ${bid} | ${items.length} items | $${rec.total} | by ${session.username}`);

    // ── Telegram notification (fire-and-forget) ────────────────
    const branches   = await loadBranches();
    const branchInfo = branches.find(b => b.branch_id === bid);
    const branchName = branchInfo?.branch_name || bid;
    tgNotifyOrder(rec, branchName).catch(() => {});

    send(res, 200, { ok:true, order:rec, newIngredients:stamped, logs:logEntries });
    return;
  }

  // ── SHIFT SUMMARY (Telegram) ──────────────────────────────────────
  if (req.method === "POST" && url === "/api/shift-summary") {
    const session = requireAdmin(req, res);
    if (!session) return;
    const body = await readBody(req);
    const { shiftId } = body;
    if (!shiftId) { send(res, 400, { error:"shiftId required" }); return; }
    const branches = (await loadBranches()).filter(b => b.active);
    const allOrds  = [];
    const branchMap = {};
    for (const b of branches) {
      branchMap[b.branch_id] = b.branch_name;
      const bd = await loadBranch(b.branch_id);
      (bd.orders||[]).forEach(o => allOrds.push({ ...o, branch_id: b.branch_id }));
    }
    await tgNotifyShift(shiftId, allOrds, branchMap);
    console.log(`[SHIFT] Summary sent: ${shiftId} by ${session.username}`);
    send(res, 200, { ok:true });
    return;
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

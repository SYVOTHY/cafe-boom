// ═══════════════════════════════════════════════════════════════════
//  Cafe Bloom POS — Multi-Branch React Frontend
//  PostgreSQL + Socket.io Edition (Full Integrated)
//  config: public/config.js → window.CAFE_SERVER, window.CAFE_BRANCH
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRealtimeDB } from "./useRealtimeDB.js";

// ── Config from public/config.js ─────────────────────────────────
const CLOUD_URL        = window.CAFE_SERVER      || "https://cafe-bloom-backend.up.railway.app";
const DEFAULT_BRANCH   = window.CAFE_BRANCH      || "branch_1";
const BRANCH_NAME      = window.CAFE_BRANCH_NAME || "Cafe Bloom";

// ── Telegram Notification ─────────────────────────────────────────
const TG_TOKEN   = "8503740689:AAEN1Hk9HEbMNWjsArqjzZb_WgTHo55-ZkU";
const TG_CHAT_ID = "-5197630379";

// Helper: resolve branch name from branches list or fallback
function getBranchDisplayName(branchId, branches) {
  if (!branchId) return "Cafe Bloom";
  const found = (branches || []).find(b => b.branch_id === branchId);
  return found ? found.branch_name : branchId;
}

// Helper: get branch label badge for a user
function getUserBranchBadge(user, branches) {
  const bid = user?.branch_id;
  if (!bid) return null;
  if (bid === "all") {
    // Super Admin
    return { label: "⭐ Super Admin", bg: "linear-gradient(135deg,#1A0A3A,#6A3FB8)", color: "#C084FC", border: "#9B6FE833" };
  }
  const bName = (branches||[]).find(b => b.branch_id === bid)?.branch_name || bid;
  const colors = {
    branch_1: { bg:"#1A2A0A", color:"#27AE60", border:"#27AE6033" },
    branch_2: { bg:"#0A1A2A", color:"#5BA3E0", border:"#5BA3E033" },
    branch_3: { bg:"#2A0A1A", color:"#C0527A", border:"#C0527A33" },
    branch_4: { bg:"#1A1A0A", color:"#E8A84B", border:"#E8A84B33" },
    branch_5: { bg:"#0A1A1A", color:"#3ABFBF", border:"#3ABFBF33" },
  };
  const c = colors[bid] || { bg:"#1A181C", color:"#888", border:"#33333333" };
  return { label: "🏪 " + bName, ...c };
}

function getBranchName() {
  if (typeof window !== "undefined") {
    if (window.CAFE_BRANCH_NAME) return window.CAFE_BRANCH_NAME;
    if (window.CAFE_BRANCH)      return window.CAFE_BRANCH;
  }
  return "Cafe Bloom";
}

async function tgSend(text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: "HTML" }),
    });
    const result = await r.json().catch(() => ({}));
    if (!r.ok) console.error("❌ Telegram:", result.description);
    else       console.log("✅ Telegram OK");
  } catch (e) { console.error("❌ Telegram:", e.message); }
}

async function sendTelegram(rec) {
  const branch = getBranchName();
  const method = rec.method === "cash" ? "💵 សាច់ប្រាក់"
    : rec.method === "qr"   ? "📱 QR Code"
    : "🏦 ធនាគារ";
  const itemLines = (rec.items || [])
    .map(i => `  • ${i.emoji || "☕"} ${i.product_name} ×${i.qty}  =  $${(i.price * i.qty).toFixed(2)}`)
    .join("\n");
  const text = [
    `☕ <b>Cafe Bloom — ការទូទាត់ថ្មី!</b>`,
    `🏪 <b>សាខា:</b> ${branch}`,
    ``,
    `🕐 <b>ម៉ោង:</b> ${rec.ts}`,
    rec.table ? `🪑 <b>តុ:</b> ${rec.table}` : `🥡 Take Away`,
    ``,
    `📋 <b>មុខម្ហូប:</b>`,
    itemLines,
    ``,
    `─────────────────`,
    `💰 <b>សរុប:</b>  $${Number(rec.total).toFixed(2)}`,
    `🏛 <b>VAT 10%:</b>  $${Number(rec.tax).toFixed(2)}`,
    `✅ <b>សរុបរួម:</b>  <b>$${(Number(rec.total) + Number(rec.tax)).toFixed(2)}</b>`,
    `💳 <b>វិធីទូទាត់:</b> ${method}`,
  ].join("\n");
  await tgSend(text);
}

// sendTelegramWithBranch — uses explicit branch name (from user's branch_id)
async function sendTelegramWithBranch(rec, branchName) {
  const branch = branchName || getBranchName();
  const method = rec.method === "cash" ? "💵 សាច់ប្រាក់"
    : rec.method === "qr"   ? "📱 QR Code"
    : "🏦 ធនាគារ";
  const itemLines = (rec.items || [])
    .map(i => `  • ${i.emoji || "☕"} ${i.product_name} ×${i.qty}  =  $${(i.price * i.qty).toFixed(2)}`)
    .join("\n");
  const text = [
    `☕ <b>Cafe Bloom — ការទូទាត់ថ្មី!</b>`,
    `🏪 <b>សាខា:</b> ${branch}`,
    ``,
    `🕐 <b>ម៉ោង:</b> ${rec.ts}`,
    rec.table ? `🪑 <b>តុ:</b> ${rec.table}` : `🥡 Take Away`,
    ``,
    `📋 <b>មុខម្ហូប:</b>`,
    itemLines,
    ``,
    `─────────────────`,
    `💰 <b>សរុប:</b>  $${Number(rec.total).toFixed(2)}`,
    `🏛 <b>VAT 10%:</b>  $${Number(rec.tax).toFixed(2)}`,
    `✅ <b>សរុបរួម:</b>  <b>$${(Number(rec.total) + Number(rec.tax)).toFixed(2)}</b>`,
    `💳 <b>វិធីទូទាត់:</b> ${method}`,
  ].join("\n");
  await tgSend(text);
}

// API alias for compatibility with old page components
const API = CLOUD_URL;

// ── Default theme ─────────────────────────────────────────────────
const DEFAULT_THEME = {
  bgMain: "#09080A", bgCard: "#120F13", bgHeader: "#0E0C0F",
  accent: "#E8A84B", accentDark: "#B8732A",
  textMain: "#EDE8E1", textDim: "#666666", borderCol: "#1E1B1F",
};

// ── API helpers ───────────────────────────────────────────────────
async function apiCall(path, opts = {}) {
  const token = localStorage.getItem("pos_token");
  const r = await fetch(CLOUD_URL + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(opts.headers || {}),
    },
  });
  return r;
}

async function printReceipt(rec) {
  try {
    const res = await fetch(`${CLOUD_URL}/api/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipt: rec }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Print failed");
    return { ok: true, via: data.via };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Utilities ─────────────────────────────────────────────────────
function runTransaction(ingredients, recipes, productId, qty) {
  // Use Number() to ensure all values are numbers, not strings
  const prodRecipes = recipes.filter(r => Number(r.product_id) === Number(productId));
  const checks = [];
  let failedOn = null;

  for (const r of prodRecipes) {
    const ing = ingredients.find(i => Number(i.ingredient_id) === Number(r.ingredient_id));
    if (!ing) continue;
    const need = Number(r.quantity_required) * Number(qty);
    const ok = Number(ing?.current_stock) >= need;
    checks.push({ ing: { ...ing }, need, ok });
    if (!ok && !failedOn) failedOn = ing?.ingredient_name;
  }

  if (failedOn) return { success: false, reason: failedOn, checks };

  // Deduct stock
  const newIngredients = ingredients.map(ing => {
    const r = prodRecipes.find(r => Number(r.ingredient_id) === Number(ing.ingredient_id));
    if (!r) return ing;
    return { ...ing, current_stock: Number(ing?.current_stock) - Number(r.quantity_required) * Number(qty) };
  });

  return { success: true, checks, newIngredients };
}

const nextId = a => Math.max(0, ...a.map(x => Object.values(x)[0])) + 1;

const fmtN = n => Number(n).toFixed(1);
// Format number with thousands separator: 1716.0 → "1,716.0"  or  "1,716"
const fmtStock = (n, decimals = 1) => {
  const num = Number(n);
  if (isNaN(num)) return "0";
  const parts = num.toFixed(decimals).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // Remove .0 for clean display
  return decimals === 1 && parts[1] === "0" ? parts[0] : parts.join(".");
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const fmt  = (n) => "$" + Number(n || 0).toFixed(2);
const now  = ()  => new Date().toISOString();
const uid  = ()  => Date.now() + "_" + Math.random().toString(36).slice(2, 6);
const TAX  = 0.10;

const PERM_LABELS = {
  pos:       { icon: "🛒", label: "ចំណុចលក់" },
  tables:    { icon: "🪑", label: "តុ" },
  menu:      { icon: "🍽️", label: "ម៉ឺនុយ" },
  orders:    { icon: "📋", label: "ប្រវត្តិ" },
  report:    { icon: "📊", label: "របាយការណ៍" },
  finance:   { icon: "💼", label: "ហិរញ្ញវត្ថុ" },
  // inventory, users, theme are admin-only — staff gets read-only view of inventory
};

// Permissions that only admin can have (never grant to staff)
const ADMIN_ONLY_PERMS = new Set(["users", "theme", "inventory"]);

const DEFAULT_PERMS_TPL = {
  pos: false, tables: false, menu: false,
  orders: false, report: false, finance: false,
  // inventory, users, theme — admin-only (staff gets read-only inventory view)
};

const SUGAR = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "100%"];
const MILK = ["គ្មានទឹកដោះ", "ទឹកដោះគោ", "ទឹកសណ្ដែក", "Oat", "មិនថែមអ្វីទេ"];

// ── EXPORT UTILITIES ────────────────────────────────────────────────
// Download CSV from array of objects
const exportCSV = (rows, filename) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// Print as PDF using browser print dialog (styled)
const exportPDF = (title, dateLabel, tableHTML) => {
  const win = window.open("", "_blank", "width=900,height=700");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Kantumruy Pro',sans-serif;color:#111;padding:24px;font-size:13px}
    h1{font-size:20px;font-weight:700;margin-bottom:4px;color:#B8732A}
    .sub{font-size:12px;color:#666;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th{background:#B8732A;color:#fff;padding:8px 10px;text-align:left;font-size:12px}
    td{padding:7px 10px;border-bottom:1px solid #eee;font-size:12px}
    tr:nth-child(even) td{background:#fafafa}
    .total{margin-top:16px;text-align:right;font-size:14px;font-weight:700;color:#B8732A}
    .footer{margin-top:24px;font-size:11px;color:#aaa;text-align:center}
    @media print{body{padding:12px}}
  </style></head><body>
  <h1>☕ Café Bloom — ${title}</h1>
  <div class="sub">${dateLabel} · បោះពុម្ព: ${new Date().toLocaleString("km-KH")}</div>
  ${tableHTML}
  <div class="footer">Café Bloom POS © ${new Date().getFullYear()}</div>
  \x3cscript\x3ewindow.onload=()=>{window.print();}\x3c/script\x3e
  </body></html>`);
  win.document.close();
};

// ═══════════════════════════════════════════════════════════════════
//  STYLE TOKENS  (must be before all components)
// ═══════════════════════════════════════════════════════════════════
const inputSt = {
  background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 9,
  padding: "9px 13px", color: "var(--text-main)", fontFamily: "inherit", fontSize: 13,
};
const btnGold = {
  padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer",
  background: "linear-gradient(135deg,#B8732A,#E8A84B)", color: "#fff",
  fontWeight: 700, fontFamily: "inherit", fontSize: 13,
};
const btnGhost = {
  padding: "10px 18px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
  border: "1px solid #2A2730", background: "transparent", color: "#888",
};
const btnGreen = {
  padding: "10px 18px", borderRadius: 10, border: "none", cursor: "pointer",
  background: "linear-gradient(135deg,#1A7A3A,#27AE60)", color: "#fff",
  fontWeight: 700, fontFamily: "inherit", fontSize: 13,
};
const btnRed = {
  padding: "10px 18px", borderRadius: 10, border: "none", cursor: "pointer",
  background: "linear-gradient(135deg,#7A1A1A,#E74C3C)", color: "#fff",
  fontWeight: 700, fontFamily: "inherit", fontSize: 13,
};
const btnSmall = {
  padding: "5px 10px", borderRadius: 7, border: "1px solid #2A2730",
  background: "transparent", color: "#aaa", cursor: "pointer", fontFamily: "inherit", fontSize: 12,
};

function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("km-KH", { day:"2-digit", month:"2-digit", year:"numeric" }); }
  catch { return iso.slice(0, 10); }
}
function fmtTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString("km-KH", { hour:"2-digit", minute:"2-digit" }); }
  catch { return ""; }
}
function fmtDateTime(iso) { return fmtDate(iso) + " " + fmtTime(iso); }
// safeDate — fix crash when order_id/created_at is number (Date.now()) from DB
function safeDate(v) {
  if (!v) return "";
  if (typeof v === "number") return new Date(v).toISOString().slice(0,10);
  if (typeof v === "string") return v.slice(0,10);
  if (v instanceof Date)     return v.toISOString().slice(0,10);
  return String(v).slice(0,10);
}
function safeMonth(v) { return safeDate(v).slice(0,7); }

// ═══════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function CafeBloom() {
  // ── Auth state ──────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError]     = useState("");
  const [authChecked, setAuthChecked]   = useState(false);

  // ── Navigation ──────────────────────────────────────────────────
  const [page, setPage] = useState("pos");
  const [menuOpen, setMenuOpen] = useState(false);

  // ── DB State (raw from server) ──────────────────────────────────
  const [catsRaw,     setCatsRaw]     = useState([]);
  const [prodsRaw,    setProdsRaw]    = useState([]);
  const [ingsRaw,     setIngsRaw]     = useState([]);
  const [recipesRaw,  setRecipesRaw]  = useState([]);
  const [optionsRaw,  setOptionsRaw]  = useState([]);
  const [tablesRaw,   setTablesRaw]   = useState([]);
  const [ordersRaw,   setOrdersRaw]   = useState([]);
  const [logsRaw,     setLogsRaw]     = useState([]);
  const [usersRaw,    setUsersRaw]    = useState([]);
  const [themeRaw,    setThemeRaw]    = useState(DEFAULT_THEME);
  const [expensesRaw, setExpensesRaw] = useState([]);
  const [offline,     setOffline]     = useState(false);

  // ── Real-time DB hook (PostgreSQL + Socket.io) ──────────────────
  // ── Branch resolution ──────────────────────────────────────────
  // Staff: always use their assigned branch_id
  // Admin with specific branch (e.g. "branch_2"): use that branch
  // Admin with branch_id="all": use pickedBranch (chosen after login)
  const [pickedBranch, setPickedBranch] = useState(null); // null = not picked yet
  const [branchList,   setBranchList]   = useState([]);   // for picker

  const isGlobalAdmin = currentUser?.role === "admin" && currentUser?.branch_id === "all";

  // Load branch list for global admin picker
  useEffect(() => {
    if (!isGlobalAdmin) return;
    const token = localStorage.getItem("pos_token");
    const hdr = { "Content-Type":"application/json","ngrok-skip-browser-warning":"true",...(token?{Authorization:"Bearer "+token}:{}) };
    fetch(`${API}/api/branches`, { headers:hdr })
      .then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setBranchList(d.filter(b=>b.active)); })
      .catch(()=>{});
  }, [isGlobalAdmin]);

  const activeBranchId = (() => {
    // Staff or admin assigned to specific branch
    if (currentUser?.branch_id && currentUser.branch_id !== "all") return currentUser.branch_id;
    // Global admin: use picked branch or default
    return pickedBranch || DEFAULT_BRANCH;
  })();

  const { db, loading, socketOnline, saveTable, reload } = useRealtimeDB(CLOUD_URL, activeBranchId);

  // Sync DB → state when data arrives/updates
  useEffect(() => {
    if (!db) return;
    if (db.categories)  setCatsRaw(db.categories);
    if (db.products)    setProdsRaw(db.products);
    if (db.ingredients) setIngsRaw(db.ingredients);
    if (db.recipes)     setRecipesRaw(db.recipes);
    if (db.options)     setOptionsRaw(db.options);
    if (db.tables)      setTablesRaw(db.tables);
    if (db.orders)      setOrdersRaw(db.orders);
    if (db.logs)        setLogsRaw(db.logs);
    if (db.users)       setUsersRaw(db.users);
    if (db.theme) {
      setThemeRaw({ ...DEFAULT_THEME, ...db.theme });
      // Sync shopName+shopLogo from DB to localStorage so all devices show same brand
      if (db.theme.shopName) localStorage.setItem("cb_shop_name", db.theme.shopName);
      if (db.theme.shopLogo !== undefined) localStorage.setItem("cb_shop_logo", db.theme.shopLogo || "");
    }
    if (db.expenses)    setExpensesRaw(db.expenses);
    setOffline(false);
  }, [db]);

  // ── mkSet: update state + save to server ──────────────────────
  const mkSet = useCallback((setRaw, key) => (v) => setRaw(prev => {
    const n = typeof v === "function" ? v(prev) : v;
    saveTable(key, n);
    return n;
  }), [saveTable]);

  const setCats     = useMemo(() => mkSet(setCatsRaw,     "categories"),  [mkSet]);
  const setProds    = useMemo(() => mkSet(setProdsRaw,    "products"),    [mkSet]);
  const setIngs     = useMemo(() => mkSet(setIngsRaw,     "ingredients"), [mkSet]);
  const setRecipes  = useMemo(() => mkSet(setRecipesRaw,  "recipes"),     [mkSet]);
  const setOptions  = useMemo(() => mkSet(setOptionsRaw,  "options"),     [mkSet]);
  const setTables   = useMemo(() => mkSet(setTablesRaw,   "tables"),      [mkSet]);
  const setOrders   = useMemo(() => mkSet(setOrdersRaw,   "orders"),      [mkSet]);
  const setLogs     = useMemo(() => mkSet(setLogsRaw,     "logs"),        [mkSet]);
  const setUsers    = useMemo(() => mkSet(setUsersRaw,    "users"),       [mkSet]);
  const setTheme    = useMemo(() => mkSet(setThemeRaw,    "theme"),       [mkSet]);
  const setExpenses = useMemo(() => mkSet(setExpensesRaw, "expenses"),    [mkSet]);

  // ── Theme injection ─────────────────────────────────────────────
  useEffect(() => {
    const t = themeRaw;
    const r = document.documentElement.style;
    r.setProperty("--bg-main",    t.bgMain);
    r.setProperty("--bg-card",    t.bgCard);
    r.setProperty("--bg-header",  t.bgHeader);
    r.setProperty("--accent",     t.accent);
    r.setProperty("--accent-dk",  t.accentDark);
    r.setProperty("--text-main",  t.textMain);
    r.setProperty("--text-dim",   t.textDim);
    r.setProperty("--border-col", t.borderCol);
    // Derived tokens — button text on accent bg, input bg
    r.setProperty("--border",     t.borderCol);
    r.setProperty("--bg-input",   t.bgCard);
    // Auto text-on-accent: light accent → dark text, dark accent → white text
    const accentHex = (t.accent||"#E8A84B").replace("#","");
    const ar=parseInt(accentHex.slice(0,2),16), ag=parseInt(accentHex.slice(2,4),16), ab=parseInt(accentHex.slice(4,6),16);
    const accentLum = (0.299*ar + 0.587*ag + 0.114*ab) / 255;
    r.setProperty("--accent-text", accentLum > 0.6 ? "#1A1510" : "#FFFFFF");
    document.body.style.background = t.bgMain;
    document.body.style.color      = t.textMain;
  }, [themeRaw]);

  // ── Auth check on mount ─────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("pos_token");
    if (!token) { setAuthChecked(true); return; }
    apiCall("/api/me").then(r => r.ok ? r.json() : null)
      .then(u => { if (u?.user_id) setCurrentUser(u); })
      .finally(() => setAuthChecked(true));
  }, []);

  // ── Login ───────────────────────────────────────────────────────
  const doLogin = useCallback(async (username, password) => {
    setLoginLoading(true); setLoginError("");
    try {
      const r = await apiCall("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (!r.ok) { setLoginError(d.error || "Login failed"); return; }
      localStorage.setItem("pos_token", d.token);
      setCurrentUser(d.user);
    } catch { setLoginError("Cannot connect to server"); }
    finally   { setLoginLoading(false); }
  }, []);

  const doLogout = useCallback(async () => {
    await apiCall("/api/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("pos_token");
    setCurrentUser(null);
  }, []);

  // ── Low Stock Alert ─────────────────────────────────────────────
  const [stockAlert, setStockAlert]   = useState(null);  // { items: [...] }
  const [stockAlertDismissed, setStockAlertDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cb_stock_alert_dismissed")||"{}"); } catch { return {}; }
  });

  useEffect(() => {
    if (!ingsRaw?.length) return;
    const low = ingsRaw.filter(i => {
      const stock = Number(i.current_stock||0);
      const thresh = Number(i.threshold||0);
      return thresh > 0 && stock <= thresh;
    });
    if (!low.length) { setStockAlert(null); return; }
    // Check if already dismissed for this combination (use ingredient ids + stock as key)
    const key = low.map(i => i.ingredient_id + ":" + i.current_stock).sort().join(",");
    if (stockAlertDismissed[key]) return;
    setStockAlert({ items: low, key });
  }, [ingsRaw]);

  const dismissStockAlert = (key) => {
    const next = { ...stockAlertDismissed, [key]: Date.now() };
    setStockAlertDismissed(next);
    localStorage.setItem("cb_stock_alert_dismissed", JSON.stringify(next));
    setStockAlert(null);
  };

  // ── Toast notification (used by POSPage) ─────────────────────────
  const [toast, setToast] = useState("");
  // ── Self Reset Password modal ────────────────────────────────────
  const [showSelfReset, setShowSelfReset] = useState(false);
  // ── Clear Data modal ─────────────────────────────────────────────
  const [showClearData, setShowClearData] = useState(false);
  // ── Branch picker (global admin) ─────────────────────────────────
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const notify = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  // ── Permission check ────────────────────────────────────────────
  // ── Sync currentUser when users array changes (e.g. edit own name/avatar) ──
  useEffect(() => {
    if (!currentUser || !usersRaw?.length) return;
    const updated = usersRaw.find(u => u.user_id === currentUser.user_id);
    if (updated && (
      updated.name !== currentUser.name ||
      updated.avatar !== currentUser.avatar ||
      updated.role !== currentUser.role
    )) {
      setCurrentUser(prev => ({ ...prev, ...updated }));
    }
  }, [usersRaw]);

  // ── Admin type detection ────────────────────────────────────────
  // isGlobalAdmin : admin + branch_id="all" → sees/controls everything
  // isBranchAdmin : admin + specific branch  → controls own branch only
  // isStaff       : role="staff"             → limited permissions

  const canAccess = useCallback((p) => {
    if (!currentUser) return false;
    const bid = currentUser.branch_id;
    const isGlobal = currentUser.role === "admin" && bid === "all";
    const isBranch = currentUser.role === "admin" && bid && bid !== "all";

    // Global admin: access everything
    if (isGlobal) return true;

    // Branch admin: can access most things EXCEPT theme (global-only)
    if (isBranch) {
      if (p === "theme") return false;   // theme = global admin only
      return true;                        // everything else OK
    }

    // Staff: check permissions, block admin-only pages
    if (ADMIN_ONLY_PERMS && ADMIN_ONLY_PERMS.has(p)) return false;
    return !!currentUser.permissions?.[p];
  }, [currentUser]);

  // ── Loading / Auth gates ────────────────────────────────────────
  if (!authChecked) return <Splash theme={themeRaw} />;
  if (!currentUser) return (
    <LoginPage
      theme={themeRaw} loading={loginLoading} error={loginError}
      onLogin={doLogin}
    />
  );
  if (loading) return <Splash theme={themeRaw} msg="កំពុង​ទាញ​ Data…" />;

  // ── Shared props ────────────────────────────────────────────────
  const shared = {
    theme: themeRaw, currentUser,
    cats: catsRaw, setCats,
    prods: prodsRaw, setProds,
    ings: ingsRaw, setIngs,
    recipes: recipesRaw, setRecipes,
    options: optionsRaw, setOptions,
    tables: tablesRaw, setTables,
    orders: ordersRaw, setOrders,
    logs: logsRaw, setLogs,
    users: usersRaw, setUsers,
    expenses: expensesRaw, setExpenses,
    setTheme, offline, socketOnline, reload,
    branchId: activeBranchId, branchName: BRANCH_NAME,
    branchList, pickedBranch, setPickedBranch, isGlobalAdmin,
    doLogout, canAccess,
    notify,
    isAdmin: currentUser?.role === "admin",
    isGlobalAdmin: currentUser?.role === "admin" && currentUser?.branch_id === "all",
    isBranchAdmin: currentUser?.role === "admin" && currentUser?.branch_id && currentUser?.branch_id !== "all",
    lowStock: (ingsRaw||[]).filter(i => (i.current_stock||0) <= (i.threshold||0)),
  };

  const _bid  = currentUser?.branch_id;
  const _isGA = currentUser?.role === "admin" && _bid === "all";   // global admin
  const _isBA = currentUser?.role === "admin" && _bid && _bid !== "all"; // branch admin

  const ALL_NAV = [
    { id:"pos",       label:"ចំណុចលក់",     emoji:"🛒" },
    { id:"tables",    label:"តុ",           emoji:"🪑" },
    { id:"menu",      label:"ម៉ឺនុយ",       emoji:"📋" },
    { id:"inventory", label:"ស្តុក",        emoji:"📦", alwaysShow:true },
    { id:"orders",    label:"ប្រវត្តិ",     emoji:"📜" },
    { id:"report",    label:"របាយការណ៍",    emoji:"📊" },
    { id:"finance",   label:"ហិរញ្ញវត្ថុ", emoji:"💰" },
    // users: global admin sees all users; branch admin sees own-branch users only
    { id:"users",     label:"អ្នកប្រើ",    emoji:"👥", requireAdmin:true },
    // theme: GLOBAL ADMIN ONLY
    { id:"theme",     label:"រចនាប័ទ្ម",   emoji:"🎨", globalOnly:true },
  ];

  const NAV = ALL_NAV.filter(n => {
    if (n.globalOnly)   return _isGA;        // theme: global admin only
    if (n.requireAdmin) return _isGA || _isBA; // users: any admin
    if (n.alwaysShow)   return true;           // inventory: always (read-only for staff)
    if (_isGA || _isBA) return true;           // admin sees everything else
    return canAccess(n.id);                    // staff: check permissions
  });

  const goPage = (id) => { setPage(id); setMenuOpen(false); };

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:"var(--bg-main)", color:"var(--text-main)", fontFamily:"'Hanuman', 'Noto Sans Khmer', sans-serif", overflow:"hidden" }} className={"app-root" + (themeRaw.bgMain && themeRaw.bgMain > "#888" ? " light-mode" : "")}>
      <style>{CSS}</style>

      {/* ── Low Stock Alert Modal ── */}
      {stockAlert && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", zIndex:600,
          display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{
            background:"var(--bg-card)", border:"2px solid #E74C3C55",
            borderRadius:20, padding:24, maxWidth:420, width:"100%",
            boxShadow:"0 0 40px #E74C3C22"
          }}>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
              <div style={{ fontSize:36, animation:"pulse 1.5s infinite" }}>⚠️</div>
              <div>
                <div style={{ fontWeight:700, fontSize:17, color:"#E74C3C" }}>ស្តុកជិតអស់!</div>
                <div style={{ fontSize:12, color:"#888", marginTop:2 }}>
                  គ្រឿងផ្សំ {stockAlert.items.length} មុខ ត្រូវបំពេញ
                </div>
              </div>
            </div>

            {/* Items list */}
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20, maxHeight:260, overflowY:"auto" }}>
              {stockAlert.items.map(i => {
                const stock  = Number(i.current_stock||0);
                const thresh = Number(i.threshold||0);
                const pct    = thresh > 0 ? Math.min(100, Math.round((stock/thresh)*100)) : 0;
                const color  = pct <= 0 ? "#E74C3C" : pct <= 50 ? "#F39C12" : "#E8A84B";
                return (
                  <div key={i.ingredient_id} style={{
                    background:"var(--bg-main)", border:`1px solid ${color}33`,
                    borderRadius:12, padding:"10px 14px"
                  }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                      <span style={{ fontWeight:600, fontSize:13 }}>{i.ingredient_name}</span>
                      <span style={{ fontSize:12, fontWeight:700, color }}>
                        {fmtStock(stock)} / {fmtStock(thresh)} {i.unit}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div style={{ height:6, background:"#1A181C", borderRadius:3, overflow:"hidden" }}>
                      <div style={{
                        height:"100%", borderRadius:3,
                        width: pct + "%",
                        background: pct <= 0 ? "#E74C3C" : pct <= 50 ? "linear-gradient(90deg,#E74C3C,#F39C12)" : "linear-gradient(90deg,#F39C12,#E8A84B)",
                        transition:"width .4s"
                      }} />
                    </div>
                    <div style={{ fontSize:10, color:"#888", marginTop:3 }}>
                      {pct <= 0 ? "❌ អស់ហើយ!" : `⚠️ ${pct}% នៃ threshold`}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div style={{ display:"flex", gap:8 }}>
              <button
                onClick={() => dismissStockAlert(stockAlert.key)}
                style={{ ...btnGhost, flex:1, fontSize:13 }}>
                ✕ ដឹងហើយ
              </button>
              <button
                onClick={() => { dismissStockAlert(stockAlert.key); setPage("inventory"); }}
                style={{ ...btnGold, flex:1, fontSize:13 }}>
                🧂 ចូលទៅស្តុក
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Self Reset Password Modal ── */}
      {showSelfReset && (
        <SelfResetPasswordModal
          currentUser={currentUser}
          onClose={() => setShowSelfReset(false)}
          notify={notify}
        />
      )}

      {/* ── Clear Data Modal ── */}
      {showClearData && (
        <ClearDataModal
          branchId={activeBranchId}
          isAdmin={currentUser?.role === "admin"}
          isBranchAdmin={currentUser?.role === "admin" && currentUser?.branch_id && currentUser?.branch_id !== "all"}
          onClose={() => setShowClearData(false)}
          notify={notify}
          onCleared={(bid) => {
            // Reset local state for cleared branch
            setOrdersRaw([]);
            setLogsRaw([]);
            reload();
          }}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position:"fixed", bottom:80, left:"50%", transform:"translateX(-50%)", background: toast.type==="error" ? "#3a1a1a" : "#1a3a1a", color: toast.type==="error" ? "#ff8080" : "#80ff80", borderRadius:10, padding:"10px 20px", fontSize:13, fontWeight:700, zIndex:999, boxShadow:"0 4px 20px rgba(0,0,0,.4)", whiteSpace:"nowrap" }}>
          {toast.msg}
        </div>
      )}

      {/* ── Mobile Sidebar Overlay ── */}
      {menuOpen && (
        <div style={{ position:"fixed", inset:0, zIndex:300 }}>
          {/* Backdrop */}
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.6)", backdropFilter:"blur(2px)" }}
            onClick={() => setMenuOpen(false)} />
          {/* Sidebar drawer */}
          <div style={{
            position:"absolute", top:0, left:0, bottom:0, width:260,
            background:"var(--bg-header)", borderRight:"1px solid var(--border-col)",
            display:"flex", flexDirection:"column", zIndex:1,
            animation:"slideInLeft .22s ease"
          }}>
            {/* Sidebar header */}
            <div style={{ padding:"16px 14px 12px", borderBottom:"1px solid var(--border-col)", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ flex:1, fontWeight:700, fontSize:15, color:"var(--accent)" }}>Menu</div>
              <button onClick={()=>setMenuOpen(false)} style={{ background:"transparent", border:"none", color:"#555", cursor:"pointer", fontSize:20, lineHeight:1 }}>✕</button>
            </div>
            {/* Nav items */}
            <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
              {NAV.map(n => (
                <button key={n.id}
                  onClick={() => goPage(n.id)}
                  style={{
                    width:"100%", display:"flex", alignItems:"center", gap:12,
                    padding:"12px 16px", border:"none", background: page===n.id ? "rgba(232,168,75,.12)" : "transparent",
                    color: page===n.id ? "var(--accent)" : "var(--text-main)",
                    fontFamily:"inherit", fontSize:14, fontWeight: page===n.id ? 700 : 400,
                    cursor:"pointer", borderLeft: page===n.id ? "3px solid var(--accent)" : "3px solid transparent",
                    transition:"all .15s"
                  }}>
                  <span style={{ fontSize:18 }}>{n.emoji}</span>
                  <span>{n.label}</span>
                </button>
              ))}
            </div>
            {/* User info + actions at bottom */}
            <div style={{ padding:"12px 16px", borderTop:"1px solid var(--border-col)" }}>
              {/* User row */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                {currentUser.avatar
                  ? <img src={currentUser.avatar} alt="" style={{ width:36, height:36, borderRadius:"50%", objectFit:"cover" }} />
                  : <div style={{ width:36, height:36, borderRadius:"50%", background:"linear-gradient(135deg,var(--accent),var(--accent-dk))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:700, color:"#1a0f00", flexShrink:0 }}>
                      {currentUser.name?.[0]?.toUpperCase()||"U"}
                    </div>
                }
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {currentUser.name}
                    {currentUser.branch_id === "all" && (
                      <span style={{ marginLeft:6, fontSize:10, background:"linear-gradient(135deg,#1A0A3A,#6A3FB8)",
                        color:"#C084FC", padding:"1px 7px", borderRadius:8, border:"1px solid #9B6FE833", fontWeight:700 }}>⭐ Super Admin</span>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:"#888", display:"flex", alignItems:"center", gap:5, flexWrap:"wrap", marginTop:2 }}>
                    <span>@{currentUser.username} · {currentUser.role}</span>
                    {currentUser.branch_id && currentUser.branch_id !== "all" && (() => {
                      const badge = getUserBranchBadge(currentUser, branchList);
                      return badge ? (
                        <span style={{ fontSize:10, padding:"1px 7px", borderRadius:8,
                          background:badge.bg, color:badge.color,
                          border:`1px solid ${badge.border}`, fontWeight:700 }}>{badge.label}</span>
                      ) : null;
                    })()}
                  </div>
                </div>
              </div>
              {/* Branch switcher — global admin, mobile only */}
              {isGlobalAdmin && branchList.length > 0 && (
                <button
                  onClick={() => { setMenuOpen(false); setShowBranchPicker(true); }}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                    border:"1px solid #5BA3E044", borderRadius:10, background:"rgba(91,163,224,.08)",
                    color:"#5BA3E0", cursor:"pointer", fontFamily:"inherit", fontSize:13, marginBottom:6 }}>
                  🏪
                  <div style={{ flex:1, textAlign:"left" }}>
                    <div style={{ fontSize:12, fontWeight:700 }}>ជ្រើសសាខា</div>
                    <div style={{ fontSize:10, color:"#5BA3E0AA", marginTop:1 }}>
                      {branchList.find(b=>b.branch_id===activeBranchId)?.branch_name || activeBranchId}
                    </div>
                  </div>
                  <span style={{ fontSize:11 }}>▼</span>
                </button>
              )}
              {/* Action buttons */}
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <button
                  onClick={() => { setMenuOpen(false); setShowSelfReset(true); }}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                    border:"1px solid #2A2730", borderRadius:10, background:"rgba(255,255,255,.04)",
                    color:"#aaa", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
                  🔐 <span>ផ្លាស់ Password</span>
                </button>
                {currentUser.role === "admin" && (
                  <button
                    onClick={() => { setMenuOpen(false); setShowClearData(true); }}
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                      border:"1px solid #3a1a1a", borderRadius:10, background:"rgba(231,76,60,.06)",
                      color:"#E74C3C", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
                    🗑️ <span>លុប Data លក់</span>
                  </button>
                )}
                <button
                  onClick={() => { setMenuOpen(false); doLogout(); }}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                    border:"1px solid #2A2730", borderRadius:10, background:"transparent",
                    color:"#666", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
                  🚪 <span>ចេញ (Logout)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Branch Picker Modal (global admin) ── */}
      {showBranchPicker && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-col)", borderRadius:18, padding:28, maxWidth:360, width:"90%" }}>
            <div style={{ fontWeight:700, fontSize:17, marginBottom:6, color:"var(--accent)" }}>🏪 ជ្រើសសាខា</div>
            <div style={{ fontSize:12, color:"#888", marginBottom:18 }}>Admin — សូមជ្រើសសាខាដែលចង់គ្រប់គ្រង</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {branchList.map(b => (
                <button key={b.branch_id}
                  onClick={() => { setPickedBranch(b.branch_id); setShowBranchPicker(false); reload(); }}
                  style={{
                    padding:"12px 16px", borderRadius:12, border:"none", cursor:"pointer",
                    fontFamily:"inherit", fontSize:14, fontWeight:700, textAlign:"left",
                    background: activeBranchId === b.branch_id
                      ? "linear-gradient(135deg,var(--accent-dk),var(--accent))"
                      : "var(--bg-main)",
                    color: activeBranchId === b.branch_id ? "#fff" : "var(--text-main)",
                    display:"flex", alignItems:"center", justifyContent:"space-between"
                  }}>
                  <span>🏪 {b.branch_name}</span>
                  {activeBranchId === b.branch_id && <span style={{fontSize:16}}>✅</span>}
                </button>
              ))}
            </div>
            <button onClick={() => setShowBranchPicker(false)}
              style={{ ...btnGhost, width:"100%", marginTop:14 }}>បោះបង់</button>
          </div>
        </div>
      )}

      {/* ── TopBar (sticky) ── */}
      <TopBar socketOnline={socketOnline} offline={offline} currentUser={currentUser} doLogout={doLogout}
        onHamburger={() => setMenuOpen(p => !p)} menuOpen={menuOpen}
        onSelfReset={() => setShowSelfReset(true)}
        onClearData={() => setShowClearData(true)}
        isAdmin={currentUser?.role === "admin"}
        activeBranchId={activeBranchId}
        branchList={branchList}
        onSwitchBranch={() => setShowBranchPicker(true)}
        isGlobalAdmin={isGlobalAdmin}
        lowStockCount={(ingsRaw||[]).filter(i => Number(i.current_stock||0) <= Number(i.threshold||0) && Number(i.threshold||0) > 0).length}
        onStockAlert={() => setStockAlert(prev => prev || { items:(ingsRaw||[]).filter(i => Number(i.current_stock||0) <= Number(i.threshold||0) && Number(i.threshold||0) > 0), key:"manual" })} />

      {/* ── Desktop Nav tabs ── */}
      <div className="nav-tab-bar desktop-nav" style={{ display:"flex", gap:0, overflowX:"auto", background:"var(--bg-header)", borderBottom:"2px solid var(--border-col)", padding:"0 8px" }}>
        {NAV.map(n => (
          <button key={n.id}
            className={"nav-tab" + (page === n.id ? " active" : "")}
            onClick={() => goPage(n.id)}
          >
            <span style={{ fontSize:15 }}>{n.emoji}</span>
            <span className="nav-label">{n.label}</span>
          </button>
        ))}
      </div>

      {/* ── Page content ── */}
      <div className={"page-pad" + (page==="pos" ? " page-pos-active" : "")} style={{ padding: page==="pos" ? "0" : "16px", display:"flex", flexDirection:"column", flex:1, minHeight:0, overflow: page==="pos" ? "hidden" : "auto" }}>
        {page === "pos"       && <POSPage       {...shared} />}
        {page === "tables"    && <TablesPage    {...shared} />}
        {page === "menu"      && <MenuPage      {...shared} />}
        {page === "inventory" && <InventoryPage {...shared} />}
        {page === "orders"    && <OrdersPage    {...shared} />}
        {page === "report"    && <ReportPage    {...shared} />}
        {page === "finance"   && <FinancePage   {...shared} />}
        {page === "users"     && <UsersPage     {...shared} />}
        {page === "theme"     && <ThemePage     {...shared} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  SPLASH / LOGIN
// ═══════════════════════════════════════════════════════════════════
function Splash({ theme, msg = "កំពុង​ចាប់​ផ្ដើម…" }) {
  return (
    <div style={{ minHeight:"100vh", background: theme?.bgMain || "#09080A", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
      <div style={{ fontSize:48 }}>☕</div>
      <div style={{ fontSize:20, fontWeight:700, color: theme?.accent || "#E8A84B" }}>Cafe Bloom POS</div>
      <div style={{ fontSize:13, color: theme?.textDim || "#666" }}>{msg}</div>
      <div className="spinner" />
    </div>
  );
}

function LoginPage({ theme, loading, error, onLogin }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const t = theme;
  // Prefer theme DB values (shared across devices), fallback to localStorage
  const shopName = t?.shopName || localStorage.getItem("cb_shop_name") || "Café Boom";
  const shopLogo = t?.shopLogo || localStorage.getItem("cb_shop_logo") || "";
  return (
    <div style={{ minHeight:"100vh", background:t.bgMain, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{CSS}</style>
      <div style={{ background:t.bgCard, border:`1px solid ${t.borderCol}`, borderRadius:16, padding:32, width:320, display:"flex", flexDirection:"column", gap:16 }}>
        <div style={{ textAlign:"center" }}>
          {shopLogo
            ? <img src={shopLogo} alt="logo" style={{ width:64, height:64, borderRadius:"50%", objectFit:"cover", margin:"0 auto", display:"block" }} />
            : <div style={{ fontSize:48 }}>☕</div>
          }
        </div>
        <div style={{ textAlign:"center", fontWeight:700, fontSize:20, color:t.accent }}>{shopName} POS</div>
        {error && <div style={{ background:"#5c1a1a", color:"#ff8080", borderRadius:8, padding:"8px 12px", fontSize:13 }}>{error}</div>}
        <input className="inp" placeholder="Username" value={u} onChange={e=>setU(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLogin(u,p)} />
        <input className="inp" type="password" placeholder="Password" value={p} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLogin(u,p)} />
        <button className="btn-primary" disabled={loading} onClick={()=>onLogin(u,p)}>
          {loading ? "កំពុងចូល…" : "ចូលប្រើ"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  POS PAGE
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
//  TOPBAR COMPONENT
// ═══════════════════════════════════════════════════════════════════
function TopBar({ socketOnline, offline, currentUser, doLogout, onHamburger, menuOpen, onSelfReset, onClearData, isAdmin, activeBranchId, branchList, onSwitchBranch, isGlobalAdmin, lowStockCount, onStockAlert }) {
  const [shopName, setShopNameState] = useState(() => localStorage.getItem("cb_shop_name") || "Café Boom");
  const [shopLogo, setShopLogoState] = useState(() => localStorage.getItem("cb_shop_logo") || "");

  // Listen for storage changes when ThemePage saves
  useEffect(() => {
    function onStorage(e) {
      if (e.key === "cb_shop_name") setShopNameState(e.newValue || "Café Boom");
      if (e.key === "cb_shop_logo") setShopLogoState(e.newValue || "");
    }
    window.addEventListener("storage", onStorage);
    // Also poll window variables set by ThemePage (same-tab updates)
    const poll = setInterval(() => {
      if (window.__SHOP_NAME__) { setShopNameState(window.__SHOP_NAME__); window.__SHOP_NAME__ = null; }
      if (window.__SHOP_LOGO__ !== undefined && window.__SHOP_LOGO__ !== null) {
        setShopLogoState(window.__SHOP_LOGO__); window.__SHOP_LOGO__ = undefined;
      }
    }, 500);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(poll); };
  }, []);
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const hhmm = time.toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" });
  const statusColor = socketOnline ? "#2ECC71" : offline ? "#E74C3C" : "#F39C12";
  const statusLabel = socketOnline ? "Online" : offline ? "Offline" : "Sync…";
  return (
    <div className="topbar-fixed" style={{ background:"var(--bg-header)", borderBottom:"1px solid var(--border-col)", display:"flex", alignItems:"center", padding:"6px 16px", gap:12, position:"sticky", top:0, zIndex:200 }}>
      {/* Hamburger button — mobile only */}
      {onHamburger && (
        <button className="hamburger-btn" onClick={onHamburger}
          style={{ background:"transparent", border:"1px solid var(--border-col)", borderRadius:8,
            width:36, height:36, display:"none", alignItems:"center", justifyContent:"center",
            flexDirection:"column", gap:4, cursor:"pointer", padding:6, flexShrink:0 }}>
          <span style={{ display:"block", width:18, height:2, background: menuOpen?"var(--accent)":"var(--text-main)", transition:"all .2s",
            transform: menuOpen ? "rotate(45deg) translate(4px,4px)" : "none" }} />
          <span style={{ display:"block", width:18, height:2, background: menuOpen?"transparent":"var(--text-main)", transition:"all .2s" }} />
          <span style={{ display:"block", width:18, height:2, background: menuOpen?"var(--accent)":"var(--text-main)", transition:"all .2s",
            transform: menuOpen ? "rotate(-45deg) translate(4px,-4px)" : "none" }} />
        </button>
      )}
      {/* Logo */}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        {shopLogo
          ? <img src={shopLogo} alt="logo" style={{ width:34, height:34, borderRadius:"50%", objectFit:"cover" }} />
          : <div style={{ width:34, height:34, borderRadius:"50%", background:"linear-gradient(135deg,var(--accent),var(--accent-dk))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>☕</div>
        }
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:"var(--accent)", lineHeight:1.1 }}>{shopName}</div>
          <div style={{ fontSize:10, color:"var(--text-dim)", lineHeight:1 }}>POS</div>
        </div>
      </div>
      <div style={{ flex:1 }} />
      {/* Status dot */}
      <div className="topbar-status" style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,.05)", borderRadius:20, padding:"4px 10px" }}>
        <div style={{ width:7, height:7, borderRadius:"50%", background:statusColor, boxShadow:`0 0 6px ${statusColor}` }} />
        <span style={{ fontSize:11, fontWeight:700, color:statusColor }}>{statusLabel}</span>
      </div>
      {/* Stock Alert Bell */}
      {lowStockCount > 0 && (
        <button onClick={onStockAlert} className="stock-bell topbar-hide-mobile"
          title={`ស្តុកជិតអស់ ${lowStockCount} មុខ`}
          style={{ position:"relative", background:"rgba(231,76,60,.12)", border:"1px solid #E74C3C44",
            borderRadius:20, padding:"4px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
          <span style={{ fontSize:14 }}>🔔</span>
          <span style={{ fontSize:10, fontWeight:700, color:"#E74C3C" }}>{lowStockCount}</span>
        </button>
      )}
      {/* Mobile bell (always show) */}
      {lowStockCount > 0 && (
        <button onClick={onStockAlert} className="stock-bell"
          style={{ display:"none", position:"relative", background:"rgba(231,76,60,.12)", border:"none",
            borderRadius:"50%", width:32, height:32, cursor:"pointer", alignItems:"center", justifyContent:"center",
            flexShrink:0 }}
          id="mobile-stock-bell">
          <span style={{ fontSize:16 }}>🔔</span>
          <span style={{ position:"absolute", top:-2, right:-2, background:"#E74C3C", color:"#fff",
            fontSize:9, fontWeight:700, borderRadius:"50%", width:16, height:16,
            display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>{lowStockCount}</span>
        </button>
      )}
      {/* Clock */}
      <div className="topbar-clock" style={{ fontSize:13, fontWeight:700, color:"var(--text-main)", fontVariantNumeric:"tabular-nums", minWidth:68, textAlign:"center" }}>{hhmm}</div>
      {/* Branch switcher — global admin only, HIDDEN on mobile (moved to hamburger) */}
      {isGlobalAdmin && branchList.length > 0 && (
        <div className="topbar-hide-mobile"
          style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(91,163,224,.12)", border:"1px solid #5BA3E044", borderRadius:20, padding:"4px 10px", cursor:"pointer" }}
          onClick={onSwitchBranch}>
          <span style={{ fontSize:10, color:"#5BA3E0" }}>🏪</span>
          <span style={{ fontSize:11, fontWeight:700, color:"#5BA3E0" }}>
            {branchList.find(b=>b.branch_id===activeBranchId)?.branch_name || activeBranchId}
          </span>
          <span style={{ fontSize:9, color:"#5BA3E0" }}>▼</span>
        </div>
      )}
      {/* User */}
      <div className="topbar-user-pill" style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.05)", borderRadius:20, padding:"5px 12px" }}>
        {currentUser.avatar
          ? <img src={currentUser.avatar} alt={currentUser.name} style={{ width:26, height:26, borderRadius:"50%", objectFit:"cover" }} />
          : <div style={{ width:26, height:26, borderRadius:"50%", background:"linear-gradient(135deg,var(--accent),var(--accent-dk))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#1a0f00" }}>
              {currentUser.name?.[0]?.toUpperCase() || "U"}
            </div>
        }
        <span className="topbar-username" style={{ fontSize:12, fontWeight:600 }}>{currentUser.name}</span>
        {currentUser.branch_id === "all"
          ? <span className="topbar-username" style={{ fontSize:9, padding:"1px 6px", borderRadius:8,
              background:"linear-gradient(135deg,#1A0A3A,#6A3FB8)", color:"#C084FC",
              border:"1px solid #9B6FE833", fontWeight:700 }}>⭐</span>
          : currentUser.branch_id
            ? <span className="topbar-username" style={{ fontSize:9, padding:"1px 6px", borderRadius:8,
                background:"rgba(91,163,224,.15)", color:"#5BA3E0",
                border:"1px solid #5BA3E033", fontWeight:700 }}>
                🏪 {(branchList||[]).find(b=>b.branch_id===currentUser.branch_id)?.branch_name || currentUser.branch_id}
              </span>
            : null
        }

      </div>
      {/* 🔐 Reset own password — always visible, inside topbar */}
      <button
        className="topbar-hide-mobile"
        onClick={onSelfReset}
        title="ផ្លាស់ Password"
        style={{ background:"rgba(255,255,255,.06)", border:"1px solid #2A2730", borderRadius:20,
          padding:"5px 12px", cursor:"pointer", fontSize:12, color:"#aaa", display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
        🔐 <span style={{fontSize:11}}>Password</span>
      </button>
      {/* 🗑️ Clear data — admin only */}
      {isAdmin && (
        <button
          className="topbar-hide-mobile"
          onClick={onClearData}
          title="លុប Data លក់"
          style={{ background:"rgba(231,76,60,.08)", border:"1px solid #3a1a1a", borderRadius:20,
            padding:"5px 12px", cursor:"pointer", fontSize:12, color:"#E74C3C", display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
          🗑️ <span style={{fontSize:11}}>Clear</span>
        </button>
      )}
      <button className="btn-sm topbar-hide-mobile" onClick={doLogout} style={{ borderRadius:20, flexShrink:0 }}>ចេញ</button>
    </div>
  );
}

function POSPage({ cats, prods, ings, recipes, options, tables, setTables, orders, setOrders, logs, setLogs, notify, setIngs, currentUser, branchId, users }) {
  const [cart, setCart] = useState([]);
  const [selCat, setSelCat] = useState(0);
  const [search, setSearch] = useState("");
  const [selTable, setSelTable] = useState(null);
  const [payMethod, setPayMethod] = useState("cash");
  const [customize, setCustomize] = useState(null);
  const [custOpts, setCustOpts] = useState({ sugar: "50%", milk: "ទឹកដោះគោ", size: "M" });
  const [receipt, setReceipt] = useState(null);
  const [txRunning, setTxRunning] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerDisplay, setCustomerDisplay] = useState(false); // customer-facing payment page

  const activeProds = prods.filter(p => p.is_active &&
    (selCat === 0 || p.category_id === selCat) &&
    (search === "" || p.product_name.includes(search)));

  const cartTotal = Math.round(cart.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0) * 100) / 100;
  const cartTax = Math.round(cartTotal * 0.1 * 100) / 100;
  const getCat = id => cats.find(c => c.category_id === id);

  const openCustomize = (prod) => {
    setCustomize(prod);
    const opts = options.filter(o => o.product_id === prod.product_id);
    const sizes = opts.filter(o => o.option_name === "ទំហំ").map(o => o.option_value);
    setCustOpts({ sugar: "50%", milk: "ទឹកដោះគោ", size: sizes[0] || "M" });
  };

  const addToCart = () => {
    const opts = options.filter(o => Number(o.product_id) === Number(customize.product_id));
    const sizeOpt = opts.find(o => o.option_name === "ទំហំ" && o.option_value === custOpts.size);
    const extra = sizeOpt ? (parseFloat(sizeOpt.additional_price) || 0) : 0;
    const price = Math.round((parseFloat(customize.base_price) + extra) * 100) / 100; // round to cents
    const key = `${customize.product_id}-${custOpts.sugar}-${custOpts.milk}-${custOpts.size}`;
    setCart(prev => {
      const ex = prev.find(i => i.key === key);
      return ex
        ? prev.map(i => i.key === key ? { ...i, qty: i.qty + 1 } : i)
        : [...prev, { ...customize, price, qty: 1, key, opts: { ...custOpts } }];
    });
    setCustomize(null);
    notify(`✓ បន្ថែម ${customize.product_name} — ${fmt(price)}`);
  };

  // CHECKOUT with full DB transaction
  const checkout = async () => {
    if (!cart.length || txRunning) return;
    setTxRunning(true);

    let currentIngs = [...ings];
    const logEntries = [];
    const ts = new Date().toLocaleString("km-KH");

    for (const item of cart) {
      const result = runTransaction(currentIngs, recipes, item.product_id, item.qty);
      if (!result.success) {
        notify(`❌ ${result.reason} ស្តុកមិនគ្រប់!`, "error");
        setTxRunning(false);
        return;
      }
      // Collect log entries
      result.checks.forEach(c => {
        logEntries.push({
          log_id: Date.now() + c.ing.ingredient_id + Math.random(),
          ts, product: item.product_name,
          ingredient: c.ing?.ingredient_name,
          before: fmtN(c.ing?.current_stock),
          deducted: fmtN(c.need),
          after: fmtN(c.ing?.current_stock - c.need),
          unit: c.ing?.unit,
        });
      });
      currentIngs = result.newIngredients;
    }

    // COMMIT
    setIngs(currentIngs);
    setLogs(p => [...logEntries, ...p]);

    // Mark table busy
    if (selTable) {
      setTables(p => p.map(t => t.table_id === selTable ? { ...t, status: "busy" } : t));
    }

    const rec = {
      order_id: Date.now(),
      items: [...cart], table: selTable,
      total: cartTotal, tax: cartTax,
      method: payMethod, ts,
      cashier: currentUser?.name || currentUser?.username || "unknown",
      branch_id: branchId,
    };
    setOrders(p => [rec, ...p]);
    setReceipt(rec);
    setCart([]);
    setSelTable(null);
    setTxRunning(false);
    notify("✅ ការទូទាត់ជោគជ័យ!");

    // 📲 Send Telegram notification (await + log result)
    // Use branch_id from currentUser for correct branch name in notification
    const branchDisplayName = getBranchDisplayName(branchId, users) || branchId;
    sendTelegramWithBranch(rec, branchDisplayName).then(() => {
      console.log('[Telegram] Notification sent for order:', rec.order_id);
    }).catch(e => {
      console.error('[Telegram] Failed to send:', e.message);
    });
  };

  return (
    <div className="pos-layout" style={{ flex: 1, minHeight: 0, height: "100%", overflow: "hidden" }}>
      {/* ── RECEIPT MODAL ── */}
      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}

      {/* ── CUSTOMER DISPLAY ── */}
      {customerDisplay && (
        <CustomerDisplay
          cart={cart} cartTotal={cartTotal} cartTax={cartTax}
          payMethod={payMethod}
          selTable={selTable}
          onClose={() => setCustomerDisplay(false)}
          onConfirmPay={async () => {
            setCustomerDisplay(false);
            await checkout();
          }}
        />
      )}

      {/* ── CUSTOMIZE MODAL ── */}
      {customize && (
        <Modal onClose={() => setCustomize(null)} maxW={380}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            {customize.image_url
              ? <img src={customize.image_url} alt={customize.product_name}
                style={{ width: 90, height: 90, borderRadius: 14, objectFit: "cover", margin: "0 auto", display: "block" }} />
              : <div style={{ fontSize: 52 }}>{customize.emoji}</div>
            }
            <div style={{ fontWeight: 700, fontSize: 17, marginTop: 8 }}>{customize.product_name}</div>
            {/* Live price preview */}
            {(() => {
              const sizeOpt = options.find(o => o.product_id === customize.product_id && o.option_name === "ទំហំ" && o.option_value === custOpts.size);
              const extra = sizeOpt ? (parseFloat(sizeOpt.additional_price) || 0) : 0;
              const total = parseFloat(customize.base_price) + extra;
              return (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}>
                  <span style={{ color: "#666", fontSize: 13, textDecoration: extra > 0 ? "line-through" : "none" }}>{fmt(customize.base_price)}</span>
                  {extra > 0 && <span style={{ color: "#5BA3E0", fontSize: 12 }}>+{fmt(extra)}</span>}
                  <span style={{ color: "#E8A84B", fontWeight: 700, fontSize: 16 }}>{fmt(total)}</span>
                </div>
              );
            })()}
          </div>
          {/* Size options — always show, default S/M/L/XL if none defined in menu */}
          <OptRow label="ទំហំ"
            items={options.filter(o => o.product_id === customize.product_id && o.option_name === "ទំហំ").length > 0
              ? options.filter(o => o.product_id === customize.product_id && o.option_name === "ទំហំ").map(o => o.option_value)
              : ["S", "M", "L", "XL"]}
            value={custOpts.size} onChange={v => setCustOpts(p => ({ ...p, size: v }))} color="#E8A84B" />
          <OptRow label="ស្ករ" items={SUGAR} value={custOpts.sugar}
            onChange={v => setCustOpts(p => ({ ...p, sugar: v }))} color="#F39C12" slider={true} />
          <OptRow label="ទឹកដោះ" items={MILK} value={custOpts.milk}
            onChange={v => setCustOpts(p => ({ ...p, milk: v }))} color="#5BA3E0" />
          <button onClick={addToCart} style={{ ...btnGold, width: "100%", marginTop: 18, padding: 14, fontSize: 15 }}>
            ➕ បន្ថែមទៅកម្ម៉ង់
          </button>
        </Modal>
      )}

      {/* LEFT: Menu */}
      <div className="pos-menu" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-main)" }}>
        {/* Search + Cats */}
        <div style={{ padding: "12px 14px 8px", background: "var(--bg-card)", borderBottom: "1px solid var(--border-col)" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ស្វែងរក..."
            style={{
              width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10,
              padding: "8px 14px", color: "var(--text-main)", fontFamily: "inherit", fontSize: 13, marginBottom: 10
            }} />
          <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2 }}>
            {[{ category_id: 0, category_name: "ទាំងអស់", emoji: "✨" }, ...cats].map(c => (
              <button key={c.category_id} onClick={() => setSelCat(c.category_id)} style={{
                padding: "6px 16px", borderRadius: 20, border: "none", cursor: "pointer", whiteSpace: "nowrap",
                background: selCat === c.category_id ? "linear-gradient(135deg,#B8732A,#E8A84B)" : "#1A181C",
                color: selCat === c.category_id ? "#fff" : "#777", fontFamily: "inherit", fontSize: 12, fontWeight: 600
              }}>{c.emoji} {c.category_name}</button>
            ))}
          </div>
        </div>
        {/* Grid */}
        <div style={{
          flex: 1, overflowY: "auto", padding: 10,
          display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, alignContent: "start"
        }}>
          {activeProds.map(p => {
            const cat = getCat(p.category_id);
            return (
              <button key={p.product_id} onClick={() => openCustomize(p)} className="hover-lift"
                style={{
                  background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14,
                  padding: "10px 8px", cursor: "pointer", textAlign: "center", fontFamily: "inherit",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 5
                }}>
                {/* Image or Emoji */}
                {p.image_url
                  ? <img src={p.image_url} alt={p.product_name}
                    style={{ width: "100%", height: 120, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{
                    width: "100%", height: 120, borderRadius: 10, background: "var(--bg-main)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48
                  }}>{p.emoji}</div>
                }
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-main)", lineHeight: 1.3 }}>{p.product_name}</div>
                <div style={{ fontSize: 13, color: "#E8A84B", fontWeight: 700 }}>{fmt(p.base_price)}</div>
                <div style={{ fontSize: 10, background: "var(--bg-main)", color: "var(--text-dim)", padding: "2px 8px", borderRadius: 20 }}>{cat?.emoji} {cat?.category_name}</div>
              </button>
            );
          })}
          {activeProds.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#333", paddingTop: 40 }}>គ្មានមុខម្ហូប</div>}
        </div>
      </div>

      {/* RIGHT: Cart */}
      <div className={`pos-cart${cartOpen ? " cart-open" : ""}`} style={{
        background: "var(--bg-card)", borderLeft: "1px solid var(--border-col)",
        display: "flex", flexDirection: "column", overflow: "hidden"
      }}>
        {/* Mobile cart header with close btn */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 12px 6px", borderBottom: "1px solid var(--border-col)"
        }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>🛒 កម្ម៉ង់
            {cart.length > 0 && <span style={{
              marginLeft: 8, background: "#B8732A", color: "#fff",
              borderRadius: 10, padding: "1px 8px", fontSize: 11
            }}>{cart.reduce((s, i) => s + i.qty, 0)}</span>}
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {selTable && <span style={{ fontSize: 11, background: "#B8732A22", color: "#E8A84B", padding: "3px 10px", borderRadius: 20 }}>តុ {selTable}</span>}
            <button onClick={() => setCartOpen(false)}
              style={{
                background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
                color: "#888", cursor: "pointer", fontSize: 18, width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1
              }}>✕</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", padding: "8px 12px", borderBottom: "1px solid var(--border-col)" }}>
          {tables.map(t => (
            <button key={t.table_id} onClick={() => setSelTable(selTable === t.table_id ? null : t.table_id)}
              style={{
                width: 34, height: 34, borderRadius: 8, border: "none", cursor: "pointer",
                background: selTable === t.table_id ? "var(--accent-dk)" : t.status === "busy" ? "#1A0A0A" : "var(--bg-card)",
                color: selTable === t.table_id ? "#fff" : t.status === "busy" ? "#6B2020" : "#777",
                fontWeight: 700, fontSize: 12, fontFamily: "inherit"
              }}>{t.table_id}</button>
          ))}
        </div>

        {/* Cart items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
          {cart.length === 0 && (
            <div style={{ textAlign: "center", color: "#333", paddingTop: 40 }}>
              <div style={{ fontSize: 36 }}>🛒</div>
              <div style={{ marginTop: 10, fontSize: 13 }}>ជ្រើសរើសមុខម្ហូប</div>
            </div>
          )}
          {cart.map(item => (
            <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: "1px solid var(--border-col)" }}>
              {item.image_url
                ? <img src={item.image_url} alt={item.product_name} style={{ width: 32, height: 32, borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />
                : <div style={{ fontSize: 22, flexShrink: 0 }}>{item.emoji}</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.product_name}</div>
                <div style={{ fontSize: 10, color: "#555" }}>{item.opts.size} · {item.opts.sugar}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <button onClick={() => setCart(p => p.map(i => i.key === item.key ? { ...i, qty: Math.max(0, i.qty - 1) } : i).filter(i => i.qty > 0))}
                  style={{ width: 22, height: 22, borderRadius: 5, border: "none", background: "var(--bg-main)", color: "var(--text-main)", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>−</button>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 14, textAlign: "center" }}>{item.qty}</span>
                <button onClick={() => setCart(p => p.map(i => i.key === item.key ? { ...i, qty: i.qty + 1 } : i))}
                  style={{ width: 22, height: 22, borderRadius: 5, border: "none", background: "#B8732A", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>+</button>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#E8A84B", minWidth: 40, textAlign: "right" }}>{fmt(item.price * item.qty)}</div>
            </div>
          ))}
        </div>

        {/* Totals + Pay */}
        <div style={{ padding: "12px", borderTop: "1px solid #1A181B" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginBottom: 4 }}>
            <span>សរុប</span><span>{fmt(cartTotal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginBottom: 10 }}>
            <span>VAT 10%</span><span>{fmt(cartTax)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
            <span>សរុបរួម</span><span style={{ color: "#E8A84B" }}>{fmt(cartTotal + cartTax)}</span>
          </div>
          {/* Pay method */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {[["cash", "💵", "សាច់ប្រាក់"], ["qr", "📱", "QR"], ["bank", "🏦", "ធនាគារ"]].map(([v, ic, lb]) => (
              <button key={v} onClick={() => setPayMethod(v)} style={{
                flex: 1, padding: "7px 4px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600,
                border: payMethod === v ? "1px solid #B8732A" : "1px solid #1E1B20",
                background: payMethod === v ? "#B8732A22" : "transparent",
                color: payMethod === v ? "#E8A84B" : "#666"
              }}>{ic} {lb}</button>
            ))}
          </div>
          <button onClick={checkout} disabled={!cart.length || txRunning} style={{
            ...btnGold, width: "100%", padding: "13px", fontSize: 14, opacity: (!cart.length || txRunning) ? 0.4 : 1,
            cursor: (!cart.length || txRunning) ? "not-allowed" : "pointer"
          }}>{txRunning ? "⏳ ដំណើរការ..." : "✓ ទូទាត់ប្រាក់"}</button>
          {cart.length > 0 && (
            <button onClick={() => setCustomerDisplay(true)}
              style={{
                ...btnGhost, width: "100%", marginTop: 6, padding: "10px", fontSize: 13, fontWeight: 700,
                color: "#5BA3E0", borderColor: "#5BA3E055"
              }}>
              📺 បង្ហាញភ្ញៀវ
            </button>
          )}
          {cart.length > 0 && (
            <button onClick={() => setCart([])} style={{ ...btnGhost, width: "100%", marginTop: 6, padding: "8px", fontSize: 12 }}>
              លុបកម្ម៉ង់
            </button>
          )}
        </div>
      </div>

      {/* ── MOBILE FAB cart button ── */}
      <button onClick={() => setCartOpen(o => !o)} className="mobile-fab"
        style={{ bottom: 68, right: 14, zIndex: 150 }}>
        {cartOpen ? "✕" : "🛒"}
        {cart.length > 0 && !cartOpen && (
          <span style={{
            position: "absolute", top: -3, right: -3, background: "#E74C3C", color: "#fff",
            borderRadius: "50%", width: 20, height: 20, fontSize: 11, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            {cart.reduce((s, i) => s + i.qty, 0)}
          </span>
        )}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TABLES PAGE
// ═══════════════════════════════════════════════════════════════════
function TablesPage({ tables, setTables, orders }) {
  const busy = tables.filter(t => t.status === "busy").length;

  function toggleTable(tid) {
    setTables(prev => prev.map(t => t.table_id === tid
      ? { ...t, status: t.status === "busy" ? "free" : "busy" }
      : t
    ));
  }

  return (
    <div style={{ padding:"16px 14px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontWeight:700, fontSize:20, display:"flex", alignItems:"center", gap:8 }}>
          🪑 គ្រប់គ្រងតុ
        </div>
        <div style={{ fontSize:12, color:"#555", marginTop:4 }}>
          {busy} / {tables.length} តុ កំពុងប្រើ
        </div>
      </div>

      {/* Table grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:14 }}>
        {tables.map(t => {
          const isBusy = t.status === "busy";
          // Only show TODAY's orders for this table (not all history)
          const todayStr = new Date().toISOString().slice(0, 10);
          const tableOrders = (orders||[]).filter(o => {
            const matchTable = String(o.table) === String(t.table_id) || o.table === t.table_id;
            const orderDate = o.ts ? o.ts.slice(0, 10) : new Date(o.order_id).toISOString().slice(0, 10);
            const isToday = orderDate === todayStr || o.ts?.includes(todayStr) || String(o.order_id).length === 13 && new Date(o.order_id).toISOString().slice(0,10) === todayStr;
            return matchTable && isToday;
          });
          const tableTotal = isBusy ? tableOrders.reduce((s,o) => s + (o.total||0) + (o.tax||0), 0) : 0;
          return (
            <div key={t.table_id} style={{
              background:"var(--bg-card)",
              border:`2px solid ${isBusy ? "#8B1A1A" : "#1A4A1A"}`,
              borderRadius:16, padding:22, textAlign:"center",
              boxShadow: isBusy ? "0 0 20px #8B1A1A22" : "0 0 20px #1A4A1A22",
              transition:"all .2s",
            }}>
              <div style={{ fontSize:34 }}>🪑</div>
              <div style={{ fontWeight:700, fontSize:18, marginTop:8, marginBottom:6 }}>
                តុ {t.table_id}
              </div>
              <div style={{
                fontSize:12, padding:"4px 14px", borderRadius:20,
                display:"inline-block", fontWeight:600,
                background: isBusy ? "#8B1A1A22" : "#1A4A1A22",
                color: isBusy ? "#E74C3C" : "#27AE60",
              }}>
                {isBusy ? "🔴 មានអតិថិជន" : "🟢 ទំនេរ"}
              </div>
              {isBusy && tableTotal > 0 && (
                <div style={{ fontSize:13, color:"#E8A84B", fontWeight:700, marginTop:6 }}>
                  ${tableTotal.toFixed(2)}
                </div>
              )}
              <button
                onClick={() => toggleTable(t.table_id)}
                style={{
                  marginTop:12, width:"100%", padding:"7px",
                  borderRadius:8, border:"1px solid rgba(255,255,255,.1)",
                  background:"rgba(255,255,255,.05)", color: isBusy ? "#E74C3C" : "#27AE60",
                  cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600,
                  transition:"all .15s",
                }}
              >
                {isBusy ? "✓ ចេញ" : "ចូល"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ marginTop:20, display:"flex", gap:16, flexWrap:"wrap" }}>
        {[["#27AE60","ទំ"],["#E74C3C","កំពុងប្រើ"],["#F39C12","បានRA"],["#3498DB","សំអាត"]].map(([color,label]) => (
          <div key={label} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#555" }}>
            <div style={{ width:10, height:10, borderRadius:"50%", background:color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MENU PAGE
// ═══════════════════════════════════════════════════════════════════
// ── Reusable Emoji Dropdown ───────────────────────────────────────
const CAFE_EMOJIS = [
  "☕","🥛","🍵","🧋","🍹","🥤","🧃","🧊","💧","🫖",
  "🍰","🎂","🍩","🍪","🍫","🍬","🧁","🥐","🥖","🥪",
  "🍳","🥗","🍜","🍛","🥘","🍲","🍱","🥡","🍣","🥩",
  "🌮","🥙","🧆","🥚","🧀","🥨","🥯","🫓","🍞","🥞",
  "🍦","🍧","🍨","🍡","🍭","🍮","🍯","🧇","🫘","🍺",
  "🥗","🫕","🧆","🥜","🌽","🍆","🥦","🥕","🧅","🍄",
];

function EmojiDropdown({ value, onChange, label = "Emoji" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:5 }}>{label}</div>
      {/* Trigger button */}
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{
          width:"100%", display:"flex", alignItems:"center", gap:10,
          background:"var(--bg-main)", border:"1px solid var(--border-col)",
          borderRadius:8, padding:"8px 12px", cursor:"pointer",
          color:"var(--text-main)", fontFamily:"inherit", fontSize:14,
          transition:"border-color .2s",
        }}
      >
        <span style={{ fontSize:22 }}>{value || "—"}</span>
        <span style={{ flex:1, textAlign:"left", fontSize:13, color: value ? "var(--text-main)" : "var(--text-dim)" }}>
          {value || "ជ្រើស Emoji..."}
        </span>
        <span style={{ fontSize:10, color:"var(--text-dim)", transform: open ? "rotate(180deg)" : "none", transition:"transform .2s" }}>▼</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:500,
          background:"var(--bg-card)", border:"1px solid var(--border-col)",
          borderRadius:10, padding:10, boxShadow:"0 8px 24px rgba(0,0,0,.5)",
        }}>
          {/* Custom input */}
          <input className="inp" style={{ marginBottom:8, fontSize:13 }}
            placeholder="ឬវាយ emoji ផ្ទាល់..."
            value={value||""}
            onChange={e => onChange(e.target.value)}
          />
          {/* Grid */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:4, maxHeight:160, overflowY:"auto" }}>
            {CAFE_EMOJIS.map(em => (
              <button key={em} type="button"
                onClick={() => { onChange(em); setOpen(false); }}
                style={{
                  fontSize:20, width:34, height:34, borderRadius:7, border:"none",
                  cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                  background: value === em ? "var(--accent)" : "rgba(255,255,255,.06)",
                  transform: value === em ? "scale(1.1)" : "scale(1)",
                  transition:"all .12s",
                }}
              >{em}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function CatForm({ cat, onSave }) {
  const [v, setV] = useState(cat);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <input className="inp" placeholder="ឈ្មោះ​ប្រភេទ" value={v.category_name} onChange={e=>setV({...v,category_name:e.target.value})} />
      <EmojiDropdown value={v.emoji} onChange={em => setV({...v, emoji:em})} label="Emoji ប្រភេទ" />
      <button className="btn-primary" onClick={()=>onSave(v)}>💾 រក្សា​ទុក</button>
    </div>
  );
}

function ProdForm({ prod, cats, onSave }) {
  const [v, setV] = useState(prod);
  const [imgLoading, setImgLoading] = useState(false);
  const fileRef = useRef(null);

  function handleImageFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("រូបភាពធំពេក! Max 2MB"); return; }
    setImgLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      // Resize to max 400px for storage efficiency
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 400;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        setV(prev => ({ ...prev, image_url: canvas.toDataURL("image/jpeg", 0.82) }));
        setImgLoading(false);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {/* Image upload */}
      <div
        style={{ border:"2px dashed var(--border-col)", borderRadius:10, padding:12, textAlign:"center", cursor:"pointer", position:"relative", minHeight:90, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:6, transition:"border-color .2s" }}
        onClick={() => fileRef.current?.click()}
        onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor="var(--accent)"}}
        onDragLeave={e=>{e.currentTarget.style.borderColor=""}}
        onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor="";handleImageFile(e.dataTransfer.files[0]);}}
      >
        {imgLoading ? (
          <div className="spinner" style={{width:28,height:28}} />
        ) : v.image_url ? (
          <>
            <img src={v.image_url} alt="" style={{ width:80, height:80, objectFit:"cover", borderRadius:8 }} />
            <span style={{ fontSize:11, color:"var(--text-dim)" }}>ចុចដើម្បីប្ដូររូប</span>
          </>
        ) : (
          <>
            <span style={{ fontSize:28 }}>📷</span>
            <span style={{ fontSize:12, color:"var(--text-dim)" }}>ចុច ឬ Drag រូបភាពមក</span>
            <span style={{ fontSize:10, color:"var(--text-dim)" }}>JPG / PNG / WEBP · Max 2MB</span>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }}
          onChange={e=>handleImageFile(e.target.files[0])} />
      </div>
      {v.image_url && (
        <button className="btn-sm" style={{ color:"#ff6b6b", fontSize:11 }} onClick={()=>setV(prev=>({...prev,image_url:""}))}>
          🗑 លុប​រូបភាព
        </button>
      )}
      <input className="inp" placeholder="ឈ្មោះ​ផលិតផល" value={v.product_name} onChange={e=>setV({...v,product_name:e.target.value})} />
      <input className="inp" type="number" placeholder="តំលៃ" value={v.base_price} onChange={e=>setV({...v,base_price:+e.target.value})} />
      <EmojiDropdown value={v.emoji||""} onChange={em => setV(prev => ({...prev, emoji:em}))} label="Emoji (backup ពេលគ្មានរូបភាព)" />
      <select className="inp" value={v.category_id} onChange={e=>setV({...v,category_id:+e.target.value})}>
        {cats.map(c=><option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
      </select>
      <button className="btn-primary" onClick={()=>onSave(v)}>💾 រក្សា​ទុក</button>
    </div>
  );
}

function OptForm({ opt, prods, onSave }) {
  const [v, setV] = useState(opt);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <input className="inp" placeholder="ឈ្មោះ Option" value={v.option_name} onChange={e=>setV({...v,option_name:e.target.value})} />
      <select className="inp" value={v.option_group} onChange={e=>setV({...v,option_group:e.target.value})}>
        {["size","sugar","milk","ice","other"].map(g=><option key={g} value={g}>{g}</option>)}
      </select>
      <input className="inp" type="number" placeholder="បន្ថែម​តំលៃ" value={v.additional_price||0} onChange={e=>setV({...v,additional_price:+e.target.value})} />
      <select className="inp" value={v.product_id||""} onChange={e=>setV({...v,product_id:e.target.value?+e.target.value:null})}>
        <option value="">ទាំងអស់​ (all products)</option>
        {prods.map(p=><option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
      </select>
      <button className="btn-primary" onClick={()=>onSave(v)}>💾 រក្សា​ទុក</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MENU PAGE
// ═══════════════════════════════════════════════════════════════════
function MenuPage({ cats, setCats, prods, setProds, options, setOptions, notify }) {
  const [subTab, setSubTab] = useState("products");
  const [editProd, setEditProd] = useState(null);
  const [editCat,  setEditCat]  = useState(null);
  const [editOpt,  setEditOpt]  = useState(null);
  const [search,   setSearch]   = useState("");
  const [filterC,  setFilterC]  = useState(0);
  const [delConf,  setDelConf]  = useState(null);

  const filteredP = prods.filter(p =>
    (filterC === 0 || p.category_id === filterC) &&
    (search === "" || (p.product_name||"").toLowerCase().includes(search.toLowerCase()))
  );

  const saveCat = (cat) => {
    setCats(prev => cat.category_id
      ? prev.map(c => c.category_id === cat.category_id ? cat : c)
      : [...prev, { ...cat, category_id: Date.now() }]
    );
    setEditCat(null);
    notify && notify("✓ រក្សាទុកប្រភេទ");
  };

  const saveProd = (p) => {
    setProds(prev => p.product_id
      ? prev.map(x => x.product_id === p.product_id ? p : x)
      : [...prev, { ...p, product_id: Date.now(), is_active: true }]
    );
    setEditProd(null);
    notify && notify("✓ រក្សាទុកផលិតផល");
  };

  const saveOpt = (o) => {
    setOptions(prev => o.option_id
      ? prev.map(x => x.option_id === o.option_id ? o : x)
      : [...prev, { ...o, option_id: Date.now() }]
    );
    setEditOpt(null);
  };

  const delCat  = (id) => { if (prods.some(p => p.category_id === id)) { alert("មានផលិតផលក្នុងប្រភេទ!"); return; } setCats(p => p.filter(c => c.category_id !== id)); setDelConf(null); };
  const delProd = (id) => { setProds(p => p.filter(x => x.product_id !== id)); setDelConf(null); };
  const delOpt  = (id) => { setOptions(p => p.filter(o => o.option_id !== id)); };
  const toggleProd = (id) => setProds(prev => prev.map(p => p.product_id === id ? { ...p, is_active: !p.is_active } : p));

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {delConf && <ConfirmDel name={delConf.name} onConfirm={delConf.fn} onCancel={() => setDelConf(null)} />}

      {/* ── STICKY HEADER: title + subtabs ── */}
      <div style={{ flexShrink:0, background:"var(--bg-main)", borderBottom:"1px solid var(--border-col)", padding:"16px 14px 0" }}>
        <div style={{ fontWeight:700, fontSize:20, marginBottom:12 }}>🍽️ គ្រប់គ្រងម៉ឺនុយ</div>
        <div style={{ display:"flex", gap:0 }}>
          {[["products","🍽️ ផលិតផល"],["categories","📂 ប្រភេទ"],["options","⚙️ Options"]].map(([v,lb]) => (
            <button key={v} onClick={() => setSubTab(v)} style={{
              padding:"10px 18px", border:"none", background:"transparent", cursor:"pointer",
              color: subTab===v ? "var(--accent)" : "#555",
              fontFamily:"inherit", fontSize:13, fontWeight:600,
              borderBottom: subTab===v ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom:-1, transition:"all .15s",
            }}>{lb}</button>
          ))}
        </div>
      </div>{/* end sticky header */}

      {/* ── SCROLLABLE CONTENT ── */}
      <div style={{ flex:1, overflowY:"auto", padding:"14px 14px 32px" }}>

        {/* ── PRODUCTS TAB ── */}
        {subTab === "products" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
              <input className="inp" style={{ flex:1, minWidth:160 }} placeholder="🔍 ស្វែងរក..." value={search} onChange={e=>setSearch(e.target.value)} />
              <select className="inp" style={{ minWidth:140 }} value={filterC} onChange={e=>setFilterC(Number(e.target.value))}>
                <option value={0}>ប្រភេទទាំងអស់</option>
                {cats.map(c => <option key={c.category_id} value={c.category_id}>{c.emoji} {c.category_name}</option>)}
              </select>
              <button style={{ ...btnGold, padding:"9px 18px", width:"auto" }}
                onClick={()=>setEditProd({ product_name:"", base_price:0, category_id:cats[0]?.category_id, emoji:"☕", is_active:true })}>
                ➕ បន្ថែម
              </button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:10 }}>
              {filteredP.map(p => {
                const cat = cats.find(c => c.category_id === p.category_id);
                return (
                  <div key={p.product_id} style={{
                    background:"var(--bg-card)", border:"1px solid var(--border-col)", borderRadius:12,
                    padding:"12px 14px", display:"flex", gap:12, alignItems:"center",
                    opacity: p.is_active===false ? 0.55 : 1, transition:"opacity .2s",
                  }}>
                    {p.image_url
                      ? <img src={p.image_url} alt="" style={{ width:48, height:48, borderRadius:8, objectFit:"cover", flexShrink:0 }} />
                      : <div style={{ width:48, height:48, borderRadius:8, background:"rgba(255,255,255,.05)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>{p.emoji}</div>
                    }
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>{p.product_name}</div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                        <span style={{ fontSize:11, background:"rgba(184,115,42,.15)", color:"#E8A84B", padding:"2px 8px", borderRadius:20 }}>
                          {cat?.emoji} {cat?.category_name}
                        </span>
                        <span style={{ color:"#E8A84B", fontWeight:700, fontSize:13 }}>{fmt(p.base_price)}</span>
                        <button onClick={()=>toggleProd(p.product_id)} style={{
                          padding:"2px 10px", borderRadius:20, border:"none", cursor:"pointer",
                          fontFamily:"inherit", fontSize:11, fontWeight:600,
                          background: p.is_active!==false ? "#1A4A1A22" : "#2A2A2A",
                          color: p.is_active!==false ? "#27AE60" : "#666",
                        }}>{p.is_active!==false ? "✓ លក់" : "✗ បិទ"}</button>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                      <button style={{ width:30, height:30, borderRadius:7, border:"1px solid var(--border-col)", background:"transparent", cursor:"pointer", fontSize:13 }}
                        onClick={()=>toggleProd(p.product_id)}>{p.is_active!==false?"⏸":"▶"}</button>
                      <button style={{ width:30, height:30, borderRadius:7, border:"1px solid var(--border-col)", background:"transparent", color:"#E8A84B", cursor:"pointer", fontSize:13 }}
                        onClick={()=>setEditProd(p)}>✏️</button>
                      <button style={{ width:30, height:30, borderRadius:7, border:"1px solid #5B1A1A", background:"transparent", color:"#E74C3C", cursor:"pointer", fontSize:13 }}
                        onClick={()=>setDelConf({ name:p.product_name, fn:()=>delProd(p.product_id) })}>🗑</button>
                    </div>
                  </div>
                );
              })}
              {filteredP.length===0 && <div style={{ gridColumn:"1/-1", textAlign:"center", color:"#444", paddingTop:30 }}>គ្មានមុខម្ហូប</div>}
            </div>
            {editProd && (
              <Modal title={editProd.product_id?"កែ​ផលិតផល":"ផលិតផល​ថ្មី"} onClose={()=>setEditProd(null)}>
                <ProdForm prod={editProd} cats={cats} onSave={saveProd} />
              </Modal>
            )}
          </div>
        )}

        {/* ── CATEGORIES TAB ── */}
        {subTab === "categories" && (
          <div>
            <button style={{ ...btnGold, padding:"9px 18px", width:"auto", marginBottom:14 }}
              onClick={()=>setEditCat({ category_name:"", emoji:"☕" })}>➕ បន្ថែម​ប្រភេទ</button>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:14 }}>
              {cats.map(c => (
                <div key={c.category_id} style={{ background:"var(--bg-card)", border:"1px solid var(--border-col)", borderRadius:14, padding:18 }}>
                  <div style={{ fontSize:32 }}>{c.emoji}</div>
                  <div style={{ fontWeight:700, fontSize:15, margin:"8px 0 4px" }}>{c.category_name}</div>
                  <div style={{ fontSize:11, color:"#555", marginBottom:12 }}>
                    {prods.filter(p=>p.category_id===c.category_id).length} ​ផលិតផល
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button style={{ flex:1, padding:"6px", borderRadius:7, border:"1px solid var(--border-col)", background:"transparent", color:"#E8A84B", cursor:"pointer", fontFamily:"inherit", fontSize:12 }}
                      onClick={()=>setEditCat(c)}>✏️ កែ</button>
                    <button style={{ flex:1, padding:"6px", borderRadius:7, border:"1px solid #5B1A1A", background:"transparent", color:"#E74C3C", cursor:"pointer", fontFamily:"inherit", fontSize:12 }}
                      onClick={()=>setDelConf({ name:c.category_name, fn:()=>delCat(c.category_id) })}>🗑 លុប</button>
                  </div>
                </div>
              ))}
            </div>
            {editCat && (
              <Modal title={editCat.category_id?"កែ​ប្រភេទ":"ប្រភេទ​ថ្មី"} onClose={()=>setEditCat(null)}>
                <CatForm cat={editCat} onSave={saveCat} />
              </Modal>
            )}
          </div>
        )}

        {/* ── OPTIONS TAB ── */}
        {subTab === "options" && (
          <div>
            <button style={{ ...btnGold, padding:"9px 18px", width:"auto", marginBottom:14 }}
              onClick={()=>setEditOpt({ option_name:"", option_group:"size", additional_price:0, product_id:null })}>➕ បន្ថែម Option</button>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {options.map(o => (
                <div key={o.option_id} style={{ display:"flex", alignItems:"center", gap:10, background:"var(--bg-card)", borderRadius:10, padding:"10px 14px", border:"1px solid var(--border-col)" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600 }}>{o.option_name} <span style={{ fontSize:11, color:"var(--text-dim)" }}>[{o.option_group}]</span></div>
                    <div style={{ fontSize:12, color:"var(--text-dim)" }}>
                      {o.product_id ? "Product: " + (prods.find(p=>p.product_id===o.product_id)?.product_name||o.product_id) : "ទាំងអស់"}
                      {o.additional_price ? " +"+fmt(o.additional_price) : ""}
                    </div>
                  </div>
                  <button style={{ width:30, height:30, borderRadius:7, border:"1px solid var(--border-col)", background:"transparent", color:"#E8A84B", cursor:"pointer" }} onClick={()=>setEditOpt(o)}>✏️</button>
                  <button style={{ width:30, height:30, borderRadius:7, border:"1px solid #5B1A1A", background:"transparent", color:"#E74C3C", cursor:"pointer" }} onClick={()=>delOpt(o.option_id)}>🗑</button>
                </div>
              ))}
            </div>
            {editOpt && (
              <Modal title={editOpt.option_id?"កែ Option":"Option ថ្មី"} onClose={()=>setEditOpt(null)}>
                <OptForm opt={editOpt} prods={prods} onSave={saveOpt} />
              </Modal>
            )}
          </div>
        )}
      </div>{/* end scrollable */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  INVENTORY PAGE
// ═══════════════════════════════════════════════════════════════════


function InventoryPage({ ings, setIngs, recipes, setRecipes, prods, notify, logs, isAdmin, currentUser }) {
  // Staff: read-only view — cannot add/edit/delete/restock
  const canEdit = isAdmin;
  const [subTab, setSubTab] = useState("stock");
  const [modal, setModal] = useState(null);
  const [delConf, setDelConf] = useState(null);
  const [restock, setRestock] = useState(null);
  const [recSearch, setRecSearch] = useState("");
  const [recFilter, setRecFilter] = useState("");
  const [recSort, setRecSort] = useState("product");
  const [expandAll, setExpandAll] = useState(true);
  const [collapsed, setCollapsed] = useState({});

  const saveIng = (data) => {
    if (modal.mode === "add") setIngs(p => [...p, { ...data, ingredient_id: nextId(p) }]);
    else setIngs(p => p.map(i => i.ingredient_id === data.ingredient_id ? data : i));
    notify(modal.mode === "add" ? "✓ បន្ថែមគ្រឿងផ្សំ" : "✓ កែប្រែ"); setModal(null);
  };
  const saveRec = (data) => {
    if (modal.mode === "add") setRecipes(p => [...p, { ...data, recipe_id: nextId(p) }]);
    else setRecipes(p => p.map(r => r.recipe_id === data.recipe_id ? data : r));
    notify(modal.mode === "add" ? "✓ បន្ថែមរូបមន្ត" : "✓ កែប្រែ"); setModal(null);
  };
  const doRestock = (id, amt) => {
    setIngs(p => p.map(i => i.ingredient_id === id ? { ...i, current_stock: i.current_stock + Number(amt) } : i));
    const ing = ings.find(i => i.ingredient_id === id);
    notify(`✓ បំពេញ ${ing?.ingredient_name} +${amt}${ing?.unit}`);
    setRestock(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {delConf && <ConfirmDel name={delConf.name} onConfirm={delConf.fn} onCancel={() => setDelConf(null)} />}
      {restock && (
        <Modal onClose={() => setRestock(null)} maxW={320}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>📦 បំពេញស្តុក</div>
          <div style={{ color: "#E8A84B", marginBottom: 16 }}>{restock.ingredient_name}</div>
          <label style={{ fontSize: 12, color: "#777", display: "block", marginBottom: 6 }}>ចំនួន ({restock.unit})</label>
          <input type="number" id="ramt" defaultValue={500} style={{ ...inputSt, width: "100%", marginBottom: 16 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setRestock(null)} style={{ ...btnGhost, flex: 1 }}>បោះបង់</button>
            <button onClick={() => doRestock(restock.ingredient_id, document.getElementById("ramt").value)}
              style={{ ...btnGreen, flex: 1 }}>📦 បំពេញ</button>
          </div>
        </Modal>
      )}
      {modal && (
        <Modal onClose={() => setModal(null)} maxW={420}>
          {modal.entity === "ing" && <IngForm data={modal.data} onSave={saveIng} onCancel={() => setModal(null)} />}
          {modal.entity === "rec" && <RecForm data={modal.data} prods={prods} ings={ings} onSave={saveRec} onCancel={() => setModal(null)} />}
        </Modal>
      )}

      {/* ── STICKY HEADER ── */}
      <div style={{ flexShrink: 0, padding: "16px 14px 0", borderBottom: "1px solid var(--border-col)", background: "var(--bg-main)" }}>
        <SectionHeader
          title="🧂 ស្តុកគ្រឿងផ្សំ"
          sub={`${ings.filter(i => Number(i.current_stock) <= Number(i.threshold)).length} ជិតអស់${!canEdit ? " · 👁️ មើលបានតែ" : ""}`}
        />
        {/* Admin: full tabs; Staff: stock view only */}
        {canEdit
          ? <SubTabs tabs={[["stock", "🧂 Ingredients"], ["recipes", "📋 Recipe Mapping"], ["sql", "💾 SQL"], ["auditlog", "🗒️ Audit Log"]]} val={subTab} set={setSubTab} />
          : <SubTabs tabs={[["stock", "🧂 ស្តុក"]]} val={subTab} set={setSubTab} />
        }
        {subTab === "stock" && (
          <div style={{ padding: "10px 0 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {canEdit && <button onClick={() => setModal({ mode: "add", entity: "ing", data: { ingredient_id: null, ingredient_name: "", current_stock: 0, unit: "g", threshold: 100 } })} style={{ ...btnGold, padding:"9px 16px", width:"auto" }}>➕ បន្ថែម</button>}
            {!canEdit && <div style={{ fontSize:12, color:"#888", padding:"6px 12px", background:"rgba(255,255,255,.04)", borderRadius:8, border:"1px solid #2A2730" }}>👁️ មើលបានតែ — admin ទេដែរ edit</div>}
            <div style={{ flex:1 }} />
            {/* Export buttons */}
            <button style={{ ...btnSmall, color:"#27AE60", borderColor:"#27AE6044", fontSize:12, padding:"7px 14px" }}
              onClick={() => {
                const rows = ings.map(i => {
                  // Calculate total used from logs
                  const usedTotal = (logs||[]).filter(l => l.ingredient === i.ingredient_name)
                    .reduce((s, l) => s + (Number(l.deducted)||0), 0);
                  const pct = i.threshold > 0 ? Math.round((Number(i.current_stock)/Number(i.threshold))*100) : 100;
                  return {
                    "ឈ្មោះ​គ្រឿង": i.ingredient_name,
                    "ស្តុក​នៅ": Number(i.current_stock),
                    "ស្តុក​អប្បបរមា": Number(i.threshold),
                    "ឯកតា": i.unit,
                    "ប្រើ​ចំណាយ​សរុប": fmtN(usedTotal),
                    "ស្ថានភាព": Number(i.current_stock) <= Number(i.threshold) ? "⚠️ ជិតអស់" : "✓ ល្អ",
                    "%": pct + "%",
                  };
                });
                exportCSV(rows, `stock_report_${new Date().toISOString().slice(0,10)}.csv`);
                notify("✅ Export CSV រួចហើយ!");
              }}>
              📊 Export CSV
            </button>
            <button style={{ ...btnSmall, color:"#E8A84B", borderColor:"#E8A84B44", fontSize:12, padding:"7px 14px" }}
              onClick={() => {
                const date = new Date().toLocaleDateString("km-KH");
                const rows = ings.map(i => {
                  const usedTotal = (logs||[]).filter(l => l.ingredient === i.ingredient_name)
                    .reduce((s, l) => s + (Number(l.deducted)||0), 0);
                  const stock = Number(i.current_stock);
                  const thresh = Number(i.threshold);
                  const pct = thresh > 0 ? Math.round((stock/thresh)*100) : 100;
                  const isLow = stock <= thresh;
                  // Light print-friendly colors
                  return `<tr style="background:${isLow?"#fff5f5":"#f5fff8"}">
                    <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;color:#111;font-weight:600">${i.ingredient_name}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-weight:700;color:${isLow?"#c0392b":"#27AE60"}">${fmtStock(stock)}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;color:#555">${fmtStock(thresh)}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;color:#333">${i.unit}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;color:#B8732A;font-weight:700">${fmtN(usedTotal)}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0">
                      <span style="padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${isLow?"#ffeaea":"#eaffea"};color:${isLow?"#c0392b":"#27AE60"};border:1px solid ${isLow?"#f5b7b1":"#a9dfbf"}">
                        ${isLow?"⚠️ ជិតអស់":"✓ ល្អ"}
                      </span>
                    </td>
                    <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;color:#555">${pct}%</td>
                  </tr>`;
                }).join("");
                const tableHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px">
                  <thead><tr style="background:#B8732A">
                    <th style="padding:10px 12px;text-align:left;color:#fff;border-bottom:2px solid #8B5520">ឈ្មោះ​គ្រឿង</th>
                    <th style="padding:10px 12px;text-align:left;color:#fff;border-bottom:2px solid #8B5520">ស្តុក​នៅ</th>
                    <th style="padding:10px 12px;text-align:left;color:#fff;border-bottom:2px solid #8B5520">អប្បបរមា</th>
                    <th style="padding:10px 12px;text-align:left;color:#fff;border-bottom:2px solid #8B5520">ឯកតា</th>
                    <th style="padding:10px 12px;text-align:left;color:#fff;border-bottom:2px solid #8B5520">ប្រើ​ចំណាយ</th>
                    <th style="padding:10px 12px;text-align:left;color:#fff;border-bottom:2px solid #8B5520">ស្ថានភាព</th>
                    <th style="padding:10px 12px;text-align:left;color:#fff;border-bottom:2px solid #8B5520">%</th>
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>`;
                exportPDF("📦 របាយការណ៍ស្តុក", date, tableHTML);
                notify("✅ Print PDF រួចហើយ!");
              }}>
              🖨️ Print PDF
            </button>
          </div>
        )}
        {subTab === "recipes" && (
          <div style={{ padding: "10px 0 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input className="inp" style={{ flex:1, minWidth:160, fontSize:13 }}
              placeholder="🔍 ស្វែងរកផលិតផល..."
              value={recSearch} onChange={e => setRecSearch(e.target.value)} />
            <select className="inp" style={{ minWidth:140 }} value={recFilter} onChange={e => setRecFilter(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">ផលិតផលទាំងអស់</option>
              {prods.map(p => <option key={p.product_id} value={p.product_id}>{p.emoji} {p.product_name}</option>)}
            </select>
            <button onClick={() => setModal({ mode: "add", entity: "rec", data: { recipe_id: null, product_id: prods[0]?.product_id || "", ingredient_id: ings[0]?.ingredient_id || "", quantity_required: "" } })} style={{ ...btnGold, padding:"9px 16px", width:"auto" }}>➕ បន្ថែម</button>
            {recipes.length === 0 && prods.length > 0 && ings.length > 0 && (
              <button style={{ ...btnSmall, fontSize:12, color:"#5BA3E0", borderColor:"#5BA3E044", padding:"8px 14px" }}
                onClick={() => {
                  // Generate 20 sample recipes using actual product + ingredient IDs
                  const ps = prods.slice(0, Math.min(prods.length, 10));
                  const is_ = ings;
                  const samples = [];
                  let id = Date.now();
                  const qty = [0.5, 1, 2, 5, 10, 15, 20, 30, 50, 100, 150, 200];
                  ps.forEach((p, pi) => {
                    // Each product uses 1-3 ingredients
                    const numIngs = pi < 3 ? 3 : pi < 7 ? 2 : 1;
                    const used = new Set();
                    for (let j = 0; j < numIngs && j < is_.length; j++) {
                      const ing = is_[(pi * 3 + j) % is_.length];
                      if (used.has(ing.ingredient_id)) continue;
                      used.add(ing.ingredient_id);
                      samples.push({
                        recipe_id: id++,
                        product_id: p.product_id,
                        ingredient_id: ing.ingredient_id,
                        quantity_required: qty[Math.floor(pi * 2 + j) % qty.length],
                      });
                    }
                  });
                  // Add more to reach 20
                  while (samples.length < 20 && prods.length > 0 && ings.length > 0) {
                    const p = prods[samples.length % prods.length];
                    const ing = ings[(samples.length * 7) % ings.length];
                    if (!samples.some(s => s.product_id === p.product_id && s.ingredient_id === ing.ingredient_id)) {
                      samples.push({ recipe_id: id++, product_id: p.product_id, ingredient_id: ing.ingredient_id, quantity_required: qty[samples.length % qty.length] });
                    } else break;
                  }
                  setRecipes(samples.slice(0, 20));
                  notify(`✅ បន្ថែម ${samples.slice(0,20).length} sample recipes ហើយ!`);
                }}>
                🌱 Seed 20 Sample Recipes
              </button>
            )}
          </div>
        )}
        {(subTab === "sql" || subTab === "auditlog") && <div style={{ paddingBottom: 10 }} />}
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 32px" }}>
        {subTab === "stock" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10 }}>
            {ings.map(i => {
              const stock = Number(i.current_stock);
              const thresh = Number(i.threshold);
              const isLow = stock <= thresh;
              const isWarn = stock <= thresh * 1.5 && !isLow;
              const col = isLow ? "#E74C3C" : isWarn ? "#F39C12" : "#27AE60";
              const pct = Math.min(100, (stock / (thresh * 4 || 1)) * 100);
              return (
                <div key={i.ingredient_id} style={{
                  background: "var(--bg-card)", border: `1px solid ${col}33`,
                  borderRadius: 12, padding: "12px 14px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{i.ingredient_name}</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                        <span style={{ color: col, fontWeight: 700, fontSize: 14 }}>{fmtStock(stock)}</span>
                        <span style={{ color: "#555" }}> / {fmtStock(thresh)} {i.unit}</span>
                      </div>
                    </div>
                    <Tag color={col}>{isLow ? "⚠️ ជិតអស់" : isWarn ? "🔶 ប្រុង" : "✓ ល្អ"}</Tag>
                  </div>
                  <div style={{ height: 5, background: "#1A181C", borderRadius: 3, marginBottom: 10 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 3 }} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {canEdit ? (<>
                      <button onClick={() => setRestock(i)} style={{ ...btnSmall, flex: 1, color: "#27AE60", borderColor: "#27AE6033", fontSize: 12 }}>📦 បំពេញ</button>
                      <button onClick={() => setModal({ mode: "edit", entity: "ing", data: { ...i } })} style={{ ...btnSmall, flex: 1, fontSize: 12 }}>✏️ កែ</button>
                      <button onClick={() => setDelConf({ name: i.ingredient_name, fn: () => { setIngs(p => p.filter(x => x.ingredient_id !== i.ingredient_id)); setRecipes(p => p.filter(r => r.ingredient_id !== i.ingredient_id)); notify("✓ លុប"); setDelConf(null); } })}
                        style={{ ...btnSmall, color: "#E74C3C", borderColor: "#E74C3C33", padding: "5px 10px", fontSize: 12 }}>🗑️</button>
                    </>) : (
                      <div style={{ fontSize:11, color:"#555", padding:"4px 8px" }}>👁️ មើលបានតែ</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {subTab === "recipes" && (() => {
          // 10-feature Recipe Mapping
          const filteredProds = prods.filter(p => {
            const hasRecipe = recipes.some(r => r.product_id === p.product_id);
            const matchFilter = recFilter === "" || p.product_id === Number(recFilter);
            const matchSearch = recSearch === "" || (p.product_name||"").toLowerCase().includes(recSearch.toLowerCase());
            return hasRecipe && matchFilter && matchSearch;
          });
          const sorted = [...filteredProds].sort((a, b) =>
            recSort === "ingredient"
              ? recipes.filter(r=>r.product_id===b.product_id).length - recipes.filter(r=>r.product_id===a.product_id).length
              : a.product_name.localeCompare(b.product_name)
          );
          const totalMappings = recipes.length;
          const totalProds = new Set(recipes.map(r => r.product_id)).size;
          const missingIng = recipes.filter(r => !ings.find(i => i.ingredient_id === r.ingredient_id)).length;
          return (
            <>
              {/* Summary bar */}
              <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
                {[["📋","Mappings",totalMappings,"#5BA3E0"],["🍽️","ផលិតផល",totalProds,"#E8A84B"],["⚠️","ខ្វះ ingredient",missingIng,missingIng>0?"#E74C3C":"#27AE60"]].map(([ic,lb,val,col])=>(
                  <div key={lb} style={{ background:"var(--bg-card)",border:`1px solid ${col}33`,borderRadius:10,padding:"7px 14px",display:"flex",gap:8,alignItems:"center" }}>
                    <span>{ic}</span>
                    <div><div style={{ fontSize:17,fontWeight:700,color:col,lineHeight:1 }}>{val}</div><div style={{ fontSize:11,color:"#555" }}>{lb}</div></div>
                  </div>
                ))}
                <select className="inp" style={{ marginLeft:"auto",fontSize:12,padding:"6px 10px",minWidth:140 }} value={recSort} onChange={e=>setRecSort(e.target.value)}>
                  <option value="product">Sort: ឈ្មោះ A→Z</option>
                  <option value="ingredient">Sort: ចំនួន ingredient ↓</option>
                </select>
                <button style={{ ...btnSmall,fontSize:12 }} onClick={()=>{setExpandAll(p=>!p);setCollapsed({});}}>
                  {expandAll?"⊟ Collapse All":"⊞ Expand All"}
                </button>
              </div>
              {missingIng>0 && (
                <div style={{ background:"#E74C3C11",border:"1px solid #E74C3C44",borderRadius:10,padding:"12px 16px",marginBottom:12,fontSize:12,color:"#E74C3C" }}>
                  <div style={{fontWeight:700,marginBottom:6}}>⚠️ មាន {missingIng} mapping ដែល ingredient ត្រូវបានលុប</div>
                  <div style={{fontSize:11,color:"#E74C3C88"}}>
                    {recipes.filter(r=>!ings.find(i=>i.ingredient_id===r.ingredient_id)).map(r=>{
                      const prod = prods.find(p=>p.product_id===r.product_id);
                      return <span key={r.recipe_id} style={{background:"#E74C3C22",borderRadius:6,padding:"2px 8px",marginRight:6,marginBottom:4,display:"inline-block"}}>
                        {prod?.product_name||"?"} → ID:{r.ingredient_id}
                      </span>;
                    })}
                  </div>
                  <button onClick={()=>setRecipes(p=>p.filter(r=>ings.find(i=>i.ingredient_id===r.ingredient_id)))}
                    style={{...btnSmall,marginTop:8,fontSize:11,color:"#E74C3C",borderColor:"#E74C3C44"}}>
                    🗑 លុប mappings ខូច​ទាំងអស់
                  </button>
                </div>
              )}
              {sorted.map(prod => {
                const pr = recipes.filter(r => r.product_id === prod.product_id);
                const isCollapsed = collapsed[prod.product_id] !== undefined ? collapsed[prod.product_id] : !expandAll;
                const totalCost = pr.reduce((sum,r) => {
                  const ing = ings.find(i=>i.ingredient_id===r.ingredient_id);
                  return sum + (Number(r.quantity_required)*(ing?.cost_per_unit||0));
                },0);
                const canMake = pr.length>0 && pr.every(r=>{ const ing=ings.find(i=>i.ingredient_id===r.ingredient_id); return ing && Number(ing?.current_stock)>=Number(r.quantity_required); });
                const hasMissing = pr.some(r=>!ings.find(i=>i.ingredient_id===r.ingredient_id));
                return (
                  <div key={prod.product_id} style={{ background:"var(--bg-card)",border:`1px solid ${hasMissing?"#E74C3C33":canMake?"#27AE6033":"#F39C1233"}`,borderRadius:12,marginBottom:10,overflow:"hidden" }}>
                    <div style={{ background:"var(--bg-header)",padding:"10px 16px",display:"flex",alignItems:"center",gap:10,cursor:"pointer" }}
                      onClick={()=>setCollapsed(p=>({...p,[prod.product_id]:!isCollapsed}))}>
                      <span style={{ fontSize:20 }}>{prod.emoji||"🍽️"}</span>
                      <span style={{ fontWeight:700,flex:1 }}>{prod.product_name}</span>
                      <span style={{ fontSize:11,padding:"2px 10px",borderRadius:20,fontWeight:600,
                        background:hasMissing?"#E74C3C22":canMake?"#27AE6022":"#F39C1222",
                        color:hasMissing?"#E74C3C":canMake?"#27AE60":"#F39C12" }}>
                        {hasMissing?"⚠️ ខ្វះ":canMake?"✅ អាចធ្វើ":"🔶 ស្តុកទាប"}
                      </span>
                      {totalCost>0 && <span style={{ fontSize:11,color:"#5BA3E0",background:"#5BA3E022",padding:"2px 8px",borderRadius:20 }}>💰 ${totalCost.toFixed(3)}/serve</span>}
                      <span style={{ fontSize:12,color:"#5BA3E0" }}>{pr.length} គ្រឿង</span>
                      <span style={{ fontSize:13,color:"#555",marginLeft:4 }}>{isCollapsed?"▶":"▼"}</span>
                    </div>
                    {!isCollapsed && (
                      <TableWrap headers={["#","ingredient + ប្រើ/serve","ស្តុក​នៅ","status / ចំនួន",""]}>
                        {pr.map((r,idx)=>{
                          const ing=ings.find(i=>i.ingredient_id===r.ingredient_id);
                          const enough=ing&&Number(ing?.current_stock)>=Number(r.quantity_required);
                          const servings=ing?Math.floor(Number(ing?.current_stock)/Number(r.quantity_required)):0;
                          return (
                            <tr key={r.recipe_id}>
                              <Td mono dim>{idx+1}</Td>
                              <Td>
                                {ing
                                  ? <div>
                                      <div style={{fontWeight:600,fontSize:12}}>{ing?.ingredient_name}</div>
                                      <div style={{fontSize:11,color:"#555",marginTop:2}}>
                                        ប្រើ <span style={{color:"#E8A84B",fontWeight:700}}>{r.quantity_required} {ing?.unit}</span>/serve
                                      </div>
                                    </div>
                                  : <span style={{color:"#E74C3C",fontSize:11}}>⚠️ deleted</span>}
                              </Td>
                              <Td>
                                {ing
                                  ? <div>
                                      <div style={{fontSize:12,color:enough?"#27AE60":"#E74C3C",fontWeight:600}}>
                                        {fmtStock(ing?.current_stock)} {ing?.unit} នៅ
                                      </div>
                                      <div style={{fontSize:11,color:"#555",marginTop:2}}>
                                        ស្តុក / {fmtStock(ing?.threshold)} {ing?.unit} min
                                      </div>
                                    </div>
                                  : <span style={{color:"#555",fontSize:11}}>—</span>}
                              </Td>
                              <Td>
                                {ing
                                  ? <div style={{textAlign:"center"}}>
                                      <span style={{ display:"block",fontSize:12,padding:"3px 8px",borderRadius:20,
                                        background:enough?"#27AE6022":"#E74C3C22",
                                        color:enough?"#27AE60":"#E74C3C",fontWeight:600 }}>
                                        {enough ? `✅ ${servings}x` : "❌ ស្តុកអស់"}
                                      </span>
                                      {enough && <div style={{fontSize:10,color:"#555",marginTop:2}}>
                                        {servings} ចំនួន​អាចធ្វើ
                                      </div>}
                                    </div>
                                  : <span style={{color:"#E74C3C",fontSize:11}}>missing</span>}
                              </Td>
                              <Td>
                                <div style={{display:"flex",gap:4}}>
                                  <button onClick={()=>setModal({mode:"edit",entity:"rec",data:{...r}})} style={{...btnSmall,padding:"4px 8px"}}>✏️</button>
                                  <button onClick={()=>setDelConf({name:`${prod.product_name} → ${ing?.ingredient_name||r.recipe_id}`,fn:()=>{setRecipes(p=>p.filter(x=>x.recipe_id!==r.recipe_id));notify("✓ លុប");setDelConf(null);}})}
                                    style={{...btnSmall,padding:"4px 8px",color:"#E74C3C",borderColor:"#E74C3C33"}}>🗑</button>
                                </div>
                              </Td>
                            </tr>
                          );
                        })}
                        {totalCost>0&&(<tr><td colSpan={6} style={{padding:"7px 14px",fontSize:12,color:"#5BA3E0",borderTop:"1px solid #1A181C",textAlign:"right"}}>
                          💰 Cost per serving: <strong>${totalCost.toFixed(4)}</strong>
                        </td></tr>)}
                      </TableWrap>
                    )}
                  </div>
                );
              })}
              {sorted.length===0&&(<div style={{textAlign:"center",color:"#444",paddingTop:40}}>
                <div style={{fontSize:36}}>📋</div>
                <div style={{marginTop:10}}>{recSearch||recFilter!==""?"រកមិនឃើញ — ប្ដូរ filter":"គ្មានរូបមន្ត — ចុច ➕ បន្ថែម"}</div>
              </div>)}
            </>
          );
        })()}

        {subTab === "sql" && (
          <div style={{ background: "var(--bg-main)", border: "1px solid #1A181C", borderRadius: 14, padding: 20 }}>
            <SqlBlock code={`-- Auto-deduction Transaction
START TRANSACTION;

UPDATE Ingredients i
JOIN Recipe_Mapping rm ON i.ingredient_id = rm.ingredient_id
SET i.current_stock = i.current_stock - (rm.quantity_required * p_qty)
WHERE rm.product_id = ?
  AND i.current_stock >= rm.quantity_required * p_qty;

IF ROW_COUNT() < expected_count THEN
  ROLLBACK;
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Insufficient Stock';
END IF;

INSERT INTO Inventory_Logs (...) SELECT ...;

COMMIT;`} />
          </div>
        )}

        {subTab === "auditlog" && (
          <>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#E8A84B", marginBottom: 12 }}>🗒️ Inventory Logs ({logs.length})</div>
            {logs.length === 0
              ? <div style={{ textAlign: "center", color: "#333", paddingTop: 40 }}><div style={{ fontSize: 40 }}>📭</div><div style={{ marginTop: 12, color: "#555" }}>ធ្វើការលក់ ដើម្បីបង្ហាញ logs</div></div>
              : <TableWrap headers={["timestamp", "product", "ingredient", "before", "deducted", "after"]}>
                {logs.slice(0, 50).map((l, i) => (
                  <tr key={l.log_id} style={{ background: i % 2 === 0 ? "#0E0C0F" : "#120F13" }}>
                    <Td dim style={{ whiteSpace: "nowrap", fontSize: 11 }}>{l.ts}</Td>
                    <Td gold>{l.product}</Td>
                    <Td>{l.ingredient}</Td>
                    <Td mono dim>{l.before}{l.unit}</Td>
                    <Td style={{ color: "#E74C3C", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>−{l.deducted}{l.unit}</Td>
                    <Td style={{ color: "#27AE60", fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{l.after}{l.unit}</Td>
                  </tr>
                ))}
              </TableWrap>
            }
          </>
        )}
      </div>{/* end scroll */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ORDERS PAGE
// ═══════════════════════════════════════════════════════════════════
function IngForm({ ing, data, onSave, onCancel }) {
  const [v, setV] = useState(data || ing || {});
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <input className="inp" placeholder="ឈ្មោះ​គ្រឿង" value={v.ingredient_name} onChange={e=>setV({...v,ingredient_name:e.target.value})} />
      <input className="inp" type="number" placeholder="ស្តុក​បច្ចុប្បន្ន" value={v.current_stock} onChange={e=>setV({...v,current_stock:+e.target.value})} />
      <input className="inp" placeholder="ឯកតា (g/ml/pcs)" value={v.unit} onChange={e=>setV({...v,unit:e.target.value})} />
      <input className="inp" type="number" placeholder="ដែន​កំណត់​ (threshold)" value={v.threshold} onChange={e=>setV({...v,threshold:+e.target.value})} />
      <button className="btn-primary" onClick={()=>onSave(v)}>💾 រក្សា​ទុក</button>
    </div>
  );
}

function RecipeForm({ rec, prods, ings, onSave }) {
  const [v, setV] = useState(rec);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <select className="inp" value={v.product_id} onChange={e=>setV({...v,product_id:+e.target.value})}>
        <option value="">ជ្រើស​ផលិតផល</option>
        {prods.map(p=><option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
      </select>
      <select className="inp" value={v.ingredient_id} onChange={e=>setV({...v,ingredient_id:+e.target.value})}>
        <option value="">ជ្រើស​គ្រឿង</option>
        {ings.map(i=><option key={i.ingredient_id} value={i.ingredient_id}>{i.ingredient_name}</option>)}
      </select>
      <input className="inp" type="number" placeholder="បរិមាណ" value={v.quantity} onChange={e=>setV({...v,quantity:+e.target.value})} />
      <input className="inp" placeholder="ឯកតា" value={v.unit||""} onChange={e=>setV({...v,unit:e.target.value})} />
      <div style={{ display:"flex", gap:8, marginTop:4 }}>
        {onCancel && <button style={{ ...btnGhost, flex:1 }} onClick={onCancel}>បោះបង់</button>}
        <button style={{ ...btnGold, flex:1 }} onClick={()=>onSave(v)}>💾 រក្សា​ទុក</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ORDERS PAGE
// ═══════════════════════════════════════════════════════════════════

function OrdersPage({ orders, ings }) {
  const [filterType, setFilterType] = useState("all");   // all | day | month
  const [selDate, setSelDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selMonth, setSelMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const filtered = orders.filter(o => {
    if (filterType === "all") return true;
    const d = new Date(o.order_id);
    const ymd = d.toISOString().slice(0, 10);
    const ym = d.toISOString().slice(0, 7);
    if (filterType === "day") return ymd === selDate;
    if (filterType === "month") return ym === selMonth;
    return true;
  });

  const totalRev = filtered.reduce((s, o) => s + o.total + o.tax, 0);
  const totalItems = filtered.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);

  const dateLabel = filterType === "day" ? selDate : filterType === "month" ? selMonth : "ទាំងអស់";

  const doExportCSV = () => {
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [];

    // ── Section 1: Summary ──
    const totalVAT = filtered.reduce((s, o) => s + o.tax, 0);
    const payBreak = { cash: 0, qr: 0, bank: 0 };
    filtered.forEach(o => { payBreak[o.method] = (payBreak[o.method] || 0) + o.total + o.tax; });
    lines.push(`"=== 📊 សង្ខេប ${dateLabel} ==="`);
    lines.push(`"ចំណូលសរុប","${fmt(totalRev)}"`);
    lines.push(`"VAT សរុប","${fmt(totalVAT)}"`);
    lines.push(`"ការបញ្ជាទិញ","${filtered.length} លើក"`);
    lines.push(`"មុខម្ហូបលក់","${totalItems} ចាន"`);
    lines.push(`"មធ្យម/Order","${fmt(filtered.length ? totalRev / filtered.length : 0)}"`);
    lines.push(`"💵 សាច់ប្រាក់","${fmt(payBreak.cash)}"`);
    lines.push(`"📱 QR Code","${fmt(payBreak.qr)}"`);
    lines.push(`"🏦 ធនាគារ","${fmt(payBreak.bank)}"`);
    lines.push("");

    // ── Section 2: Orders ──
    lines.push(`"=== 📋 តារាង Orders ==="`);
    lines.push(`"ថ្ងៃទី","តុ","មុខម្ហូប","សរុប ($)","VAT ($)","វិធីទូទាត់"`);
    filtered.forEach(o => {
      lines.push([
        escape(o.ts), escape(o.table || ""),
        escape(o.items.map(i => `${i.product_name}×${i.qty}`).join(", ")),
        `"${(o.total + o.tax).toFixed(2)}"`, `"${o.tax.toFixed(2)}"`, escape(o.method)
      ].join(","));
    });
    lines.push(`"សរុប","","","${fmt(totalRev)}","${fmt(totalVAT)}",""`);
    lines.push("");

    // ── Section 3: Stock status ──
    lines.push(`"=== ⚠️ ស្ថានភាពស្តុក ==="`);
    lines.push(`"គ្រឿងផ្សំ","ស្តុកបច្ចុប្បន្ន","ដែនកំណត់","ស្ថានភាព","ឯកតា"`);
    (ings || []).forEach(i => {
      const s = Number(i.current_stock), t = Number(i.threshold);
      const status = s <= t ? "⚠️ ជិតអស់" : s <= t * 1.5 ? "🔶 ប្រុង" : "✅ ល្អ";
      lines.push([escape(i.ingredient_name), `"${fmtStock(s)}"`, `"${fmtStock(t)}"`, escape(status), escape(i.unit)].join(","));
    });

    const csv = lines.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `orders-${dateLabel}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const doExportPDF = () => {
    const orderRows = filtered.map(o => `<tr>
      <td style="white-space:nowrap;font-size:11px">${o.ts}</td>
      <td>${o.table || "—"}</td>
      <td style="font-size:11px">${o.items.map(i => `${i.product_name}×${i.qty}`).join(", ")}</td>
      <td style="text-align:right;font-weight:600;color:#B8732A">${fmt(o.total + o.tax)}</td>
      <td>${o.method === "cash" ? "💵 សាច់ប្រាក់" : o.method === "qr" ? "📱 QR" : "🏦 ធនាគារ"}</td>
    </tr>`).join("");

    const stockRows = ings.map(i => {
      const s = Number(i.current_stock), t = Number(i.threshold);
      const isLow = s <= t, isWarn = s <= t * 1.5 && !isLow;
      const col = isLow ? "#E74C3C" : isWarn ? "#E67E22" : "#27AE60";
      const pct = Math.min(100, (s / (t * 4 || 1)) * 100);
      return `<tr>
        <td>${i.ingredient_name}</td>
        <td style="font-weight:700;color:${col}">${fmtStock(s)} ${i.unit}</td>
        <td style="color:#888">${fmtStock(t)} ${i.unit}</td>
        <td><div style="background:#eee;border-radius:4px;height:8px;width:100px"><div style="background:${col};height:8px;border-radius:4px;width:${pct}%"></div></div></td>
        <td style="color:${col};font-weight:600">${isLow ? "⚠️ ជិតអស់" : isWarn ? "🔶 ប្រុង" : "✅ ល្អ"}</td>
      </tr>`;
    }).join("");

    const win = window.open("", "_blank", "width=1000,height=750");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Café Boom — ប្រវត្តិ ${dateLabel}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;600;700&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Kantumruy Pro',Arial,sans-serif;color:#111;padding:28px 32px;font-size:13px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:3px solid #B8732A}
      .logo{font-size:20px;font-weight:700;color:#B8732A}
      .logo span{font-size:11px;color:#888;display:block;font-weight:400}
      .meta{text-align:right;font-size:12px;color:#888}
      h2{font-size:14px;font-weight:700;color:#B8732A;margin:18px 0 8px;padding:5px 10px;background:#fff7f0;border-left:4px solid #B8732A}
      table{width:100%;border-collapse:collapse;margin-bottom:4px;font-size:12px}
      th{background:#B8732A;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
      td{padding:6px 10px;border-bottom:1px solid #f0ece8}
      tr:nth-child(even) td{background:#fdf9f6}
      .total-row td{background:#fff3e8!important;font-weight:700;color:#B8732A}
      .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 0 16px}
      .kpi{background:#fff7f0;border:1px solid #e8d8c8;border-radius:8px;padding:10px 12px}
      .kpi .val{font-size:18px;font-weight:700;color:#B8732A;margin-top:2px}
      .kpi .lbl{font-size:11px;color:#888}
      .footer{margin-top:24px;padding-top:10px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center}
    </style></head><body>
    <div class="header">
      <div class="logo">☕ Café Boom<span>ប្រវត្តិការបញ្ជាទិញ</span></div>
      <div class="meta"><b>${dateLabel}</b><br/>បោះពុម្ព: ${new Date().toLocaleString("km-KH")}</div>
    </div>

    <h2>📊 សង្ខេប</h2>
    <div class="kpi-grid">
      <div class="kpi"><div class="lbl">💰 ចំណូលសរុប</div><div class="val">${fmt(totalRev)}</div></div>
      <div class="kpi"><div class="lbl">🛒 ការបញ្ជាទិញ</div><div class="val">${filtered.length} លើក</div></div>
      <div class="kpi"><div class="lbl">☕ មុខម្ហូប</div><div class="val">${totalItems} ចាន</div></div>
      <div class="kpi"><div class="lbl">📊 មធ្យម/Order</div><div class="val">${fmt(filtered.length ? totalRev / filtered.length : 0)}</div></div>
    </div>

    <h2>📋 តារាង Orders</h2>
    <table><thead><tr><th>ថ្ងៃទី</th><th>តុ</th><th>មុខម្ហូប</th><th>ចំណូល</th><th>ទូទាត់</th></tr></thead>
    <tbody>${orderRows}
    <tr class="total-row"><td colspan="3" style="text-align:right">សរុបរួម</td><td>${fmt(totalRev)}</td><td></td></tr>
    </tbody></table>

    <h2>⚠️ ស្ថានភាពស្តុក</h2>
    <table><thead><tr><th>គ្រឿងផ្សំ</th><th>ស្តុក</th><th>ដែនកំណត់</th><th>Progress</th><th>ស្ថានភាព</th></tr></thead>
    <tbody>${stockRows}</tbody></table>

    <div class="footer">Café Boom POS © ${new Date().getFullYear()}</div>
    \x3cscript\x3ewindow.onload=()=>{window.print();}\x3c/script\x3e
    </body></html>`);
    win.document.close();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── STICKY HEADER ── */}
      <div style={{ flexShrink: 0, padding: "16px 14px 12px", borderBottom: "1px solid var(--border-col)", background: "var(--bg-main)" }}>
        <SectionHeader title="📋 ប្រវត្តិការបញ្ជាទិញ" sub={`${filtered.length} / ${orders.length} ការបញ្ជាទិញ`} />

        {/* Filter tabs + date picker row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingTop: 10 }}>
          {[["all", "📋 ទាំងអស់"], ["day", "📅 តាមថ្ងៃ"], ["month", "📆 តាមខែ"]].map(([k, lb]) => (
            <button key={k} onClick={() => setFilterType(k)} style={{
              padding: "6px 16px", borderRadius: 20, border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, fontWeight: 700,
              background: filterType === k ? "linear-gradient(135deg,#B8732A,#E8A84B)" : "#1A181C",
              color: filterType === k ? "#fff" : "#666",
              boxShadow: filterType === k ? "0 4px 14px #B8732A44" : "none"
            }}>{lb}</button>
          ))}
          {filterType === "day" && (
            <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
              style={{ ...inputSt, fontSize: 12, padding: "6px 12px", marginLeft: "auto" }} />
          )}
          {filterType === "month" && (
            <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)}
              style={{ ...inputSt, fontSize: 12, padding: "6px 12px", marginLeft: "auto" }} />
          )}
        </div>

        {/* Export buttons */}
        {filtered.length > 0 && (
          <div style={{ display: "flex", gap: 8, paddingTop: 10 }}>
            <button onClick={doExportCSV} style={{ ...btnSmall, color: "#27AE60", borderColor: "#27AE6044", fontSize: 12, padding: "6px 14px" }}>
              📊 Save CSV
            </button>
            <button onClick={doExportPDF} style={{ ...btnSmall, color: "#E8A84B", borderColor: "#E8A84B44", fontSize: 12, padding: "6px 14px" }}>
              🖨️ Print / PDF
            </button>
          </div>
        )}

        {/* Summary KPI row */}
        {filtered.length > 0 && (
          <div style={{ display: "flex", gap: 10, paddingTop: 10 }}>
            {[
              ["💰", "ចំណូលសរុប", fmt(totalRev), "#E8A84B"],
              ["🛒", "ការបញ្ជាទិញ", `${filtered.length} លើក`, "#5BA3E0"],
              ["☕", "មុខម្ហូប", `${totalItems} ចាន`, "#5C9E5C"],
              ["📊", "មធ្យម/Order", fmt(filtered.length ? totalRev / filtered.length : 0), "#9B59B6"],
            ].map(([ic, lb, val, col]) => (
              <div key={lb} style={{
                flex: 1, background: "var(--bg-card)", border: `1px solid ${col}22`,
                borderRadius: 10, padding: "8px 12px", minWidth: 0
              }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>{ic} {lb}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 32px" }}>
        {filtered.length === 0
          ? <Empty icon="📭" label="មិនមានការបញ្ជាទិញ" />
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(o => (
              <div key={o.order_id} style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: 14, padding: "14px 18px", display: "flex", gap: 16, flexWrap: "wrap",
                transition: "border-color .15s"
              }}>
                {/* Left — items + time */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  {/* Item list — each on its own line */}
                  <div style={{ marginBottom: 6 }}>
                    {o.items.map((i, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 16 }}>{i.emoji}</span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-main)" }}>{i.product_name}</span>
                        <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>×{i.qty}</span>
                        <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: "auto" }}>{fmt(i.price * i.qty)}</span>
                      </div>
                    ))}
                  </div>
                  {/* Time + table */}
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span>🕐 {o.ts}</span>
                    {o.table && <span style={{ color: "var(--accent)" }}>🪑 តុ {o.table}</span>}
                    {o.cashier && <span>👤 {o.cashier}</span>}
                  </div>
                </div>
                {/* Right — total + method */}
                <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--accent)", fontSize: 17 }}>{fmt(o.total + o.tax)}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>VAT {fmt(o.tax)}</div>
                  </div>
                  <Tag color={o.method === "cash" ? "#27AE60" : o.method === "qr" ? "#5BA3E0" : "#9B59B6"}>
                    {o.method === "cash" ? "💵 Cash" : o.method === "qr" ? "📱 QR" : "🏦 Bank"}
                  </Tag>
                </div>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  REPORT PAGE  — ថ្ងៃ / ខែ / ឆ្នាំ
// ═══════════════════════════════════════════════════════════════════

function ReportPage({ orders, ings, prods, recipes, lowStock, isAdmin, isGlobalAdmin, isBranchAdmin, branchId, currentUser, users, branchList }) {
  const [period, setPeriod] = useState("day");   // day | month | year
  const [selDate, setSelDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selMonth, setSelMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selYear, setSelYear] = useState(() => String(new Date().getFullYear()));
  const [reportMode, setReportMode] = useState("branch"); // branch | all
  const [allOrders,  setAllOrders]  = useState([]);
  const [allLoading, setAllLoading] = useState(false);
  const [branches,   setBranches]   = useState([]);
  const [allStock,   setAllStock]   = useState(null);  // { branch_id: { branch_name, ingredients } }
  const [stockLoading, setStockLoading] = useState(false);

  // Only global admin can switch to "all" mode
  // Branch admin + staff: always stay on "branch"
  const setReportModeSafe = (mode) => {
    if (!isGlobalAdmin && mode === "all") return;
    setReportMode(mode);
  };

  useEffect(() => {
    if (reportMode !== "all" || !isAdmin) return;
    const token = localStorage.getItem("pos_token");
    const headers = { "Content-Type":"application/json", "ngrok-skip-browser-warning":"true", ...(token ? { Authorization:"Bearer "+token } : {}) };
    setAllLoading(true);
    fetch(`${API}/api/all-orders`, { headers })
      .then(r => r.json()).then(data => { setAllOrders(Array.isArray(data) ? data : []); setAllLoading(false); })
      .catch(() => setAllLoading(false));
    fetch(`${API}/api/branches`, { headers })
      .then(r => r.json()).then(data => setBranches(Array.isArray(data) ? data : []))
      .catch(() => {});
    // Fetch per-branch stock data
    setStockLoading(true);
    fetch(`${API}/api/all-stock`, { headers })
      .then(r => r.json()).then(data => { setAllStock(data); setStockLoading(false); })
      .catch(() => setStockLoading(false));
  }, [reportMode, isAdmin]);

  // Branch filter within "all" mode (global admin only)
  const [selReportBranch, setSelReportBranch] = useState("all"); // "all" | branch_id

  // Only global admin in "all" mode sees all branches
  // Branch admin + staff: always own branch only
  const sourceOrders = (() => {
    if (!isGlobalAdmin || reportMode !== "all") return orders;
    if (allOrders === null || allOrders.length === 0) return orders;
    if (selReportBranch === "all") return allOrders;
    return allOrders.filter(o => o.branch_id === selReportBranch);
  })();

  // ── Filter orders by period ──────────────────────────────────────
  const filtered = sourceOrders.filter(o => {
    try {
      const d = new Date(o.order_id);
      if (period === "day") return d.toISOString().slice(0, 10) === selDate;
      if (period === "month") return d.toISOString().slice(0, 7) === selMonth;
      if (period === "year") return String(d.getFullYear()) === selYear;
    } catch { return false; }
    return false;
  });

  // ── Aggregates ───────────────────────────────────────────────────
  const totalRev = filtered.reduce((s, o) => s + o.total + o.tax, 0);
  const totalItems = filtered.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);
  const avgOrder = filtered.length ? totalRev / filtered.length : 0;

  const counts = {};
  filtered.forEach(o => o.items.forEach(i => { counts[i.product_name] = (counts[i.product_name] || 0) + i.qty; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxTop = top[0]?.[1] || 1;

  const byMethod = { cash: 0, qr: 0, bank: 0 };
  filtered.forEach(o => { byMethod[o.method] = (byMethod[o.method] || 0) + o.total + o.tax; });

  // ── For month view: group by day ─────────────────────────────────
  const byDay = {};
  if (period === "month") {
    filtered.forEach(o => {
      const day = new Date(o.order_id).toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + o.total + o.tax;
    });
  }

  // ── For year view: group by month ────────────────────────────────
  const byMon = {};
  const MON_KH = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
  if (period === "year") {
    filtered.forEach(o => {
      const m = new Date(o.order_id).getMonth();
      byMon[m] = (byMon[m] || 0) + o.total + o.tax;
    });
  }

  // ── For day view: group by hour ──────────────────────────────────
  const byHour = {};
  if (period === "day") {
    filtered.forEach(o => {
      const h = new Date(o.order_id).getHours();
      byHour[h] = (byHour[h] || 0) + o.total + o.tax;
    });
  }

  const periodLabel = period === "day"
    ? new Date(selDate).toLocaleDateString("km-KH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : period === "month"
      ? `${MON_KH[parseInt(selMonth.slice(5)) - 1]} ${selYear}`
      : `ឆ្នាំ ${selYear}`;

  // Branch label for current view
  const reportBranchLabel = (() => {
    if (!isGlobalAdmin || reportMode !== "all") return null;
    if (selReportBranch === "all") return "🌐 ទាំងអស់";
    return "🏪 " + (branches.find(b=>b.branch_id===selReportBranch)?.branch_name || selReportBranch);
  })();

  // ── Available years from orders ──────────────────────────────────
  const allYears = [...new Set(orders.map(o => String(new Date(o.order_id).getFullYear())))].sort().reverse();
  if (!allYears.includes(selYear)) allYears.unshift(selYear);

  // ── Export helpers ───────────────────────────────────────────────
  const doExportCSV = () => {
    // Sheet 1: Summary KPI
    const prodCount = {};
    filtered.forEach(o => o.items.forEach(i => { prodCount[i.product_name] = (prodCount[i.product_name] || 0) + i.qty; }));
    const payBreak = { cash: 0, qr: 0, bank: 0 };
    filtered.forEach(o => { payBreak[o.method] = (payBreak[o.method] || 0) + o.total + o.tax; });

    // Build combined CSV with sections separated by blank rows
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const lines = [];
    // ── Section 1: Summary ──
    lines.push(`"=== សង្ខេប ${periodLabel} ==="`);
    lines.push(`"ចំណូលសរុប","${fmt(totalRev)}"`);
    lines.push(`"ការបញ្ជាទិញ","${filtered.length} លើក"`);
    lines.push(`"មុខម្ហូបលក់","${totalItems} ចាន"`);
    lines.push(`"មធ្យម/Order","${fmt(avgOrder)}"`);
    lines.push(`"💵 សាច់ប្រាក់","${fmt(payBreak.cash)}"`);
    lines.push(`"📱 QR Code","${fmt(payBreak.qr)}"`);
    lines.push(`"🏦 ធនាគារ","${fmt(payBreak.bank)}"`);
    lines.push("");

    // ── Section 2: Top products ──
    lines.push(`"=== 🏆 មុខម្ហូបលក់ច្រើន ==="`);
    lines.push(`"#","មុខម្ហូប","ចំនួន (ចាន)"`);
    Object.entries(prodCount).sort((a, b) => b[1] - a[1]).forEach(([n, q], i) => {
      lines.push(`"${i + 1}",${escape(n)},"${q}"`);
    });
    lines.push("");

    // ── Section 3: All orders ──
    lines.push(`"=== 📋 តារាង Orders ==="`);
    lines.push(`"ថ្ងៃទី","តុ","មុខម្ហូប","សរុប ($)","VAT ($)","វិធីទូទាត់"`);
    filtered.forEach(o => {
      lines.push([
        escape(o.ts), escape(o.table || ""), escape(o.items.map(i => `${i.product_name}×${i.qty}`).join(", ")),
        `"${(o.total + o.tax).toFixed(2)}"`, `"${o.tax.toFixed(2)}"`, escape(o.method)
      ].join(","));
    });
    lines.push(`"សរុប","","","${fmt(totalRev)}","${fmt(filtered.reduce((s, o) => s + o.tax, 0))}",""`);
    lines.push("");

    // ── Section 4: Stock status ──
    lines.push(`"=== ⚠️ ស្ថានភាពស្តុក ==="`);
    lines.push(`"គ្រឿងផ្សំ","ស្តុកបច្ចុប្បន្ន","ដែនកំណត់","ស្ថានភាព","ឯកតា"`);
    ings.forEach(i => {
      const s = Number(i.current_stock), t = Number(i.threshold);
      const status = s <= t ? "⚠️ ជិតអស់" : s <= t * 1.5 ? "🔶 ប្រុង" : "✅ ល្អ";
      lines.push([escape(i.ingredient_name), `"${fmtStock(s)}"`, `"${fmtStock(t)}"`, escape(status), escape(i.unit)].join(","));
    });

    const csv = lines.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `report-${period}-${periodLabel}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const doExportPDF = () => {
    const prodCount = {};
    filtered.forEach(o => o.items.forEach(i => { prodCount[i.product_name] = (prodCount[i.product_name] || 0) + i.qty; }));
    const top = Object.entries(prodCount).sort((a, b) => b[1] - a[1]);
    const payBreak = { cash: 0, qr: 0, bank: 0 };
    filtered.forEach(o => { payBreak[o.method] = (payBreak[o.method] || 0) + o.total + o.tax; });

    // Summary rows for month/year
    let periodSummaryHtml = "";
    if (period === "month") {
      const byDay = {};
      filtered.forEach(o => { const d = new Date(o.order_id).getDate(); byDay[d] = (byDay[d] || { rev: 0, cnt: 0, items: 0 }); byDay[d].rev += (o.total + o.tax); byDay[d].cnt++; byDay[d].items += o.items.reduce((s, i) => s + i.qty, 0); });
      const dayRows = Object.entries(byDay).sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([d, v]) => `<tr><td>${String(d).padStart(2, "0")}</td><td style="color:#5BA3E0">${v.cnt}</td><td style="color:#5C9E5C">${v.items}</td><td style="font-weight:700;color:#B8732A">${fmt(v.rev)}</td></tr>`).join("");
      periodSummaryHtml = `<h3>📅 សង្ខេបប្រចាំថ្ងៃ — ${periodLabel}</h3>
        <table><thead><tr><th>ថ្ងៃ</th><th>Orders</th><th>Items</th><th>ចំណូល</th></tr></thead><tbody>${dayRows}
        <tr class="total-row"><td>សរុប</td><td>${filtered.length}</td><td>${totalItems}</td><td>${fmt(totalRev)}</td></tr>
        </tbody></table><br/>`;
    } else if (period === "year") {
      const byMonth = {};
      filtered.forEach(o => { const m = new Date(o.order_id).getMonth(); byMonth[m] = (byMonth[m] || { rev: 0, cnt: 0, items: 0 }); byMonth[m].rev += (o.total + o.tax); byMonth[m].cnt++; byMonth[m].items += o.items.reduce((s, i) => s + i.qty, 0); });
      const monRows = Object.entries(byMonth).sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([m, v]) => `<tr><td>${MON_KH[Number(m)] || m}</td><td style="color:#5BA3E0">${v.cnt}</td><td style="color:#5C9E5C">${v.items}</td><td style="font-weight:700;color:#B8732A">${fmt(v.rev)}</td></tr>`).join("");
      periodSummaryHtml = `<h3>📆 សង្ខេបប្រចាំខែ — ${periodLabel}</h3>
        <table><thead><tr><th>ខែ</th><th>Orders</th><th>Items</th><th>ចំណូល</th></tr></thead><tbody>${monRows}
        <tr class="total-row"><td>សរុប</td><td>${filtered.length}</td><td>${totalItems}</td><td>${fmt(totalRev)}</td></tr>
        </tbody></table><br/>`;
    }

    // Orders table (day: all rows; month/year: top 50)
    const orderRows = (period === "day" ? filtered : filtered.slice(0, 50)).map(o => `<tr>
      <td style="white-space:nowrap;font-size:11px">${o.ts}</td>
      <td>${o.table || "—"}</td>
      <td style="font-size:11px">${o.items.map(i => `${i.product_name}×${i.qty}`).join(", ")}</td>
      <td style="text-align:right;font-weight:600;color:#B8732A">${fmt(o.total + o.tax)}</td>
      <td>${o.method === "cash" ? "💵" : o.method === "qr" ? "📱" : "🏦"} ${o.method}</td>
    </tr>`).join("");
    const orderNote = (period !== "day" && filtered.length > 50) ? `<p style="font-size:11px;color:#888">(បង្ហាញ 50 ក្នុង ${filtered.length} orders)</p>` : "";

    // Stock status
    const stockRows = ings.map(i => {
      const s = Number(i.current_stock), t = Number(i.threshold);
      const isLow = s <= t, isWarn = s <= t * 1.5 && !isLow;
      const col = isLow ? "#E74C3C" : isWarn ? "#E67E22" : "#27AE60";
      const pct = Math.min(100, (s / (t * 4 || 1)) * 100);
      return `<tr>
        <td>${i.ingredient_name}</td>
        <td style="font-weight:700;color:${col}">${fmtStock(s)} ${i.unit}</td>
        <td style="color:#888">${fmtStock(t)} ${i.unit}</td>
        <td><div style="background:#eee;border-radius:4px;height:8px;width:120px"><div style="background:${col};height:8px;border-radius:4px;width:${pct}%"></div></div></td>
        <td style="color:${col};font-weight:600">${isLow ? "⚠️ ជិតអស់" : isWarn ? "🔶 ប្រុង" : "✅ ល្អ"}</td>
      </tr>`;
    }).join("");

    const topRows = top.map(([n, q], i) => `<tr><td>#${i + 1}</td><td>${n}</td><td style="font-weight:700;color:#B8732A">${q} ចាន</td></tr>`).join("");

    const win = window.open("", "_blank", "width=1000,height=750");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Café Boom — របាយការណ៍ ${periodLabel}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;600;700&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Kantumruy Pro',Arial,sans-serif;color:#111;padding:28px 32px;font-size:13px;background:#fff}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #B8732A}
      .logo{font-size:22px;font-weight:700;color:#B8732A}
      .logo span{font-size:12px;color:#888;display:block;font-weight:400}
      .meta{text-align:right;font-size:12px;color:#888}
      h2{font-size:15px;font-weight:700;color:#B8732A;margin:20px 0 10px;padding:6px 10px;background:#fff7f0;border-left:4px solid #B8732A}
      h3{font-size:13px;font-weight:700;color:#555;margin:16px 0 8px}
      table{width:100%;border-collapse:collapse;margin-bottom:4px;font-size:12px}
      th{background:#B8732A;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
      td{padding:6px 10px;border-bottom:1px solid #f0ece8}
      tr:nth-child(even) td{background:#fdf9f6}
      .total-row td{background:#fff3e8!important;font-weight:700;color:#B8732A}
      .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:12px 0 20px}
      .kpi{background:#fff7f0;border:1px solid #e8d8c8;border-radius:8px;padding:12px 14px}
      .kpi .val{font-size:20px;font-weight:700;color:#B8732A;margin-top:4px}
      .kpi .lbl{font-size:11px;color:#888}
      .pay-row{display:flex;gap:12px;margin:8px 0 16px}
      .pay-card{flex:1;background:#f8f8f8;border:1px solid #eee;border-radius:8px;padding:10px 14px;text-align:center}
      .pay-card .icon{font-size:18px}
      .pay-card .amt{font-size:15px;font-weight:700;color:#333;margin-top:2px}
      .footer{margin-top:28px;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center}
      @media print{body{padding:16px 20px} .no-print{display:none}}
    </style></head><body>
    <div class="header">
      <div><div class="logo">☕ Café Boom<span>POS System</span></div></div>
      <div class="meta">
        <b>របាយការណ៍${period === "day" ? "ប្រចាំថ្ងៃ" : period === "month" ? "ប្រចាំខែ" : "ប្រចាំឆ្នាំ"}</b><br/>
        ${periodLabel}<br/>
        បោះពុម្ព: ${new Date().toLocaleString("km-KH")}
      </div>
    </div>

    <h2>📊 សង្ខេបទូទៅ</h2>
    <div class="kpi-grid">
      <div class="kpi"><div class="lbl">💰 ចំណូលសរុប</div><div class="val">${fmt(totalRev)}</div></div>
      <div class="kpi"><div class="lbl">🛒 ការបញ្ជាទិញ</div><div class="val">${filtered.length} លើក</div></div>
      <div class="kpi"><div class="lbl">☕ មុខម្ហូបលក់</div><div class="val">${totalItems} ចាន</div></div>
      <div class="kpi"><div class="lbl">📊 មធ្យម/Order</div><div class="val">${fmt(avgOrder)}</div></div>
    </div>
    <div class="pay-row">
      <div class="pay-card"><div class="icon">💵</div><div class="lbl">សាច់ប្រាក់</div><div class="amt">${fmt(payBreak.cash)}</div></div>
      <div class="pay-card"><div class="icon">📱</div><div class="lbl">QR Code</div><div class="amt">${fmt(payBreak.qr)}</div></div>
      <div class="pay-card"><div class="icon">🏦</div><div class="lbl">ធនាគារ</div><div class="amt">${fmt(payBreak.bank)}</div></div>
    </div>

    ${periodSummaryHtml}

    <h2>📋 តារាង Orders</h2>
    <table><thead><tr><th>ថ្ងៃទី</th><th>តុ</th><th>មុខម្ហូប</th><th>ចំណូល</th><th>ទូទាត់</th></tr></thead>
    <tbody>${orderRows}
    <tr class="total-row"><td colspan="3" style="text-align:right">សរុបរួម</td><td>${fmt(totalRev)}</td><td></td></tr>
    </tbody></table>
    ${orderNote}

    <h2>🏆 មុខម្ហូបលក់ច្រើន</h2>
    <table><thead><tr><th>#</th><th>មុខម្ហូប</th><th>ចំនួន</th></tr></thead>
    <tbody>${topRows}</tbody></table>

    <h2>⚠️ ស្ថានភាពស្តុក</h2>
    <table><thead><tr><th>គ្រឿងផ្សំ</th><th>ស្តុក</th><th>ដែនកំណត់</th><th>Progress</th><th>ស្ថានភាព</th></tr></thead>
    <tbody>${stockRows}</tbody></table>

    <div class="footer">Café Boom POS © ${new Date().getFullYear()} · Generated ${new Date().toLocaleString()}</div>
    \x3cscript\x3ewindow.onload=()=>{window.print();}\x3c/script\x3e
    </body></html>`);
    win.document.close();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── STICKY HEADER ── */}
      <div style={{ flexShrink: 0, padding: "16px 14px 12px", borderBottom: "1px solid var(--border-col)", background: "var(--bg-main)" }}>
        <SectionHeader title="📊 របាយការណ៍លក់" sub={periodLabel + (reportBranchLabel ? " · " + reportBranchLabel : "")} />

        {/* Multi-Branch Toggle — GLOBAL ADMIN ONLY */}
        {isGlobalAdmin && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>📍 មើល:</span>
            {[["branch", "🏪 តូបខ្ញុំ"], ["all", "🌐 តូបទាំងអស់"]].map(([k, lb]) => (
              <button key={k} onClick={() => setReportModeSafe(k)} style={{
                padding: "6px 16px", borderRadius: 20, border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                background: reportMode === k ? `linear-gradient(135deg,var(--accent-dk),var(--accent))` : "var(--bg-card)",
                color: reportMode === k ? "#fff" : "var(--text-dim)",
                boxShadow: reportMode === k ? `0 4px 14px var(--accent)44` : "none",
              }}>{lb}</button>
            ))}
            {reportMode === "all" && (
              <button onClick={() => { setAllLoading(true); const tok = localStorage.getItem('pos_token'); const hdr = { 'Content-Type':'application/json','ngrok-skip-browser-warning':'true',...(tok ? { Authorization:'Bearer '+tok } : {}) }; fetch(`${API}/api/all-orders`, { headers:hdr }).then(r => r.json()).then(d => { setAllOrders(Array.isArray(d) ? d : []); setAllLoading(false); }).catch(() => setAllLoading(false)); }}
                style={{
                  marginLeft: "auto", padding: "6px 12px", borderRadius: 20, border: "1px solid var(--border)",
                  background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 11, color: "var(--text-dim)"
                }}>
                🔄 Refresh
              </button>
            )}
          </div>
        )}

        {/* Branch filter — show when in "all" mode */}
        {isGlobalAdmin && reportMode === "all" && branches.length > 0 && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", marginBottom:10 }}>
            <span style={{ fontSize:12, color:"var(--text-dim)", flexShrink:0 }}>🏪 សាខា:</span>
            <button
              onClick={() => setSelReportBranch("all")}
              style={{ padding:"5px 14px", borderRadius:20, border:"none", cursor:"pointer",
                fontFamily:"inherit", fontSize:12, fontWeight:700,
                background: selReportBranch==="all" ? "linear-gradient(135deg,#1A3A5A,#5BA3E0)" : "var(--bg-card)",
                color: selReportBranch==="all" ? "#fff" : "var(--text-dim)" }}>
              🌐 ទាំងអស់
            </button>
            {branches.filter(b => b.active).map(b => {
              const badge = getUserBranchBadge({ branch_id: b.branch_id }, branches);
              const isActive = selReportBranch === b.branch_id;
              const bOrders = (allOrders||[]).filter(o => o.branch_id === b.branch_id);
              return (
                <button key={b.branch_id}
                  onClick={() => setSelReportBranch(b.branch_id)}
                  style={{ padding:"5px 14px", borderRadius:20, border:"none", cursor:"pointer",
                    fontFamily:"inherit", fontSize:12, fontWeight:700,
                    background: isActive ? (badge?.bg||"var(--bg-card)") : "var(--bg-card)",
                    color: isActive ? (badge?.color||"#fff") : "var(--text-dim)",
                    boxShadow: isActive ? `0 0 0 1px ${badge?.border||"#333"}` : "none",
                    display:"flex", alignItems:"center", gap:5 }}>
                  🏪 {b.branch_name}
                  <span style={{ fontSize:10, opacity:.7 }}>({bOrders.length})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Period Tabs + Date Picker */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {[["day", "📅 ប្រចាំថ្ងៃ"], ["month", "📆 ប្រចាំខែ"], ["year", "🗓️ ប្រចាំឆ្នាំ"]].map(([k, lb]) => (
            <button key={k} onClick={() => setPeriod(k)} style={{
              padding: "7px 18px", borderRadius: 20, border: "none", cursor: "pointer", fontFamily: "inherit",
              fontSize: 12, fontWeight: 700,
              background: period === k ? "linear-gradient(135deg,#B8732A,#E8A84B)" : "#1A181C",
              color: period === k ? "#fff" : "#666",
              boxShadow: period === k ? "0 4px 14px #B8732A44" : "none",
            }}>{lb}</button>
          ))}
          {period === "day" && (
            <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
              style={{ ...inputSt, fontSize: 12, padding: "6px 12px", marginLeft: "auto" }} />
          )}
          {period === "month" && (
            <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)}
              style={{ ...inputSt, fontSize: 12, padding: "6px 12px", marginLeft: "auto" }} />
          )}
          {period === "year" && (
            <select value={selYear} onChange={e => setSelYear(e.target.value)}
              style={{ ...inputSt, fontSize: 12, padding: "6px 12px", marginLeft: "auto" }}>
              {allYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>

        {/* Export buttons */}
        {filtered.length > 0 && (
          <div style={{ display: "flex", gap: 8, paddingTop: 10 }}>
            <button onClick={doExportCSV} style={{ ...btnSmall, color: "#27AE60", borderColor: "#27AE6044", fontSize: 12, padding: "6px 14px" }}>
              📊 Save CSV
            </button>
            <button onClick={doExportPDF} style={{ ...btnSmall, color: "#E8A84B", borderColor: "#E8A84B44", fontSize: 12, padding: "6px 14px" }}>
              🖨️ Print / PDF
            </button>
          </div>
        )}
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 32px" }}>

        {/* Per-branch summary cards — clickable to filter */}
        {reportMode === "all" && !allLoading && branches.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ fontWeight:700, fontSize:13 }}>🏪 សង្ខេបតាមតូប</div>
              {selReportBranch !== "all" && (
                <button onClick={() => setSelReportBranch("all")}
                  style={{ fontSize:11, color:"#888", background:"transparent", border:"1px solid #333",
                    borderRadius:10, padding:"2px 10px", cursor:"pointer", fontFamily:"inherit" }}>
                  ✕ លុប Filter
                </button>
              )}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10 }}>
              {branches.filter(b => b.active).map(b => {
                // Use allOrders for period-filtered data per branch
                const allBOrders = (allOrders||[]).filter(o => {
                  if (o.branch_id !== b.branch_id) return false;
                  try {
                    const d = new Date(o.order_id);
                    if (period === "day")   return d.toISOString().slice(0,10) === selDate;
                    if (period === "month") return d.toISOString().slice(0,7)  === selMonth;
                    if (period === "year")  return String(d.getFullYear())      === selYear;
                  } catch { return false; }
                  return false;
                });
                const bRev = allBOrders.reduce((s,o) => s + o.total + o.tax, 0);
                const totalAllRev = (allOrders||[]).filter(o => {
                  try {
                    const d = new Date(o.order_id);
                    if (period === "day")   return d.toISOString().slice(0,10) === selDate;
                    if (period === "month") return d.toISOString().slice(0,7)  === selMonth;
                    if (period === "year")  return String(d.getFullYear())      === selYear;
                  } catch { return false; }
                  return false;
                }).reduce((s,o) => s + o.total + o.tax, 0);
                const pct = totalAllRev > 0 ? Math.round((bRev / totalAllRev) * 100) : 0;
                const isSelected = selReportBranch === b.branch_id;
                const badge = getUserBranchBadge({ branch_id: b.branch_id }, branches);
                return (
                  <div key={b.branch_id}
                    onClick={() => setSelReportBranch(isSelected ? "all" : b.branch_id)}
                    style={{
                      background: isSelected ? (badge?.bg||"var(--bg-card)") : "var(--bg-card)",
                      border: `2px solid ${isSelected ? (badge?.color||"var(--accent)") : "var(--border-col)"}`,
                      borderRadius:12, padding:"12px 14px", cursor:"pointer",
                      transition:"all .15s",
                      boxShadow: isSelected ? `0 0 0 2px ${badge?.border||"var(--accent)33"}` : "none"
                    }}>
                    <div style={{ fontSize:12, fontWeight:700, marginBottom:4,
                      color: isSelected ? (badge?.color||"var(--accent)") : "var(--text-main)" }}>
                      🏪 {b.branch_name}
                      {isSelected && <span style={{ marginLeft:5, fontSize:10 }}>✓</span>}
                    </div>
                    <div style={{ fontSize:18, fontWeight:700,
                      color: isSelected ? (badge?.color||"var(--accent)") : "var(--accent)" }}>
                      {fmt(bRev)}
                    </div>
                    <div style={{ fontSize:11, color:"var(--text-dim)", marginTop:2 }}>
                      {allBOrders.length} orders · {pct}%
                    </div>
                    <div style={{ height:4, background:"var(--bg-main)", borderRadius:2, marginTop:8, overflow:"hidden" }}>
                      <div style={{
                        height:"100%", borderRadius:2,
                        background: badge?.bg || `linear-gradient(90deg,var(--accent-dk),var(--accent))`,
                        width: pct + "%", transition:"width .4s"
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading all-orders */}
        {reportMode === "all" && allLoading && (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-dim)" }}>
            <div style={{
              width: 28, height: 28, border: "3px solid var(--border)", borderTop: `3px solid var(--accent)`,
              borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 10px"
            }} />
            កំពុងទាញ Orders ពីតូបទាំងអស់...
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
          {[
            ["💰", "ចំណូលសរុប", fmt(totalRev), "#E8A84B"],
            ["🛒", "ការបញ្ជាទិញ", filtered.length + " លើក", "#5BA3E0"],
            ["☕", "មុខម្ហូបលក់", totalItems + " ចាន", "#5C9E5C"],
            ["📊", "មធ្យម/Order", fmt(avgOrder), "#9B59B6"],
          ].map(([ic, lb, val, col]) => (
            <div key={lb} style={{
              background: "var(--bg-card)", border: `1px solid ${col}33`, borderRadius: 14, padding: "14px 12px",
              display: "flex", flexDirection: "column", gap: 4
            }}>
              <div style={{ fontSize: 22 }}>{ic}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: col }}>{val}</div>
              <div style={{ fontSize: 11, color: "#555" }}>{lb}</div>
            </div>
          ))}
        </div>

        {/* ── Chart: by hour/day/month ── */}
        {filtered.length > 0 && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-col)", borderRadius: 14, padding: 18, marginBottom: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 13 }}>
              {period === "day" ? "⏰ ចំណូលតាមម៉ោង" : period === "month" ? "📅 ចំណូលតាមថ្ងៃ" : "📆 ចំណូលតាមខែ"}
            </div>
            {(() => {
              let bars = [];
              if (period === "day") {
                bars = Array.from({ length: 14 }, (_, i) => i + 7).map(h => ({ label: `${h}h`, val: byHour[h] || 0 }));
              } else if (period === "month") {
                const days = new Date(parseInt(selMonth.slice(0, 4)), parseInt(selMonth.slice(5)), 0).getDate();
                bars = Array.from({ length: days }, (_, i) => i + 1).map(d => {
                  const key = `${selMonth}-${String(d).padStart(2, "0")}`;
                  return { label: String(d), val: byDay[key] || 0 };
                });
              } else {
                bars = Array.from({ length: 12 }, (_, i) => i).map(m => ({ label: MON_KH[m].slice(0, 3), val: byMon[m] || 0 }));
              }
              const maxVal = Math.max(...bars.map(b => b.val), 0.01);
              const BAR_AREA = 140; // height for bars only (excluding x-labels)
              return (
                <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                  <div style={{
                    display: "flex", alignItems: "flex-end", gap: period === "month" ? 3 : 6,
                    height: BAR_AREA + 24,  /* bar area + x-label space */
                  }}>
                    {bars.map((b, i) => {
                      const barH = Math.max(2, (b.val / maxVal) * BAR_AREA);
                      const showLabelInside = barH > 26; // label inside if bar tall enough
                      return (
                        <div key={i} style={{
                          display: "flex", flexDirection: "column", alignItems: "center",
                          justifyContent: "flex-end",
                          gap: 0, minWidth: period === "month" ? 14 : 28, flex: period === "month" ? "0 0 14px" : "1",
                          height: "100%",
                        }}>
                          {/* Value label — above bar (only when bar is short) */}
                          {!showLabelInside && (
                            <div style={{ fontSize: 9, color: b.val > 0 ? "#E8A84B" : "transparent", fontWeight: 700, marginBottom: 2, lineHeight: 1 }}>
                              {b.val > 0 ? `$${b.val.toFixed(0)}` : ""}
                            </div>
                          )}
                          {/* Bar */}
                          <div style={{
                            width: "100%", position: "relative",
                            background: b.val > 0 ? "linear-gradient(0deg,#B8732A,#E8A84B)" : "#1A181C",
                            borderRadius: "3px 3px 0 0", transition: "height .4s",
                            height: `${barH}px`,
                            display: "flex", alignItems: "flex-start", justifyContent: "center",
                          }}>
                            {/* Value label inside bar (when bar is tall) */}
                            {showLabelInside && b.val > 0 && (
                              <div style={{ fontSize: 9, color: "#fff", fontWeight: 700, marginTop: 4, lineHeight: 1 }}>
                                ${b.val.toFixed(0)}
                              </div>
                            )}
                          </div>
                          {/* X-axis label */}
                          <div style={{ fontSize: 9, color: "#444", whiteSpace: "nowrap", marginTop: 3, height: 14 }}>{b.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Top products */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-col)", borderRadius: 14, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13 }}>🏆 មុខម្ហូបលក់ដាច់</div>
            {top.length === 0
              ? <div style={{ color: "#444", fontSize: 12 }}>មិនទាន់មានទិន្នន័យ</div>
              : top.map(([name, qty], i) => (
                <div key={name} style={{ marginBottom: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                    <span style={{
                      color: i === 0 ? "#E8A84B" : "#aaa", overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", maxWidth: "70%"
                    }}>#{i + 1} {name}</span>
                    <span style={{ color: "#E8A84B", fontWeight: 700, flexShrink: 0 }}>{qty} ចាន</span>
                  </div>
                  <div style={{ height: 4, background: "#1A181C", borderRadius: 2 }}>
                    <div style={{
                      height: "100%", width: `${(qty / maxTop) * 100}%`,
                      background: `linear-gradient(90deg,#B8732A,#E8A84B)`, borderRadius: 2
                    }} />
                  </div>
                </div>
              ))
            }
          </div>

          {/* Payment breakdown */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-col)", borderRadius: 14, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13 }}>💳 វិធីទូទាត់</div>
            {filtered.length === 0
              ? <div style={{ color: "#444", fontSize: 12 }}>មិនទាន់មានទិន្នន័យ</div>
              : [["💵", "សាច់ប្រាក់", "cash", "#27AE60"], ["📱", "QR Code", "qr", "#5BA3E0"], ["🏦", "ធនាគារ", "bank", "#9B59B6"]].map(([ic, lb, k, col]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>{ic}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: "#888" }}>{lb}</span>
                      <span style={{ color: col, fontWeight: 700 }}>{fmt(byMethod[k] || 0)}</span>
                    </div>
                    <div style={{ height: 4, background: "#1A181C", borderRadius: 2 }}>
                      <div style={{
                        height: "100%", width: totalRev ? `${((byMethod[k] || 0) / totalRev) * 100}%` : "0%",
                        background: col, borderRadius: 2
                      }} />
                    </div>
                  </div>
                </div>
              ))
            }
          </div>

          {/* Order list for day view */}
          {period === "day" && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-col)", borderRadius: 14, padding: 16, gridColumn: "1/-1" }}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13 }}>🧾 តារាង Order ថ្ងៃនេះ ({filtered.length})</div>
              {filtered.length === 0
                ? <div style={{ color: "#444", fontSize: 12 }}>គ្មានការលក់ថ្ងៃនេះ</div>
                : filtered.slice().reverse().map(o => (
                  <div key={o.order_id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 0", borderBottom: "1px solid var(--border-col)", gap: 8
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#777", fontFamily: "'DM Mono',monospace" }}>
                        {new Date(o.order_id).toLocaleTimeString("km-KH", { hour: "2-digit", minute: "2-digit" })}
                        {o.table && <span style={{ marginLeft: 6, color: "#B8732A" }}>តុ{o.table}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#aaa", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.items.map(i => `${i.emoji}${i.product_name}×${i.qty}`).join(", ")}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: "#E8A84B", fontSize: 13, flexShrink: 0 }}>{fmt(o.total + o.tax)}</div>
                  </div>
                ))
              }
            </div>
          )}

          {/* Monthly breakdown table */}
          {period === "month" && filtered.length > 0 && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-col)", borderRadius: 14, padding: 16, gridColumn: "1/-1" }}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13 }}>📋 សង្ខេបប្រចាំថ្ងៃ</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 1, fontSize: 11 }}>
                {["ថ្ងៃ", "Orders", "Items", "ចំណូល"].map(h => (
                  <div key={h} style={{ background: "#1A181C", padding: "6px 8px", fontWeight: 700, color: "#E8A84B" }}>{h}</div>
                ))}
                {Object.entries(byDay).sort().map(([day, rev]) => {
                  const dayOrders = filtered.filter(o => new Date(o.order_id).toISOString().slice(0, 10) === day);
                  const items = dayOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);
                  return [
                    <div key={day + "d"} style={{ padding: "6px 8px", color: "#aaa" }}>{day.slice(8)}</div>,
                    <div key={day + "o"} style={{ padding: "6px 8px", color: "#5BA3E0" }}>{dayOrders.length}</div>,
                    <div key={day + "i"} style={{ padding: "6px 8px", color: "#5C9E5C" }}>{items}</div>,
                    <div key={day + "r"} style={{ padding: "6px 8px", color: "#E8A84B", fontWeight: 700 }}>{fmt(rev)}</div>,
                  ];
                })}
                <div style={{ background: "#1A2A1A", padding: "6px 8px", fontWeight: 700, color: "#fff" }}>សរុប</div>
                <div style={{ background: "#1A2A1A", padding: "6px 8px", fontWeight: 700, color: "#5BA3E0" }}>{filtered.length}</div>
                <div style={{ background: "#1A2A1A", padding: "6px 8px", fontWeight: 700, color: "#5C9E5C" }}>{totalItems}</div>
                <div style={{ background: "#1A2A1A", padding: "6px 8px", fontWeight: 700, color: "#E8A84B" }}>{fmt(totalRev)}</div>
              </div>
            </div>
          )}

          {/* Yearly breakdown table */}
          {period === "year" && filtered.length > 0 && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-col)", borderRadius: 14, padding: 16, gridColumn: "1/-1" }}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13 }}>📋 សង្ខេបប្រចាំខែ</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 1, fontSize: 11 }}>
                {["ខែ", "Orders", "Items", "ចំណូល"].map(h => (
                  <div key={h} style={{ background: "#1A181C", padding: "6px 8px", fontWeight: 700, color: "#E8A84B" }}>{h}</div>
                ))}
                {Array.from({ length: 12 }, (_, m) => m).filter(m => byMon[m] > 0).map(m => {
                  const monOrders = filtered.filter(o => new Date(o.order_id).getMonth() === m);
                  const items = monOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);
                  return [
                    <div key={m + "n"} style={{ padding: "6px 8px", color: "#aaa" }}>{MON_KH[m]}</div>,
                    <div key={m + "o"} style={{ padding: "6px 8px", color: "#5BA3E0" }}>{monOrders.length}</div>,
                    <div key={m + "i"} style={{ padding: "6px 8px", color: "#5C9E5C" }}>{items}</div>,
                    <div key={m + "r"} style={{ padding: "6px 8px", color: "#E8A84B", fontWeight: 700 }}>{fmt(byMon[m])}</div>,
                  ];
                })}
                <div style={{ background: "#1A2A1A", padding: "6px 8px", fontWeight: 700, color: "#fff" }}>សរុប</div>
                <div style={{ background: "#1A2A1A", padding: "6px 8px", fontWeight: 700, color: "#5BA3E0" }}>{filtered.length}</div>
                <div style={{ background: "#1A2A1A", padding: "6px 8px", fontWeight: 700, color: "#5C9E5C" }}>{totalItems}</div>
                <div style={{ background: "#1A2A1A", padding: "6px 8px", fontWeight: 700, color: "#E8A84B" }}>{fmt(totalRev)}</div>
              </div>
            </div>
          )}

          {/* ── Sales by User ── */}
          {(() => {
            const userSales = {};
            filtered.forEach(o => {
              const key = o.cashier || o.user || "unknown";
              if (!userSales[key]) userSales[key] = { orders: 0, revenue: 0, items: 0, branch_id: o.branch_id };
              userSales[key].orders++;
              userSales[key].revenue += o.total + o.tax;
              userSales[key].items += (o.items||[]).reduce((s,i) => s+i.qty, 0);
              // Try to enrich branch from users list
              if (!userSales[key].branch_id && users) {
                const u = (users||[]).find(u => u.name === key || u.username === key);
                if (u) userSales[key].branch_id = u.branch_id;
              }
            });
            const entries = Object.entries(userSales).sort((a,b) => b[1].revenue - a[1].revenue);
            if (entries.length === 0) return null;
            const maxRev = entries[0][1].revenue || 1;
            return (
              <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-col)", borderRadius:14, padding:16, gridColumn:"1/-1" }}>
                <div style={{ fontWeight:700, marginBottom:14, fontSize:13, display:"flex", alignItems:"center", gap:8 }}>
                  👤 ការលក់តាម User
                  <span style={{ fontSize:11, color:"#555", fontWeight:400 }}>({entries.length} នាក់)</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:10 }}>
                  {entries.map(([name, s], idx) => {
                    const pct = (s.revenue / maxRev) * 100;
                    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx+1}`;
                    const col = idx === 0 ? "#E8A84B" : idx === 1 ? "#aaa" : idx === 2 ? "#CD7F32" : "#555";
                    // Branch badge for this cashier
                    const cashierUser = (users||[]).find(u => u.name === name || u.username === name);
                    const cashierBid = s.branch_id || cashierUser?.branch_id;
                    const branchBadge = cashierBid ? getUserBranchBadge({ branch_id: cashierBid }, branchList) : null;
                    return (
                      <div key={name} style={{
                        background:"var(--bg-main)", border:"1px solid var(--border-col)",
                        borderRadius:12, padding:"12px 14px"
                      }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                          <div style={{
                            width:36, height:36, borderRadius:10, flexShrink:0,
                            background: idx===0 ? "linear-gradient(135deg,#8B5520,#E8A84B)"
                              : idx===1 ? "linear-gradient(135deg,#555,#aaa)"
                              : idx===2 ? "linear-gradient(135deg,#7A4A1A,#CD7F32)"
                              : "linear-gradient(135deg,#1A1820,#2A2530)",
                            display:"flex", alignItems:"center", justifyContent:"center", fontSize:17
                          }}>{medal}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                              <span style={{ fontWeight:700, fontSize:13, color:col, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {name}
                              </span>
                              {/* Branch badge */}
                              {branchBadge && (
                                <span style={{
                                  fontSize:10, padding:"1px 7px", borderRadius:8,
                                  background:branchBadge.bg, color:branchBadge.color,
                                  border:`1px solid ${branchBadge.border}`, fontWeight:700, flexShrink:0
                                }}>{branchBadge.label}</span>
                              )}
                            </div>
                            <div style={{ fontSize:11, color:"#555", marginTop:1 }}>
                              {s.orders} Order · {s.items} មុខ
                            </div>
                          </div>
                          <div style={{ fontWeight:700, fontSize:14, color:col, fontFamily:"'DM Mono',monospace", flexShrink:0 }}>
                            {fmt(s.revenue)}
                          </div>
                        </div>
                        <div style={{ height:5, background:"#1A181C", borderRadius:3, overflow:"hidden" }}>
                          <div style={{
                            height:"100%", width:pct+"%", borderRadius:3,
                            background: idx===0
                              ? "linear-gradient(90deg,#B8732A,#E8A84B)"
                              : idx===1 ? "linear-gradient(90deg,#777,#bbb)"
                              : idx===2 ? "linear-gradient(90deg,#7A4A1A,#CD7F32)"
                              : "#2A2530",
                            transition:"width .4s"
                          }} />
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", marginTop:5, fontSize:10, color:"#444" }}>
                          <span>avg {fmt(s.orders ? s.revenue/s.orders : 0)}/order</span>
                          <span>{Math.round(pct)}% នៃការលក់</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Stock health + Usage — Admin only */}
          {isAdmin && (
          <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-col)", borderRadius:14, padding:16, gridColumn:"1/-1" }}>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>
                🧂 ស្ថានភាពស្តុក
                {lowStock.length > 0 && (
                  <span style={{ marginLeft:8, background:"#E74C3C22", color:"#E74C3C", fontSize:11,
                    padding:"2px 8px", borderRadius:10, border:"1px solid #E74C3C33" }}>
                    ⚠️ {lowStock.length} ជិតអស់
                  </span>
                )}
              </div>
              {reportMode === "all"
                ? <span style={{ fontSize:11, color:"#5BA3E0", background:"#5BA3E022", padding:"3px 10px", borderRadius:10 }}>🌐 ទាំងអស់</span>
                : <span style={{ fontSize:11, color:"#5BA3E0", background:"#5BA3E022", padding:"3px 10px", borderRadius:10 }}>🏪 {branchId}</span>
              }
            </div>

            {/* ── Mode: branch (own branch only) ── */}
            {reportMode !== "all" && (() => {
              const StockBar = ({i}) => {
                const stock = Number(i.current_stock), thresh = Number(i.threshold);
                const isLow = thresh > 0 && stock <= thresh;
                const isWarn = thresh > 0 && stock <= thresh * 1.5 && !isLow;
                const pct = Math.min(100, (stock / (thresh * 4 || 1)) * 100);
                const col = isLow ? "#E74C3C" : isWarn ? "#F39C12" : "#27AE60";
                return (
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
                    <div style={{ width:130, fontSize:11, color:isLow?"#E74C3C":"#aaa", flexShrink:0,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:isLow?700:400 }}>
                      {isLow&&"⚠️ "}{i.ingredient_name}
                    </div>
                    <div style={{ flex:1, height:6, background:"#1A181C", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:pct+"%", background:col, borderRadius:3, transition:"width .4s" }} />
                    </div>
                    <div style={{ fontSize:11, color:col, minWidth:80, textAlign:"right", fontFamily:"'DM Mono',monospace", fontWeight:isLow?700:400 }}>
                      {fmtStock(stock)}/{fmtStock(thresh)} {i.unit}
                    </div>
                  </div>
                );
              };
              return ings.length === 0
                ? <div style={{ color:"#555", fontSize:12 }}>គ្មានស្តុក</div>
                : ings.map(i => <StockBar key={i.ingredient_id} i={i} />);
            })()}

            {/* ── Mode: all (per-branch panels) ── */}
            {reportMode === "all" && (
              stockLoading
                ? <div style={{ textAlign:"center", padding:20, color:"#888" }}>⏳ កំពុងទាញស្តុក...</div>
                : allStock
                  ? <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:12 }}>
                      {Object.entries(allStock).map(([bid, bd]) => {
                        const bIngs = bd.ingredients || [];
                        const bLow  = bIngs.filter(i => Number(i.threshold)>0 && Number(i.current_stock)<=Number(i.threshold));
                        return (
                          <div key={bid} style={{ background:"var(--bg-main)", border:`1px solid ${bLow.length?"#E74C3C33":"#1A181C"}`, borderRadius:12, padding:14 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                              <div style={{ fontWeight:700, fontSize:13 }}>🏪 {bd.branch_name}</div>
                              {bLow.length > 0
                                ? <span style={{ fontSize:11, color:"#E74C3C", background:"#E74C3C22", padding:"2px 8px", borderRadius:8, border:"1px solid #E74C3C33" }}>⚠️ {bLow.length} ជិតអស់</span>
                                : <span style={{ fontSize:11, color:"#27AE60" }}>✅ ល្អ</span>
                              }
                            </div>
                            {bIngs.length === 0
                              ? <div style={{ color:"#555", fontSize:11 }}>គ្មានស្តុក</div>
                              : bIngs.map(i => {
                                const stock = Number(i.current_stock), thresh = Number(i.threshold);
                                const isLow = thresh>0 && stock<=thresh;
                                const isWarn = thresh>0 && stock<=thresh*1.5 && !isLow;
                                const pct = Math.min(100,(stock/(thresh*4||1))*100);
                                const col = isLow?"#E74C3C":isWarn?"#F39C12":"#27AE60";
                                return (
                                  <div key={i.ingredient_id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                                    <div style={{ width:110, fontSize:10, color:isLow?"#E74C3C":"#888", flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:isLow?700:400 }}>
                                      {isLow&&"⚠ "}{i.ingredient_name}
                                    </div>
                                    <div style={{ flex:1, height:5, background:"#1A181C", borderRadius:3, overflow:"hidden" }}>
                                      <div style={{ height:"100%", width:pct+"%", background:col, borderRadius:3 }} />
                                    </div>
                                    <div style={{ fontSize:10, color:col, minWidth:72, textAlign:"right", fontFamily:"'DM Mono',monospace" }}>
                                      {fmtStock(stock)}/{fmtStock(thresh)}{i.unit}
                                    </div>
                                  </div>
                                );
                              })
                            }
                          </div>
                        );
                      })}
                    </div>
                  : <div style={{ color:"#555", fontSize:12 }}>ចុច Refresh ដើម្បីទាញស្តុក</div>
            )}

            {/* ── Ingredient Usage (Day / Month) ── */}
            {(() => {
              if (!isAdmin) return null; // staff cannot see usage
              // Calculate usage from filtered orders via recipes
              const usageMap = {}; // ingredient_id → qty used
              filtered.forEach(o => {
                (o.items || []).forEach(item => {
                  const prod = prods.find(p => p.product_name === item.product_name || p.product_id === item.product_id);
                  if (!prod) return;
                  (recipes || []).filter(r => r.product_id === prod.product_id).forEach(r => {
                    usageMap[r.ingredient_id] = (usageMap[r.ingredient_id] || 0) + r.quantity_required * item.qty;
                  });
                });
              });
              const usedIngs = ings.filter(i => usageMap[i.ingredient_id] > 0);
              if (usedIngs.length === 0) return null;
              const periodLabel = period === "day" ? "ថ្ងៃនេះ" : period === "month" ? "ខែនេះ" : "ឆ្នាំនេះ";
              return (
                <div style={{ marginTop: 20, borderTop: "1px solid #1E1B1F", paddingTop: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#5BA3E0", marginBottom: 12 }}>
                    📦 ការប្រើប្រាស់គ្រឿងផ្សំ — {periodLabel}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 8 }}>
                    {usedIngs.map(i => {
                      const used = usageMap[i.ingredient_id] || 0;
                      const stock = Number(i.current_stock);
                      const pctUsed = stock > 0 ? Math.min(100, (used / (stock + used)) * 100) : 100;
                      const col = pctUsed > 70 ? "#E74C3C" : pctUsed > 40 ? "#F39C12" : "#5BA3E0";
                      return (
                        <div key={i.ingredient_id} style={{ background: "var(--bg-main)", border: "1px solid #1A181C", borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-main)" }}>{i.ingredient_name}</span>
                            <span style={{ fontSize: 12, color: col, fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>
                              -{fmtStock(used)}{i.unit}
                            </span>
                          </div>
                          <div style={{ height: 4, background: "#1A181C", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: pctUsed+"%", background: col, borderRadius: 2, transition: "width .3s" }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10, color: "#555" }}>
                            <span>ប្រើ {Math.round(pctUsed)}% នៃស្តុក</span>
                            <span>នៅសល់ {fmtStock(stock)}{i.unit}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
          )}
        </div>

        {/* Telegram button */}
        <div style={{ marginTop: 20 }}>
          <button onClick={async () => { await sendDailySummary(orders); alert("✅ ផ្ញើ Telegram Summary រួចហើយ!"); }}
            style={{ ...btnGold, display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            📲 ផ្ញើ Summary ថ្ងៃនេះ ទៅ Telegram
          </button>
        </div>
      </div>{/* end scroll */}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  FINANCE PAGE  — ចំណូល ចំណាយ ចំណេញ ប្រចាំខែ
// ═══════════════════════════════════════════════════════════════════

// Default expense categories (used if none saved yet)
const DEFAULT_EXPENSE_CATS = [
  { id:"salary",      label:"💰 ប្រាក់ខែបុគ្គលិក", color:"#E74C3C" },
  { id:"electricity", label:"⚡ ភ្លើង",              color:"#F39C12" },
  { id:"tax",         label:"🏛️ ពន្ធ",               color:"#9B59B6" },
  { id:"rent",        label:"🏠 ជួលកន្លែង",          color:"#5BA3E0" },
  { id:"supplies",    label:"🧴 គ្រឿងប្រើប្រាស់",   color:"#27AE60" },
  { id:"other",       label:"📦 ចំណាយផ្សេងៗ",       color:"#7F8C8D" },
];

const CAT_COLORS = ["#E74C3C","#F39C12","#9B59B6","#5BA3E0","#27AE60","#7F8C8D","#E8A84B","#1ABC9C","#E91E63","#FF5722"];
const CAT_EMOJIS = ["💰","⚡","🏛️","🏠","🧴","📦","🚗","💊","🍱","📱","🔧","💡","🎁","📋","🏦"];


function FinancePage({ orders, expenses, setExpenses, notify, isAdmin, isGlobalAdmin, isBranchAdmin, branchId }) {
  const MON_KH = ["មករា","កុម្ភៈ","មីនា","មេសា","ឧសភា","មិថុនា","កក្កដា","សីហា","កញ្ញា","តុលា","វិច្ឆិកា","ធ្នូ"];
  const [selMonth,   setSelMonth]   = useState(() => new Date().toISOString().slice(0,7));
  const [editMode,   setEditMode]   = useState(false);
  const [catMode,    setCatMode]    = useState(false);
  const [draft,      setDraft]      = useState({});
  const [newCat,     setNewCat]     = useState({ label:"", color:"#E8A84B", emoji:"📦" });
  const [editCatId,  setEditCatId]  = useState(null);
  // Admin: branch selector + all-orders cache
  const [selBranch,  setSelBranch]  = useState("current"); // "current" | branch_id
  const [branches,   setBranches]   = useState([]);
  const [allOrders,  setAllOrders]  = useState(null); // null = not loaded yet
  const [loadingAll, setLoadingAll] = useState(false);

  // Load branches + all-orders when admin switches away from "current"
  useEffect(() => {
    if (!isGlobalAdmin) return;
    if (branches.length === 0) {
      const token = localStorage.getItem("pos_token");
      const hdr = { "Content-Type":"application/json","ngrok-skip-browser-warning":"true",...(token?{Authorization:"Bearer "+token}:{}) };
      fetch(`${API}/api/branches`, { headers:hdr })
        .then(r=>r.json()).then(d=>setBranches(Array.isArray(d)?d:[])).catch(()=>{});
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isGlobalAdmin || selBranch === "current") return;
    if (allOrders !== null) return; // already loaded
    setLoadingAll(true);
    const token = localStorage.getItem("pos_token");
    const hdr = { "Content-Type":"application/json","ngrok-skip-browser-warning":"true",...(token?{Authorization:"Bearer "+token}:{}) };
    fetch(`${API}/api/all-orders`, { headers:hdr })
      .then(r=>r.json()).then(d=>{ setAllOrders(Array.isArray(d)?d:[]); setLoadingAll(false); })
      .catch(()=>setLoadingAll(false));
  }, [isAdmin, selBranch, allOrders]);

  const [y, m] = selMonth.split("-");
  const monthLabel = MON_KH[parseInt(m)-1] + " " + y;

  // Resolve which orders to use for revenue
  // Branch admin: always own branch only
  const sourceOrders = (() => {
    if (!isGlobalAdmin || selBranch === "current") return orders || [];
    if (allOrders === null) return [];
    if (selBranch === "all") return allOrders;
    return allOrders.filter(o => o.branch_id === selBranch);
  })();

  // Load expense_cats from array meta entry
  const expCats = (() => {
    if (!Array.isArray(expenses)) return DEFAULT_EXPENSE_CATS;
    const meta = expenses.find(e => e && e._meta);
    return (meta && meta._cats && meta._cats.length > 0) ? meta._cats : DEFAULT_EXPENSE_CATS;
  })();

  const monthOrders = sourceOrders.filter(o => {
    try { return new Date(o.order_id).toISOString().slice(0,7) === selMonth; } catch { return false; }
  });
  const revenue = monthOrders.reduce((s,o) => s + o.total + o.tax, 0);

  // ── Expense transactions (new system) ─────────────────────────────
  // Each entry: { id, date, cat_id, desc, amount, branch_id, created_by }
  const expTxns = Array.isArray(expenses)
    ? expenses.filter(e => e && e._txn)
    : [];
  // Legacy monthly records (old system) — keep for backward compat
  const monthlyRecords = Array.isArray(expenses) ? expenses.filter(e => e && e.month) : [];

  // Filter transactions for current view (month + branch)
  const viewBranchId = (!isAdmin || selBranch === "current") ? branchId : (selBranch === "all" ? null : selBranch);
  const monthTxns = expTxns.filter(t => {
    const inMonth = t.date && t.date.slice(0,7) === selMonth;
    const inBranch = viewBranchId === null ? true : (t.branch_id === viewBranchId);
    return inMonth && inBranch;
  });

  // Legacy fallback: old monthly items format
  const monthExp  = monthlyRecords.find(e => e.month === selMonth) || { month:selMonth, items:{} };
  const expItems  = monthExp.items || {};
  const legacyExp = expCats.reduce((s,c) => s + (Number(expItems[c.id])||0), 0);

  const totalExp = monthTxns.reduce((s,t) => s + (Number(t.amount)||0), 0) + legacyExp;
  const profit   = revenue - totalExp;
  const profitColor = profit > 0 ? "#27AE60" : profit < 0 ? "#E74C3C" : "#888";

  // ── Add / Edit / Delete expense transaction ────────────────────────
  const [txnModal, setTxnModal] = useState(null); // null | {mode:"add"|"edit", data:{}}
  const [txnConfirmDel, setTxnConfirmDel] = useState(null);

  const saveTxn = (data) => {
    const meta  = Array.isArray(expenses) ? expenses.find(e => e && e._meta) : null;
    const legacy = Array.isArray(expenses) ? expenses.filter(e => e && (e.month || (!e._meta && !e._txn))) : [];
    const txns  = expTxns.filter(t => t.id !== data.id);
    const entry = { ...data, _txn:true, branch_id: data.branch_id || branchId };
    txns.push(entry);
    const next = [...legacy, ...txns];
    if (meta) next.push(meta);
    setExpenses(next);
    setTxnModal(null);
    notify("✅ " + (data._isNew ? "បន្ថែម" : "កែប្រែ") + "ចំណាយ រួចហើយ!");
  };

  const deleteTxn = (id) => {
    const meta   = Array.isArray(expenses) ? expenses.find(e => e && e._meta) : null;
    const legacy = Array.isArray(expenses) ? expenses.filter(e => e && (e.month || (!e._meta && !e._txn))) : [];
    const txns   = expTxns.filter(t => t.id !== id);
    const next   = [...legacy, ...txns];
    if (meta) next.push(meta);
    setExpenses(next);
    setTxnConfirmDel(null);
    notify("🗑️ លុបចំណាយ រួចហើយ!");
  };

  // orderMonths uses sourceOrders so dropdown reflects selected branch
  const orderMonths = [...new Set((sourceOrders||[]).map(o => {
    try { return new Date(o.order_id).toISOString().slice(0,7); } catch { return null; }
  }).filter(Boolean))].sort().reverse();
  if (!orderMonths.includes(selMonth)) orderMonths.unshift(selMonth);

  // ── Save cats to meta ──────────────────────────────────────────────
  const saveCats = (newCats) => {
    // Keep all monthly records, replace/add _meta entry
    const monthRecs = Array.isArray(expenses) ? expenses.filter(e => e && !e._meta) : [];
    const meta = { _meta: true, _cats: newCats };
    setExpenses([...monthRecs, meta]);
  };

  // Helper: get _cats from expenses array (same as expCats but callable)
  const getCats = () => expCats;

  // ── Add new category ───────────────────────────────────────────────
  const addCat = () => {
    if (!newCat.label.trim()) return;
    const id = "cat_" + Date.now();
    const cats = [...getCats(), { id, label: newCat.emoji + " " + newCat.label.trim(), color: newCat.color }];
    saveCats(cats);
    setNewCat({ label:"", color: CAT_COLORS[cats.length % CAT_COLORS.length], emoji:"📦" });
    notify("✓ បន្ថែមមុខចំណាយ: " + newCat.label);
  };

  // ── Delete category ────────────────────────────────────────────────
  const delCat = (id) => {
    const cats = getCats().filter(c => c.id !== id);
    // Also remove this category's amount from ALL monthly records
    const monthRecs = Array.isArray(expenses) ? expenses.filter(e => e && !e._meta) : [];
    const updatedRecs = monthRecs.map(e => {
      if (!e.items || !(id in e.items)) return e;
      const { [id]: _removed, ...rest } = e.items;
      return { ...e, items: rest };
    });
    const meta = { _meta: true, _cats: cats };
    setExpenses([...updatedRecs, meta]);
    notify("✓ លុបមុខចំណាយ + សម្អាតចំនួន");
  };

  // ── Edit category label ────────────────────────────────────────────
  const [editCatDraft, setEditCatDraft] = useState({});
  const startEditCat = (c) => {
    setEditCatId(c.id);
    // parse emoji and label
    const parts = c.label.match(/^(\S+)\s+(.+)$/);
    setEditCatDraft({ emoji: parts ? parts[1] : "📦", label: parts ? parts[2] : c.label, color: c.color });
  };
  const saveEditCat = () => {
    if (!editCatDraft.label.trim()) return;
    const cats = getCats().map(c => c.id === editCatId
      ? { ...c, label: editCatDraft.emoji + " " + editCatDraft.label.trim(), color: editCatDraft.color }
      : c);
    saveCats(cats);
    setEditCatId(null);
    notify("✓ កែប្រែមុខចំណាយ");
  };

  // ── Start edit amounts ─────────────────────────────────────────────
  const startEdit = () => {
    const d = {};
    expCats.forEach(c => { d[c.id] = expItems[c.id] != null ? String(expItems[c.id]) : ""; });
    setDraft(d);
    setEditMode(true);
  };

  const saveEdit = () => {
    const items = {};
    expCats.forEach(c => { const v = parseFloat(draft[c.id]); if (!isNaN(v) && v > 0) items[c.id] = v; });
    const meta = Array.isArray(expenses) ? expenses.find(e => e && e._meta) : null;
    const updated = monthlyRecords.filter(e => e.month !== selMonth);
    updated.push({ month:selMonth, items });
    if (meta) updated.push(meta);
    setExpenses(updated);
    setEditMode(false);
    notify("💾 រក្សាទុកចំណាយខែ " + monthLabel + " ហើយ!");
  };

  // ── Print PDF ──────────────────────────────────────────────────────
  const doPrint = () => {
    const expRows = expCats.map(c => {
      const val = Number(expItems[c.id])||0;
      return "<tr><td>" + c.label + "</td><td style='text-align:right;font-weight:"+(val>0?700:400)+";color:"+(val>0?"#c0392b":"#aaa")+"'>" + (val>0?fmt(val):"—") + "</td></tr>";
    }).join("");
    const histRows = monthlyRecords.slice(0,12).map(e => {
      const parts = e.month.split("-"); const ey=parts[0]; const em=parts[1];
      const rev2 = (sourceOrders||[]).filter(o => { try { return new Date(o.order_id).toISOString().slice(0,7)===e.month; } catch { return false; } }).reduce((s,o) => s+o.total+o.tax, 0);
      const exp2 = expCats.reduce((s,c) => s+Number((e.items||{})[c.id]||0), 0);
      const pnl2 = rev2-exp2;
      return "<tr"+(e.month===selMonth?" style='background:#fff7f0'":'')+">"
        +"<td>"+MON_KH[parseInt(em)-1]+" "+ey+"</td>"
        +"<td style='color:#B8732A'>"+fmt(rev2)+"</td>"
        +"<td style='color:#c0392b'>"+fmt(exp2)+"</td>"
        +"<td style='font-weight:700;color:"+(pnl2>=0?"#27ae60":"#c0392b")+"'>"+(pnl2>=0?"+":"")+fmt(pnl2)+"</td></tr>";
    }).join("");
    const barExpW = totalExp>0 ? Math.min(100,(totalExp/Math.max(revenue,totalExp))*100) : 0;
    const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Cafe Bloom - ហិរញ្ញវត្ថុ "+monthLabel+"</title>"
      +"<style>@import url('https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;600;700&display=swap');"
      +"*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Kantumruy Pro',Arial,sans-serif;color:#111;padding:28px 32px;font-size:13px}"
      +".header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:3px solid #B8732A}"
      +".logo{font-size:20px;font-weight:700;color:#B8732A}.logo span{font-size:11px;color:#888;display:block;font-weight:400}"
      +".meta{text-align:right;font-size:12px;color:#888}h2{font-size:14px;font-weight:700;color:#B8732A;margin:18px 0 8px;padding:5px 10px;background:#fff7f0;border-left:4px solid #B8732A}"
      +".kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:10px 0 16px}"
      +".kpi{background:#fff7f0;border:1px solid #e8d8c8;border-radius:8px;padding:12px 14px}"
      +".kpi .val{font-size:20px;font-weight:700;margin-top:3px}.kpi .lbl{font-size:11px;color:#888}"
      +".bar-wrap{background:#eee;border-radius:6px;height:12px;overflow:hidden;margin:8px 0 4px;display:flex}"
      +".bar-exp{background:#e74c3c;height:100%}.bar-rev{background:#27ae60;height:100%;flex:1}"
      +"table{width:100%;border-collapse:collapse;margin-bottom:4px;font-size:12px}"
      +"th{background:#B8732A;color:#fff;padding:7px 10px;text-align:left;font-size:11px}"
      +"td{padding:7px 10px;border-bottom:1px solid #f0ece8}tr:nth-child(even) td{background:#fdf9f6}"
      +".footer{margin-top:24px;padding-top:10px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center}"
      +"@media print{body{padding:14px}}</style></head><body>"
      +"<div class='header'><div class='logo'>☕ Cafe Bloom <span>💼 ហិរញ្ញវត្ថុប្រចាំខែ</span></div>"
      +"<div class='meta'><b>"+monthLabel+"</b><br/>បោះពុម្ព: "+new Date().toLocaleString("km-KH")+"</div></div>"
      +"<h2>📊 សង្ខេបហិរញ្ញវត្ថុ</h2>"
      +"<div class='kpi-grid'>"
      +"<div class='kpi'><div class='lbl'>💰 ចំណូលសរុប</div><div class='val' style='color:#B8732A'>"+fmt(revenue)+"</div></div>"
      +"<div class='kpi'><div class='lbl'>💸 ចំណាយសរុប</div><div class='val' style='color:#e74c3c'>"+fmt(totalExp)+"</div></div>"
      +"<div class='kpi'><div class='lbl'>📈 ចំណេញសុទ្ធ</div><div class='val' style='color:"+(profit>=0?"#27ae60":"#e74c3c")+"'>"+(profit>=0?"+":"")+fmt(profit)+"</div></div>"
      +"</div>"
      +(revenue>0||totalExp>0?"<div class='bar-wrap'>"+(totalExp>0?"<div class='bar-exp' style='width:"+barExpW+"%'></div>":"")+(revenue>totalExp?"<div class='bar-rev'></div>":"")+"</div><div style='display:flex;justify-content:space-between;font-size:11px;color:#888;margin-bottom:12px'><span style='color:#e74c3c'>ចំណាយ "+fmt(totalExp)+"</span><span style='color:#27ae60'>ចំណូល "+fmt(revenue)+"</span></div>":"")
      +"<h2>📋 បញ្ជីចំណាយ</h2>"
      +"<table><thead><tr><th>ប្រភេទចំណាយ</th><th style='text-align:right'>ចំនួន</th></tr></thead>"
      +"<tbody>"+expRows+"<tr style='background:#fff3e8'><td style='font-weight:700'>💸 ចំណាយសរុប</td><td style='text-align:right;font-weight:700;color:#c0392b'>"+fmt(totalExp)+"</td></tr></tbody></table>"
      +(histRows?"<h2>📅 ប្រវត្តិប្រចាំខែ</h2><table><thead><tr><th>ខែ</th><th>ចំណូល</th><th>ចំណាយ</th><th>ចំណេញ</th></tr></thead><tbody>"+histRows+"</tbody></table>":"")
      +"<div class='footer'>Cafe Bloom POS &copy; "+new Date().getFullYear()+" &middot; ហិរញ្ញវត្ថុ "+monthLabel+"</div>"
      +"\x3cscript\x3ewindow.onload=function(){window.print();}\x3c/script\x3e</body></html>";
    const win = window.open("","_blank","width=1000,height=750");
    win.document.write(html);
    win.document.close();
  };

  const inSt2 = { ...inputSt, fontSize:12, padding:"6px 10px" };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* Sticky Header */}
      <div style={{ flexShrink:0, padding:"14px 16px 12px", borderBottom:"1px solid #E8A84B44", background:"linear-gradient(135deg,#1a1208,#120f05)" }}>
        <div style={{ fontWeight:700, fontSize:18, marginBottom:10, color:"var(--accent)" }}>💼 ហិរញ្ញវត្ថុប្រចាំខែ</div>

        {/* Row 1: Branch selector — GLOBAL ADMIN ONLY */}
        {isGlobalAdmin && (
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:10 }}>
            <span style={{ fontSize:12, color:"#888", flexShrink:0 }}>🏪 សាខា:</span>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              <button onClick={()=>{ setSelBranch("current"); setEditMode(false); setCatMode(false); }}
                style={{ padding:"5px 14px", borderRadius:20, border:"none", cursor:"pointer", fontFamily:"inherit",
                  fontSize:12, fontWeight:700,
                  background: selBranch==="current" ? "linear-gradient(135deg,#B8732A,#E8A84B)" : "var(--bg-card)",
                  color: selBranch==="current" ? "#fff" : "#666" }}>
                🏪 សាខាខ្ញុំ
              </button>
              {branches.filter(b=>b.active).map(b => (
                <button key={b.branch_id}
                  onClick={()=>{ setSelBranch(b.branch_id); setEditMode(false); setCatMode(false); }}
                  style={{ padding:"5px 14px", borderRadius:20, border:"none", cursor:"pointer", fontFamily:"inherit",
                    fontSize:12, fontWeight:700,
                    background: selBranch===b.branch_id ? "linear-gradient(135deg,#B8732A,#E8A84B)" : "var(--bg-card)",
                    color: selBranch===b.branch_id ? "#fff" : "#666" }}>
                  {b.branch_name}
                </button>
              ))}
              <button onClick={()=>{ setSelBranch("all"); setEditMode(false); setCatMode(false); }}
                style={{ padding:"5px 14px", borderRadius:20, border:"none", cursor:"pointer", fontFamily:"inherit",
                  fontSize:12, fontWeight:700,
                  background: selBranch==="all" ? "linear-gradient(135deg,#1A3A5A,#5BA3E0)" : "var(--bg-card)",
                  color: selBranch==="all" ? "#fff" : "#666" }}>
                🌐 ទាំងអស់
              </button>
            </div>
          </div>
        )}

        {/* Row 2: Month selector + print */}
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <span style={{ fontSize:12, color:"#888", flexShrink:0 }}>📆 ខែ:</span>
          <select value={selMonth} onChange={e => { setSelMonth(e.target.value); setEditMode(false); setCatMode(false); }}
            style={{ ...inputSt, fontSize:13, padding:"6px 12px" }}>
            {orderMonths.map(mo => {
              const [oy,om] = mo.split("-");
              return <option key={mo} value={mo}>{MON_KH[parseInt(om)-1]} {oy}</option>;
            })}
          </select>
          {/* Branch label badge */}
          {isAdmin && selBranch !== "current" && (
            <span style={{ fontSize:11, padding:"3px 10px", borderRadius:12, background:"#E8A84B22", color:"var(--accent)", fontWeight:700, border:"1px solid #E8A84B33" }}>
              {selBranch === "all" ? "🌐 ទាំងអស់" : (branches.find(b=>b.branch_id===selBranch)?.branch_name || selBranch)}
            </span>
          )}
          {loadingAll && <span style={{ fontSize:11, color:"#888" }}>⏳ កំពុងទាញ...</span>}
          <button onClick={doPrint} style={{ ...btnSmall, color:"#E8A84B", borderColor:"#E8A84B44", fontSize:12, padding:"6px 14px", marginLeft:"auto" }}>
            🖨️ Print / PDF
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px" }}>
        <div style={{ maxWidth:720, margin:"0 auto" }}>

          {/* KPI Cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:18 }}>
            {[
              ["💰","ចំណូល",  revenue,  "#E8A84B"],
              ["💸","ចំណាយ",  totalExp, "#E74C3C"],
              ["📈","ចំណេញ",  profit,   profitColor],
            ].map(([ic,lb,val,col]) => (
              <div key={lb} style={{ background:"var(--bg-card)", border:"1px solid "+col+"33", borderRadius:14, padding:"14px 10px", textAlign:"center" }}>
                <div style={{ fontSize:24 }}>{ic}</div>
                <div style={{ fontSize:18, fontWeight:700, color:col, marginTop:4 }}>{fmt(val)}</div>
                <div style={{ fontSize:11, color:"#555", marginTop:2 }}>{lb}</div>
              </div>
            ))}
          </div>

          {/* Revenue vs Expense bar */}
          {(revenue > 0 || totalExp > 0) && (
            <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-col)", borderRadius:14, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:12, color:"#666", marginBottom:8, fontWeight:600 }}>ចំណូល vs ចំណាយ</div>
              <div style={{ height:14, background:"#1A181C", borderRadius:7, overflow:"hidden", display:"flex" }}>
                {totalExp > 0 && (
                  <div style={{ width:Math.min(100,(totalExp/Math.max(revenue,totalExp))*100)+"%", background:"linear-gradient(90deg,#8B1A1A,#E74C3C)" }} />
                )}
                {revenue > totalExp && (
                  <div style={{ flex:1, background:"linear-gradient(90deg,#1A7A3A,#27AE60)" }} />
                )}
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:5, fontSize:11 }}>
                <span style={{ color:"#E74C3C" }}>ចំណាយ {fmt(totalExp)}</span>
                <span style={{ color:"#27AE60" }}>ចំណូល {fmt(revenue)}</span>
              </div>
            </div>
          )}

          {/* ── Confirm Delete Txn ── */}
          {txnConfirmDel && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ background:"var(--bg-card)", border:"1px solid #3a1a1a", borderRadius:16, padding:24, maxWidth:340, width:"90%", textAlign:"center" }}>
                <div style={{ fontSize:36, marginBottom:8 }}>🗑️</div>
                <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>លុបចំណាយ?</div>
                <div style={{ fontSize:13, color:"#888", marginBottom:18 }}>{txnConfirmDel.desc} — {fmt(txnConfirmDel.amount)}</div>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={{ ...btnGhost, flex:1 }} onClick={() => setTxnConfirmDel(null)}>បោះបង់</button>
                  <button style={{ ...btnRed, flex:1 }} onClick={() => deleteTxn(txnConfirmDel.id)}>🗑️ លុប</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Add/Edit Txn Modal ── */}
          {txnModal && (
            <ExpenseTxnModal
              data={txnModal.data}
              expCats={expCats}
              branchId={branchId}
              branches={branches}
              isAdmin={isAdmin}
              selMonth={selMonth}
              onSave={saveTxn}
              onClose={() => setTxnModal(null)}
            />
          )}

          {/* ── Expense Transactions ── */}
          <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-col)", borderRadius:14, padding:16, marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:14 }}>💸 ចំណាយប្រចាំខែ</div>
                <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{monthTxns.length} រាយការណ៍ · សរុប {fmt(totalExp)}</div>
              </div>
              <button
                onClick={() => setTxnModal({ data: { id:"txn_"+Date.now(), date:selMonth+"-"+new Date().toISOString().slice(8,10), cat_id: expCats[0]?.id||"other", desc:"", amount:"", branch_id:branchId, _isNew:true } })}
                style={{ ...btnGold, padding:"8px 16px", fontSize:12 }}>
                ➕ បន្ថែមចំណាយ
              </button>
            </div>

            {monthTxns.length === 0 ? (
              <div style={{ textAlign:"center", padding:"24px 0", color:"#444", fontSize:13 }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
                មិនទាន់មានចំណាយសម្រាប់ខែនេះ
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {monthTxns.sort((a,b) => (b.date||"").localeCompare(a.date||"")).map(t => {
                  const cat = expCats.find(c => c.id === t.cat_id);
                  const bName = branches.find(b => b.branch_id === t.branch_id)?.branch_name || t.branch_id || branchId;
                  return (
                    <div key={t.id} style={{
                      display:"flex", alignItems:"center", gap:10,
                      padding:"10px 12px", borderRadius:10,
                      background:"var(--bg-main)", border:"1px solid var(--border-col)"
                    }}>
                      {/* Cat color dot */}
                      <div style={{ width:10, height:10, borderRadius:"50%", background:cat?.color||"#888", flexShrink:0 }} />
                      {/* Info */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {t.desc || cat?.label || "ចំណាយ"}
                        </div>
                        <div style={{ fontSize:11, color:"#666", marginTop:2, display:"flex", gap:8, flexWrap:"wrap" }}>
                          <span>📅 {t.date}</span>
                          {cat && <span style={{ color:cat.color }}>{cat.label}</span>}
                          {isAdmin && t.branch_id && <span style={{ color:"#5BA3E0" }}>🏪 {bName}</span>}
                          {t.created_by && <span style={{ color:"#555" }}>👤 {t.created_by}</span>}
                        </div>
                      </div>
                      {/* Amount */}
                      <div style={{ fontWeight:700, fontSize:14, color:"#E74C3C", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>
                        {fmt(t.amount)}
                      </div>
                      {/* Actions */}
                      <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                        <button onClick={() => setTxnModal({ data:{ ...t } })}
                          style={{ ...btnSmall, fontSize:12, padding:"4px 8px", color:"#E8A84B", borderColor:"#E8A84B33" }}>✏️</button>
                        <button onClick={() => setTxnConfirmDel({ id:t.id, desc:t.desc||cat?.label||"ចំណាយ", amount:t.amount })}
                          style={{ ...btnSmall, fontSize:12, padding:"4px 8px", color:"#E74C3C", borderColor:"#E74C3C33" }}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Summary by category */}
            {monthTxns.length > 0 && (
              <div style={{ marginTop:14, paddingTop:12, borderTop:"1px solid var(--border-col)" }}>
                <div style={{ fontSize:12, color:"#666", marginBottom:8, fontWeight:600 }}>📊 សង្ខេបតាមប្រភេទ</div>
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  {expCats.map(c => {
                    const catTotal = monthTxns.filter(t => t.cat_id === c.id).reduce((s,t) => s + Number(t.amount||0), 0);
                    if (catTotal === 0) return null;
                    const pct = totalExp > 0 ? Math.round((catTotal/totalExp)*100) : 0;
                    return (
                      <div key={c.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", background:c.color, flexShrink:0 }} />
                        <div style={{ flex:1, fontSize:12, color:"#aaa" }}>{c.label}</div>
                        <div style={{ fontSize:12, fontWeight:700, color:"#E74C3C", fontFamily:"'DM Mono',monospace", minWidth:60, textAlign:"right" }}>{fmt(catTotal)}</div>
                        <div style={{ fontSize:10, color:"#555", minWidth:32, textAlign:"right" }}>{pct}%</div>
                        <div style={{ width:60, height:4, background:"#1A181C", borderRadius:2, overflow:"hidden" }}>
                          <div style={{ width:pct+"%", height:"100%", background:c.color, borderRadius:2 }} />
                        </div>
                      </div>
                    );
                  }).filter(Boolean)}
                  <div style={{ display:"flex", justifyContent:"space-between", paddingTop:8, marginTop:4, borderTop:"1px solid var(--border-col)" }}>
                    <span style={{ fontSize:12, fontWeight:700, color:"#aaa" }}>💸 សរុបចំណាយ</span>
                    <span style={{ fontSize:13, fontWeight:700, color:"#E74C3C", fontFamily:"'DM Mono',monospace" }}>{fmt(totalExp)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
//  EXPENSE TRANSACTION MODAL
// ═══════════════════════════════════════════════════════════════════
function ExpenseTxnModal({ data, expCats, branchId, branches, isAdmin, selMonth, onSave, onClose }) {
  const today = new Date().toISOString().slice(0,10);
  const [v, setV] = useState({
    id:       data.id       || "txn_"+Date.now(),
    date:     data.date     || today,
    cat_id:   data.cat_id   || expCats[0]?.id || "other",
    desc:     data.desc     || "",
    amount:   data.amount   || "",
    branch_id: data.branch_id || branchId,
    created_by: data.created_by || "",
    _isNew:   data._isNew   || false,
  });
  const s = (k, val) => setV(p => ({ ...p, [k]: val }));
  const isValid = v.date && v.amount && Number(v.amount) > 0;

  return (
    <Modal onClose={onClose} maxW={420}>
      <div style={{ fontWeight:700, fontSize:16, marginBottom:18, color:"var(--accent)" }}>
        {v._isNew ? "➕ បន្ថែមចំណាយ" : "✏️ កែប្រែចំណាយ"}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

        {/* Date */}
        <div>
          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>📅 ថ្ងៃ *</div>
          <input type="date" className="inp" value={v.date} onChange={e=>s("date",e.target.value)}
            style={{ width:"100%" }} />
        </div>

        {/* Category */}
        <div>
          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>🏷️ ប្រភេទចំណាយ *</div>
          <select className="inp" value={v.cat_id} onChange={e=>s("cat_id",e.target.value)}
            style={{ width:"100%", ...{background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:9, padding:"9px 13px", color:"var(--text-main)", fontFamily:"inherit", fontSize:13} }}>
            {expCats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        {/* Description */}
        <div>
          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>📝 ការរៀបរាប់</div>
          <input className="inp" placeholder="ឈ្មោះចំណាយ (ការជួលកន្លែង, ប្រាក់ខែ...)"
            value={v.desc} onChange={e=>s("desc",e.target.value)} style={{ width:"100%" }} />
        </div>

        {/* Amount */}
        <div>
          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>💵 ចំនួនទឹកប្រាក់ ($) *</div>
          <input className="inp" type="number" step="0.01" min="0" placeholder="0.00"
            value={v.amount} onChange={e=>s("amount",e.target.value)} style={{ width:"100%" }} />
        </div>

        {/* Branch — admin can assign to any branch */}
        {isAdmin && branches.length > 0 && (
          <div>
            <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>🏪 សាខា</div>
            <select className="inp" value={v.branch_id} onChange={e=>s("branch_id",e.target.value)}
              style={{ width:"100%", background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:9, padding:"9px 13px", color:"var(--text-main)", fontFamily:"inherit", fontSize:13 }}>
              {branches.filter(b=>b.active).map(b => (
                <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Created by */}
        <div>
          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>👤 បញ្ចូលដោយ</div>
          <input className="inp" placeholder="ឈ្មោះអ្នកបញ្ចូល..."
            value={v.created_by} onChange={e=>s("created_by",e.target.value)} style={{ width:"100%" }} />
        </div>

        <div style={{ display:"flex", gap:8, marginTop:4 }}>
          <button style={{ ...btnGhost, flex:1 }} onClick={onClose}>បោះបង់</button>
          <button style={{ ...btnGold, flex:1, opacity:isValid?1:0.4 }}
            disabled={!isValid}
            onClick={()=>onSave({ ...v, amount:Number(v.amount), _txn:true })}>
            💾 រក្សាទុក
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  THEME PAGE  (Admin only)
// ═══════════════════════════════════════════════════════════════════
const THEME_PRESETS = [
  // ── Original 8 ─────────────────────────────────────────────────
  { name: "☕ Cafe Classic",    bgMain: "#09080A", bgCard: "#120F13", bgHeader: "#0E0C0F", accent: "#E8A84B", accentDark: "#B8732A", textMain: "#EDE8E1", textDim: "#666666", borderCol: "#1E1B1F" },
  { name: "🌙 Midnight Blue",  bgMain: "#060B14", bgCard: "#0D1420", bgHeader: "#080E1A", accent: "#5BA3E0", accentDark: "#2A6FA8", textMain: "#E0EDFB", textDim: "#445566", borderCol: "#131E2E" },
  { name: "🌲 Forest Green",   bgMain: "#060D08", bgCard: "#0D160F", bgHeader: "#080F0A", accent: "#4CAF7D", accentDark: "#2E7D52", textMain: "#E0F0E5", textDim: "#3A5544", borderCol: "#111E14" },
  { name: "🍷 Deep Wine",      bgMain: "#0D060A", bgCard: "#180C12", bgHeader: "#10070D", accent: "#C0527A", accentDark: "#8B2A4A", textMain: "#F0E0E8", textDim: "#664455", borderCol: "#1E1018" },
  { name: "🌅 Sunset Orange",  bgMain: "#0D0806", bgCard: "#1A100A", bgHeader: "#120A06", accent: "#E87A3A", accentDark: "#B84A1A", textMain: "#FAE8DC", textDim: "#664433", borderCol: "#201208" },
  { name: "🪐 Galaxy Purple",  bgMain: "#08060D", bgCard: "#100D18", bgHeader: "#0A0810", accent: "#9B6FE8", accentDark: "#6A3FB8", textMain: "#EAE0FA", textDim: "#553377", borderCol: "#16101E" },
  { name: "🌊 Ocean Teal",     bgMain: "#050D0D", bgCard: "#0A1818", bgHeader: "#07100F", accent: "#3ABFBF", accentDark: "#1A8A8A", textMain: "#DCFAFA", textDim: "#336655", borderCol: "#0F1E1E" },
  { name: "☀️ Light Mode",    bgMain: "#F5F2EE", bgCard: "#FFFFFF", bgHeader: "#EDE8E1", accent: "#B8732A", accentDark: "#8B5510", textMain: "#1A1510", textDim: "#888880", borderCol: "#DDD8D0" },
  // ── New 6 Beautiful Presets ─────────────────────────────────────
  { name: "🌸 Cherry Blossom", bgMain: "#0D070B", bgCard: "#1A0D14", bgHeader: "#140A10",
    accent: "#F472B6", accentDark: "#BE185D",
    textMain: "#FDE7F3", textDim: "#7A4060", borderCol: "#2A1020" },
  { name: "🔥 Ember Dark",     bgMain: "#0C0804", bgCard: "#1C1008", bgHeader: "#150C06",
    accent: "#FB923C", accentDark: "#C2410C",
    textMain: "#FEF3E8", textDim: "#7C4A20", borderCol: "#2E1A08" },
  { name: "❄️ Arctic White",   bgMain: "#F0F4F8", bgCard: "#FFFFFF", bgHeader: "#E2EAF0",
    accent: "#0EA5E9", accentDark: "#0369A1",
    textMain: "#0F172A", textDim: "#64748B", borderCol: "#CBD5E1" },
  { name: "🌿 Matcha Latte",   bgMain: "#F5F5F0", bgCard: "#FAFAF5", bgHeader: "#EEEEE8",
    accent: "#65A30D", accentDark: "#3F6212",
    textMain: "#1C1A14", textDim: "#78716C", borderCol: "#D6D3C4" },
  { name: "🌃 Neon City",      bgMain: "#04040C", bgCard: "#080818", bgHeader: "#060610",
    accent: "#22D3EE", accentDark: "#0891B2",
    textMain: "#E0F7FF", textDim: "#1E4A5A", borderCol: "#0A1525" },
  { name: "🍫 Dark Chocolate", bgMain: "#0A0705", bgCard: "#160F09", bgHeader: "#110C07",
    accent: "#D97706", accentDark: "#92400E",
    textMain: "#FDF4E7", textDim: "#6B5040", borderCol: "#241A0E" },
];

function ExpenseForm({ exp, onSave }) {
  const [v, setV] = useState(exp);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <input className="inp" placeholder="ប្រភេទ​ចំណាយ" value={v.category} onChange={e=>setV({...v,category:e.target.value})} />
      <input className="inp" type="number" placeholder="ចំនួន​ (USD)" value={v.amount} onChange={e=>setV({...v,amount:+e.target.value})} />
      <input className="inp" placeholder="កំណត់​ចំណាំ" value={v.note||""} onChange={e=>setV({...v,note:e.target.value})} />
      <button className="btn-primary" onClick={()=>onSave(v)}>💾 រក្សា​ទុក</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  USERS PAGE
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
//  CLEAR DATA MODAL  (admin only)
// ═══════════════════════════════════════════════════════════════════
function ClearDataModal({ branchId, isAdmin, isBranchAdmin, onClose, notify, onCleared }) {
  const [scope,   setScope]   = useState("current"); // current | all
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const CONFIRM_WORD = "លុប";
  const ready = confirm === CONFIRM_WORD;

  const doClear = async () => {
    if (!ready || loading) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("pos_token");
      const headers = {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      };
      const bid = scope === "all" ? "all" : branchId;
      const r = await fetch(`${API}/api/clear-all-orders?scope=${bid}`, { method:"POST", headers });
      const d = await r.json();
      if (!r.ok) { notify("❌ " + (d.error || "Error"), "error"); setLoading(false); return; }
      const cleared = d.cleared || [];
      notify(`✅ លុប Data លក់ ${cleared.length} សាខា រួចហើយ!`);
      onCleared(bid);
      onClose();
    } catch (e) {
      notify("❌ មិនអាចភ្ជាប់ Server!", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} maxW={400}>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:44 }}>🗑️</div>
          <div style={{ fontWeight:700, fontSize:17, marginTop:8, color:"#E74C3C" }}>លុប Data លក់</div>
          <div style={{ fontSize:12, color:"#888", marginTop:6 }}>
            ប្រតិបត្តិការនេះ <b style={{color:"#E74C3C"}}>មិនអាច Undo</b> បានទេ!<br/>
            Orders + Logs ទាំងអស់នឹងត្រូវលុប។
          </div>
        </div>

        {/* Scope selection */}
        <div>
          <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:8, fontWeight:600 }}>ជ្រើសសាខា:</div>
          <div style={{ display:"flex", gap:8 }}>
            {[["current","🏪 សាខាខ្ញុំ"], ...(isAdmin && !isBranchAdmin ? [["all","🌐 ទាំងអស់"]] : [])].map(([v,lb]) => (
              <button key={v} onClick={()=>{setScope(v);setConfirm("");}} style={{
                flex:1, padding:"10px 0", borderRadius:10, cursor:"pointer", fontFamily:"inherit",
                fontSize:13, fontWeight:700, border:"none",
                background: scope===v ? (v==="all"?"linear-gradient(135deg,#7A1A1A,#E74C3C)":"linear-gradient(135deg,#B8732A,#E8A84B)") : "var(--bg-card)",
                color: scope===v ? "#fff" : "var(--text-dim)",
              }}>{lb}</button>
            ))}
          </div>
        </div>

        {/* Confirm input */}
        <div style={{ background:"#1A0A0A", border:"1px solid #3a1a1a", borderRadius:10, padding:14 }}>
          <div style={{ fontSize:12, color:"#E74C3C", marginBottom:8 }}>
            ដើម្បីបញ្ជាក់ សូមវាយ <b>"{CONFIRM_WORD}"</b> ខាងក្រោម:
          </div>
          <input
            className="inp"
            placeholder={`វាយ "${CONFIRM_WORD}" ដើម្បីបញ្ជាក់...`}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            style={{ width:"100%", borderColor: ready ? "#E74C3C" : undefined }}
            autoFocus
          />
        </div>

        <div style={{ display:"flex", gap:8 }}>
          <button style={{ ...btnGhost, flex:1 }} onClick={onClose}>បោះបង់</button>
          <button
            style={{ ...btnRed, flex:1, opacity:(!ready||loading)?0.4:1 }}
            disabled={!ready||loading}
            onClick={doClear}>
            {loading ? "កំពុងលុប..." : "🗑️ លុបឥឡូវ"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  SELF RESET PASSWORD MODAL  (any logged-in user)
// ═══════════════════════════════════════════════════════════════════
function SelfResetPasswordModal({ currentUser, onClose, notify }) {
  const [oldPw,  setOldPw]  = useState("");
  const [newPw,  setNewPw]  = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [show,   setShow]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,  setError]  = useState("");

  const strong = newPw.length >= 6;
  const match  = newPw && newPw === newPw2;

  const doReset = async () => {
    if (!oldPw || !newPw || !newPw2) { setError("សូមបំពេញគ្រប់ fields!"); return; }
    if (!strong) { setError("Password ថ្មីត្រូវតែ ≥ 6 អក្សរ!"); return; }
    if (!match)  { setError("Password ថ្មីមិនត្រូវគ្នា!"); return; }
    setLoading(true); setError("");
    try {
      const token = localStorage.getItem("pos_token");
      const r = await fetch(`${API}/api/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "មានបញ្ហា!"); setLoading(false); return; }
      notify("✅ ផ្លាស់ Password រួចហើយ!");
      onClose();
    } catch (e) {
      setError("មិនអាចភ្ជាប់ Server!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} maxW={380}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:40 }}>🔐</div>
          <div style={{ fontWeight:700, fontSize:16, marginTop:8, color:"var(--accent)" }}>ផ្លាស់ Password</div>
          <div style={{ fontSize:12, color:"#555", marginTop:4 }}>@{currentUser.username}</div>
        </div>

        {error && (
          <div style={{ background:"#3a1a1a", color:"#ff8080", borderRadius:8, padding:"8px 12px", fontSize:12 }}>
            ⚠️ {error}
          </div>
        )}

        <div>
          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>Password បច្ចុប្បន្ន *</div>
          <div style={{ position:"relative" }}>
            <input className="inp" type={show?"text":"password"} placeholder="Password ចាស់..."
              value={oldPw} onChange={e=>{setOldPw(e.target.value);setError("");}}
              style={{ width:"100%", paddingRight:36 }} />
            <button type="button" onClick={()=>setShow(p=>!p)}
              style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", cursor:"pointer", fontSize:14, color:"#555" }}>
              {show?"🙈":"👁️"}
            </button>
          </div>
        </div>

        <div>
          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>Password ថ្មី * (≥6 អក្សរ)</div>
          <input className="inp" type={show?"text":"password"} placeholder="Password ថ្មី..."
            value={newPw} onChange={e=>{setNewPw(e.target.value);setError("");}} style={{ width:"100%" }} />
        </div>

        <div>
          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>បញ្ជាក់ Password ថ្មី *</div>
          <input className="inp" type={show?"text":"password"} placeholder="វាយម្ដងទៀត..."
            value={newPw2} onChange={e=>{setNewPw2(e.target.value);setError("");}} style={{ width:"100%" }} />
        </div>

        {newPw && (
          <div style={{ fontSize:11, display:"flex", gap:10 }}>
            <span style={{ color:strong?"#27AE60":"#E74C3C" }}>{strong?"✅":"❌"} ≥6 chars</span>
            <span style={{ color:match?"#27AE60":"#E74C3C" }}>{match?"✅":"❌"} ត្រូវគ្នា</span>
          </div>
        )}

        <div style={{ display:"flex", gap:8, marginTop:4 }}>
          <button style={{ ...btnGhost, flex:1 }} onClick={onClose}>បោះបង់</button>
          <button style={{ ...btnGold, flex:1, opacity:(!oldPw||!match||!strong||loading)?0.4:1 }}
            disabled={!oldPw||!match||!strong||loading}
            onClick={doReset}>
            {loading ? "កំពុង..." : "🔐 ផ្លាស់ Password"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function UsersPage({ users, setUsers, currentUser, notify, branchList, isGlobalAdmin, isBranchAdmin, branchId }) {
  const [modal, setModal] = useState(null);
  const [delConf, setDelConf] = useState(null);
  const [permModal, setPermModal] = useState(null); // user to edit perms

  // Branch admin sees only users from own branch (+ themselves)
  const visibleUsers = (() => {
    if (isGlobalAdmin) return users;  // global admin sees all
    if (isBranchAdmin) {
      // branch admin sees users whose branch matches, or no branch set
      return users.filter(u =>
        u.branch_id === branchId ||
        u.user_id === currentUser.user_id ||
        !u.branch_id
      );
    }
    return users; // staff shouldn't be here, but show all as fallback
  })();

  const saveUser = (data) => {
    const isNew = !data.user_id;
    if (!data.username?.trim() || !data.name?.trim()) {
      notify("⚠️ សូមបំពេញ ឈ្មោះ និង Username!", "error"); return;
    }
    if (isNew && !data.password?.trim()) {
      notify("⚠️ User ថ្មី ត្រូវការ Password!", "error"); return;
    }
    if (isNew) {
      const dup = users.find(u => u.username === data.username.trim());
      if (dup) { notify("❌ Username នេះមានរួចហើយ!", "error"); return; }
      setUsers(p => [...p, {
        ...data,
        user_id: Math.max(0, ...p.map(u => u.user_id)) + 1,
        username: data.username.trim(),
        permissions: data.role === "admin" ? {} : { ...DEFAULT_PERMS_TPL, ...(data.permissions || {}) }
      }]);
      notify("✅ បន្ថែម User រួចហើយ!");
    } else {
      setUsers(p => p.map(u => {
        if (u.user_id !== data.user_id) return u;
        return {
          ...u,          // keep old fields (esp. password hash)
          ...data,
          username: data.username.trim(),
          // If password field was left blank, keep old password
          password: data.password?.trim() ? data.password.trim() : u.password,
        };
      }));
      notify("✅ កែប្រែ User រួចហើយ!");
    }
    setModal(null);
  };

  const savePerm = (uid, perms) => {
    setUsers(p => p.map(u => u.user_id === uid ? { ...u, permissions: perms } : u));
    notify("✅ កំណត់សិទ្ធ រួចហើយ!");
    setPermModal(null);
  };

  const toggleActive = (uid) => {
    if (uid === currentUser.user_id) { notify("⚠️ មិនអាចបិទ account ខ្លួនឯង!", "error"); return; }
    setUsers(p => p.map(u => u.user_id === uid ? { ...u, active: !u.active } : u));
  };

  const delUser = (uid) => {
    if (uid === currentUser.user_id) { notify("⚠️ មិនអាចលុប account ខ្លួនឯង!", "error"); return; }
    setUsers(p => p.filter(u => u.user_id !== uid));
    notify("✅ លុប User រួចហើយ!"); setDelConf(null);
  };

  const ROLES = [{ v: "admin", label: "👑 Admin", color: "#E8A84B" }, { v: "staff", label: "👤 Staff", color: "#5BA3E0" }];

  // Super admin branch filter
  const [filterBranch, setFilterBranch] = useState("all"); // "all" | branch_id

  // Apply branch filter on top of visibleUsers
  const displayUsers = (() => {
    if (!isGlobalAdmin || filterBranch === "all") return visibleUsers;
    if (filterBranch === "none") return visibleUsers.filter(u => !u.branch_id || u.branch_id === "all");
    return visibleUsers.filter(u => u.branch_id === filterBranch);
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {delConf && <ConfirmDel name={delConf.name} onConfirm={delConf.fn} onCancel={() => setDelConf(null)} />}

      {modal && (
        <Modal onClose={() => setModal(null)} maxW={440}>
          {modal.mode === "add" && <>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:18, color:"#E8A84B" }}>➕ បន្ថែម User ថ្មី</div>
            <UserForm data={modal.data} onSave={saveUser} onCancel={() => setModal(null)} roles={ROLES} />
          </>}
          {modal.mode === "edit" && <>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:18, color:"#E8A84B" }}>✏️ កែប្រែ User</div>
            <UserForm data={modal.data} onSave={saveUser} onCancel={() => setModal(null)} roles={ROLES} />
          </>}
          {modal.mode === "reset" && <ResetPasswordForm user={modal.data} onSave={(uid, pw) => {
            setUsers(p => p.map(u => u.user_id === uid ? { ...u, password: pw } : u));
            notify("✅ Reset Password រួចហើយ!"); setModal(null);
          }} onCancel={() => setModal(null)} />}
          {modal.mode === "photo" && <UploadPhotoForm user={modal.data} onSave={(uid, avatar) => {
            setUsers(p => p.map(u => u.user_id === uid ? { ...u, avatar } : u));
            notify("✅ Upload Photo រួចហើយ!"); setModal(null);
          }} onCancel={() => setModal(null)} />}
        </Modal>
      )}

      {permModal && (
        <PermModal user={permModal} onSave={savePerm} onClose={() => setPermModal(null)} />
      )}

      {/* Sticky header */}
      <div style={{ flexShrink: 0, padding: "16px 14px 12px", borderBottom: "1px solid var(--border-col)", background: "var(--bg-main)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8, flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:18 }}>👥 គ្រប់គ្រង Users</div>
            <div style={{ fontSize:12, color:"#888", marginTop:2 }}>
              {displayUsers.length} users · {displayUsers.filter(u => u.active).length} active
              {isBranchAdmin && <span style={{ marginLeft:6, color:"var(--accent)" }}>· {branchId}</span>}
              {isGlobalAdmin && filterBranch !== "all" && (
                <span style={{ marginLeft:6, color:"#5BA3E0" }}>
                  · {branchList.find(b=>b.branch_id===filterBranch)?.branch_name || filterBranch}
                </span>
              )}
            </div>
          </div>
          <button onClick={() => setModal({
            mode: "add",
            data: {
              username: "", password: "", name: "", role: "staff", active: true,
              permissions: { ...DEFAULT_PERMS_TPL },
              // Branch admin: auto-assign new users to own branch
              branch_id: isBranchAdmin ? branchId : "",
            }
          })}
            style={btnGold}>➕ បន្ថែម User</button>
        </div>

        {/* Branch filter tabs — Super Admin only */}
        {isGlobalAdmin && branchList.length > 0 && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", paddingTop:10, alignItems:"center" }}>
            <span style={{ fontSize:12, color:"#888", flexShrink:0 }}>🏪 តម្រងតាមតូប:</span>
            <button
              onClick={() => setFilterBranch("all")}
              style={{ padding:"5px 14px", borderRadius:20, border:"none", cursor:"pointer",
                fontFamily:"inherit", fontSize:12, fontWeight:700,
                background: filterBranch==="all" ? "linear-gradient(135deg,#B8732A,#E8A84B)" : "var(--bg-card)",
                color: filterBranch==="all" ? "#fff" : "#666" }}>
              🌐 ទាំងអស់ ({visibleUsers.length})
            </button>
            {/* No-branch users */}
            {visibleUsers.filter(u => !u.branch_id).length > 0 && (
              <button
                onClick={() => setFilterBranch("none")}
                style={{ padding:"5px 14px", borderRadius:20, border:"none", cursor:"pointer",
                  fontFamily:"inherit", fontSize:12, fontWeight:700,
                  background: filterBranch==="none" ? "linear-gradient(135deg,#555,#888)" : "var(--bg-card)",
                  color: filterBranch==="none" ? "#fff" : "#666" }}>
                ⭐ Super Admin ({visibleUsers.filter(u => !u.branch_id || u.branch_id==="all").length})
              </button>
            )}
            {branchList.map(b => {
              const count = visibleUsers.filter(u => u.branch_id === b.branch_id).length;
              const badge = getUserBranchBadge({ branch_id: b.branch_id }, branchList);
              const isActive = filterBranch === b.branch_id;
              return (
                <button key={b.branch_id}
                  onClick={() => setFilterBranch(b.branch_id)}
                  style={{ padding:"5px 14px", borderRadius:20, border:"none", cursor:"pointer",
                    fontFamily:"inherit", fontSize:12, fontWeight:700,
                    background: isActive ? (badge?.bg || "var(--bg-card)") : "var(--bg-card)",
                    color: isActive ? (badge?.color || "#fff") : "#666",
                    boxShadow: isActive ? `0 0 0 1px ${badge?.border||"#333"}` : "none" }}>
                  🏪 {b.branch_name} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
          {displayUsers.map(u => {
            const roleInfo = ROLES.find(r => r.v === u.role);
            const isMe = u.user_id === currentUser.user_id;
            const perms = u.role === "admin"
              ? Object.keys(PERM_LABELS).reduce((a, k) => ({ ...a, [k]: true }), {})
              : { ...DEFAULT_PERMS_TPL, ...(u.permissions || {}) };
            const allowedPages = Object.entries(perms).filter(([, v]) => v).map(([k]) => k);
            return (
              <div key={u.user_id} style={{
                background: "var(--bg-card)",
                border: `1px solid ${u.active ? "#1E1B1F" : "#2A1A1A"}`, borderRadius: 14, padding: "14px 16px",
                opacity: u.active ? 1 : 0.6
              }}>
                {/* Top row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ position:"relative", width:42, height:42 }}>
                      {u.avatar
                        ? <img src={u.avatar} alt={u.name} style={{ width:42, height:42, borderRadius:12, objectFit:"cover" }} />
                        : <div style={{
                            width:42, height:42, borderRadius:12,
                            background:`linear-gradient(135deg,${u.role==="admin"?"#8B5520,#E8A84B":"#1A3A5A,#5BA3E0"})`,
                            display:"flex", alignItems:"center", justifyContent:"center", fontSize:20
                          }}>{u.role === "admin" ? "👑" : "👤"}</div>
                      }
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {u.name} {isMe && <span style={{
                          fontSize: 10, color: "#27AE60", background: "#1A4A1A22",
                          padding: "2px 6px", borderRadius: 8, marginLeft: 4
                        }}>ខ្ញុំ</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#555", fontFamily: "'DM Mono',monospace", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginTop:2 }}>
                        <span>@{u.username}</span>
                        {/* Branch badge */}
                        {(() => {
                          const badge = getUserBranchBadge(u, branchList);
                          if (!badge) return null;
                          return (
                            <span style={{
                              fontSize:10, padding:"1px 8px", borderRadius:10,
                              background:badge.bg, color:badge.color,
                              border:`1px solid ${badge.border}`, fontWeight:700,
                              fontFamily:"inherit"
                            }}>{badge.label}</span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  {/* Role badge */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: roleInfo?.color,
                    background: `${roleInfo?.color}22`, padding: "3px 10px", borderRadius: 20, flexShrink:0
                  }}>
                    {u.branch_id === "all" ? "⭐ Super Admin" : roleInfo?.label}
                  </span>
                </div>

                {/* Permissions badges */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 5 }}>សិទ្ធចូលប្រើ:</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {Object.entries(PERM_LABELS).map(([k, { icon, label }]) => {
                      const has = perms[k];
                      return (
                        <span key={k} style={{
                          fontSize: 10, padding: "2px 7px", borderRadius: 10,
                          background: has ? "#1A3A1A" : "#1A1A1A",
                          color: has ? "#27AE60" : "#333",
                          border: `1px solid ${has ? "#27AE6022" : "#2A2A2A"}`
                        }}>
                          {icon} {label}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => toggleActive(u.user_id)}
                    style={{
                      flex: 1, ...btnSmall, fontSize: 11,
                      color: u.active ? "#27AE60" : "#E74C3C",
                      borderColor: u.active ? "#27AE6033" : "#E74C3C33"
                    }}>
                    {u.active ? "✅ Active" : "⛔ Inactive"}
                  </button>
                  {u.role !== "admin" && (
                    <button onClick={() => setPermModal(u)}
                      style={{ ...btnSmall, fontSize: 12, color: "#5BA3E0", borderColor: "#5BA3E033" }}
                      title="កំណត់សិទ្ធ">🛡️</button>
                  )}
                  <button onClick={() => setModal({ mode: "edit", data: { ...u } })} style={{ ...btnSmall, fontSize: 12 }} title="កែប្រែ">✏️</button>
                  <button onClick={() => setModal({ mode: "reset", data: u })} style={{ ...btnSmall, fontSize: 11, color:"#F39C12", borderColor:"#F39C1233", display:"flex", alignItems:"center", gap:4 }} title="Reset Password">
                    🔑 <span className="btn-label-mobile" style={{ fontSize:10 }}>Reset PW</span>
                  </button>
                  <button onClick={() => setModal({ mode: "photo", data: u })} style={{ ...btnSmall, fontSize: 12, color:"#5BA3E0", borderColor:"#5BA3E033" }} title="Upload Photo">🖼️</button>
                  <button onClick={() => setDelConf({ name: u.name, fn: () => delUser(u.user_id) })}
                    style={{ ...btnSmall, color:"#E74C3C", borderColor:"#E74C3C33", fontSize: 12 }} title="លុប">🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Reset Password Form ────────────────────────────────────────
function ResetPasswordForm({ user, onSave, onCancel }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const match = pw && pw === pw2;
  const strong = pw.length >= 6;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ textAlign:"center", marginBottom:4 }}>
        <div style={{ fontSize:36 }}>🔑</div>
        <div style={{ fontWeight:700, fontSize:15, marginTop:8 }}>Reset Password</div>
        <div style={{ fontSize:12, color:"#555", marginTop:4 }}>@{user.username}</div>
      </div>
      <div>
        <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>Password ថ្មី *</div>
        <div style={{ position:"relative" }}>
          <input className="inp" type={show?"text":"password"} placeholder="Password ថ្មី (min 6 characters)"
            value={pw} onChange={e=>setPw(e.target.value)}
            style={{ width:"100%", paddingRight:36 }} />
          <button type="button" onClick={()=>setShow(p=>!p)}
            style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", cursor:"pointer", fontSize:14, color:"#555" }}>
            {show?"🙈":"👁️"}
          </button>
        </div>
      </div>
      <div>
        <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>បញ្ជាក់ Password *</div>
        <input className="inp" type={show?"text":"password"} placeholder="វាយម្ដងទៀត..."
          value={pw2} onChange={e=>setPw2(e.target.value)} />
      </div>
      {pw && (
        <div style={{ fontSize:11, display:"flex", gap:8 }}>
          <span style={{ color: strong?"#27AE60":"#E74C3C" }}>{strong?"✅ >=6 chars":"❌ >=6 chars"}</span>
          <span style={{ color: match?"#27AE60":"#E74C3C" }}>{match?"✅ ត្រូវគ្នា":"❌ មិនត្រូវ"}</span>
        </div>
      )}
      <div style={{ display:"flex", gap:8, marginTop:4 }}>
        <button style={{ ...btnGhost, flex:1 }} onClick={onCancel}>បោះបង់</button>
        <button style={{ ...btnGold, flex:1, opacity: (!match||!strong)?0.4:1 }}
          disabled={!match||!strong}
          onClick={()=>onSave(user.user_id, pw)}>🔑 Reset</button>
      </div>
    </div>
  );
}

// ── Upload Photo Form ─────────────────────────────────────────
function UploadPhotoForm({ user, onSave, onCancel }) {
  const [preview, setPreview] = useState(user.avatar || "");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  function handleFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("រូបភាពធំពេក! Max 2MB"); return; }
    setLoading(true);
    const reader = new FileReader();
    reader.onload = e => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 200;
        let w = img.width, h = img.height;
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        setPreview(canvas.toDataURL("image/jpeg", 0.85));
        setLoading(false);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, alignItems:"center" }}>
      <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>🖼️ Upload Photo</div>
      <div style={{ fontSize:12, color:"#555" }}>@{user.username}</div>

      {/* Avatar preview */}
      <div
        style={{ width:100, height:100, borderRadius:20, overflow:"hidden", cursor:"pointer",
          border:"2px dashed var(--border-col)", display:"flex", alignItems:"center", justifyContent:"center",
          background:"var(--bg-card)", position:"relative" }}
        onClick={()=>fileRef.current?.click()}
        onDragOver={e=>{e.preventDefault();}}
        onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0]);}}>
        {loading
          ? <div className="spinner" style={{width:28,height:28}} />
          : preview
            ? <img src={preview} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            : <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:32 }}>📷</div>
                <div style={{ fontSize:11, color:"var(--text-dim)", marginTop:4 }}>ចុចឬ Drag</div>
              </div>
        }
        <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }}
          onChange={e=>handleFile(e.target.files[0])} />
      </div>

      <div style={{ fontSize:11, color:"#555", textAlign:"center" }}>
        JPG / PNG · Max 2MB · ស្វ័យប្រវត្តិ resize 200px
      </div>

      {preview && preview !== user.avatar && (
        <button style={{ ...btnSmall, color:"#E74C3C", fontSize:11 }}
          onClick={()=>setPreview("")}>🗑 លុប​រូបភាព</button>
      )}

      <div style={{ display:"flex", gap:8, width:"100%", marginTop:4 }}>
        <button style={{ ...btnGhost, flex:1 }} onClick={onCancel}>បោះបង់</button>
        <button style={{ ...btnGold, flex:1 }}
          onClick={()=>onSave(user.user_id, preview)}>💾 រក្សាទុក</button>
      </div>
    </div>
  );
}


// Permission editor modal
function UserForm({ data, user, onSave, onCancel, roles, branchList }) {
  // Support both prop names: data (new) and user (old)
  const init = data || user || {};
  const [v, setV] = useState(init);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <input className="inp" placeholder="ឈ្មោះ​ពេញ" value={v.name||""} onChange={e=>setV({...v,name:e.target.value})} />
      <input className="inp" placeholder="Username" value={v.username||""} onChange={e=>setV({...v,username:e.target.value})} />
      <div>
        <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>
          {v.user_id ? "Password ថ្មី (ទុកឱ្យទទេ = មិនប្ដូរ)" : "Password *"}
        </div>
        <input className="inp" type="password"
          placeholder={v.user_id ? "ទុកទទេ = រក្សា password ចាស់" : "Password *"}
          value={v.password||""}
          onChange={e=>setV({...v,password:e.target.value})} />
      </div>
      <select className="inp" value={v.role||"staff"} onChange={e=>setV({...v,role:e.target.value})}
        style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:9, padding:"9px 13px", color:"var(--text-main)", fontFamily:"inherit", fontSize:13 }}>
        {roles ? roles.map(r => <option key={r.v} value={r.v}>{r.label}</option>)
               : <><option value="staff">👤 Staff</option><option value="admin">👑 Admin</option></>}
      </select>
      {/* Branch selector */}
      <div>
        <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>
          🏪 សាខា {v.role==="admin" ? <span style={{color:"#888"}}>(admin: "all" = ទាំងអស់)</span> : "*"}
        </div>
        {branchList && branchList.length > 0 ? (
          <select className="inp" value={v.branch_id||""}
            onChange={e=>setV({...v,branch_id:e.target.value})}
            style={{ width:"100%", background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:9, padding:"9px 13px", color:"var(--text-main)", fontFamily:"inherit", fontSize:13 }}>
            {v.role === "admin" && <option value="all">🌐 ទាំងអស់ (all)</option>}
            {branchList.map(b => <option key={b.branch_id} value={b.branch_id}>🏪 {b.branch_name} ({b.branch_id})</option>)}
          </select>
        ) : (
          <input className="inp" placeholder="branch_1, branch_2 ... ឬ all"
            value={v.branch_id||""} onChange={e=>setV({...v,branch_id:e.target.value})} />
        )}
        <div style={{ fontSize:10, color:"#666", marginTop:4 }}>
          💡 Admin + branch_2 = login ចូល branch_2 ដូច staff ប៉ុន្តែមាន permission admin
        </div>
      </div>
      <div style={{ display:"flex", gap:8, marginTop:4 }}>
        {onCancel && <button style={{ ...btnGhost, flex:1 }} onClick={onCancel}>បោះបង់</button>}
        <button style={{ ...btnGold, flex:1 }} onClick={()=>onSave(v)}>💾 រក្សា​ទុក</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  THEME PAGE
// ═══════════════════════════════════════════════════════════════════

function ThemePage({ theme, setTheme, notify, isGlobalAdmin, currentUser }) {
  // Block non-global-admin from accessing theme
  if (!isGlobalAdmin) {
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        height:"100%", gap:16, color:"var(--text-dim)" }}>
        <div style={{ fontSize:48 }}>🔒</div>
        <div style={{ fontSize:18, fontWeight:700, color:"var(--text-main)" }}>គ្មានសិទ្ធ</div>
        <div style={{ fontSize:13, color:"#888", textAlign:"center", maxWidth:320 }}>
          ការកំណត់រចនាប័ទ្ម អាចធ្វើបានតែ Global Admin (branch: all) ប៉ុណ្ណោះ
        </div>
        <div style={{ fontSize:12, color:"var(--accent)", background:"var(--bg-card)",
          border:"1px solid var(--border-col)", borderRadius:10, padding:"8px 16px" }}>
          👤 {currentUser?.name} · 🏪 {currentUser?.branch_id}
        </div>
      </div>
    );
  }
  const [custom, setCustom] = useState({ ...theme });
  const [tab, setTab] = useState("presets"); // presets | custom | brand
  const [shopName, setShopName] = useState(() => localStorage.getItem("cb_shop_name") || "Café Boom");
  const [shopLogo, setShopLogo] = useState(() => localStorage.getItem("cb_shop_logo") || "");
  const [logoPreview, setLogoPreview] = useState(() => localStorage.getItem("cb_shop_logo") || "");
  const logoRef = useRef(null);

  const saveBrand = () => {
    localStorage.setItem("cb_shop_name", shopName);
    localStorage.setItem("cb_shop_logo", logoPreview);
    // Update global so header reacts immediately
    window.__SHOP_NAME__ = shopName;
    window.__SHOP_LOGO__ = logoPreview;
    // CRITICAL: Save shopName+shopLogo into theme DB so ALL devices sync
    setTheme(prev => ({ ...prev, shopName, shopLogo: logoPreview }));
    notify("✅ រក្សាទុក ឈ្មោះហាង + Logo រួចហើយ!");
    window.dispatchEvent(new Event("shopBrandUpdate"));
  };


  




  const handleLogoFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { notify("❌ រូបភាពធំពេក! Max 2MB", "error"); return; }
    const reader = new FileReader();
    reader.onload = ev => { setLogoPreview(ev.target.result); setShopLogo(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoPreview(""); setShopLogo("");
    localStorage.removeItem("cb_shop_logo");
    window.__SHOP_LOGO__ = "";
    window.dispatchEvent(new Event("shopBrandUpdate"));
    notify("🗑️ លុប Logo រួចហើយ!");
  };

  const applyPreset = (p) => {
    const t = { ...p };
    delete t.name;
    setTheme(t);
    setCustom(t);
    notify("🎨 ប្តូរ Theme រួចហើយ!");
  };

  const applyCustom = () => {
    setTheme(custom);
    notify("🎨 ប្តូរ Theme Custom រួចហើយ!");
  };

  const resetDefault = () => {
    setTheme(DEFAULT_THEME);
    setCustom(DEFAULT_THEME);
    notify("🔄 Reset Theme រួចហើយ!");
  };

  const isActive = (p) => {
    const t = { ...p }; delete t.name;
    return Object.keys(t).every(k => t[k] === theme[k]);
  };

  const ColorRow = ({ label, k }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <div style={{ width: 130, fontSize: 12, color: "var(--text-dim)", flexShrink: 0 }}>{label}</div>
      <input type="color" value={custom[k]} onChange={e => setCustom(p => ({ ...p, [k]: e.target.value }))}
        style={{
          width: 44, height: 36, border: "none", borderRadius: 8, cursor: "pointer",
          background: "transparent", padding: 2
        }} />
      <div style={{
        flex: 1, height: 36, borderRadius: 8, background: custom[k],
        border: "1px solid var(--border)", boxShadow: "inset 0 2px 4px rgba(0,0,0,.3)"
      }} />
      <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'DM Mono',monospace", minWidth: 70 }}>
        {custom[k]}
      </div>
    </div>
  );

  return (
    <div style={{ padding: "16px 14px 32px" }}>
      <SectionHeader title="🎨 កំណត់រចនាប័ទ្ម" sub="ជ្រើសរើស Theme ឬ កំណត់ពណ៌ផ្ទាល់ខ្លួន" />

      {/* Live Preview Bar */}
      <div style={{ marginBottom: 20, borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)" }}>
        <div style={{ background: theme.bgHeader, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#E74C3C" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#F39C12" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#27AE60" }} />
          <span style={{ fontSize: 11, color: theme.textDim, marginLeft: 8 }}>Preview — Café Boom</span>
        </div>
        <div style={{ background: theme.bgMain, padding: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ background: theme.bgCard, border: `1px solid ${theme.borderCol}`, borderRadius: 10, padding: "10px 16px" }}>
            <div style={{ fontSize: 11, color: theme.textDim }}>ចំណូល</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: theme.accent }}>$245.50</div>
          </div>
          <div style={{
            background: `linear-gradient(135deg,${theme.accentDark},${theme.accent})`,
            borderRadius: 10, padding: "10px 18px", color: "#fff", fontSize: 13, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 6
          }}>
            🛒 ទូទាត់
          </div>
          <div style={{
            background: theme.bgCard, border: `1px solid ${theme.borderCol}`, borderRadius: 10,
            padding: "10px 14px", display: "flex", gap: 8, alignItems: "center"
          }}>
            <span style={{ fontSize: 18 }}>☕</span>
            <div>
              <div style={{ fontSize: 12, color: theme.textMain }}>ឡាតេ</div>
              <div style={{ fontSize: 11, color: theme.accent }}>$3.50</div>
            </div>
          </div>
          <div style={{
            background: theme.bgCard, border: `1px solid ${theme.borderCol}`, borderRadius: 10,
            padding: "8px 14px", fontSize: 11, color: theme.textDim
          }}>
            📊 Cards, Borders, Text
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[["presets", "🎭 Presets"], ["custom", "🖌️ Custom"], ["brand", "🏪 ហាង"]].map(([k, lb]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "8px 20px", borderRadius: 20, border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 12, fontWeight: 700,
            background: tab === k ? `linear-gradient(135deg,${theme.accentDark},${theme.accent})` : "var(--bg-card)",
            color: tab === k ? "#fff" : "var(--text-dim)",
            boxShadow: tab === k ? `0 4px 14px ${theme.accent}44` : "none",
          }}>{lb}</button>
        ))}
        <button onClick={resetDefault} style={{
          marginLeft: "auto", padding: "8px 16px", borderRadius: 20,
          border: "1px solid var(--border)", background: "transparent", cursor: "pointer",
          fontFamily: "inherit", fontSize: 12, color: "var(--text-dim)"
        }}>
          🔄 Reset
        </button>
      </div>

      {/* PRESETS */}
      {tab === "presets" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
          {THEME_PRESETS.map(p => {
            const active = isActive(p);
            return (
              <div key={p.name} onClick={() => applyPreset(p)}
                style={{
                  background: p.bgCard,
                  border: `2px solid ${active ? p.accent : p.borderCol}`,
                  borderRadius: 16, overflow: "hidden", cursor: "pointer",
                  boxShadow: active ? `0 0 0 3px ${p.accent}55, 0 8px 24px ${p.accent}22` : "0 2px 8px rgba(0,0,0,.3)",
                  transition: "all .2s", transform: active ? "scale(1.02)" : "scale(1)"
                }}>
                {/* ── Mock UI Preview ── */}
                <div style={{ background: p.bgMain, padding: "10px 10px 8px" }}>
                  {/* Topbar mock */}
                  <div style={{ display:"flex", alignItems:"center", gap:5, background:p.bgHeader, borderRadius:6, padding:"5px 8px", marginBottom:6 }}>
                    <div style={{ width:14, height:14, borderRadius:"50%", background:`linear-gradient(135deg,${p.accent},${p.accentDark})` }} />
                    <div style={{ flex:1, height:4, background:p.accent, borderRadius:2, opacity:.7 }} />
                    <div style={{ width:20, height:4, background:p.textDim, borderRadius:2, opacity:.5 }} />
                    <div style={{ width:10, height:10, borderRadius:"50%", background:p.accent, opacity:.8 }} />
                  </div>
                  {/* Product cards mock */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:4 }}>
                    {[0,1,2,3,4,5].map(i => (
                      <div key={i} style={{ background:p.bgCard, borderRadius:5, padding:"5px 4px", border:`1px solid ${p.borderCol}` }}>
                        <div style={{ height:18, background:p.bgHeader, borderRadius:3, marginBottom:3 }} />
                        <div style={{ height:3, background:p.accent, borderRadius:2, width:"70%", marginBottom:2 }} />
                        <div style={{ height:3, background:p.textDim, borderRadius:2, width:"50%", opacity:.5 }} />
                      </div>
                    ))}
                  </div>
                  {/* Button mock */}
                  <div style={{ marginTop:6, height:16, borderRadius:6, background:`linear-gradient(135deg,${p.accentDark},${p.accent})`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <div style={{ height:4, width:40, background:"rgba(255,255,255,.5)", borderRadius:2 }} />
                  </div>
                </div>
                {/* ── Name row ── */}
                <div style={{ padding:"10px 12px", display:"flex", justifyContent:"space-between", alignItems:"center", borderTop:`1px solid ${p.borderCol}` }}>
                  <span style={{ fontSize:12, fontWeight:700, color:p.textMain }}>{p.name}</span>
                  {active
                    ? <span style={{ fontSize:12, fontWeight:700, color:p.accent }}>✅ ប្រើ</span>
                    : <span style={{ fontSize:11, color:p.textDim, padding:"2px 8px", border:`1px solid ${p.borderCol}`, borderRadius:10 }}>ជ្រើស</span>
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BRAND */}
      {tab === "brand" && (
        <div style={{ maxWidth: 520 }}>
          {/* Shop Name */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16 }}>🏪 ឈ្មោះហាង</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                value={shopName}
                onChange={e => setShopName(e.target.value)}
                placeholder="ឈ្មោះហាង..."
                style={{
                  ...inputSt, flex: 1, fontSize: 15, fontWeight: 600,
                  border: "1px solid var(--border)"
                }}
              />
            </div>
            {/* Live preview */}
            <div style={{ marginTop: 12, padding: "8px 14px", background: "var(--bg-main)", borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
              {logoPreview
                ? <img src={logoPreview} alt="logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
                : <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>☕</div>
              }
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--accent)" }}>{shopName || "ឈ្មោះហាង"}</div>
                <div style={{ fontSize: 10, color: "var(--text-dim)" }}>POS</div>
              </div>
            </div>
          </div>

          {/* Logo Upload */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16 }}>🖼️ Logo ហាង</div>

            {/* Logo preview */}
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
              <div style={{
                width: 80, height: 80, borderRadius: 16, background: "var(--bg-main)",
                border: "2px dashed var(--border)", display: "flex", alignItems: "center",
                justifyContent: "center", overflow: "hidden", flexShrink: 0
              }}>
                {logoPreview
                  ? <img src={logoPreview} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 32 }}>☕</span>
                }
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
                  PNG, JPG — Max 5MB<br/>ណែនាំ: ទំហំ 200×200px
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => document.getElementById("logo-upload-input").click()} style={{
                    ...btnGold, padding: "8px 16px", fontSize: 12
                  }}>
                    📁 ជ្រើស រូបភាព
                  </button>
                  {logoPreview && (
                    <button onClick={removeLogo} style={{ ...btnRed, padding: "8px 14px", fontSize: 12 }}>
                      🗑️ លុប
                    </button>
                  )}
                </div>
                <input
                  id="logo-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFile}
                  style={{ display: "none" }}
                />
              </div>
            </div>
          </div>

          {/* Save button */}
          <button onClick={saveBrand} style={{ ...btnGold, width: "100%", fontSize: 14, padding: "13px" }}>
            ✅ រក្សាទុក ឈ្មោះ + Logo
          </button>
        </div>
      )}

      {/* CUSTOM */}
      {tab === "custom" && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, maxWidth: 520 }}>
          <div style={{ fontWeight: 700, marginBottom: 18, fontSize: 13 }}>🖌️ កំណត់ពណ៌ផ្ទាល់ខ្លួន</div>
          <ColorRow label="🌑 Background ចម្បង" k="bgMain" />
          <ColorRow label="🗂️ Background Cards" k="bgCard" />
          <ColorRow label="📌 Background Header" k="bgHeader" />
          <ColorRow label="⭐ Accent ចម្បង" k="accent" />
          <ColorRow label="🔆 Accent ងងឹត" k="accentDark" />
          <ColorRow label="📝 ពណ៌អក្សរ ចម្បង" k="textMain" />
          <ColorRow label="📝 ពណ៌អក្សរ ស្រាល" k="textDim" />
          <ColorRow label="📐 Border / Divider" k="borderCol" />

          {/* Custom preview */}
          <div style={{
            background: custom.bgMain, borderRadius: 10, padding: 14, marginBottom: 16,
            border: `1px solid ${custom.borderCol}`
          }}>
            <div style={{ fontSize: 11, color: custom.textDim, marginBottom: 6 }}>Preview ផ្ទាល់</div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{
                background: custom.bgCard, border: `1px solid ${custom.borderCol}`,
                borderRadius: 8, padding: "8px 12px"
              }}>
                <div style={{ fontSize: 11, color: custom.textDim }}>ចំណូល</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: custom.accent }}>$128.00</div>
              </div>
              <div style={{
                background: `linear-gradient(135deg,${custom.accentDark},${custom.accent})`,
                borderRadius: 8, padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 700,
                display: "flex", alignItems: "center"
              }}>
                ✅ Apply
              </div>
            </div>
          </div>

          <button onClick={applyCustom} style={{ ...btnGold, width: "100%", fontSize: 14 }}>
            🎨 Apply Custom Theme
          </button>
        </div>
      )}
    </div>
  );
}


function Modal({ title, children, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }} onClick={onClose}>
      <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, minWidth:300, maxWidth:480, width:"90%", border:"1px solid var(--border-col)", maxHeight:"90vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:16 }}>{title}</div>
          <button className="btn-sm" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CustomerDisplay({ cart, cartTotal, cartTax, payMethod, selTable, onClose, onConfirmPay }) {
  const [confirming, setConfirming] = useState(false);

  const handlePay = async () => {
    setConfirming(true);
    await onConfirmPay();
    setConfirming(false);
  };

  const METHOD_INFO = {
    cash: { icon: "💵", label: "សាច់ប្រាក់", color: "#27AE60" },
    qr: { icon: "📱", label: "QR Code", color: "#5BA3E0" },
    bank: { icon: "🏦", label: "ធនាគារ", color: "#9B59B6" },
  };
  const m = METHOD_INFO[payMethod] || METHOD_INFO.cash;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000,
      background: "#09080A",
      display: "flex", flexDirection: "column",
      fontFamily: "'Kantumruy Pro','Noto Sans Khmer',sans-serif",
      color: "var(--text-main)"
    }}>
      {/* Header */}
      <div style={{
        background: "var(--bg-header)", borderBottom: "1px solid var(--border-col)",
        padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "linear-gradient(135deg,#B8732A,#E8A84B)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20
          }}>☕</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#E8A84B" }}>Café Boom</div>
            <div style={{ fontSize: 11, color: "#555" }}>វិក្កយបត្រ {selTable ? `· តុ ${selTable}` : ""}</div>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: "#888",
          fontFamily: "inherit"
        }}>✕ បិទ</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>

        {/* Items */}
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ fontSize: 14, color: "#555", marginBottom: 16, fontWeight: 600 }}>
            📋 តារាងបញ្ជាទិញ ({cart.reduce((s, i) => s + i.qty, 0)} មុខ)
          </div>

          <div style={{
            background: "var(--bg-card)", borderRadius: 16, overflow: "hidden", marginBottom: 20,
            border: "1px solid var(--border-col)"
          }}>
            {cart.map((item, idx) => (
              <div key={item.key} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                borderBottom: idx < cart.length - 1 ? "1px solid #1A181C" : "none"
              }}>
                {item.image_url
                  ? <img src={item.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{
                    width: 48, height: 48, borderRadius: 10, background: "var(--bg-main)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0
                  }}>{item.emoji}</div>
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{item.product_name}</div>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                    {item.opts.size} · ស្ករ {item.opts.sugar} · {item.opts.milk}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, color: "#888" }}>×{item.qty}</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#E8A84B" }}>{fmt(item.price * item.qty)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{
            background: "var(--bg-card)", borderRadius: 16, padding: "18px 20px",
            border: "1px solid var(--border-col)", marginBottom: 24
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#666", marginBottom: 8 }}>
              <span>សរុប</span><span>{fmt(cartTotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#666", marginBottom: 14 }}>
              <span>VAT 10%</span><span>{fmt(cartTax)}</span>
            </div>
            <div style={{ height: 1, background: "#1E1B1F", marginBottom: 14 }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 24 }}>
              <span>សរុបរួម</span>
              <span style={{ color: "#E8A84B" }}>{fmt(cartTotal + cartTax)}</span>
            </div>
          </div>

          {/* Payment method badge */}
          <div style={{
            background: "var(--bg-card)", borderRadius: 16, padding: "16px 20px",
            border: `1px solid ${m.color}44`, marginBottom: 24,
            display: "flex", alignItems: "center", gap: 12
          }}>
            <div style={{ fontSize: 32 }}>{m.icon}</div>
            <div>
              <div style={{ fontSize: 12, color: "#555" }}>វិធីទូទាត់</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: m.color }}>{m.label}</div>
            </div>
          </div>

          {/* Thank you */}
          <div style={{ textAlign: "center", color: "#333", fontSize: 13, marginBottom: 24 }}>
            សូមអរគុណដែលប្រើប្រាស់សេវាកម្ម Café Boom 🙏
          </div>
        </div>
      </div>

      {/* Footer - confirm button */}
      <div style={{ background: "#120F10", borderTop: "1px solid #1F1C1E", padding: "16px 24px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <button onClick={handlePay} disabled={confirming} style={{
            width: "100%", padding: "18px", borderRadius: 14, border: "none", cursor: confirming ? "not-allowed" : "pointer",
            background: confirming ? "#2A2A2A" : "linear-gradient(135deg,#B8732A,#E8A84B)",
            color: "#fff", fontFamily: "inherit", fontSize: 18, fontWeight: 700,
            boxShadow: confirming ? "none" : "0 8px 28px rgba(184,115,42,.45)",
            transition: "all .2s"
          }}>
            {confirming
              ? "⏳ កំពុងដំណើរការ..."
              : `${m.icon} បញ្ជាក់ការទូទាត់ — ${fmt(cartTotal + cartTax)}`
            }
          </button>
          <div style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: "#333" }}>
            ចុចបញ្ជាក់ → ផ្ញើ Telegram ភ្លាមៗ 📲
          </div>
        </div>
      </div>
    </div>
  );
}


function ReceiptModal({ receipt, onClose }) {
  const [printing, setPrinting] = useState(false);
  const [printMsg, setPrintMsg] = useState("");   // success/error feedback
  const [autoPrint, setAutoPrint] = useState(() => localStorage.getItem("cb_autoprint") === "1");

  // Auto-print on mount if enabled
  useEffect(() => {
    if (autoPrint) handlePrint();
  }, []);

  const handlePrint = async () => {
    setPrinting(true);
    setPrintMsg("");
    const result = await printReceipt(receipt);
    setPrinting(false);
    if (result.ok) {
      setPrintMsg(`✅ បោះពុម្ព​ជោគជ័យ (${result.via || "printer"})`);
    } else {
      // Fallback: browser print
      setPrintMsg(`⚠️ ${result.error} — ប្រើ Browser Print`);
      doBrowserPrint(receipt);
    }
  };

  const toggleAutoPrint = () => {
    const next = !autoPrint;
    setAutoPrint(next);
    localStorage.setItem("cb_autoprint", next ? "1" : "0");
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }}>
      <div style={{
        background: "#fff", color: "#111", borderRadius: 16, padding: 28, maxWidth: 340, width: "100%",
        fontFamily: "'Courier New',monospace", boxShadow: "0 24px 64px rgba(0,0,0,.5)", animation: "slideUp .25s ease"
      }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>☕ Café Bloom</div>
          <div style={{ fontSize: 11, color: "#777" }}>ភ្នំពេញ · {receipt.ts}</div>
          {receipt.table && <div style={{ fontSize: 11, color: "#777" }}>តុ {receipt.table}</div>}
          <div style={{ borderTop: "1px dashed #ccc", marginTop: 10 }} />
        </div>

        {/* Items */}
        {receipt.items.map(i => (
          <div key={i.key} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
            <div>
              <div>{i.product_name} ×{i.qty}</div>
              <div style={{ fontSize: 10, color: "#999" }}>{i.opts.size} · {i.opts.sugar} · {i.opts.milk}</div>
            </div>
            <div style={{ fontWeight: 600 }}>{fmt(i.price * i.qty)}</div>
          </div>
        ))}

        {/* Totals */}
        <div style={{ borderTop: "1px dashed #ccc", marginTop: 10, paddingTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888" }}><span>សរុប</span><span>{fmt(receipt.total)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888" }}><span>VAT 10%</span><span>{fmt(receipt.tax)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 6 }}><span>សរុបរួម</span><span>{fmt(receipt.total + receipt.tax)}</span></div>
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "#aaa" }}>
            {receipt.method === "cash" ? "💵 សាច់ប្រាក់" : receipt.method === "qr" ? "📱 QR Code" : "🏦 ធនាគារ"}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", borderTop: "1px dashed #ccc", marginTop: 12, paddingTop: 12, fontSize: 12, color: "#aaa" }}>
          អរគុណចំពោះការគាំទ្រ 🙏
        </div>

        {/* Print feedback */}
        {printMsg && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 8, fontSize: 11, textAlign: "center",
            background: printMsg.startsWith("✅") ? "#f0fff4" : "#fff8f0",
            color: printMsg.startsWith("✅") ? "#27AE60" : "#E67E22", fontFamily: "inherit"
          }}>
            {printMsg}
          </div>
        )}

        {/* Auto-print toggle */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          marginTop: 10, fontSize: 11, color: "#888", fontFamily: "inherit", cursor: "pointer"
        }}
          onClick={toggleAutoPrint}>
          <div style={{
            width: 32, height: 18, borderRadius: 9, background: autoPrint ? "#27AE60" : "#ddd",
            position: "relative", transition: "background .2s", flexShrink: 0
          }}>
            <div style={{
              position: "absolute", top: 2, left: autoPrint ? 14 : 2, width: 14, height: 14,
              borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.3)"
            }} />
          </div>
          <span>Print ដោយស្វ័យប្រវត្តិ</span>
        </div>

        {/* Action buttons */}
        <button onClick={handlePrint} disabled={printing} style={{
          width: "100%", marginTop: 12, padding: "11px", borderRadius: 10,
          background: printing ? "#ccc" : "#B8732A", border: "none",
          color: "#fff", fontWeight: 700, cursor: printing ? "not-allowed" : "pointer",
          fontFamily: "inherit", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8
        }}>
          {printing ? "⏳ កំពុងបោះពុម្ព..." : "🖨️ Print វិក័យប័ត្រ"}
        </button>

        <button onClick={onClose} style={{
          width: "100%", marginTop: 8, padding: "11px", borderRadius: 10,
          background: "#111", border: "none", color: "#fff", fontWeight: 600, cursor: "pointer",
          fontFamily: "inherit", fontSize: 13
        }}>
          បិទ
        </button>
      </div>
    </div>
  );
}


function doBrowserPrint(receipt) {
  const win = window.open("", "_blank", "width=400,height=600");
  const items = receipt.items.map(i => `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px">
      <div>${i.product_name} ×${i.qty}<br/><small style="color:#999">${i.opts?.size || ""} · ${i.opts?.sugar || ""}</small></div>
      <div>$${(i.price * i.qty).toFixed(2)}</div>
    </div>`).join("");
  const method = receipt.method === "cash" ? "💵 Cash" : receipt.method === "qr" ? "📱 QR" : "🏦 Bank";
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;padding:16px;width:80mm;font-size:12px}
  .center{text-align:center}.bold{font-weight:700}.big{font-size:18px}.dash{border-top:1px dashed #999;margin:8px 0}
  @media print{body{width:80mm}}</style></head><body>
  <div class="center bold big">Cafe Bloom</div>
  <div class="center" style="font-size:10px;color:#777;margin-top:2px">${receipt.ts}</div>
  ${receipt.table ? `<div class="center" style="font-size:10px">Table: ${receipt.table}</div>` : ""}
  <div class="dash"></div>${items}<div class="dash"></div>
  <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>$${receipt.total.toFixed(2)}</span></div>
  <div style="display:flex;justify-content:space-between;color:#888"><span>VAT 10%</span><span>$${receipt.tax.toFixed(2)}</span></div>
  <div class="dash"></div>
  <div style="display:flex;justify-content:space-between" class="bold"><span>TOTAL</span><span style="font-size:16px">$${(receipt.total + receipt.tax).toFixed(2)}</span></div>
  <div class="center" style="margin-top:8px;font-size:11px">${method}</div>
  <div class="dash"></div>
  <div class="center" style="font-size:11px;color:#aaa">Thank you! / Arkun! 🙏</div>
  \x3cscript\x3ewindow.onload=()=>{window.print();}\x3c/script\x3e
  </body></html>`);
  win.document.close();
}


function Tag({ children, color = "#E8A84B" }) {
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: `${color}22`, color
    }}>
      {children}
    </span>
  );
}

function ActionBtns({ onEdit, onDel }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button onClick={onEdit} style={btnSmall}>✏️</button>
      <button onClick={onDel} style={{ ...btnSmall, color: "#E74C3C", borderColor: "#E74C3C33" }}>🗑️</button>
    </div>
  );
}

function FieldWrapper({ label, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ fontSize: 11, color: "#666", fontWeight: 600, letterSpacing: .4, display: "block", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}
const F = FieldWrapper; // alias for RecForm compatibility


function ConfirmDel({ name, onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} maxW={320}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36 }}>🗑️</div>
        <div style={{ fontWeight: 700, fontSize: 15, margin: "12px 0 6px" }}>លុប "{name}"?</div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} style={{ ...btnGhost, flex: 1 }}>បោះបង់</button>
          <button onClick={onConfirm} style={{ ...btnRed, flex: 1 }}>លុប</button>
        </div>
      </div>
    </Modal>
  );
}


function Empty({ icon, label }) {
  return (
    <div style={{ textAlign: "center", paddingTop: 60, color: "#444" }}>
      <div style={{ fontSize: 46 }}>{icon}</div>
      <div style={{ marginTop: 14, color: "#555" }}>{label}</div>
    </div>
  );
}


function PermModal({ user, onSave, onClose }) {
  const [perms, setPerms] = useState({ ...DEFAULT_PERMS_TPL, ...(user.permissions || {}) });
  const toggle = (k) => setPerms(p => ({ ...p, [k]: !p[k] }));
  return (
    <Modal onClose={onClose} maxW={400}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: "#E8A84B" }}>🛡️ កំណត់សិទ្ធ</div>
      <div style={{ fontSize: 13, color: "#888", marginBottom: 18 }}>👤 {user.name} (@{user.username})</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        {Object.entries(PERM_LABELS).map(([k, { icon, label }]) => {
          const on = perms[k];
          return (
            <button key={k} onClick={() => toggle(k)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
              borderRadius: 10, border: `1px solid ${on ? "#27AE6055" : "#2A2A2A"}`,
              background: on ? "#0A2A0A" : "#111", cursor: "pointer", fontFamily: "inherit",
              textAlign: "left"
            }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: on ? "#27AE60" : "#555" }}>{label}</div>
                <div style={{ fontSize: 10, color: on ? "#5C9E5C" : "#333" }}>{on ? "✅ អនុញ្ញាត" : "❌ បិទ"}</div>
              </div>
            </button>
          );
        })}
      </div>
      <BtnRow onSave={() => onSave(user.user_id, perms)} onCancel={onClose} saveLabel="💾 រក្សាទុក" />
    </Modal>
  );
}


function RecForm({ data, prods, ings, onSave, onCancel }) {
  const [f, setF] = useState({ ...data });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const selIng = ings.find(i => i.ingredient_id === Number(f.ingredient_id));
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 18 }}>📋 {data.recipe_id ? "កែប្រែ" : "បន្ថែម"}រូបមន្ត</div>
      <F label="product *">
        <select value={f.product_id} onChange={e => s("product_id", Number(e.target.value))} style={{ ...inputSt, width: "100%" }}>
          {prods.map(p => <option key={p.product_id} value={p.product_id}>{p.emoji} {p.product_name}</option>)}
        </select>
      </F>
      <F label="ingredient *">
        <select value={f.ingredient_id} onChange={e => s("ingredient_id", Number(e.target.value))} style={{ ...inputSt, width: "100%" }}>
          {ings.map(i => <option key={i.ingredient_id} value={i.ingredient_id}>{i.ingredient_name} ({i.unit})</option>)}
        </select>
      </F>
      <F label={`quantity_required${selIng ? ` (${selIng.unit})` : ""} *`}>
        <input type="number" step="0.5" value={f.quantity_required} onChange={e => s("quantity_required", e.target.value)} style={{ ...inputSt, width: "100%" }} />
      </F>
      <BtnRow onSave={() => f.quantity_required && onSave(f)} onCancel={onCancel} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  SHARED UI ATOMS
// ═══════════════════════════════════════════════════════════════════

function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 18 }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}


function SqlBlock({ code }) {
  const keywords = ["START", "TRANSACTION", "COMMIT", "ROLLBACK", "UPDATE", "SELECT", "INSERT", "JOIN", "WHERE", "SET", "FROM", "AND", "IF", "SIGNAL", "END", "CREATE", "TABLE", "PRIMARY", "KEY", "NOT", "NULL", "DEFAULT", "FOREIGN", "REFERENCES", "AUTO_INCREMENT", "ON", "DELETE", "CASCADE", "INTO", "VALUES", "INT", "VARCHAR", "DECIMAL", "BOOLEAN", "TEXT"];
  return (
    <pre style={{ margin: 0, overflowX: "auto", fontSize: 12, lineHeight: 1.9, fontFamily: "'DM Mono',monospace" }}>
      {code.split("\n").map((line, i) => {
        if (line.trim().startsWith("--")) return <span key={i} style={{ color: "#444", display: "block" }}>{line}</span>;
        const parts = line.split(/\b/);
        return (
          <span key={i} style={{ display: "block" }}>
            {parts.map((part, j) => {
              if (keywords.includes(part.toUpperCase())) return <span key={j} style={{ color: "#E8A84B", fontWeight: 500 }}>{part}</span>;
              if (/^['"']/.test(part)) return <span key={j} style={{ color: "#5BA3E0" }}>{part}</span>;
              return <span key={j} style={{ color: "#9A9A9A" }}>{part}</span>;
            })}
          </span>
        );
      })}
    </pre>
  );
}

function SubTabs({ tabs, val, set }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid var(--border-col)", paddingBottom: 0 }}>
      {tabs.map(([v, lb]) => (
        <button key={v} onClick={() => set(v)} style={{
          padding: "9px 16px", border: "none", background: "transparent", cursor: "pointer",
          color: val === v ? "#E8A84B" : "#555", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
          borderBottom: val === v ? "2px solid #E8A84B" : "2px solid transparent",
          marginBottom: -1
        }}>{lb}</button>
      ))}
    </div>
  );
}


function TableWrap({ headers, children }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--bg-header)" }}>
            {headers.map(h => (
              <th key={h} style={{
                padding: "10px 14px", textAlign: "left", color: "#E8A84B",
                fontWeight: 600, fontSize: 11, letterSpacing: .5, borderBottom: "1px solid #252230", whiteSpace: "nowrap"
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}


function BtnRow({ onSave, onCancel, saveLabel = "រក្សាទុក" }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
      <button onClick={onCancel} style={{ ...btnGhost, flex: 1 }}>បោះបង់</button>
      <button onClick={onSave} style={{ ...btnGold, flex: 1 }}>{saveLabel}</button>
    </div>
  );
}

function OptRow({ label, items, value, onChange, color, slider }) {
  if (slider) {
    // Slider mode for sugar %
    const idx = items.indexOf(value);
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#666", fontWeight: 600, letterSpacing: .5 }}>{label.toUpperCase()}</div>
          <div style={{
            fontSize: 14, fontWeight: 700, color, background: `${color}22`,
            padding: "3px 12px", borderRadius: 20, minWidth: 52, textAlign: "center"
          }}>{value}</div>
        </div>
        {/* Slider track */}
        <input type="range" min={0} max={items.length - 1} value={idx >= 0 ? idx : 0}
          onChange={e => onChange(items[parseInt(e.target.value)])}
          style={{ width: "100%", accentColor: color, cursor: "pointer", height: 4 }} />
        {/* Tick labels */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          {items.filter((_, i) => i % 2 === 0).map(v => (
            <span key={v} style={{ fontSize: 9, color: value === v ? color : "#444" }}>{v}</span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "#666", marginBottom: 7, fontWeight: 600, letterSpacing: .5 }}>{label.toUpperCase()}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {items.map(v => (
          <button key={v} onClick={() => onChange(v)} style={{
            padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit", fontSize: 12,
            border: value === v ? `2px solid ${color}` : "1px solid #2A2730",
            background: value === v ? `${color}22` : "#111",
            color: value === v ? color : "#888",
            fontWeight: value === v ? 700 : 400,
          }}>{v}</button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  CSS
// ═══════════════════════════════════════════════════════════════════
function Td({ children, mono, dim, bold, gold, style = {} }) {
  return (
    <td style={{
      padding: "10px 14px", borderBottom: "1px solid var(--border-col)",
      fontFamily: mono ? "'DM Mono',monospace" : "inherit",
      color: dim ? "#555" : gold ? "#E8A84B" : "inherit",
      fontWeight: bold ? 600 : "normal", ...style
    }}>
      {children}
    </td>
  );
}

const CSS = `
  :root {
    --bg-main: #09080A; --bg-card: #120F13; --bg-header: #0E0C0F;
    --accent: #E8A84B; --accent-dk: #B8732A;
    --text-main: #EDE8E1; --text-dim: #666666; --border-col: #1E1B1F;
    --border: #1E1B1F;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg-main); color: var(--text-main); }

  .inp {
    background: var(--bg-main); color: var(--text-main);
    border: 1px solid var(--border-col); border-radius: 8px;
    padding: 8px 12px; font-size: 14px; width: 100%;
    outline: none;
    font-family: 'Hanuman', 'Noto Sans Khmer', sans-serif;
  }
  .inp:focus { border-color: var(--accent); }

  .btn-primary {
    background: var(--accent); color: #000; border: none;
    border-radius: 8px; padding: 10px 18px; font-weight: 700;
    cursor: pointer; font-size: 14px; width: 100%;
    font-family: 'Hanuman', 'Noto Sans Khmer', sans-serif;
    transition: opacity .2s;
  }
  .btn-primary:hover { opacity: .85; }
  .btn-primary:disabled { opacity: .5; cursor: default; }

  .btn-sm {
    background: var(--bg-main); color: var(--text-main);
    border: 1px solid var(--border-col); border-radius: 6px;
    padding: 4px 10px; cursor: pointer; font-size: 12px;
    font-family: 'Hanuman', 'Noto Sans Khmer', sans-serif;
    white-space: nowrap;
  }
  .btn-sm:hover { border-color: var(--accent); color: var(--accent); }

  .nav-btn {
    background: var(--bg-main); color: var(--text-dim);
    border: 1px solid var(--border-col); border-radius: 8px;
    padding: 6px 14px; cursor: pointer; font-size: 13px;
    white-space: nowrap;
    font-family: 'Hanuman', 'Noto Sans Khmer', sans-serif;
  }
  .nav-btn.active, .nav-btn:hover { background: var(--accent); color: #000; border-color: var(--accent); }

  .cat-btn {
    background: var(--bg-card); color: var(--text-dim);
    border: 1px solid var(--border-col); border-radius: 20px;
    padding: 5px 14px; cursor: pointer; font-size: 13px;
    white-space: nowrap;
    font-family: 'Hanuman', 'Noto Sans Khmer', sans-serif;
  }
  .cat-btn.active { background: var(--accent); color: #000; border-color: var(--accent); }

  .prod-card {
    background: var(--bg-card); border: 1px solid var(--border-col);
    border-radius: 12px; padding: 14px 10px;
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    cursor: pointer; transition: border-color .2s, transform .15s;
  }
  .prod-card:hover { border-color: var(--accent); transform: scale(1.03); }

  .table-card {
    background: var(--bg-card); border: 2px solid var(--border-col);
    border-radius: 12px; padding: 14px 10px;
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    cursor: pointer; transition: border-color .2s;
  }
  .table-card:hover { transform: scale(1.04); }

  .pay-btn {
    flex: 1; background: var(--bg-main); color: var(--text-dim);
    border: 1px solid var(--border-col); border-radius: 8px;
    padding: 6px 4px; cursor: pointer; font-size: 11px;
    font-family: 'Hanuman', 'Noto Sans Khmer', sans-serif;
  }
  .pay-btn.active { background: var(--accent); color: #000; border-color: var(--accent); }

  .opt-btn {
    background: var(--bg-main); color: var(--text-dim);
    border: 1px solid var(--border-col); border-radius: 6px;
    padding: 5px 10px; cursor: pointer; font-size: 12px;
    font-family: 'Hanuman', 'Noto Sans Khmer', sans-serif;
  }
  .opt-btn.active { background: var(--accent); color: #000; border-color: var(--accent); }

  .spinner {
    width: 32px; height: 32px; border: 3px solid var(--border-col);
    border-top-color: var(--accent); border-radius: 50%;
    animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  select.inp { cursor: pointer; }

  /* ── Nav tabs (new style) ── */
  .nav-tab {
    display: flex; align-items: center; gap: 6px;
    background: transparent; color: var(--text-dim);
    border: none; border-bottom: 3px solid transparent;
    padding: 10px 16px; cursor: pointer; font-size: 13px;
    white-space: nowrap; transition: all .18s;
    font-family: 'Hanuman', 'Noto Sans Khmer', sans-serif;
  }
  .nav-tab:hover { color: var(--text-main); border-bottom-color: rgba(232,168,75,.4); }
  .nav-tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 700; }

  /* ── Product image wrapper ── */
  .prod-img-wrap {
    width: 100%; aspect-ratio: 1 / 1;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,.04); border-radius: 10px;
    overflow: hidden; margin-bottom: 2px;
  }

  /* ── Responsive ── */
  .page-pos-active { padding: 0 !important; }

  /* Slide in animation for sidebar */
  @keyframes slideInLeft {
    from { transform: translateX(-100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50%       { transform: scale(1.15); }
  }
  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20%     { transform: translateX(-4px); }
    40%     { transform: translateX(4px); }
    60%     { transform: translateX(-3px); }
    80%     { transform: translateX(3px); }
  }
  .stock-bell { animation: shake 0.6s ease 0s 3; }

  /* Hamburger — hidden on desktop */
  .hamburger-btn { display: none !important; }
  .topbar-role { display: inline; }
  .topbar-name { display: inline; }

  @media (max-width: 768px) {
    /* Show hamburger, hide desktop nav */
    .hamburger-btn { display: flex !important; }
    .desktop-nav { display: none !important; }
    .topbar-role { display: none !important; }
    /* Keep TopBar truly sticky on mobile */
    .app-root { overflow: hidden; }
    .topbar-fixed {
      position: sticky !important;
      top: 0 !important;
      z-index: 200 !important;
      -webkit-position: sticky !important;
    }
    /* Hide name text inside user pill — keep only avatar */
    .topbar-username { display: none !important; }
    /* Show mobile stock bell */
    #mobile-stock-bell { display: flex !important; }
    /* Hide password, clear, logout buttons — use hamburger instead */
    .topbar-hide-mobile { display: none !important; }
    /* User pill: compact — avatar only */
    .topbar-user-pill {
      padding: 4px !important;
      gap: 0 !important;
      background: transparent !important;
    }
  }
  @media (max-width: 640px) {
    .nav-tab { padding: 8px 10px !important; font-size: 12px !important; }
    .nav-label { display: none; }
    /* Keep clock + status visible on mobile — show compact */
    .topbar-clock { font-size: 11px !important; min-width: 50px !important; }
    .topbar-status { padding: 3px 7px !important; }
    .topbar-status span { display: none !important; } /* hide text, keep dot */
  }
  @media (max-width: 480px) {
    .prod-card { padding: 8px !important; }
  }
  @media print {
    .no-print { display: none !important; }
    body { background: #fff !important; color: #000 !important; }
  }

  /* ── Light Mode Global Overrides ── */
  /* When bg-main is light, override hardcoded dark element colors */
  .light-mode .inp {
    background: #fff !important;
    border-color: #DDD8D0 !important;
    color: #1A1510 !important;
  }
  .light-mode .btn-sm {
    background: #fff !important;
    border-color: #DDD8D0 !important;
    color: #555 !important;
  }
  /* Cards with hardcoded dark backgrounds */
  .light-mode [style*="#120F13"],
  .light-mode [style*="120F13"] {
    background: #fff !important;
  }
  /* Nav tab bar */
  .light-mode .nav-tab-bar {
    border-bottom-color: #DDD8D0 !important;
  }
  /* POS cart */
  .light-mode .pos-cart {
    background: #FFFFFF !important;
    border-left-color: #DDD8D0 !important;
  }
  /* Product cards text */
  .light-mode .prod-card {
    color: #1A1510 !important;
  }

  /* ── POS Layout (from old version) ── */
  .pos-layout{display:flex;flex-direction:row;flex:1;overflow:hidden;height:100%;min-height:0}
        .pos-menu{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}
        .pos-cart{width:300px;flex-shrink:0;display:flex;flex-direction:column;overflow:hidden;min-height:0}
        .mobile-bottom-nav{display:none}
        .mobile-fab{display:none}

        /* Mobile ≤768px */
        @media(max-width:768px){
          .desktop-nav{display:none!important}
          .mobile-spacer{display:block}
          .hamburger-btn{display:flex!important}
          .header-logo-text{display:block}

          /* POS layout: menu full screen */
          .pos-layout{flex-direction:column;position:relative;height:100%}
          .pos-menu{flex:1;min-height:0}
          .pos-cart{
            position:fixed;bottom:0;left:0;right:0;
            width:100%!important;max-height:72vh;
            background:var(--bg-card);
            border-top:2px solid var(--accent-dk)!important;
            border-left:none!important;
            z-index:100;
            transform:translateY(105%);
            transition:transform .28s cubic-bezier(.4,0,.2,1);
            display:flex!important;flex-direction:column;overflow:hidden;
          }
          .pos-cart.cart-open{transform:translateY(0)}

          /* Bottom nav */
          .mobile-bottom-nav{
            display:none;
            position:fixed;bottom:0;left:0;right:0;
            height:56px;
            background:var(--bg-header);
            border-top:1px solid var(--border);
            z-index:200;
          }
          .mobile-bottom-nav button{
            flex:1;border:none;background:transparent;
            display:flex;flex-direction:column;align-items:center;
            justify-content:center;gap:1px;
            cursor:pointer;color:#444;
            transition:color .15s;padding:0;
          }
          .mobile-bottom-nav button.active{color:#E8A84B}
          .mobile-bottom-nav button.active span:first-child{
            background:#B8732A22;border-radius:12px;padding:2px 12px;
          }

          /* FAB cart button */
          .mobile-fab{
            display:flex!important;
            align-items:center;justify-content:center;
            position:fixed;bottom:14px;right:14px;
            width:52px;height:52px;border-radius:50%;
            border:none;cursor:pointer;
            background:linear-gradient(135deg,#B8732A,#E8A84B);
            box-shadow:0 4px 16px rgba(184,115,42,.55);
            font-size:22px;z-index:150;
          }

          /* All pages padding for bottom nav */
          main > div{padding-bottom:80px!important}
        }
`

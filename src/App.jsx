// ═══════════════════════════════════════════════════════════════════
//  Cafe Bloom POS — Multi-Branch React Frontend
//  PostgreSQL + Socket.io Edition (Full Integrated)
//  config: public/config.js → window.CAFE_SERVER, window.CAFE_BRANCH
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRealtimeDB } from "./useRealtimeDB.js";

// ── Config from public/config.js ─────────────────────────────────
const CLOUD_URL   = window.CAFE_SERVER      || "https://cafe-bloom-backend.up.railway.app";
const BRANCH_ID   = window.CAFE_BRANCH      || "branch_1";
const BRANCH_NAME = window.CAFE_BRANCH_NAME || "Cafe Bloom";

// ── Telegram Notification ─────────────────────────────────────────
const TG_TOKEN   = "8503740689:AAEN1Hk9HEbMNWjsArqjzZb_WgTHo55-ZkU";
const TG_CHAT_ID = "-5197630379";

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
    const ok = Number(ing.current_stock) >= need;
    checks.push({ ing: { ...ing }, need, ok });
    if (!ok && !failedOn) failedOn = ing.ingredient_name;
  }

  if (failedOn) return { success: false, reason: failedOn, checks };

  // Deduct stock
  const newIngredients = ingredients.map(ing => {
    const r = prodRecipes.find(r => Number(r.ingredient_id) === Number(ing.ingredient_id));
    if (!r) return ing;
    return { ...ing, current_stock: Number(ing.current_stock) - Number(r.quantity_required) * Number(qty) };
  });

  return { success: true, checks, newIngredients };
}

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
const nextId = a => Math.max(0, ...a.map(x => Object.values(x)[0])) + 1;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const fmt  = (n) => "$" + Number(n || 0).toFixed(2);
const now  = ()  => new Date().toISOString();
const uid  = ()  => Date.now() + "_" + Math.random().toString(36).slice(2, 6);
const TAX  = 0.10;

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
  <script>window.onload=()=>{window.print();}<\/script>
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
  const { db, loading, socketOnline, saveTable, reload } = useRealtimeDB(CLOUD_URL, BRANCH_ID);

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
    if (db.theme)       setThemeRaw({ ...DEFAULT_THEME, ...db.theme });
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

  // ── Toast notification (used by POSPage) ─────────────────────────
  const [toast, setToast] = useState("");
  const notify = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  // ── Permission check ────────────────────────────────────────────
  const canAccess = useCallback((p) => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
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
    branchId: BRANCH_ID, branchName: BRANCH_NAME,
    doLogout, canAccess,
    notify,
  };

  const NAV = [
    { id:"pos",       label:"ចំណុចលក់",     emoji:"🛒", page:true },
    { id:"tables",    label:"តុ",           emoji:"🪑", page:true },
    { id:"menu",      label:"ម៉ឺនុយ",       emoji:"📋", page:true },
    { id:"inventory", label:"ស្តុក",        emoji:"📦", page:true },
    { id:"orders",    label:"ប្រវត្តិ",     emoji:"📜", page:true },
    { id:"report",    label:"របាយការណ៍",    emoji:"📊", page:true },
    { id:"finance",   label:"ហិរញ្ញវត្ថុ", emoji:"💰", page:true },
    { id:"users",     label:"អ្នកប្រើ",    emoji:"👥", page:true, adminOnly:true },
    { id:"theme",     label:"រចនាប័ទ្ម",   emoji:"🎨", page:true, adminOnly:true },
  ].filter(n => !n.adminOnly || currentUser.role === "admin");

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg-main)", color:"var(--text-main)", fontFamily:"'Hanuman', 'Noto Sans Khmer', sans-serif" }}>
      <style>{CSS}</style>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position:"fixed", bottom:80, left:"50%", transform:"translateX(-50%)", background: toast.type==="error" ? "#3a1a1a" : "#1a3a1a", color: toast.type==="error" ? "#ff8080" : "#80ff80", borderRadius:10, padding:"10px 20px", fontSize:13, fontWeight:700, zIndex:999, boxShadow:"0 4px 20px rgba(0,0,0,.4)", whiteSpace:"nowrap" }}>
          {toast.msg}
        </div>
      )}
      {/* ── TopBar ── */}
      <TopBar socketOnline={socketOnline} offline={offline} currentUser={currentUser} doLogout={doLogout} />

      {/* ── Nav tabs ── */}
      <div className="nav-tab-bar" style={{ display:"flex", gap:0, overflowX:"auto", background:"var(--bg-header)", borderBottom:"2px solid var(--border-col)", padding:"0 8px" }}>
        {NAV.map(n => (
          <button key={n.id}
            className={"nav-tab" + (page === n.id ? " active" : "")}
            onClick={() => setPage(n.id)}
          >
            <span style={{ fontSize:15 }}>{n.emoji}</span>
            <span className="nav-label">{n.label}</span>
          </button>
        ))}
      </div>

      {/* ── Page content ── */}
      <div className="page-pad" style={{ padding:"16px" }}>
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
  return (
    <div style={{ minHeight:"100vh", background:t.bgMain, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{CSS}</style>
      <div style={{ background:t.bgCard, border:`1px solid ${t.borderCol}`, borderRadius:16, padding:32, width:320, display:"flex", flexDirection:"column", gap:16 }}>
        <div style={{ textAlign:"center", fontSize:40 }}>☕</div>
        <div style={{ textAlign:"center", fontWeight:700, fontSize:20, color:t.accent }}>Cafe Bloom POS</div>
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
function TopBar({ socketOnline, offline, currentUser, doLogout }) {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const hhmm = time.toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" });
  const statusColor = socketOnline ? "#2ECC71" : offline ? "#E74C3C" : "#F39C12";
  const statusLabel = socketOnline ? "Online" : offline ? "Offline" : "Sync…";
  return (
    <div style={{ background:"var(--bg-header)", borderBottom:"1px solid var(--border-col)", display:"flex", alignItems:"center", padding:"6px 16px", gap:12, position:"sticky", top:0, zIndex:100 }}>
      {/* Logo */}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:34, height:34, borderRadius:"50%", background:"linear-gradient(135deg,var(--accent),var(--accent-dk))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>☕</div>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:"var(--accent)", lineHeight:1.1 }}>Café Boom</div>
          <div style={{ fontSize:10, color:"var(--text-dim)", lineHeight:1 }}>POS</div>
        </div>
      </div>
      <div style={{ flex:1 }} />
      {/* Status dot */}
      <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,.05)", borderRadius:20, padding:"4px 10px" }}>
        <div style={{ width:7, height:7, borderRadius:"50%", background:statusColor, boxShadow:`0 0 6px ${statusColor}` }} />
        <span style={{ fontSize:11, fontWeight:700, color:statusColor }}>{statusLabel}</span>
      </div>
      {/* Clock */}
      <div style={{ fontSize:13, fontWeight:700, color:"var(--text-main)", fontVariantNumeric:"tabular-nums", minWidth:68, textAlign:"center" }}>{hhmm}</div>
      {/* User */}
      <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.05)", borderRadius:20, padding:"5px 12px" }}>
        <div style={{ width:26, height:26, borderRadius:"50%", background:"linear-gradient(135deg,var(--accent),var(--accent-dk))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#1a0f00" }}>
          {currentUser.name?.[0]?.toUpperCase() || "U"}
        </div>
        <span style={{ fontSize:12, fontWeight:600 }}>{currentUser.name}</span>
        <span style={{ fontSize:10, color:"var(--text-dim)" }}>({currentUser.role})</span>
      </div>
      <button className="btn-sm" onClick={doLogout} style={{ borderRadius:20 }}>ចេញ</button>
    </div>
  );
}

function POSPage({ cats, prods, ings, recipes, options, tables, setTables, orders, setOrders, logs, setLogs, notify, setIngs, currentUser }) {
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
          ingredient: c.ing.ingredient_name,
          before: fmtN(c.ing.current_stock),
          deducted: fmtN(c.need),
          after: fmtN(c.ing.current_stock - c.need),
          unit: c.ing.unit,
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
    };
    setOrders(p => [rec, ...p]);
    setReceipt(rec);
    setCart([]);
    setSelTable(null);
    setTxRunning(false);
    notify("✅ ការទូទាត់ជោគជ័យ!");

    // 📲 Send Telegram notification (await + log result)
    sendTelegram(rec).then(() => {
      console.log('[Telegram] Notification sent for order:', rec.order_id);
    }).catch(e => {
      console.error('[Telegram] Failed to send:', e.message);
    });
  };

  return (
    <div className="pos-layout" style={{ flex: 1, minHeight: 0 }}>
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
        <div style={{ padding: "12px 14px 8px", background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
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
                <div style={{ fontSize: 12, fontWeight: 600, color: "#E8E3DB", lineHeight: 1.3 }}>{p.product_name}</div>
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
        background: "var(--bg-card)", borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column", overflow: "hidden"
      }}>
        {/* Mobile cart header with close btn */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 12px 6px", borderBottom: "1px solid var(--border)"
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
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", padding: "8px 12px", borderBottom: "1px solid #1A181B" }}>
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
            <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: "1px solid #1A181B" }}>
              {item.image_url
                ? <img src={item.image_url} alt={item.product_name} style={{ width: 32, height: 32, borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />
                : <div style={{ fontSize: 22, flexShrink: 0 }}>{item.emoji}</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#E8E3DB", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.product_name}</div>
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
function TablesPage({ tables, setTables }) {
  const statuses = ["free","occupied","reserved","cleaning"];
  const statusLabel = { free:"ទំ", occupied:"កំពុង​ប្រើ", reserved:"បាន​RA", cleaning:"សំអាត" };
  const statusColor = { free:"#27AE60", occupied:"#E74C3C", reserved:"#F39C12", cleaning:"#3498DB" };

  function cycleStatus(tid) {
    setTables(prev => prev.map(t => t.table_id === tid
      ? { ...t, status: statuses[(statuses.indexOf(t.status)+1) % statuses.length] }
      : t
    ));
  }

  return (
    <div>
      <h2 style={{ marginBottom:16 }}>🪑 ស្ថានភាព​តុ</h2>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:12, maxWidth:700 }}>
        {tables.map(t => (
          <div key={t.table_id} className="table-card" style={{ borderColor: statusColor[t.status] || "#666" }} onClick={()=>cycleStatus(t.table_id)}>
            <div style={{ fontSize:32 }}>🪑</div>
            <div style={{ fontWeight:700 }}>តុ {t.table_id}</div>
            <div style={{ fontSize:11, color: statusColor[t.status], fontWeight:600 }}>{statusLabel[t.status] || t.status}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:12, display:"flex", gap:10, flexWrap:"wrap" }}>
        {statuses.map(s => (
          <div key={s} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12 }}>
            <div style={{ width:10, height:10, borderRadius:"50%", background: statusColor[s] }} />
            {statusLabel[s]}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MENU PAGE
// ═══════════════════════════════════════════════════════════════════
function MenuPage({ cats, setCats, prods, setProds, options, setOptions }) {
  const [tab, setTab]       = useState("products");
  const [editProd, setEditProd] = useState(null);
  const [editCat,  setEditCat]  = useState(null);
  const [editOpt,  setEditOpt]  = useState(null);

  // ── Categories ──
  const saveCat = (cat) => {
    setCats(prev => cat.category_id
      ? prev.map(c => c.category_id === cat.category_id ? cat : c)
      : [...prev, { ...cat, category_id: Date.now() }]
    );
    setEditCat(null);
  };
  const delCat = (id) => { if (confirm("លុប?")) setCats(prev => prev.filter(c => c.category_id !== id)); };

  // ── Products ──
  const saveProd = (p) => {
    setProds(prev => p.product_id
      ? prev.map(x => x.product_id === p.product_id ? p : x)
      : [...prev, { ...p, product_id: Date.now(), is_active: true }]
    );
    setEditProd(null);
  };
  const delProd = (id) => { if (confirm("លុប?")) setProds(prev => prev.filter(p => p.product_id !== id)); };
  const toggleProd = (id) => setProds(prev => prev.map(p => p.product_id === id ? { ...p, is_active: !p.is_active } : p));

  // ── Options ──
  const saveOpt = (o) => {
    setOptions(prev => o.option_id
      ? prev.map(x => x.option_id === o.option_id ? o : x)
      : [...prev, { ...o, option_id: Date.now() }]
    );
    setEditOpt(null);
  };
  const delOpt = (id) => { if (confirm("លុប?")) setOptions(prev => prev.filter(o => o.option_id !== id)); };

  return (
    <div>
      <h2 style={{ marginBottom:12 }}>📋 ការ​គ្រប់​គ្រង​ម៉ឺនុយ</h2>
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {["products","categories","options"].map(t => (
          <button key={t} className={"nav-btn" + (tab===t?" active":"")} onClick={()=>setTab(t)}>
            {t==="products"?"🥤 ផលិតផល":t==="categories"?"🏷 ប្រភេទ":"⚙️ Options"}
          </button>
        ))}
      </div>

      {tab === "categories" && (
        <div>
          <button className="btn-primary" style={{ marginBottom:12 }} onClick={()=>setEditCat({ category_name:"", emoji:"☕" })}>+ បន្ថែម​ប្រភេទ</button>
          <div style={{ display:"flex", flexDirection:"column", gap:8, maxWidth:500 }}>
            {cats.map(c => (
              <div key={c.category_id} style={{ display:"flex", alignItems:"center", gap:10, background:"var(--bg-card)", borderRadius:10, padding:"10px 14px", border:"1px solid var(--border-col)" }}>
                <span style={{ fontSize:24 }}>{c.emoji}</span>
                <span style={{ flex:1, fontWeight:600 }}>{c.category_name}</span>
                <button className="btn-sm" onClick={()=>setEditCat(c)}>✏️</button>
                <button className="btn-sm" style={{ color:"#ff6b6b" }} onClick={()=>delCat(c.category_id)}>🗑</button>
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

      {tab === "products" && (
        <div>
          <button className="btn-primary" style={{ marginBottom:12 }} onClick={()=>setEditProd({ product_name:"", base_price:0, category_id: cats[0]?.category_id, emoji:"☕" })}>+ បន្ថែម​ផលិតផល</button>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {prods.map(p => (
              <div key={p.product_id} style={{ display:"flex", alignItems:"center", gap:10, background:"var(--bg-card)", borderRadius:10, padding:"10px 14px", border:"1px solid var(--border-col)", opacity: p.is_active===false ? 0.5 : 1 }}>
                {p.image_url
                  ? <img src={p.image_url} alt="" style={{ width:40, height:40, objectFit:"cover", borderRadius:6, flexShrink:0 }} />
                  : <span style={{ fontSize:24 }}>{p.emoji}</span>
                }
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600 }}>{p.product_name}</div>
                  <div style={{ fontSize:12, color:"var(--text-dim)" }}>{cats.find(c=>c.category_id===p.category_id)?.category_name} — {fmt(p.base_price)}</div>
                </div>
                <button className="btn-sm" onClick={()=>toggleProd(p.product_id)}>{p.is_active===false?"▶":"⏸"}</button>
                <button className="btn-sm" onClick={()=>setEditProd(p)}>✏️</button>
                <button className="btn-sm" style={{ color:"#ff6b6b" }} onClick={()=>delProd(p.product_id)}>🗑</button>
              </div>
            ))}
          </div>
          {editProd && (
            <Modal title={editProd.product_id?"កែ​ផលិតផល":"ផលិតផល​ថ្មី"} onClose={()=>setEditProd(null)}>
              <ProdForm prod={editProd} cats={cats} onSave={saveProd} />
            </Modal>
          )}
        </div>
      )}

      {tab === "options" && (
        <div>
          <button className="btn-primary" style={{ marginBottom:12 }} onClick={()=>setEditOpt({ option_name:"", option_group:"size", additional_price:0, product_id: null })}>+ បន្ថែម Option</button>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {options.map(o => (
              <div key={o.option_id} style={{ display:"flex", alignItems:"center", gap:10, background:"var(--bg-card)", borderRadius:10, padding:"10px 14px", border:"1px solid var(--border-col)" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600 }}>{o.option_name} <span style={{ fontSize:11, color:"var(--text-dim)" }}>[{o.option_group}]</span></div>
                  <div style={{ fontSize:12, color:"var(--text-dim)" }}>
                    {o.product_id ? "ផលិតផល: " + (prods.find(p=>p.product_id===o.product_id)?.product_name || o.product_id) : "ទាំងអស់"}
                    {o.additional_price ? " +"+fmt(o.additional_price) : ""}
                  </div>
                </div>
                <button className="btn-sm" onClick={()=>setEditOpt(o)}>✏️</button>
                <button className="btn-sm" style={{ color:"#ff6b6b" }} onClick={()=>delOpt(o.option_id)}>🗑</button>
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
    </div>
  );
}

function CatForm({ cat, onSave }) {
  const [v, setV] = useState(cat);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <input className="inp" placeholder="ឈ្មោះ​ប្រភេទ" value={v.category_name} onChange={e=>setV({...v,category_name:e.target.value})} />
      <input className="inp" placeholder="Emoji" value={v.emoji} onChange={e=>setV({...v,emoji:e.target.value})} />
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
      <input className="inp" placeholder="Emoji (backup)" value={v.emoji||""} onChange={e=>setV({...v,emoji:e.target.value})} />
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
//  INVENTORY PAGE
// ═══════════════════════════════════════════════════════════════════
function InventoryPage({ ings, setIngs, prods, recipes, setRecipes }) {
  const [editIng,  setEditIng]  = useState(null);
  const [editRec,  setEditRec]  = useState(null);
  const [tab, setTab] = useState("stock");

  const saveIng = (ing) => {
    setIngs(prev => ing.ingredient_id
      ? prev.map(i => i.ingredient_id === ing.ingredient_id ? ing : i)
      : [...prev, { ...ing, ingredient_id: Date.now() }]
    );
    setEditIng(null);
  };
  const delIng = (id) => { if (confirm("លុប?")) setIngs(prev => prev.filter(i => i.ingredient_id !== id)); };

  const saveRec = (r) => {
    setRecipes(prev => r.recipe_id
      ? prev.map(x => x.recipe_id === r.recipe_id ? r : x)
      : [...prev, { ...r, recipe_id: Date.now() }]
    );
    setEditRec(null);
  };
  const delRec = (id) => { if (confirm("លុប?")) setRecipes(prev => prev.filter(r => r.recipe_id !== id)); };

  return (
    <div>
      <h2 style={{ marginBottom:12 }}>📦 ការ​គ្រប់​គ្រង​ស្តុក</h2>
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        <button className={"nav-btn"+(tab==="stock"?" active":"")} onClick={()=>setTab("stock")}>🧪 ស្តុក</button>
        <button className={"nav-btn"+(tab==="recipe"?" active":"")} onClick={()=>setTab("recipe")}>📋 រូបមន្ត</button>
      </div>

      {tab === "stock" && (
        <div>
          <button className="btn-primary" style={{ marginBottom:12 }} onClick={()=>setEditIng({ ingredient_name:"", current_stock:0, unit:"g", threshold:0 })}>+ បន្ថែម​គ្រឿង</button>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {ings.map(i => {
              const low = i.current_stock <= i.threshold;
              return (
                <div key={i.ingredient_id} style={{ display:"flex", alignItems:"center", gap:10, background:"var(--bg-card)", borderRadius:10, padding:"10px 14px", border:`1px solid ${low?"#E74C3C":"var(--border-col)"}` }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600 }}>{i.ingredient_name} {low && "⚠️"}</div>
                    <div style={{ fontSize:12, color: low?"#E74C3C":"var(--text-dim)" }}>
                      {i.current_stock} {i.unit} / min: {i.threshold} {i.unit}
                    </div>
                  </div>
                  <button className="btn-sm" onClick={()=>setEditIng(i)}>✏️</button>
                  <button className="btn-sm" style={{ color:"#ff6b6b" }} onClick={()=>delIng(i.ingredient_id)}>🗑</button>
                </div>
              );
            })}
          </div>
          {editIng && (
            <Modal title={editIng.ingredient_id?"កែ​គ្រឿង":"គ្រឿង​ថ្មី"} onClose={()=>setEditIng(null)}>
              <IngForm ing={editIng} onSave={saveIng} />
            </Modal>
          )}
        </div>
      )}

      {tab === "recipe" && (
        <div>
          <button className="btn-primary" style={{ marginBottom:12 }} onClick={()=>setEditRec({ product_id:"", ingredient_id:"", quantity:0, unit:"g" })}>+ បន្ថែម​រូបមន្ត</button>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {recipes.map(r => (
              <div key={r.recipe_id} style={{ display:"flex", alignItems:"center", gap:10, background:"var(--bg-card)", borderRadius:10, padding:"10px 14px", border:"1px solid var(--border-col)" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600 }}>{prods.find(p=>p.product_id===r.product_id)?.product_name || r.product_id}</div>
                  <div style={{ fontSize:12, color:"var(--text-dim)" }}>
                    {ings.find(i=>i.ingredient_id===r.ingredient_id)?.ingredient_name || r.ingredient_id} — {r.quantity} {r.unit}
                  </div>
                </div>
                <button className="btn-sm" onClick={()=>setEditRec(r)}>✏️</button>
                <button className="btn-sm" style={{ color:"#ff6b6b" }} onClick={()=>delRec(r.recipe_id)}>🗑</button>
              </div>
            ))}
          </div>
          {editRec && (
            <Modal title={editRec.recipe_id?"កែ​រូបមន្ត":"រូបមន្ត​ថ្មី"} onClose={()=>setEditRec(null)}>
              <RecipeForm rec={editRec} prods={prods} ings={ings} onSave={saveRec} />
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}

function IngForm({ ing, onSave }) {
  const [v, setV] = useState(ing);
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
      <button className="btn-primary" onClick={()=>onSave(v)}>💾 រក្សា​ទុក</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ORDERS PAGE
// ═══════════════════════════════════════════════════════════════════
function OrdersPage({ orders, currentUser }) {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("today");

  const today = new Date().toISOString().slice(0,10);

  const filtered = orders.filter(o => {
    const d = safeDate(o.created_at || o.order_id);
    if (dateFilter === "today"  && d !== today) return false;
    if (dateFilter === "month"  && safeMonth(o.created_at || o.order_id) !== today.slice(0,7)) return false;
    if (search && !JSON.stringify(o).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const total = filtered.reduce((s,o) => s + (o.total||0), 0);

  return (
    <div>
      <h2 style={{ marginBottom:12 }}>📜 ប្រវត្តិ​ការ​លក់</h2>
      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
        <input className="inp" placeholder="🔍 ស្វែងរក..." value={search} onChange={e=>setSearch(e.target.value)} />
        {["today","month","all"].map(f => (
          <button key={f} className={"nav-btn"+(dateFilter===f?" active":"")} onClick={()=>setDateFilter(f)}>
            {f==="today"?"ថ្ងៃ​នេះ":f==="month"?"ខែ​នេះ":"ទាំង​អស់"}
          </button>
        ))}
      </div>
      <div style={{ marginBottom:12, fontWeight:700, color:"var(--accent)" }}>
        {filtered.length} ការ​លក់ — សរុប: {fmt(total)}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {filtered.map(o => (
          <div key={o.order_id} style={{ background:"var(--bg-card)", borderRadius:10, padding:"12px 16px", border:"1px solid var(--border-col)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontWeight:700, color:"var(--accent)" }}>{fmt(o.total)}</span>
              <span style={{ fontSize:12, color:"var(--text-dim)" }}>{fmtDateTime(o.created_at)}</span>
            </div>
            <div style={{ fontSize:12, color:"var(--text-dim)" }}>
              Cashier: {o.cashier_name || o.cashier} · តុ: {o.table||"—"} · {o.method==="cash"?"💵":o.method==="qr"?"📱":"🏦"} {o.method}
            </div>
            <div style={{ fontSize:12, marginTop:4 }}>
              {(o.items||[]).map((i,idx)=>(
                <span key={idx} style={{ marginRight:8 }}>{i.qty}× {i.product_name}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  REPORT PAGE
// ═══════════════════════════════════════════════════════════════════
function ReportPage({ orders, prods, currentUser, branchId }) {
  const [period, setPeriod] = useState("today");
  const today = new Date().toISOString().slice(0,10);

  const filtered = orders.filter(o => {
    const d = safeDate(o.created_at || o.order_id);
    if (period === "today") return d === today;
    if (period === "month") return safeMonth(o.created_at || o.order_id) === today.slice(0,7);
    return true;
  });

  const revenue = filtered.reduce((s,o) => s + (o.subtotal||0), 0);
  const tax     = filtered.reduce((s,o) => s + (o.tax||0), 0);
  const total   = filtered.reduce((s,o) => s + (o.total||0), 0);
  const count   = filtered.length;

  // Sales by product
  const byProd = {};
  filtered.forEach(o => (o.items||[]).forEach(i => {
    if (!byProd[i.product_name]) byProd[i.product_name] = { qty:0, revenue:0 };
    byProd[i.product_name].qty     += i.qty;
    byProd[i.product_name].revenue += i.price * i.qty;
  }));
  const prodRanking = Object.entries(byProd).sort((a,b)=>b[1].revenue-a[1].revenue);

  // Sales by method
  const byMethod = {};
  filtered.forEach(o => {
    byMethod[o.method||"cash"] = (byMethod[o.method||"cash"]||0) + (o.total||0);
  });

  // ── Export CSV ─────────────────────────────────────
  function exportCSV() {
    const periodLabel = period==="today"?today:period==="month"?today.slice(0,7):"all";
    const rows = [
      ["Order ID","Date","Time","Cashier","Table","Method","Items","Subtotal","VAT","Total"],
      ...filtered.map(o => [
        String(o.order_id).slice(-8),
        safeDate(o.created_at||o.order_id),
        fmtTime(o.created_at||o.order_id),
        o.cashier_name||o.cashier||"",
        o.table||"",
        o.method||"cash",
        (o.items||[]).map(i=>`${i.qty}x${i.product_name}`).join(" | "),
        Number(o.subtotal||0).toFixed(2),
        Number(o.tax||0).toFixed(2),
        Number(o.total||0).toFixed(2),
      ])
    ];
    // Summary rows
    rows.push([]);
    rows.push(["SUMMARY"]);
    rows.push(["Period", periodLabel]);
    rows.push(["Total Orders", count]);
    rows.push(["Revenue (excl.VAT)", revenue.toFixed(2)]);
    rows.push(["VAT 10%", tax.toFixed(2)]);
    rows.push(["Grand Total", total.toFixed(2)]);
    rows.push([]);
    rows.push(["TOP PRODUCTS"]);
    prodRanking.forEach(([name,d],i) => rows.push([i+1, name, d.qty+" ដង", d.revenue.toFixed(2)]));

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const bom = "﻿"; // UTF-8 BOM for Khmer text in Excel
    const blob = new Blob([bom+csv], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `report_${BRANCH_NAME}_${periodLabel}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Print / PDF ─────────────────────────────────────
  function printReport() {
    const periodLabel = period==="today"?"ថ្ងៃ​នេះ":period==="month"?"ខែ​នេះ":"ទាំង​អស់";
    const topProds = prodRanking.slice(0,10).map(([name,d],i)=>
      `<tr><td>${i+1}</td><td>${name}</td><td style="text-align:right">${d.qty}ដង</td><td style="text-align:right">$${d.revenue.toFixed(2)}</td></tr>`
    ).join("");
    const methodRows = Object.entries(byMethod).map(([m,v])=>
      `<tr><td>${m==="cash"?"💵 សាច់ប្រាក់":m==="qr"?"📱 QR":"🏦 ប្រាក់​គណនី"}</td><td style="text-align:right">$${v.toFixed(2)}</td></tr>`
    ).join("");
    const orderRows = filtered.slice(0,50).map(o=>
      `<tr><td>${safeDate(o.created_at||o.order_id)}</td><td>${fmtTime(o.created_at||o.order_id)}</td><td>${o.cashier_name||o.cashier||""}</td><td>${o.table||"—"}</td><td>${o.method||"cash"}</td><td style="text-align:right">$${Number(o.total||0).toFixed(2)}</td></tr>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;700&display=swap');
      body{font-family:'Noto Sans Khmer',sans-serif;color:#111;padding:24px;max-width:800px;margin:0 auto}
      h1{font-size:20px;margin-bottom:4px}
      .meta{color:#666;font-size:12px;margin-bottom:20px}
      .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
      .kpi div{border:1px solid #ddd;border-radius:8px;padding:10px 14px}
      .kpi .val{font-size:20px;font-weight:700;color:#B8732A}
      .kpi .lbl{font-size:11px;color:#888}
      table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px}
      th{background:#f5f5f5;padding:7px 10px;text-align:left;border-bottom:2px solid #ddd}
      td{padding:6px 10px;border-bottom:1px solid #eee}
      tr:nth-child(even){background:#fafafa}
      .section-title{font-size:14px;font-weight:700;margin:18px 0 8px;border-left:3px solid #E8A84B;padding-left:8px}
      @media print{body{padding:12px}.no-print{display:none}}
    </style></head><body>
    <h1>📊 របាយការណ៍ — ${BRANCH_NAME}</h1>
    <div class="meta">រយៈ​ពេល: ${periodLabel} · បោះ​ពុម្ព: ${new Date().toLocaleString("km-KH")}</div>
    <div class="kpi">
      <div><div class="lbl">ការ​លក់</div><div class="val">${count} ដង</div></div>
      <div><div class="lbl">រាយ (excl.VAT)</div><div class="val">$${revenue.toFixed(2)}</div></div>
      <div><div class="lbl">VAT 10%</div><div class="val">$${tax.toFixed(2)}</div></div>
      <div><div class="lbl">សរុប​រួម</div><div class="val">$${total.toFixed(2)}</div></div>
    </div>
    <div class="section-title">🏆 ផលិតផល​លក់​ដាច់</div>
    <table><thead><tr><th>#</th><th>ឈ្មោះ</th><th>ចំនួន</th><th>ចំណូល</th></tr></thead><tbody>${topProds}</tbody></table>
    <div class="section-title">💳 វិធី​បង់​ប្រាក់</div>
    <table><thead><tr><th>វិធី</th><th>សរុប</th></tr></thead><tbody>${methodRows}</tbody></table>
    <div class="section-title">📋 បញ្ជី​ការ​លក់ (${Math.min(filtered.length,50)} / ${filtered.length})</div>
    <table><thead><tr><th>ថ្ងៃ</th><th>ម៉ោង</th><th>Cashier</th><th>តុ</th><th>វិធី</th><th>សរុប</th></tr></thead><tbody>${orderRows}</tbody></table>
    <script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("","_blank","width=900,height=700");
    w.document.write(html); w.document.close();
  }

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
        <h2 style={{ margin:0 }}>📊 របាយការណ៍</h2>
        <div style={{ flex:1 }} />
        <button className="btn-sm" onClick={exportCSV} style={{ background:"#1a3a1a", color:"#80ff80", borderColor:"#27AE60" }}>
          📥 CSV
        </button>
        <button className="btn-sm" onClick={printReport} style={{ background:"#1a2a3a", color:"#80b0ff", borderColor:"#3498DB" }}>
          🖨️ PDF / Print
        </button>
      </div>
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {["today","month","all"].map(p=>(
          <button key={p} className={"nav-btn"+(period===p?" active":"")} onClick={()=>setPeriod(p)}>
            {p==="today"?"ថ្ងៃ​នេះ":p==="month"?"ខែ​នេះ":"ទាំង​អស់"}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:12, marginBottom:20 }}>
        {[
          { label:"ការ​លក់", val:count+" ដង", color:"#3498DB" },
          { label:"រាយ​(excl.VAT)", val:fmt(revenue), color:"#27AE60" },
          { label:"VAT 10%", val:fmt(tax), color:"#F39C12" },
          { label:"សរុប​រួម", val:fmt(total), color:"var(--accent)" },
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)", borderRadius:12, padding:"14px 16px", border:`1px solid ${k.color}` }}>
            <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>{k.label}</div>
            <div style={{ fontWeight:700, fontSize:18, color:k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Top products */}
      <div style={{ background:"var(--bg-card)", borderRadius:12, padding:16, border:"1px solid var(--border-col)", marginBottom:16 }}>
        <div style={{ fontWeight:700, marginBottom:10 }}>🏆 ផលិតផល​លក់​ដាច់</div>
        {prodRanking.slice(0,10).map(([name,d],i) => (
          <div key={name} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <span style={{ width:20, color:"var(--text-dim)", fontSize:12 }}>{i+1}.</span>
            <span style={{ flex:1, fontSize:13 }}>{name}</span>
            <span style={{ fontSize:12, color:"var(--text-dim)" }}>{d.qty}ដង</span>
            <span style={{ fontWeight:700, color:"var(--accent)" }}>{fmt(d.revenue)}</span>
          </div>
        ))}
        {!prodRanking.length && <div style={{ color:"var(--text-dim)", fontSize:13 }}>មិន​ទាន់​មាន​ទិន្នន័យ</div>}
      </div>

      {/* By payment method */}
      <div style={{ background:"var(--bg-card)", borderRadius:12, padding:16, border:"1px solid var(--border-col)" }}>
        <div style={{ fontWeight:700, marginBottom:10 }}>💳 ការ​បង់​ប្រាក់</div>
        {Object.entries(byMethod).map(([m,v])=>(
          <div key={m} style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13 }}>
            <span>{m==="cash"?"💵 សាច់ប្រាក់":m==="qr"?"📱 QR":"🏦 ប្រាក់​គណនី"}</span>
            <span style={{ fontWeight:700, color:"var(--accent)" }}>{fmt(v)}</span>
          </div>
        ))}
        {!Object.keys(byMethod).length && <div style={{ color:"var(--text-dim)", fontSize:13 }}>មិន​ទាន់​មាន​ទិន្នន័យ</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  FINANCE PAGE
// ═══════════════════════════════════════════════════════════════════
function FinancePage({ orders, expenses, setExpenses }) {
  const [editExp, setEditExp] = useState(null);
  const today = new Date().toISOString().slice(0,10);

  const monthOrders   = orders.filter(o => safeMonth(o.created_at || o.order_id) === today.slice(0,7));
  const monthExpenses = expenses.filter(e => safeMonth(e.created_at) === today.slice(0,7));

  const revenue  = monthOrders.reduce((s,o) => s + (o.subtotal||0), 0);
  const expTotal = monthExpenses.reduce((s,e) => s + (e.amount||0), 0);
  const profit   = revenue - expTotal;

  const saveExp = (e) => {
    setExpenses(prev => e.expense_id
      ? prev.map(x => x.expense_id === e.expense_id ? e : x)
      : [...prev, { ...e, expense_id: uid(), created_at: now() }]
    );
    setEditExp(null);
  };
  const delExp = (id) => { if (confirm("លុប?")) setExpenses(prev => prev.filter(e => e.expense_id !== id)); };

  return (
    <div>
      <h2 style={{ marginBottom:12 }}>💰 ហិរញ្ញវត្ថុ — ខែ​នេះ</h2>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:12, marginBottom:20 }}>
        {[
          { label:"ចំណូល​(excl.VAT)", val:fmt(revenue), color:"#27AE60" },
          { label:"ចំណាយ", val:fmt(expTotal), color:"#E74C3C" },
          { label:"ចំណេញ", val:fmt(profit), color: profit>=0?"var(--accent)":"#E74C3C" },
        ].map(k=>(
          <div key={k.label} style={{ background:"var(--bg-card)", borderRadius:12, padding:"14px 16px", border:`1px solid ${k.color}` }}>
            <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>{k.label}</div>
            <div style={{ fontWeight:700, fontSize:18, color:k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontWeight:700 }}>📝 ចំណាយ</div>
        <button className="btn-primary" onClick={()=>setEditExp({ category:"", note:"", amount:0 })}>+ បន្ថែម</button>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {monthExpenses.map(e=>(
          <div key={e.expense_id} style={{ display:"flex", alignItems:"center", gap:10, background:"var(--bg-card)", borderRadius:10, padding:"10px 14px", border:"1px solid var(--border-col)" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600 }}>{e.category} — {fmt(e.amount)}</div>
              <div style={{ fontSize:12, color:"var(--text-dim)" }}>{e.note} · {fmtDate(e.created_at)}</div>
            </div>
            <button className="btn-sm" onClick={()=>setEditExp(e)}>✏️</button>
            <button className="btn-sm" style={{ color:"#ff6b6b" }} onClick={()=>delExp(e.expense_id)}>🗑</button>
          </div>
        ))}
        {!monthExpenses.length && <div style={{ color:"var(--text-dim)", fontSize:13 }}>មិន​ទាន់​មាន​ចំណាយ</div>}
      </div>

      {editExp && (
        <Modal title={editExp.expense_id?"កែ​ចំណាយ":"ចំណាយ​ថ្មី"} onClose={()=>setEditExp(null)}>
          <ExpenseForm exp={editExp} onSave={saveExp} />
        </Modal>
      )}
    </div>
  );
}

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
function UsersPage({ users, setUsers, currentUser }) {
  const [editUser, setEditUser] = useState(null);
  const [changePw, setChangePw] = useState(null);

  const saveUser = (u) => {
    if (!u.username) return alert("ត្រូវ​ការ Username!");
    setUsers(prev => u.user_id
      ? prev.map(x => x.user_id === u.user_id ? { ...x, ...u } : x)
      : [...prev, { ...u, user_id: Date.now(), active:true }]
    );
    setEditUser(null);
  };
  const toggleUser = (id) => setUsers(prev => prev.map(u => u.user_id === id ? { ...u, active:!u.active } : u));
  const delUser = (id) => { if (id === currentUser.user_id) return alert("មិន​អាច​លុប​ខ្លួន​ឯង!"); if (confirm("លុប?")) setUsers(prev => prev.filter(u => u.user_id !== id)); };

  const PAGES = ["pos","tables","menu","inventory","orders","report","finance"];

  return (
    <div>
      <h2 style={{ marginBottom:12 }}>👥 ការ​គ្រប់​គ្រង​អ្នក​ប្រើ</h2>
      <button className="btn-primary" style={{ marginBottom:12 }} onClick={()=>setEditUser({ username:"", name:"", role:"staff", branch_id:"branch_1", password:"", permissions:{} })}>+ បន្ថែម​អ្នក​ប្រើ</button>

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {users.map(u => (
          <div key={u.user_id} style={{ background:"var(--bg-card)", borderRadius:12, padding:"12px 16px", border:"1px solid var(--border-col)", opacity:u.active===false?.5:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700 }}>{u.name} <span style={{ fontSize:11, background: u.role==="admin"?"#5c1a1a":"#1a3a1a", color: u.role==="admin"?"#ff8080":"#80ff80", padding:"2px 6px", borderRadius:4 }}>{u.role}</span></div>
                <div style={{ fontSize:12, color:"var(--text-dim)" }}>@{u.username} · {u.branch_id}</div>
              </div>
              <button className="btn-sm" onClick={()=>toggleUser(u.user_id)}>{u.active===false?"▶":"⏸"}</button>
              <button className="btn-sm" onClick={()=>setEditUser(u)}>✏️</button>
              <button className="btn-sm" style={{ color:"#ff6b6b" }} onClick={()=>delUser(u.user_id)}>🗑</button>
            </div>
            {u.role !== "admin" && (
              <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                {PAGES.map(p => (
                  <button key={p}
                    style={{ fontSize:10, padding:"2px 6px", borderRadius:4, border:"1px solid var(--border-col)", background: u.permissions?.[p]?"var(--accent)":"var(--bg-main)", color: u.permissions?.[p]?"#000":"var(--text-dim)", cursor:"pointer" }}
                    onClick={()=>setUsers(prev=>prev.map(x=>x.user_id===u.user_id?{...x,permissions:{...x.permissions,[p]:!x.permissions?.[p]}}:x))}
                  >{p}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {editUser && (
        <Modal title={editUser.user_id?"កែ​អ្នក​ប្រើ":"អ្នក​ប្រើ​ថ្មី"} onClose={()=>setEditUser(null)}>
          <UserForm user={editUser} onSave={saveUser} />
        </Modal>
      )}
    </div>
  );
}

function UserForm({ user, onSave }) {
  const [v, setV] = useState(user);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <input className="inp" placeholder="ឈ្មោះ​ពេញ" value={v.name||""} onChange={e=>setV({...v,name:e.target.value})} />
      <input className="inp" placeholder="Username" value={v.username||""} onChange={e=>setV({...v,username:e.target.value})} />
      {!v.user_id && <input className="inp" type="password" placeholder="Password" value={v.password||""} onChange={e=>setV({...v,password:e.target.value})} />}
      <select className="inp" value={v.role||"staff"} onChange={e=>setV({...v,role:e.target.value})}>
        <option value="staff">Staff</option>
        <option value="admin">Admin</option>
      </select>
      <input className="inp" placeholder="Branch ID (branch_1)" value={v.branch_id||""} onChange={e=>setV({...v,branch_id:e.target.value})} />
      <button className="btn-primary" onClick={()=>onSave(v)}>💾 រក្សា​ទុក</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  THEME PAGE
// ═══════════════════════════════════════════════════════════════════
function ThemePage({ theme, setTheme }) {
  const [v, setV] = useState(theme);

  const presets = [
    { name:"Dark Gold (Default)", bgMain:"#09080A", bgCard:"#120F13", bgHeader:"#0E0C0F", accent:"#E8A84B", accentDark:"#B8732A", textMain:"#EDE8E1", textDim:"#666666", borderCol:"#1E1B1F" },
    { name:"Dark Blue", bgMain:"#0A0D1A", bgCard:"#0F1525", bgHeader:"#0C1020", accent:"#4A9EFF", accentDark:"#2A7EDF", textMain:"#E0E8FF", textDim:"#556688", borderCol:"#1A2035" },
    { name:"Dark Green", bgMain:"#061208", bgCard:"#0A1F0D", bgHeader:"#081510", accent:"#4AE84B", accentDark:"#2AC82A", textMain:"#E0FFE0", textDim:"#446644", borderCol:"#102015" },
    { name:"Purple Night", bgMain:"#0D0A1A", bgCard:"#150F25", bgHeader:"#100C20", accent:"#A855F7", accentDark:"#7E22CE", textMain:"#EDE0FF", textDim:"#665588", borderCol:"#1D1535" },
  ];

  const fields = [
    { k:"bgMain", label:"배경 (Main BG)" },
    { k:"bgCard", label:"Card BG" },
    { k:"bgHeader", label:"Header BG" },
    { k:"accent", label:"Accent Color" },
    { k:"accentDark", label:"Accent Dark" },
    { k:"textMain", label:"Text Main" },
    { k:"textDim", label:"Text Dim" },
    { k:"borderCol", label:"Border" },
  ];

  return (
    <div style={{ maxWidth:600 }}>
      <h2 style={{ marginBottom:12 }}>🎨 រចនាប័ទ្ម</h2>

      <div style={{ marginBottom:16 }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Presets:</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {presets.map(p => (
            <button key={p.name}
              style={{ background:p.bgCard, color:p.textMain, border:`2px solid ${p.accent}`, borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12 }}
              onClick={()=>{ const {name,...rest}=p; setV(rest); }}
            >{p.name}</button>
          ))}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
        {fields.map(f=>(
          <div key={f.k} style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <label style={{ fontSize:12, color:"var(--text-dim)" }}>{f.label}</label>
            <div style={{ display:"flex", gap:6 }}>
              <input type="color" value={v[f.k]||"#000000"} onChange={e=>setV({...v,[f.k]:e.target.value})} style={{ width:40, height:36, border:"none", background:"none", cursor:"pointer" }} />
              <input className="inp" style={{ flex:1, fontFamily:"monospace", fontSize:12 }} value={v[f.k]||""} onChange={e=>setV({...v,[f.k]:e.target.value})} />
            </div>
          </div>
        ))}
      </div>

      <button className="btn-primary" onClick={()=>setTheme(v)}>💾 អនុវត្ត​ & រក្សា​ទុក</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════
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
        background: "var(--bg-header)", borderBottom: "1px solid var(--border)",
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
            background: "#120F13", borderRadius: 16, overflow: "hidden", marginBottom: 20,
            border: "1px solid #1E1B1F"
          }}>
            {cart.map((item, idx) => (
              <div key={item.key} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                borderBottom: idx < cart.length - 1 ? "1px solid #1A181C" : "none"
              }}>
                {item.image_url
                  ? <img src={item.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{
                    width: 48, height: 48, borderRadius: 10, background: "#1E1B20",
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
            background: "#120F13", borderRadius: 16, padding: "18px 20px",
            border: "1px solid #1E1B1F", marginBottom: 24
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
            background: "#120F13", borderRadius: 16, padding: "16px 20px",
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
  <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`);
  win.document.close();
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
const CSS = `
  :root {
    --bg-main: #09080A; --bg-card: #120F13; --bg-header: #0E0C0F;
    --accent: #E8A84B; --accent-dk: #B8732A;
    --text-main: #EDE8E1; --text-dim: #666666; --border-col: #1E1B1F;
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
  .pos-layout {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 16px;
    max-width: 1400px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .pos-layout { grid-template-columns: 1fr; }
    .pos-cart {
      position: fixed !important;
      bottom: 0; left: 0; right: 0; z-index: 200;
      border-radius: 20px 20px 0 0 !important;
      max-height: 55vh; overflow-y: auto;
      top: auto !important;
    }
    .page-pad { padding: 8px 8px 200px !important; }
  }
  @media (max-width: 640px) {
    .nav-tab { padding: 8px 10px !important; font-size: 12px !important; }
    .nav-label { display: none; }
  }
  @media (max-width: 480px) {
    .prod-card { padding: 8px !important; }
  }
  @media print {
    .no-print { display: none !important; }
    body { background: #fff !important; color: #000 !important; }
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
`;

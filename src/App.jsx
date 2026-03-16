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

async function sendTelegram(msg) {
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text: msg, parse_mode: "HTML" }),
    });
  } catch {}
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

// ── Utilities ─────────────────────────────────────────────────────
const fmt  = (n) => "$" + Number(n || 0).toFixed(2);
const now  = ()  => new Date().toISOString();
const uid  = ()  => Date.now() + "_" + Math.random().toString(36).slice(2, 6);
const TAX  = 0.10;

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

      {/* ── TopBar ── */}
      <div style={{ background:"var(--bg-header)", borderBottom:"1px solid var(--border-col)", display:"flex", alignItems:"center", padding:"8px 16px", gap:12, position:"sticky", top:0, zIndex:100 }}>
        <span style={{ fontWeight:700, fontSize:16, color:"var(--accent)" }}>☕ {BRANCH_NAME}</span>
        <div style={{ flex:1 }} />

        {/* Socket / Offline indicator */}
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <div style={{
            width:7, height:7, borderRadius:"50%",
            background: socketOnline ? "#27AE60" : offline ? "#E74C3C" : "#F39C12",
            boxShadow:`0 0 6px ${socketOnline ? "#27AE60" : offline ? "#E74C3C" : "#F39C12"}`
          }} />
          <span style={{ fontSize:10, fontWeight:700, color: socketOnline ? "#27AE60" : offline ? "#E74C3C" : "#F39C12" }}>
            {socketOnline ? "Live" : offline ? "Offline" : "Connecting"}
          </span>
        </div>

        <span style={{ fontSize:12, color:"var(--text-dim)" }}>{currentUser.name} ({currentUser.role})</span>
        <button className="btn-sm" onClick={doLogout}>ចេញ</button>
      </div>

      {/* ── Nav tabs ── */}
      <div className="nav-tab-bar" style={{ display:"flex", gap:2, overflowX:"auto", background:"var(--bg-card)", borderBottom:"1px solid var(--border-col)", padding:"4px 8px" }}>
        {NAV.map(n => (
          <button key={n.id}
            className={"nav-btn" + (page === n.id ? " active" : "")}
            onClick={() => setPage(n.id)}
          >
            {n.emoji} {n.label}
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
function POSPage({ prods, cats, ings, recipes, options, orders, setOrders, logs, setLogs, setIngs, tables, theme, currentUser, branchId, branchName }) {
  const [cart,       setCart]       = useState([]);
  const [selCat,     setSelCat]     = useState(0);
  const [search,     setSearch]     = useState("");
  const [customize,  setCustomize]  = useState(null);
  const [payModal,   setPayModal]   = useState(false);
  const [payMethod,  setPayMethod]  = useState("cash");
  const [tableNum,   setTableNum]   = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const filtered = prods.filter(p =>
    p.is_active !== false &&
    (selCat === 0 || p.category_id === selCat) &&
    (p.product_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const cartTotal   = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartTax     = cartTotal * TAX;
  const cartGrand   = cartTotal + cartTax;

  function addToCart(prod, opts = {}) {
    const price = prod.base_price + (opts.addPrice || 0);
    const key   = prod.product_id + JSON.stringify(opts);
    setCart(prev => {
      const ex = prev.find(i => i.key === key);
      if (ex) return prev.map(i => i.key === key ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { key, product_id: prod.product_id, product_name: prod.product_name, price, qty: 1, emoji: prod.emoji, opts }];
    });
  }

  function openCustomize(prod) {
    const prodOpts = options.filter(o => o.product_id === prod.product_id);
    if (!prodOpts.length) { addToCart(prod); return; }
    setCustomize({ prod, opts: prodOpts, sel: {} });
  }

  function confirmCustomize() {
    if (!customize) return;
    const { prod, sel } = customize;
    const addPrice = Object.values(sel).reduce((s, o) => s + (o?.additional_price || 0), 0);
    addToCart(prod, { ...sel, addPrice });
    setCustomize(null);
  }

  function removeFromCart(key) { setCart(prev => prev.filter(i => i.key !== key)); }
  function qtyChange(key, delta) {
    setCart(prev => prev.map(i => i.key === key ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0));
  }

  async function checkout() {
    if (!cart.length) return;
    const order = {
      order_id:    now(),
      branch_id:   branchId,
      cashier:     currentUser.username,
      cashier_name: currentUser.name,
      table:       tableNum,
      items:       cart,
      subtotal:    cartTotal,
      tax:         cartTax,
      total:       cartGrand,
      method:      payMethod,
      created_at:  now(),
    };

    // Deduct ingredients
    const newIngs = [...ings];
    for (const item of cart) {
      const rec = recipes.filter(r => r.product_id === item.product_id);
      for (const r of rec) {
        const ing = newIngs.find(i => i.ingredient_id === r.ingredient_id);
        if (ing) ing.current_stock = Math.max(0, (ing.current_stock || 0) - (r.quantity || 0) * item.qty);
      }
    }
    setIngs(newIngs);

    const newOrders = [order, ...orders];
    setOrders(newOrders);

    const log = { log_id: uid(), type:"order", ref: order.order_id, amount: cartGrand, note: `${cart.length} items`, created_at: now(), cashier: currentUser.username };
    setLogs([log, ...logs]);

    // Telegram
    const lines = cart.map(i => `  ${i.qty}x ${i.product_name} — ${fmt(i.price * i.qty)}`).join("\n");
    sendTelegram(`🧾 <b>ការបញ្ជាទិញថ្មី — ${branchName}</b>\nតុ: ${tableNum || "—"}\nCashier: ${currentUser.name}\n${lines}\n<b>សរុប: ${fmt(cartGrand)}</b>`);

    // Print
    try {
      await fetch(CLOUD_URL + "/api/print?branch=" + branchId, {
        method: "POST",
        headers: { "Content-Type":"application/json", "ngrok-skip-browser-warning":"true" },
        body: JSON.stringify({ receipt: { items: cart, total: cartTotal, tax: cartTax, method: payMethod, table: tableNum, ts: fmtDateTime(now()) } }),
      });
    } catch {}

    setCart([]);
    setTableNum("");
    setPayModal(false);
    setSuccessMsg(`✅ ការបញ្ជាទិញ ${fmt(cartGrand)} បានរក្សាទុក!`);
    setTimeout(() => setSuccessMsg(""), 3000);
  }

  return (
    <div className="pos-layout">
      {/* ── Products ── */}
      <div>
        {successMsg && <div style={{ background:"#1a3a1a", color:"#80ff80", borderRadius:8, padding:"10px 14px", marginBottom:12, fontWeight:700 }}>{successMsg}</div>}

        {/* Search + Category */}
        <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
          <input className="inp" style={{ flex:1, minWidth:160 }} placeholder="🔍 ស្វែងរក..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
          <button className={"cat-btn" + (selCat===0?" active":"")} onClick={()=>setSelCat(0)}>ទាំងអស់</button>
          {cats.map(c => (
            <button key={c.category_id} className={"cat-btn" + (selCat===c.category_id?" active":"")} onClick={()=>setSelCat(c.category_id)}>
              {c.emoji} {c.category_name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:10 }}>
          {filtered.map(p => (
            <div key={p.product_id} className="prod-card" onClick={()=>openCustomize(p)}>
              <div style={{ fontSize:36 }}>{p.emoji || "☕"}</div>
              <div style={{ fontSize:13, fontWeight:600, textAlign:"center", lineHeight:1.3 }}>{p.product_name}</div>
              <div style={{ color:"var(--accent)", fontWeight:700 }}>{fmt(p.base_price)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Cart ── */}
      <div className="pos-cart" style={{ background:"var(--bg-card)", borderRadius:12, border:"1px solid var(--border-col)", padding:16, display:"flex", flexDirection:"column", gap:10, height:"fit-content" }}>
        <div style={{ fontWeight:700, fontSize:16, color:"var(--accent)" }}>🛒  កញ្ចប់​ទិញ</div>
        <input className="inp" placeholder="លេខ​តុ..." value={tableNum} onChange={e=>setTableNum(e.target.value)} />

        {!cart.length && <div style={{ color:"var(--text-dim)", textAlign:"center", padding:24, fontSize:13 }}>មិន​ទាន់​មាន​ទំនិញ</div>}

        {cart.map(item => (
          <div key={item.key} style={{ display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid var(--border-col)", paddingBottom:8 }}>
            <span>{item.emoji || "☕"}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600 }}>{item.product_name}</div>
              {item.opts && Object.entries(item.opts).filter(([k])=>k!=="addPrice").map(([k,v])=>(
                <div key={k} style={{ fontSize:10, color:"var(--text-dim)" }}>{k}: {typeof v === "object" ? v?.option_name : v}</div>
              ))}
              <div style={{ fontSize:12, color:"var(--accent)" }}>{fmt(item.price)} × {item.qty} = {fmt(item.price*item.qty)}</div>
            </div>
            <div style={{ display:"flex", gap:4, alignItems:"center" }}>
              <button className="btn-sm" onClick={()=>qtyChange(item.key,-1)}>−</button>
              <button className="btn-sm" onClick={()=>qtyChange(item.key,+1)}>+</button>
              <button className="btn-sm" style={{ color:"#ff6b6b" }} onClick={()=>removeFromCart(item.key)}>✕</button>
            </div>
          </div>
        ))}

        {cart.length > 0 && (
          <>
            <div style={{ fontSize:13, color:"var(--text-dim)" }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}><span>សរុប:</span><span>{fmt(cartTotal)}</span></div>
              <div style={{ display:"flex", justifyContent:"space-between" }}><span>VAT 10%:</span><span>{fmt(cartTax)}</span></div>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontWeight:700, fontSize:16, color:"var(--accent)" }}>
              <span>សរុបរួម:</span><span>{fmt(cartGrand)}</span>
            </div>

            <div style={{ display:"flex", gap:6 }}>
              {["cash","qr","bank"].map(m => (
                <button key={m} className={"pay-btn" + (payMethod===m?" active":"")} onClick={()=>setPayMethod(m)}>
                  {m==="cash"?"💵 សាច់ប្រាក់":m==="qr"?"📱 QR":"🏦 ប្រាក់​គណនី"}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={checkout}>✅ Checkout</button>
            <button className="btn-sm" style={{ width:"100%" }} onClick={()=>setCart([])}>🗑 លុប​ទាំង​អស់</button>
          </>
        )}
      </div>

      {/* ── Customize Modal ── */}
      {customize && (
        <Modal title={`🛠 ${customize.prod.product_name}`} onClose={()=>setCustomize(null)}>
          {["size","sugar","milk","ice"].map(grp => {
            const grpOpts = customize.opts.filter(o => o.option_group === grp);
            if (!grpOpts.length) return null;
            const labels = { size:"ទំហំ", sugar:"ស្ករ", milk:"ទឹកដោះ", ice:"ទឹកកក" };
            return (
              <div key={grp} style={{ marginBottom:10 }}>
                <div style={{ fontWeight:700, marginBottom:6, fontSize:13 }}>{labels[grp] || grp}:</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {grpOpts.map(o => (
                    <button key={o.option_id}
                      className={"opt-btn" + (customize.sel[grp]?.option_id===o.option_id?" active":"")}
                      onClick={()=>setCustomize(prev=>({ ...prev, sel:{ ...prev.sel, [grp]:o } }))}
                    >
                      {o.option_name}{o.additional_price>0?` +${fmt(o.additional_price)}`:""}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <button className="btn-primary" style={{ marginTop:10 }} onClick={confirmCustomize}>បន្ថែម​ទៅ​កញ្ចប់</button>
        </Modal>
      )}
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
                <span style={{ fontSize:24 }}>{p.emoji}</span>
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
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <input className="inp" placeholder="ឈ្មោះ​ផលិតផល" value={v.product_name} onChange={e=>setV({...v,product_name:e.target.value})} />
      <input className="inp" type="number" placeholder="តំលៃ" value={v.base_price} onChange={e=>setV({...v,base_price:+e.target.value})} />
      <input className="inp" placeholder="Emoji" value={v.emoji||""} onChange={e=>setV({...v,emoji:e.target.value})} />
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

  return (
    <div>
      <h2 style={{ marginBottom:12 }}>📊 របាយការណ៍</h2>
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

  /* ── Responsive ── */
  .pos-layout {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 16px;
    max-width: 1400px;
  }
  @media (max-width: 900px) {
    .pos-layout {
      grid-template-columns: 1fr;
    }
    .pos-cart {
      position: fixed !important;
      bottom: 0; left: 0; right: 0;
      z-index: 200;
      border-radius: 20px 20px 0 0 !important;
      max-height: 50vh;
      overflow-y: auto;
    }
    .pos-cart-collapsed {
      max-height: 60px;
      overflow: hidden;
    }
    .page-pad { padding: 8px !important; }
  }
  @media (max-width: 600px) {
    .nav-tab-bar { gap: 0 !important; }
    .nav-btn { padding: 5px 8px !important; font-size: 11px !important; }
    .nav-btn .nav-label { display: none; }
    .nav-btn .nav-emoji { display: inline !important; }
    .topbar-name { display: none; }
    .topbar-role { display: none; }
  }
  @media (max-width: 480px) {
    .prod-card { padding: 10px 6px !important; }
  }
  @media print {
    .no-print { display: none !important; }
    body { background: #fff !important; color: #000 !important; }
  }
`;

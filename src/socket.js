// ═══════════════════════════════════════════════════════════════════
//  socket.js  —  Real-time client (Frontend)
//  FIX: dynamic import of socket.io-client → app won't crash if pkg missing
// ═══════════════════════════════════════════════════════════════════

let socket = null;
let _io    = null;
const listeners = new Map();

// ── Load socket.io-client dynamically (no crash if pkg missing) ───
async function getIo() {
  if (_io) return _io;
  try {
    const mod = await import("socket.io-client");
    _io = mod.io || mod.default;
    return _io;
  } catch (e) {
    console.error("[Socket.io] ❌ socket.io-client not installed. Run: npm i socket.io-client");
    return null;
  }
}

// ── Connect to server ─────────────────────────────────────────────
export async function initSocket(serverUrl, branchId) {
  if (socket && socket.connected) return socket;

  const io = await getIo();
  if (!io) {
    console.warn("[Socket.io] Running without real-time (socket.io-client unavailable).");
    return null;
  }

  socket = io(serverUrl, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
    timeout: 10000,
  });

  socket.on("connect", () => {
    console.log("[Socket.io] ✅ Connected:", socket.id);
    socket.emit("join_branch", branchId);
  });

  socket.on("disconnect", (reason) => {
    console.warn("[Socket.io] ⚠️ Disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    console.error("[Socket.io] ❌ Error:", err.message);
  });

  socket.on("reconnect", (attempt) => {
    console.log("[Socket.io] 🔄 Reconnected after", attempt, "attempts");
    socket.emit("join_branch", branchId);
  });

  ["db_update", "branch_update", "shared_update"].forEach(event => {
    socket.on(event, (data) => {
      const cbs = listeners.get(event);
      if (cbs) cbs.forEach(fn => fn(data));
    });
  });

  return socket;
}

// ── Subscribe to events ───────────────────────────────────────────
export function onDbUpdate(cb)     { return _on("db_update",     cb); }
export function onBranchUpdate(cb) { return _on("branch_update", cb); }
export function onSharedUpdate(cb) { return _on("shared_update", cb); }

function _on(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return () => listeners.get(event).delete(cb);
}

export function isConnected()  { return socket?.connected ?? false; }
export function getSocket()    { return socket; }

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
  listeners.clear();
}

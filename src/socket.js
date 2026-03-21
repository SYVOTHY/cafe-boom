// ═══════════════════════════════════════════════════════════════════
//  socket.js  —  Real-time client (Frontend)
//  FIX: dynamic import + presence tracking (user online/offline)
// ═══════════════════════════════════════════════════════════════════

let socket        = null;
let _io           = null;
let _heartbeatInt = null;
const listeners   = new Map();

// ── Load socket.io-client dynamically ────────────────────────────
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
export async function initSocket(serverUrl, branchId, user) {
  if (socket && socket.connected) return socket;

  const io = await getIo();
  if (!io) {
    console.warn("[Socket.io] Running without real-time.");
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
    // Announce presence
    if (user) {
      socket.emit("user_online", {
        user_id:   user.user_id,
        username:  user.username,
        name:      user.name || user.username,
        branch_id: user.branch_id || null,
      });
    }
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
    if (user) socket.emit("user_online", {
      user_id: user.user_id, username: user.username,
      name: user.name || user.username, branch_id: user.branch_id || null,
    });
  });

  ["db_update", "branch_update", "shared_update", "presence_update"].forEach(event => {
    socket.on(event, (data) => {
      const cbs = listeners.get(event);
      if (cbs) cbs.forEach(fn => fn(data));
    });
  });

  // Heartbeat every 30s to keep presence alive
  if (_heartbeatInt) clearInterval(_heartbeatInt);
  _heartbeatInt = setInterval(() => {
    if (socket?.connected && user) {
      socket.emit("heartbeat", { user_id: user.user_id });
    }
  }, 30000);

  return socket;
}

// ── Subscribe to events ───────────────────────────────────────────
export function onDbUpdate(cb)       { return _on("db_update",       cb); }
export function onBranchUpdate(cb)   { return _on("branch_update",   cb); }
export function onSharedUpdate(cb)   { return _on("shared_update",   cb); }
export function onPresenceUpdate(cb) { return _on("presence_update", cb); }

function _on(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return () => listeners.get(event).delete(cb);
}

export function isConnected()  { return socket?.connected ?? false; }
export function getSocket()    { return socket; }

export function disconnectSocket() {
  if (_heartbeatInt) { clearInterval(_heartbeatInt); _heartbeatInt = null; }
  if (socket) { socket.disconnect(); socket = null; }
  listeners.clear();
}

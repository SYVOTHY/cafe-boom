// ═══════════════════════════════════════════════════════════════════
//  socket.js  —  Real-time client + presence tracking
// ═══════════════════════════════════════════════════════════════════

let socket        = null;
let _io           = null;
let _heartbeatInt = null;
let _currentUser  = null;   // keep latest user ref for re-announce
const listeners   = new Map();

async function getIo() {
  if (_io) return _io;
  try {
    const mod = await import("socket.io-client");
    _io = mod.io || mod.default;
    return _io;
  } catch (e) {
    console.error("[Socket.io] ❌ socket.io-client not installed.");
    return null;
  }
}

function emitPresence(user) {
  if (!socket?.connected || !user?.user_id) return;
  socket.emit("user_online", {
    user_id:   user.user_id,
    username:  user.username,
    name:      user.name || user.username,
    branch_id: user.branch_id || null,
  });
}

// ── Connect to server ─────────────────────────────────────────────
export async function initSocket(serverUrl, branchId, user) {
  // Update current user ref every call (currentUser may change after first connect)
  if (user?.user_id) _currentUser = user;

  // If already connected, just (re)announce presence and return
  if (socket && socket.connected) {
    emitPresence(_currentUser);
    return socket;
  }

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
    emitPresence(_currentUser);
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
    emitPresence(_currentUser);
  });

  ["db_update", "branch_update", "shared_update", "presence_update"].forEach(event => {
    socket.on(event, (data) => {
      const cbs = listeners.get(event);
      if (cbs) cbs.forEach(fn => fn(data));
    });
  });

  // Heartbeat every 30s
  if (_heartbeatInt) clearInterval(_heartbeatInt);
  _heartbeatInt = setInterval(() => {
    if (socket?.connected && _currentUser) {
      socket.emit("heartbeat", { user_id: _currentUser.user_id });
    }
  }, 30000);

  return socket;
}

// ── Announce presence (call after login when user becomes known) ──
export function announcePresence(user) {
  if (user?.user_id) { _currentUser = user; emitPresence(user); }
}

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
  _currentUser = null;
  listeners.clear();
}

// ═══════════════════════════════════════════════════════════════════
//  socket.js  —  Real-time client (Frontend)
//  Import this in App.jsx:  import { initSocket, onBranchUpdate } from "./socket.js"
// ═══════════════════════════════════════════════════════════════════
import { io } from "socket.io-client";

let socket = null;
const listeners = new Map();   // event → Set of callbacks

// ── Connect to server ─────────────────────────────────────────────
export function initSocket(serverUrl, branchId) {
  if (socket && socket.connected) return socket;

  socket = io(serverUrl, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
    timeout: 10000,
  });

  socket.on("connect", () => {
    console.log("[Socket.io] ✅ Connected:", socket.id);
    // Join this branch's room for targeted updates
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
    socket.emit("join_branch", branchId);   // re-join room after reconnect
  });

  // ── Forward all server events to local listeners ──────────────
  ["db_update", "branch_update", "shared_update"].forEach(event => {
    socket.on(event, (data) => {
      const cbs = listeners.get(event);
      if (cbs) cbs.forEach(fn => fn(data));
    });
  });

  return socket;
}

// ── Subscribe to events ───────────────────────────────────────────
// Usage: const off = onBranchUpdate(({table, data}) => { ... })
//        off()  ← call to unsubscribe

export function onDbUpdate(cb) {
  return _on("db_update", cb);
}

export function onBranchUpdate(cb) {
  return _on("branch_update", cb);
}

export function onSharedUpdate(cb) {
  return _on("shared_update", cb);
}

function _on(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return () => listeners.get(event).delete(cb);   // returns unsubscribe fn
}

// ── Getters ───────────────────────────────────────────────────────
export function isConnected() {
  return socket?.connected ?? false;
}

export function getSocket() {
  return socket;
}

// ── Disconnect (cleanup) ─────────────────────────────────────────
export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
  listeners.clear();
}

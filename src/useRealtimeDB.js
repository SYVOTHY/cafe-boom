// ═══════════════════════════════════════════════════════════════════
//  useRealtimeDB.js  —  React Hook  (with presence tracking)
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { initSocket, announcePresence, onBranchUpdate, onSharedUpdate, onPresenceUpdate, isConnected } from "./socket.js";

const BRANCH_TABLES = new Set(["orders","logs","tables","ingredients","expenses","recipes"]);

function authHeaders() {
  const token = localStorage.getItem("pos_token");
  return {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  };
}

export function useRealtimeDB(serverUrl, branchId, currentUser) {
  const [db,           setDb]          = useState(null);
  const [loading,      setLoading]     = useState(true);
  const [socketOnline, setSocketOnline] = useState(false);
  const [onlineUsers,  setOnlineUsers] = useState([]); // presence list
  const dbRef        = useRef(null);
  const lastWriteRef = useRef({});

  // ── Initial load ──────────────────────────────────────────────────
  const loadFull = useCallback(async () => {
    setLoading(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(`${serverUrl}/api/db?branch=${branchId}`, {
        signal: controller.signal, headers: authHeaders(),
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      if (data.products) data.products = data.products.map(p => ({ ...p, base_price: parseFloat(p.base_price)||0 }));
      if (data.options)  data.options  = data.options.map(o  => ({ ...o, additional_price: parseFloat(o.additional_price)||0 }));
      dbRef.current = data;
      setDb(data);
      setLoading(false);
      console.log("[RealtimeDB] ✅ Initial load OK");
      return true;
    } catch (e) {
      console.warn("[RealtimeDB] Initial load failed:", e.message);
      setLoading(false);
      return false;
    }
  }, [serverUrl, branchId]);

  // ── Save a table via REST ─────────────────────────────────────────
  const saveTable = useCallback(async (table, data, retries = 3) => {
    const isShared = !BRANCH_TABLES.has(table);
    const url = `${serverUrl}/api/db/${table}${isShared ? "" : "?branch=" + branchId}`;
    lastWriteRef.current[table] = Date.now();
    dbRef.current = { ...dbRef.current, [table]: data };
    setDb(prev => ({ ...prev, [table]: data }));
    for (let i = 0; i < retries; i++) {
      try {
        const r = await fetch(url, { method:"POST", headers: authHeaders(), body: JSON.stringify(data) });
        if (r.ok) { console.log(`[RealtimeDB] Saved: ${table}`); return true; }
        if (r.status === 401) { console.error(`[RealtimeDB] Auth error: ${table}`); return false; }
      } catch (e) {
        console.warn(`[RealtimeDB] Save attempt ${i+1} failed for ${table}:`, e.message);
        if (i < retries - 1) await new Promise(r => setTimeout(r, 800 * (i + 1)));
      }
    }
    console.error(`[RealtimeDB] Failed to save after ${retries} retries: ${table}`);
    return false;
  }, [serverUrl, branchId]);

  // Safety net: loading stuck → force off
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(prev => {
        if (prev) { console.warn("[RealtimeDB] ⚠️ Loading timeout — forcing off"); return false; }
        return prev;
      });
    }, 12000);
    return () => clearTimeout(t);
  }, [serverUrl, branchId]);

  // ── Re-announce presence whenever currentUser changes ────────────
  // This fires when: (1) user logs in, (2) user data updates, (3) socket reconnects
  useEffect(() => {
    if (!currentUser?.user_id) return;
    // Small delay to let socket connect first if this runs before connection
    const t = setTimeout(() => announcePresence(currentUser), 500);
    return () => clearTimeout(t);
  }, [currentUser?.user_id, currentUser?.name]);

  // ── Socket setup ──────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    loadFull();
    let sockRef = null;

    const setupSocket = async () => {
      try {
        // Pass currentUser so socket can announce presence
        const sock = await initSocket(serverUrl, branchId, currentUser);
        if (!sock || !mounted) return;
        sockRef = sock;

        const checkOnline = () => { if (mounted) setSocketOnline(isConnected()); };
        sock.on("connect",    checkOnline);
        sock.on("disconnect", checkOnline);
        checkOnline();

        const offBranch = onBranchUpdate(({ branch_id, table, data }) => {
          if (branch_id !== branchId) return;
          if (table === "ingredients" && Array.isArray(data) && data.length > 0 && data[0]._ts) {
            const incomingTs  = data[0]._ts;
            const myLastWrite = lastWriteRef.current[table] || 0;
            if (incomingTs < myLastWrite - 500) { console.log(`[Socket] Ignoring stale ${table}`); return; }
          }
          console.log(`[Socket] Branch update: ${table} (${branch_id})`);
          const cleanData = (table === "ingredients" && Array.isArray(data))
            ? data.map(({ _ts, ...rest }) => rest) : data;
          dbRef.current = { ...dbRef.current, [table]: cleanData };
          if (mounted) setDb(prev => ({ ...prev, [table]: cleanData }));
        });

        const offShared = onSharedUpdate(({ table, data }) => {
          console.log(`[Socket] Shared update: ${table}`);
          dbRef.current = { ...dbRef.current, [table]: data };
          if (mounted) setDb(prev => ({ ...prev, [table]: data }));
        });

        // Presence updates
        const offPresence = onPresenceUpdate((list) => {
          if (mounted) setOnlineUsers(Array.isArray(list) ? list : []);
        });

        sock.__offBranch   = offBranch;
        sock.__offShared   = offShared;
        sock.__offPresence = offPresence;
        sock.__checkOnline = checkOnline;

      } catch (e) {
        console.warn("[RealtimeDB] Socket setup error:", e.message);
      }
    };

    setupSocket();

    return () => {
      mounted = false;
      if (sockRef) {
        sockRef.__offBranch?.();
        sockRef.__offShared?.();
        sockRef.__offPresence?.();
        sockRef.off("connect",    sockRef.__checkOnline);
        sockRef.off("disconnect", sockRef.__checkOnline);
      }
    };
  }, [serverUrl, branchId, loadFull, currentUser?.user_id]);

  return { db, loading, socketOnline, saveTable, reload: loadFull, onlineUsers };
}

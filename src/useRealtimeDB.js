// ═══════════════════════════════════════════════════════════════════
//  useRealtimeDB.js  —  React Hook
//  Fixed: proper memory cleanup, no leaks on unmount/remount
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import {
  initSocket, announcePresence,
  onBranchUpdate, onSharedUpdate, onPresenceUpdate,
  isConnected
} from "./socket.js";

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
  const [onlineUsers,  setOnlineUsers] = useState([]);

  // Stable refs — never trigger re-renders
  const dbRef        = useRef(null);
  const lastWriteRef = useRef({});
  const mountedRef   = useRef(true);      // track if component is still mounted
  const unsubsRef    = useRef([]);        // collect all unsubscribe functions
  const sockRef      = useRef(null);      // socket reference for cleanup

  // ── Initial load ──────────────────────────────────────────────────
  const loadFull = useCallback(async () => {
    if (!mountedRef.current) return false;
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
      if (mountedRef.current) { setDb(data); setLoading(false); }
      console.log("[RealtimeDB] ✅ Initial load OK");
      return true;
    } catch (e) {
      console.warn("[RealtimeDB] Initial load failed:", e.message);
      if (mountedRef.current) setLoading(false);
      return false;
    }
  }, [serverUrl, branchId]);

  // ── Save a table via REST ─────────────────────────────────────────
  const saveTable = useCallback(async (table, data, retries = 3) => {
    const isShared = !BRANCH_TABLES.has(table);
    const url = `${serverUrl}/api/db/${table}${isShared ? "" : "?branch=" + branchId}`;
    lastWriteRef.current[table] = Date.now();
    dbRef.current = { ...dbRef.current, [table]: data };
    if (mountedRef.current) setDb(prev => ({ ...prev, [table]: data }));

    for (let i = 0; i < retries; i++) {
      try {
        const r = await fetch(url, { method:"POST", headers: authHeaders(), body: JSON.stringify(data) });
        if (r.ok) { console.log(`[RealtimeDB] Saved: ${table}`); return true; }
        if (r.status === 401) { console.error(`[RealtimeDB] Auth error: ${table}`); return false; }
      } catch (e) {
        console.warn(`[RealtimeDB] Save attempt ${i+1} failed:`, e.message);
        if (i < retries - 1) await new Promise(res => setTimeout(res, 800 * (i + 1)));
      }
    }
    console.error(`[RealtimeDB] Failed after ${retries} retries: ${table}`);
    return false;
  }, [serverUrl, branchId]);

  // ── Loading timeout safety net ────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      if (mountedRef.current) {
        setLoading(prev => {
          if (prev) { console.warn("[RealtimeDB] ⚠️ Loading timeout — forcing off"); return false; }
          return prev;
        });
      }
    }, 12000);
    return () => clearTimeout(t);
  }, [serverUrl, branchId]);

  // ── Announce presence when user changes ───────────────────────────
  useEffect(() => {
    if (!currentUser?.user_id) return;
    const t = setTimeout(() => {
      if (mountedRef.current) announcePresence(currentUser);
    }, 500);
    return () => clearTimeout(t);
  }, [currentUser?.user_id, currentUser?.name]);

  // ── Socket setup + cleanup ────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    // Load data immediately
    loadFull();

    const setupSocket = async () => {
      try {
        const sock = await initSocket(serverUrl, branchId, currentUser);
        if (!sock || !mountedRef.current) return;

        sockRef.current = sock;

        // ── Connect / Disconnect status ──────────────────────────
        const checkOnline = () => {
          if (mountedRef.current) setSocketOnline(isConnected());
        };
        sock.on("connect",    checkOnline);
        sock.on("disconnect", checkOnline);
        checkOnline();

        // ── Branch-specific updates ──────────────────────────────
        const offBranch = onBranchUpdate(({ branch_id, table, data }) => {
          if (!mountedRef.current || branch_id !== branchId) return;
          // Stale ingredient check
          if (table === "ingredients" && Array.isArray(data) && data[0]?._ts) {
            const myLastWrite = lastWriteRef.current[table] || 0;
            if (data[0]._ts < myLastWrite - 500) {
              console.log(`[Socket] Ignoring stale ${table}`);
              return;
            }
          }
          const cleanData = (table === "ingredients" && Array.isArray(data))
            ? data.map(({ _ts, ...rest }) => rest) : data;
          dbRef.current = { ...dbRef.current, [table]: cleanData };
          setDb(prev => ({ ...prev, [table]: cleanData }));
        });

        // ── Shared data updates ──────────────────────────────────
        const offShared = onSharedUpdate(({ table, data }) => {
          if (!mountedRef.current) return;
          dbRef.current = { ...dbRef.current, [table]: data };
          setDb(prev => ({ ...prev, [table]: data }));
        });

        // ── Presence updates ─────────────────────────────────────
        const offPresence = onPresenceUpdate((list) => {
          if (mountedRef.current) setOnlineUsers(Array.isArray(list) ? list : []);
        });

        // Collect all cleanup functions
        unsubsRef.current = [offBranch, offShared, offPresence];

        // Store named handlers for socket.off cleanup
        sock.__checkOnline = checkOnline;

      } catch (e) {
        console.warn("[RealtimeDB] Socket setup error:", e.message);
      }
    };

    setupSocket();

    // ── Cleanup — runs on unmount or dependency change ────────────
    return () => {
      mountedRef.current = false;

      // Unsubscribe all event listeners
      unsubsRef.current.forEach(off => { try { off?.(); } catch {} });
      unsubsRef.current = [];

      // Remove socket event handlers
      const sock = sockRef.current;
      if (sock) {
        try { sock.off("connect",    sock.__checkOnline); } catch {}
        try { sock.off("disconnect", sock.__checkOnline); } catch {}
        sock.__checkOnline = null;
        sockRef.current = null;
      }
    };
  }, [serverUrl, branchId, loadFull, currentUser?.user_id]);

  return { db, loading, socketOnline, saveTable, reload: loadFull, onlineUsers };
}

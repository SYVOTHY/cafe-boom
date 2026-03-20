// ═══════════════════════════════════════════════════════════════════
//  useRealtimeDB.js  —  React Hook
//  FIX: handles async initSocket + graceful fallback if socket missing
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { initSocket, onBranchUpdate, onSharedUpdate, isConnected } from "./socket.js";

const BRANCH_TABLES = new Set(["orders","logs","tables","ingredients","expenses","recipes"]);

function authHeaders() {
  const token = localStorage.getItem("pos_token");
  return {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  };
}

export function useRealtimeDB(serverUrl, branchId) {
  const [db,           setDb]          = useState(null);
  const [loading,      setLoading]     = useState(true);
  const [socketOnline, setSocketOnline] = useState(false);
  const dbRef         = useRef(null);
  const lastWriteRef  = useRef({});

  // ── Initial load from REST API ──────────────────────────────────
  const loadFull = useCallback(async () => {
    setLoading(true);   // always show loading state during fetch
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(`${serverUrl}/api/db?branch=${branchId}`, {
        signal: controller.signal,
        headers: authHeaders(),
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

  // ── Save a table via REST ───────────────────────────────────────
  const saveTable = useCallback(async (table, data, retries = 3) => {
    const isShared = !BRANCH_TABLES.has(table);
    const url = `${serverUrl}/api/db/${table}${isShared ? "" : "?branch=" + branchId}`;
    lastWriteRef.current[table] = Date.now();
    dbRef.current = { ...dbRef.current, [table]: data };
    setDb(prev => ({ ...prev, [table]: data }));

    for (let i = 0; i < retries; i++) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(data),
        });
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

  // ── Socket.io setup (async — won't crash if socket.io-client missing) ──
  // Safety net: if loading is stuck after 12s, force it off
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(prev => {
        if (prev) { console.warn("[RealtimeDB] ⚠️ Loading timeout — forcing off"); return false; }
        return prev;
      });
    }, 12000);
    return () => clearTimeout(t);
  }, [serverUrl, branchId]);
  useEffect(() => {
    let mounted = true;

    // 1) Load initial data
    loadFull();

    // 2) Connect socket (async — graceful fallback if unavailable)
    let sockRef = null;

    const setupSocket = async () => {
      try {
        const sock = await initSocket(serverUrl, branchId);
        if (!sock || !mounted) return;   // socket.io-client missing or unmounted

        sockRef = sock;

        const checkOnline = () => {
          if (mounted) setSocketOnline(isConnected());
        };

        sock.on("connect",    checkOnline);
        sock.on("disconnect", checkOnline);
        checkOnline();

        // 3) Branch-specific updates
        const offBranch = onBranchUpdate(({ branch_id, table, data }) => {
          if (branch_id !== branchId) return;

          if (table === "ingredients" && Array.isArray(data) && data.length > 0 && data[0]._ts) {
            const incomingTs = data[0]._ts;
            const myLastWrite = lastWriteRef.current[table] || 0;
            if (incomingTs < myLastWrite - 500) {
              console.log(`[Socket] Ignoring stale ${table}`);
              return;
            }
          }

          console.log(`[Socket] Branch update: ${table} (${branch_id})`);
          const cleanData = (table === "ingredients" && Array.isArray(data))
            ? data.map(({ _ts, ...rest }) => rest)
            : data;
          dbRef.current = { ...dbRef.current, [table]: cleanData };
          if (mounted) setDb(prev => ({ ...prev, [table]: cleanData }));
        });

        // 4) Shared data updates
        const offShared = onSharedUpdate(({ table, data }) => {
          console.log(`[Socket] Shared update: ${table}`);
          dbRef.current = { ...dbRef.current, [table]: data };
          if (mounted) setDb(prev => ({ ...prev, [table]: data }));
        });

        // Store cleanup refs on sock object for useEffect cleanup
        sock.__offBranch = offBranch;
        sock.__offShared = offShared;
        sock.__checkOnline = checkOnline;

      } catch (e) {
        console.warn("[RealtimeDB] Socket setup error:", e.message);
        // App still works via REST polling — just no real-time
      }
    };

    setupSocket();

    return () => {
      mounted = false;
      if (sockRef) {
        sockRef.__offBranch?.();
        sockRef.__offShared?.();
        sockRef.off("connect",    sockRef.__checkOnline);
        sockRef.off("disconnect", sockRef.__checkOnline);
      }
    };
  }, [serverUrl, branchId, loadFull]);

  return { db, loading, socketOnline, saveTable, reload: loadFull };
}

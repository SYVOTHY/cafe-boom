// ═══════════════════════════════════════════════════════════════════
//  useRealtimeDB.js  —  React Hook
//  ជំនួស apiLoad() ដើម + បន្ថែម real-time sync ដោយស្វ័យប្រវត្តិ
//
//  Usage in App.jsx:
//    import { useRealtimeDB } from "./useRealtimeDB.js";
//    const { db, connected, socketOnline } = useRealtimeDB(API, BRANCH_ID);
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { initSocket, onBranchUpdate, onSharedUpdate, isConnected } from "./socket.js";

// Tables that belong to a branch vs shared
const BRANCH_TABLES = new Set(["orders","logs","tables","ingredients","expenses","recipes"]);

// Helper: get auth header from localStorage
function authHeaders() {
  const token = localStorage.getItem("pos_token");
  return {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  };
}

export function useRealtimeDB(serverUrl, branchId) {
  const [db,            setDb]           = useState(null);
  const [loading,       setLoading]      = useState(true);
  const [socketOnline,  setSocketOnline] = useState(false);
  const dbRef = useRef(null);

  // ── Initial load from REST API ──────────────────────────────────
  const loadFull = useCallback(async () => {
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
      // Normalise prices
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

  // ── Save a table via REST (also triggers socket broadcast on server) ─
  const lastWriteRef = useRef({});

  const saveTable = useCallback(async (table, data, retries = 3) => {
    const isShared = !BRANCH_TABLES.has(table);
    const url = `${serverUrl}/api/db/${table}${isShared ? "" : "?branch=" + branchId}`;

    // Record local write time to block stale socket updates
    lastWriteRef.current[table] = Date.now();

    // Optimistic update locally
    dbRef.current = { ...dbRef.current, [table]: data };
    setDb(prev => ({ ...prev, [table]: data }));

    for (let i = 0; i < retries; i++) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: authHeaders(),   // ✅ includes Authorization token
          body: JSON.stringify(data),
        });
        if (r.ok) {
          console.log(`[RealtimeDB] Saved: ${table}`);
          return true;
        }
        if (r.status === 401) {
          console.error(`[RealtimeDB] Auth error saving ${table} — token expired?`);
          return false;   // don't retry auth failures
        }
      } catch (e) {
        console.warn(`[RealtimeDB] Save attempt ${i+1} failed for ${table}:`, e.message);
        if (i < retries - 1) await new Promise(r => setTimeout(r, 800 * (i + 1)));
      }
    }
    console.error(`[RealtimeDB] Failed to save after ${retries} retries: ${table}`);
    return false;
  }, [serverUrl, branchId]);

  // ── Socket.io setup ─────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    // 1) Load initial data
    loadFull();

    // 2) Connect socket
    const sock = initSocket(serverUrl, branchId);

    const checkOnline = () => {
      if (mounted) setSocketOnline(isConnected());
    };

    sock.on("connect",    checkOnline);
    sock.on("disconnect", checkOnline);
    checkOnline();

    // 3) Listen for branch-specific updates from OTHER clients
    const offBranch = onBranchUpdate(({ branch_id, table, data }) => {
      if (branch_id !== branchId) return;   // ignore other branches

      // For ingredients: ignore socket updates that are OLDER than our last local write
      // This prevents checkout stock deduction from being overwritten by stale broadcasts
      if (table === "ingredients" && Array.isArray(data) && data.length > 0 && data[0]._ts) {
        const incomingTs = data[0]._ts;
        const myLastWrite = lastWriteRef.current[table] || 0;
        if (incomingTs < myLastWrite - 500) { // 500ms tolerance
          console.log(`[Socket] Ignoring stale ${table} (server:${incomingTs} < local:${myLastWrite})`);
          return;
        }
      }

      console.log(`[Socket] Branch update: ${table} (${branch_id})`);
      // Strip internal timestamps before storing
      const cleanData = (table === "ingredients" && Array.isArray(data))
        ? data.map(({ _ts, ...rest }) => rest)
        : data;
      dbRef.current = { ...dbRef.current, [table]: cleanData };
      if (mounted) setDb(prev => ({ ...prev, [table]: cleanData }));
    });

    // 4) Listen for shared data updates (menu, products, users…)
    const offShared = onSharedUpdate(({ table, data }) => {
      console.log(`[Socket] Shared update: ${table}`);
      dbRef.current = { ...dbRef.current, [table]: data };
      if (mounted) setDb(prev => ({ ...prev, [table]: data }));
    });

    return () => {
      mounted = false;
      offBranch();
      offShared();
      sock.off("connect",    checkOnline);
      sock.off("disconnect", checkOnline);
    };
  }, [serverUrl, branchId, loadFull]);

  return {
    db,
    loading,
    socketOnline,
    saveTable,
    reload: loadFull,
  };
}

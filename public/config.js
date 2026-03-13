// ═══════════════════════════════════════════════════════
//  Café Boom — Branch Config
// ═══════════════════════════════════════════════════════

window.CAFE_SERVER      = "https://cafe-boom-production.up.railway.app";
window.CAFE_BRANCH      = "branch_1";
window.CAFE_BRANCH_NAME = "សាខាមាត់ជ្រោះ";

// ✅ Patch fetch: redirect /api/* calls to Railway backend
(function patchFetch() {
  const _fetch = window.fetch.bind(window);
  window.fetch = function(url, opts) {
    if (typeof url === "string" && url.startsWith("/api/")) {
      url = window.CAFE_SERVER + url;
    }
    return _fetch(url, opts);
  };
})();

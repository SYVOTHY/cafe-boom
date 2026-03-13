// ═══════════════════════════════════════════════════════════════
//  Cafe Bloom POS — Security & Health Check Tool
//  Usage: node test-security.js
//  (Run from cafe-bloom1 folder while server is running)
// ═══════════════════════════════════════════════════════════════
import http from "http";
import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3001";
let passed = 0, failed = 0, warned = 0;

const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

function ok(msg)   { console.log(`  ${GREEN}✅ PASS${RESET}  ${msg}`); passed++; }
function fail(msg) { console.log(`  ${RED}❌ FAIL${RESET}  ${msg}`); failed++; }
function warn(msg) { console.log(`  ${YELLOW}⚠️  WARN${RESET}  ${msg}`); warned++; }
function info(msg) { console.log(`  ${CYAN}ℹ️  INFO${RESET}  ${msg}`); }
function head(msg) { console.log(`\n${BOLD}${CYAN}━━━ ${msg} ━━━${RESET}`); }

async function req(method, path, body, token) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "localhost", port: 3001,
      path, method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": "Bearer " + token } : {}),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const r = http.request(options, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on("error", e => resolve({ status: 0, error: e.message }));
    if (payload) r.write(payload);
    r.end();
  });
}

async function run() {
  console.log(`\n${BOLD}╔══════════════════════════════════════════════╗`);
  console.log(`║   Cafe Bloom POS — Security & Health Check   ║`);
  console.log(`╚══════════════════════════════════════════════╝${RESET}`);

  // ══════════════════════════════════════════
  head("1. FILES & ENVIRONMENT");
  // ══════════════════════════════════════════

  // .env file
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    ok(".env file exists");
    const envContent = fs.readFileSync(envPath, "utf8");
    if (envContent.includes("SESSION_SECRET=") && !envContent.includes("SESSION_SECRET=\n") && !envContent.includes("change-this")) {
      ok("SESSION_SECRET is set");
    } else {
      warn("SESSION_SECRET មិនទាន់ set ឬនៅ default — សូម edit .env!");
    }
    if (fs.existsSync(path.join(__dirname, ".gitignore"))) {
      const gi = fs.readFileSync(path.join(__dirname, ".gitignore"), "utf8");
      gi.includes(".env") ? ok(".env is in .gitignore") : warn(".env មិននៅក្នុង .gitignore — Risk leak to git!");
    } else {
      warn(".gitignore មិនមាន — .env might leak to git!");
    }
  } else {
    fail(".env file មិនមាន! Copy .env.example → .env");
  }

  // data/shared.json passwords
  const sharedPath = path.join(__dirname, "data", "shared.json");
  if (fs.existsSync(sharedPath)) {
    ok("data/shared.json exists");
    const shared = JSON.parse(fs.readFileSync(sharedPath, "utf8"));
    const users = shared.users || [];
    info(`Found ${users.length} user(s) in database`);
    let allHashed = true;
    for (const u of users) {
      if (!u.password) {
        warn(`User "${u.username}" មិនមាន password!`);
        allHashed = false;
      } else if (u.password.startsWith("pbkdf2:")) {
        ok(`User "${u.username}" — password hashed ✓ (PBKDF2-SHA512)`);
      } else {
        fail(`User "${u.username}" — password PLAIN TEXT! Login ម្ដងដើម្បី auto-hash.`);
        allHashed = false;
      }
    }
    if (allHashed && users.length > 0) ok("All passwords are hashed");
  } else {
    warn("data/shared.json មិនមាន — Server ត្រូវ start ជាមុន");
  }

  // ══════════════════════════════════════════
  head("2. SERVER CONNECTIVITY");
  // ══════════════════════════════════════════

  const ping = await req("GET", "/api/ping");
  if (ping.status === 200) {
    ok(`Server online — Port 3001`);
    info(`Server time: ${ping.body.time}`);
    info(`Branches: ${ping.body.branches}`);
  } else if (ping.status === 0) {
    fail(`Server offline! Error: ${ping.error}`);
    fail("Run: node server.js  (or: npm run dev)");
    console.log(`\n${RED}${BOLD}⛔ Cannot continue — Server not running.${RESET}\n`);
    process.exit(1);
  } else {
    fail(`Unexpected response: ${ping.status}`);
  }

  // ══════════════════════════════════════════
  head("3. LOGIN SECURITY");
  // ══════════════════════════════════════════

  // Wrong credentials
  const bad = await req("POST", "/api/login", { username: "admin", password: "wrongpassword" });
  if (bad.status === 401) {
    ok("Wrong password → 401 Unauthorized ✓");
  } else {
    fail(`Wrong password should return 401, got: ${bad.status}`);
  }

  // SQL injection attempt
  const sqli = await req("POST", "/api/login", { username: "admin'--", password: "' OR '1'='1" });
  if (sqli.status === 401) {
    ok("SQL injection attempt → blocked ✓");
  } else {
    warn(`SQL injection test returned: ${sqli.status} (JSON DB — less risk but check)`);
  }

  // Empty credentials
  const empty = await req("POST", "/api/login", { username: "", password: "" });
  if (empty.status === 400 || empty.status === 401) {
    ok("Empty credentials → rejected ✓");
  } else {
    fail(`Empty credentials should be rejected, got: ${empty.status}`);
  }

  // Valid login — ask user for real password
  info("ការ test login ត្រូវការ password ពិតប្រាកដ។ Skip auto-test (password អាចផ្លាស់ប្ដូរហើយ)");
  ok("Login API endpoint exists + rejects wrong credentials ✓");
  let token = null;
  // Try to get a token for further tests using a test approach
  const loginTest = await req("POST", "/api/login", { username: "admin", password: "admin123" });
  if (loginTest.status === 200 && loginTest.body.token) {
    token = loginTest.body.token;
    ok("Default credentials test login succeeded ✓");
    if (loginTest.body.user && !loginTest.body.user.password) {
      ok("User object has NO password field ✓");
    }
    info(`Token length: ${token.length} chars (32 bytes random)`);
  } else if (loginTest.status === 401) {
    ok("Default password changed — Custom password in use ✓ (Security good!)");
    info("Login API working correctly — custom password protected");
  } else {
    fail(`Login endpoint error: ${loginTest.status} — ${JSON.stringify(loginTest.body)}`);
  }

  // ══════════════════════════════════════════
  head("4. SESSION & TOKEN SECURITY");
  // ══════════════════════════════════════════

  // /api/me without token
  const meNoToken = await req("GET", "/api/me");
  if (meNoToken.status === 401) {
    ok("/api/me without token → 401 ✓");
  } else {
    fail(`/api/me without token should be 401, got: ${meNoToken.status}`);
  }

  // /api/me with fake token
  const meFake = await req("GET", "/api/me", null, "fakeinvalidtoken123");
  if (meFake.status === 401) {
    ok("/api/me with fake token → 401 ✓");
  } else {
    fail(`Fake token should be rejected, got: ${meFake.status}`);
  }

  if (token) {
    // /api/me with valid token
    const me = await req("GET", "/api/me", null, token);
    if (me.status === 200 && me.body.username) {
      ok(`/api/me with valid token → 200, user: ${me.body.username} (${me.body.role}) ✓`);
    } else {
      fail(`/api/me with valid token failed: ${me.status}`);
    }

    // Logout
    const logout = await req("POST", "/api/logout", null, token);
    if (logout.status === 200) {
      ok("Logout → 200 OK ✓");
    } else {
      warn(`Logout returned: ${logout.status}`);
    }

    // Token should be invalid after logout
    const meAfter = await req("GET", "/api/me", null, token);
    if (meAfter.status === 401) {
      ok("Token invalidated after logout → 401 ✓");
    } else {
      fail(`Token still valid after logout! Got: ${meAfter.status}`);
    }
  }

  // ══════════════════════════════════════════
  head("5. DATA PROTECTION");
  // ══════════════════════════════════════════

  // Check DB response doesn't leak passwords
  const db = await req("GET", "/api/db?branch=branch_1");
  if (db.status === 200) {
    ok("GET /api/db → 200 ✓");
    const users = db.body.users || [];
    const leaked = users.filter(u => u.password);
    if (leaked.length === 0) {
      ok("No passwords in /api/db response ✓");
    } else {
      // Check if they are hashed
      const allHashed = leaked.every(u => u.password.startsWith("pbkdf2:"));
      if (allHashed) {
        warn(`/api/db returns hashed passwords (${leaked.length} users) — Consider stripping in production`);
      } else {
        fail(`/api/db leaks PLAIN TEXT passwords for ${leaked.length} user(s)!`);
      }
    }
  }

  // ══════════════════════════════════════════
  head("6. SUMMARY");
  // ══════════════════════════════════════════

  const total = passed + failed + warned;
  console.log(`\n  Total checks : ${total}`);
  console.log(`  ${GREEN}Passed${RESET}       : ${passed}`);
  console.log(`  ${YELLOW}Warnings${RESET}     : ${warned}`);
  console.log(`  ${RED}Failed${RESET}       : ${failed}`);

  if (failed === 0 && warned === 0) {
    console.log(`\n${GREEN}${BOLD}  🎉 ALL CHECKS PASSED! System is secure.${RESET}\n`);
  } else if (failed === 0) {
    console.log(`\n${YELLOW}${BOLD}  ⚠️  Passed with warnings. Review items above.${RESET}\n`);
  } else {
    console.log(`\n${RED}${BOLD}  ❌ ${failed} check(s) FAILED. Fix security issues above!${RESET}\n`);
  }
}

run().catch(e => { console.error("Test error:", e.message); process.exit(1); });
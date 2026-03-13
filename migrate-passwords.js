// ═══════════════════════════════════════════════════════════════
//  migrate-passwords.js
//  Hash all plain-text passwords in data/shared.json
//  Run ONCE: node migrate-passwords.js
// ═══════════════════════════════════════════════════════════════
import crypto from "crypto";
import fs     from "fs";
import path   from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHARED    = path.join(__dirname, "data", "shared.json");

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(pw, salt, 100000, 64, "sha512").toString("hex");
  return "pbkdf2:" + salt + ":" + hash;
}

if (!fs.existsSync(SHARED)) {
  console.error("❌ data/shared.json មិនមាន!");
  process.exit(1);
}

const db    = JSON.parse(fs.readFileSync(SHARED, "utf8"));
const users = db.users || [];
let changed = 0;

console.log("\n🔐 កំពុង Hash passwords...\n");

db.users = users.map(u => {
  if (!u.password) {
    console.log(`  ⚠️  User "${u.username}" — no password, skipping`);
    return u;
  }
  if (u.password.startsWith("pbkdf2:")) {
    console.log(`  ✅ User "${u.username}" — already hashed, skip`);
    return u;
  }
  // Plain text — hash it
  const hashed = hashPassword(u.password);
  console.log(`  🔑 User "${u.username}" — hashed! (was: "${u.password}")`);
  changed++;
  return { ...u, password: hashed };
});

if (changed > 0) {
  // Backup first
  fs.writeFileSync(SHARED + ".bak", fs.readFileSync(SHARED));
  console.log(`\n  💾 Backup saved → data/shared.json.bak`);
  fs.writeFileSync(SHARED, JSON.stringify(db, null, 2), "utf8");
  console.log(`  ✅ Saved ${changed} hashed password(s) → data/shared.json`);
} else {
  console.log("\n  ✅ All passwords already hashed — nothing to do.");
}

console.log("\n⚠️  សូមកត់ note password ដើម — បន្ទាប់ login ជាមួយ password ចាស់ដដែល!\n");

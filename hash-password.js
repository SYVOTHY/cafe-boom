// ═══════════════════════════════════════════════════════════════
//  hash-password.js — Utility to generate password hashes
//  Usage: node hash-password.js yourpassword
//  Then copy the output into data/shared.json users[].password
// ═══════════════════════════════════════════════════════════════
import crypto from "crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node hash-password.js <password>");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
const result = "pbkdf2:" + salt + ":" + hash;

console.log("\n✅ Password hash generated:");
console.log(result);
console.log("\nCopy this value into data/shared.json as the user's password field.");
console.log('Example: { "username": "admin", "password": "' + result.slice(0,30) + '...", ... }');

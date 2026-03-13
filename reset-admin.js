// reset-admin.js — Run once to reset passwords
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = path.join(__dirname, "data");
const SHARED_FILE = path.join(DATA_DIR, "shared.json");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return "pbkdf2:" + salt + ":" + hash;
}

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Load or create shared.json
let shared = {};
if (fs.existsSync(SHARED_FILE)) {
  shared = JSON.parse(fs.readFileSync(SHARED_FILE, "utf8"));
}

// Reset/create default users with fresh hashed passwords
shared.users = [
  {
    user_id: 1,
    username: "admin",
    password: hashPassword("admin123"),
    role: "admin",
    name: "Administrator",
    active: true,
    branch_id: "all"
  },
  {
    user_id: 2,
    username: "staff1",
    password: hashPassword("staff123"),
    role: "staff",
    name: "បុគ្គលិក ១",
    active: true,
    branch_id: "branch_1"
  }
];

fs.writeFileSync(SHARED_FILE, JSON.stringify(shared, null, 2), "utf8");
console.log("✅ Passwords reset successfully!");
console.log("   admin  → admin123");
console.log("   staff1 → staff123");

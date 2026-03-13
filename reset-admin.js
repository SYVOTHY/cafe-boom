import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;

// តភ្ជាប់ទៅ Database តាមរយៈ DATABASE_URL របស់ Railway
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return "pbkdf2:" + salt + ":" + hash;
}

async function resetAdmin() {
  try {
    await client.connect();
    console.log("✅ Connected to Database");

    const hashedAdmin = hashPassword("admin123");
    const hashedStaff = hashPassword("staff123");

    // លុប User ចាស់ និងបញ្ចូល User ថ្មី
    await client.query("DELETE FROM users WHERE username IN ('admin', 'staff1')");
    
    await client.query(
      "INSERT INTO users (username, password, role, name, active) VALUES ($1, $2, $3, $4, $5)",
      ["admin", hashedAdmin, "admin", "Administrator", true]
    );

    await client.query(
      "INSERT INTO users (username, password, role, name, active) VALUES ($1, $2, $3, $4, $5)",
      ["staff1", hashedStaff, "staff", "បុគ្គលិក ១", true]
    );

    console.log("✅ Admin & Staff passwords reset successfully in PostgreSQL!");
  } catch (err) {
    console.error("❌ Error resetting passwords:", err);
  } finally {
    await client.end();
  }
}

resetAdmin();

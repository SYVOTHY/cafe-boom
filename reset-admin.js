import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;

// តភ្ជាប់ទៅ Database តាមរយៈ DATABASE_URL ដែលយើងបានកំណត់
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

    // ១. បង្កើត Table users ប្រសិនបើវាមិនទាន់មាន
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20),
        name VARCHAR(100),
        active BOOLEAN DEFAULT true,
        branch_id VARCHAR(50)
      )
    `);
    console.log("✅ Table 'users' verified/created.");

    // ២. លុប User ចាស់ចេញសិន ដើម្បីកុំឱ្យជាន់គ្នា (Clean start)
    await client.query("DELETE FROM users WHERE username IN ('admin', 'staff1')");
    
    // ៣. បញ្ចូល Admin និង Staff ថ្មី
    const hashedAdmin = hashPassword("admin123");
    const hashedStaff = hashPassword("staff123");

    await client.query(
      "INSERT INTO users (username, password, role, name, active, branch_id) VALUES ($1, $2, $3, $4, $5, $6)",
      ["admin", hashedAdmin, "admin", "Administrator", true, "all"]
    );

    await client.query(
      "INSERT INTO users (username, password, role, name, active, branch_id) VALUES ($1, $2, $3, $4, $5, $6)",
      ["staff1", hashedStaff, "staff", "បុគ្គលិក ១", true, "branch_1"]
    );

    console.log("✅ Admin & Staff passwords reset successfully in PostgreSQL!");
  } catch (err) {
    console.error("❌ Error resetting passwords:", err);
  } finally {
    await client.end();
  }
}

resetAdmin();

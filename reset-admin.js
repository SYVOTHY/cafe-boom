import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // បន្ថែម SSL សម្រាប់ Railway
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return "pbkdf2:" + salt + ":" + hash;
}

async function resetCredentials() {
  try {
    await client.connect();
    console.log("✅ Connected to Database");

    // បង្កើត Table ប្រសិនបើវាមិនទាន់មាន
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

    // លុប User ចាស់ចេញសិន (ការពារការជាន់គ្នា)
    await client.query("DELETE FROM users WHERE username IN ('admin', 'staff1')");

    // បញ្ចូល User ថ្មី
    const adminPass = hashPassword("admin123");
    const staffPass = hashPassword("staff123");

    await client.query(
      "INSERT INTO users (username, password, role, name, active, branch_id) VALUES ($1, $2, $3, $4, $5, $6)",
      ["admin", adminPass, "admin", "Administrator", true, "all"]
    );

    await client.query(
      "INSERT INTO users (username, password, role, name, active, branch_id) VALUES ($1, $2, $3, $4, $5, $6)",
      ["staff1", staffPass, "staff", "បុគ្គលិក ១", true, "branch_1"]
    );

    console.log("✅ Reset ជោគជ័យ!");
    console.log("   Admin: admin / admin123");
    console.log("   Staff: staff1 / staff123");

  } catch (err) {
    console.error("❌ កំហុស:", err.message);
  } finally {
    await client.end();
  }
}

resetCredentials();

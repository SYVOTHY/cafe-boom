import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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

    // ១. បង្កើត Table មុននឹងធ្វើអ្វីផ្សេង
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20),
        name VARCHAR(100),
        active BOOLEAN DEFAULT true,
        branch_id VARCHAR(50),
        permissions JSONB DEFAULT '{}'
      )
    `);
    console.log("✅ Table 'users' verified/created.");

    // ២. លុប User ចាស់ប្រសិនបើមាន
    await client.query("DELETE FROM users WHERE username = 'admin'");

    // ៣. បញ្ចូល Admin ថ្មីជាមួយសិទ្ធិពេញលេញ
    const hashedAdmin = hashPassword("admin123");
    const fullPermissions = {
      can_edit_menu: true, can_view_report: true,
      can_manage_users: true, can_delete_orders: true,
      can_change_settings: true
    };

    await client.query(
      `INSERT INTO users (username, password, role, name, active, branch_id, permissions) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ["admin", hashedAdmin, "admin", "Administrator", true, "all", JSON.stringify(fullPermissions)]
    );

    console.log("✅ Admin user reset successfully!");
    console.log("   Username: admin | Password: admin123");

  } catch (err) {
    console.error("❌ កំហុស:", err.message);
  } finally {
    await client.end();
  }
}

resetAdmin();

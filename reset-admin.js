import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;

// តភ្ជាប់ទៅ Database តាមរយៈ DATABASE_URL
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

// មុខងារ Hash Password តាមទម្រង់ដែលប្រព័ន្ធត្រូវការ
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return "pbkdf2:" + salt + ":" + hash;
}

async function resetCredentials() {
  try {
    await client.connect();
    console.log("✅ Connected to Database");

    // ១. ធានាថាមាន Table 'users' (ព្រោះប្រព័ន្ធត្រូវការវា)
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

    // ២. រៀបចំ Password ថ្មី
    const newAdminPass = hashPassword("admin123");
    const newStaffPass = hashPassword("staff123");

    // ៣. លុប User ចាស់ចេញពី Table ឱ្យស្អាត (ឬ Update តែម្តង)
    await client.query("DELETE FROM users WHERE username IN ('admin', 'staff1')");

    // ៤. បញ្ចូល User ថ្មី
    await client.query(
      "INSERT INTO users (username, password, role, name, active, branch_id) VALUES ($1, $2, $3, $4, $5, $6)",
      ["admin", newAdminPass, "admin", "Administrator", true, "all"]
    );

    await client.query(
      "INSERT INTO users (username, password, role, name, active, branch_id) VALUES ($1, $2, $3, $4, $5, $6)",
      ["staff1", newStaffPass, "staff", "បុគ្គលិក ១", true, "branch_1"]
    );

    console.log("✅ បញ្ចូលទិន្នន័យថ្មីជោគជ័យ!");
    console.log("   Username: admin  | Password: admin123");
    console.log("   Username: staff1 | Password: staff123");

  } catch (err) {
    console.error("❌ កំហុសក្នុងការ Reset:", err);
  } finally {
    await client.end();
  }
}

resetCredentials();

import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setupDatabase() {
  try {
    await client.connect();
    console.log("✅ តភ្ជាប់ទៅ Database ជោគជ័យ!");

    // បង្កើតតារាងចាំបាច់ទាំងអស់
    await client.query(`
      CREATE TABLE IF NOT EXISTS shared_data (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS branch_data (
        branch_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value JSONB NOT NULL,
        PRIMARY KEY (branch_id, key)
      );

      CREATE TABLE IF NOT EXISTS branches (
        branch_id TEXT PRIMARY KEY,
        branch_name TEXT NOT NULL,
        address TEXT DEFAULT '',
        active BOOLEAN DEFAULT TRUE
      );

      -- បង្កើតតារាង users ដែលអ្នកត្រូវការ
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20),
        name VARCHAR(100),
        active BOOLEAN DEFAULT true,
        branch_id VARCHAR(50),
        permissions JSONB DEFAULT '{}'
      );
    `);

    console.log("✅ តារាងទាំងអស់ត្រូវបានបង្កើតដោយជោគជ័យ (រួមទាំង users)!");
  } catch (err) {
    console.error("❌ កំហុសក្នុងការបង្កើតតារាង:", err);
  } finally {
    await client.end();
  }
}

setupDatabase();

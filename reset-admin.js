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

    // ១. កំណត់សិទ្ធិប្រើប្រាស់ Schema public
    await client.query("CREATE SCHEMA IF NOT EXISTS public;");
    await client.query("SET search_path TO public;");

    // ២. បង្កើត Table ដោយបញ្ជាក់ Schema ឱ្យច្បាស់
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.users (
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
    console.log("✅ Table 'public.users' verified.");

    // ៣. លុបនិងបញ្ចូល Admin ថ្មី
    await client.query("DELETE FROM public.users WHERE username = 'admin'");

    const fullPermissions = {
      can_edit_menu: true, can_view_report: true,
      can_manage_users: true, can_delete_orders: true,
      can_change_settings: true
    };

    const hashedAdmin = hashPassword("admin123");

    await client.query(
      `INSERT INTO public.users (username, password, role, name, active, branch_id, permissions) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ["admin", hashedAdmin, "admin", "Administrator", true, "all", JSON.stringify(fullPermissions)]
    );

    console.log("✅ Admin user reset successfully in 'public.users'!");
    console.log("   Username: admin | Password: admin123");

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await client.end();
  }
}

resetAdmin();

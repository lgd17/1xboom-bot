require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const createTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      telegram_id BIGINT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      lang TEXT DEFAULT 'fr'
    );
  `;

  try {
    await pool.query(query);
    console.log("✅ Table 'users' créée (ou déjà existante).");
  } catch (err) {
    console.error("❌ Erreur création table :", err.message);
  } finally {
    await pool.end();
  }
};

createTable();

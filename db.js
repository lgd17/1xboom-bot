
require('dotenv').config(); // ✅ charge les variables depuis .env
const { Pool } = require('pg');

// ✅ Connexion PostgreSQL via .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // ✅ important pour Supabase
  }
});

// ✅ Gestion des erreurs côté base
pool.on('error', (err) => {
  console.error('❌ Erreur inattendue côté PostgreSQL :', err);
  process.exit(-1);
});

async function insertManualCoupon(content, mediaUrl, mediaType, date) {
  const query = `
    INSERT INTO daily_pronos (content, media_url, media_type, date)
    VALUES ($1, $2, $3, $4)
  `;
  const values = [content, mediaUrl, mediaType, date];

  try {
    await pool.query(query, values);
    console.log("✅ Prono inséré avec succès.");
  } catch (err) {
    console.error("❌ Erreur lors de l'insertion :", err);
  }
}

module.exports = {
  pool,
  insertManualCoupon
};

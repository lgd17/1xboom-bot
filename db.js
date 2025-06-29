require('dotenv').config(); // Charger les variables .env
const { Pool } = require('pg');

// ✅ Création du pool PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ✅ Gestion des erreurs côté base
pool.on('error', (err) => {
  console.error('❌ Erreur inattendue côté PostgreSQL :', err);
  process.exit(-1);
});

// ✅ Fonction : insérer un prono manuel dans la table daily_pronos
async function insertManualCoupon(content, mediaUrl, mediaType, date, type = 'gratuit') {
  const query = `
    INSERT INTO daily_pronos (content, media_url, media_type, date, type)
    VALUES ($1, $2, $3, $4, $5)
  `;
  const values = [content, mediaUrl, mediaType, date, type];

  try {
    await pool.query(query, values);
    console.log("✅ Prono inséré avec succès.");
  } catch (err) {
    console.error("❌ Erreur lors de l'insertion :", err);
  }
}

// ✅ Export unique
module.exports = {
  pool,
  insertManualCoupon
};

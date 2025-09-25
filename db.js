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

// --- insertManualCoupon adapté pour file_id avec type par défaut ---
async function insertManualCoupon(content, mediaFileId, mediaType, dateOnly, type = "gratuit") {
  try {
    if (!dateOnly) throw new Error("Date manquante");

    // Normalisation de date_only (YYYY-MM-DD)
    let normalizedDate;
    if (dateOnly instanceof Date) {
      normalizedDate = dateOnly.toISOString().slice(0, 10);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      normalizedDate = dateOnly;
    } else {
      throw new Error("Format de date_only invalide : " + dateOnly);
    }

    // Insertion avec UPSERT sur date_only
    await pool.query(
      `
      INSERT INTO daily_pronos (content, media_url, media_type, date_only, type)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (date_only) DO UPDATE
      SET content = EXCLUDED.content,
          media_url = EXCLUDED.media_url,
          media_type = EXCLUDED.media_type,
          type = EXCLUDED.type
      `,
      [content, mediaFileId, mediaType, normalizedDate, type]
    );

    return { success: true };
  } catch (err) {
    console.error("❌ Erreur lors de l'ajout manuel :", err);
    return { success: false, error: err };
  }
}

// ✅ Export unique
module.exports = {
  pool,
  insertManualCoupon
};

// notify_validated_users.js
require('dotenv').config();
const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    // Sélectionne les utilisateurs validés qui sont encore listés dans la table de vérification en attente
    const { rows } = await pool.query(`
      SELECT telegram_id FROM pending_verifications
      WHERE telegram_id IN (SELECT telegram_id FROM verified_users)
    `);

    for (const row of rows) {
      await bot.sendMessage(row.telegram_id, '✅ Tu as été validé ! Tu peux désormais accéder aux pronostics du jour.');
      await pool.query('DELETE FROM pending_verifications WHERE telegram_id = $1', [row.telegram_id]);
    }
  } catch (err) {
    console.error('Erreur lors de la notification des utilisateurs validés :', err);
  } finally {
    await pool.end();
  }
})();

// notify_validated_users.js
require('dotenv').config();
const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const { rows } = await pool.query(`
    SELECT v.telegram_id
    FROM verified_users v
    LEFT JOIN pending_verifications p ON v.telegram_id = p.telegram_id
    WHERE p.telegram_id IS NOT NULL
  `);

  for (const row of rows) {
    await bot.sendMessage(row.telegram_id, '✅ Tu as été validé ! Tu peux désormais accéder aux pronostics du jour.');
    await pool.query('DELETE FROM pending_verifications WHERE telegram_id = $1', [row.telegram_id]);
  }

  await pool.end();
})();
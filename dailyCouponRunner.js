// dailyCouponRunner.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const schedule = require('node-schedule');

const generateCouponEurope = require('./generateCouponEurope');
const generateCouponAfrica = require('./generateCouponAfrica');
const generateCouponAmerica = require('./generateCouponAmerica');
const generateCouponAsia = require('./generateCouponAsia');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ✅ Planifié pour 7h15 UTC tous les jours
schedule.scheduleJob('15 7 * * *', async () => {
  const today = new Date().toISOString().split('T')[0];

  try {
    // Vérifier s'il existe déjà un coupon manuel pour aujourd'hui
    const { rows } = await pool.query(
      "SELECT id FROM daily_pronos WHERE created_at::date = CURRENT_DATE AND source = 'manual'"
    );

    if (rows.length > 0) {
      console.log('✅ Coupon manuel déjà inséré, génération automatique annulée.');
      return;
    }

    const generators = [
      { fn: generateCouponEurope, region: 'Europe' },
      { fn: generateCouponAfrica, region: 'Afrique' },
      { fn: generateCouponAmerica, region: 'Amérique' },
      { fn: generateCouponAsia, region: 'Asie' }
    ];

    for (const gen of generators) {
      const result = await gen.fn();

      if (!result || !result.content) continue;

      // Insérer dans daily_pronos avec tag région
      await pool.query(
        `INSERT INTO daily_pronos (content, media_url, media_type, source, created_at, region)
         VALUES ($1, $2, $3, $4, NOW(), $5)`,
        [result.content, result.media_url, result.media_type, result.source, gen.region]
      );

      // Récupérer tous les utilisateurs validés
      const users = await pool.query('SELECT telegram_id FROM verified_users');
      for (const user of users.rows) {
        await bot.sendMessage(user.telegram_id, result.content, { parse_mode: 'Markdown' });
      }
    }

    console.log('✅ Coupons auto insérés et envoyés aux utilisateurs vérifiés.');
  } catch (err) {
    console.error('❌ Erreur dailyCouponRunner:', err.message);
  } finally {
    await pool.end();
  }
});

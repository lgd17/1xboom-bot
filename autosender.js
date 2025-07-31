const schedule = require('node-schedule');
const pool = require('./db');
const bot = require('./bot');
const generateCoupon = require('./generateCoupon'); // suppose que ça retourne une string
const { format } = require('date-fns');

// Remplace par l'@username de ton canal (si public) ou son ID (si privé, avec -100...)
const CHANNEL_ID = '@nom_de_ton_canal'; // 

schedule.scheduleJob('0 6 * * *', async () => {
  const result = await pool.query("SELECT * FROM daily_pronos WHERE date = CURRENT_DATE LIMIT 1");
  const coupon = result.rows.length > 0 ? result.rows[0].content : "⚠️ Aucun coupon disponible aujourd'hui.";

  const users = await pool.query("SELECT telegram_id FROM verified_users");

  for (const user of users.rows) {
    await bot.sendMessage(user.telegram_id, `🎯 *Pronostic du jour :*\n\n${coupon}`, {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [
          ["🏆 Mes Points", "🤝 Parrainage"],
          ["🆘 Assistance 🤖"]
        ],
        resize_keyboard: true
      }
    });

    await pool.query(`
      INSERT INTO daily_access (telegram_id, date, clicked)
      VALUES ($1, CURRENT_DATE, true)
      ON CONFLICT (telegram_id, date) DO UPDATE SET clicked = true
    `, [user.telegram_id]);
  }

  // ✅ Message d'alerte dans le canal
  await bot.sendMessage(CHANNEL_ID, `📢 *Nouveau coupon du jour disponible !*\n\n🎯 Connecte-toi à ton bot pour recevoir le pronostic automatique d’aujourd’hui.`, {
    parse_mode: "Markdown"
  });
});


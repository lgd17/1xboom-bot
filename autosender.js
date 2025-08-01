require("dotenv").config();
const { pool } = require("./db");
const schedule = require("node-schedule");
const generateCouponEurope = require("./generateCouponEurope");
const generateCouponAfrica = require("./generateCouponAfrica");
const generateCouponAmerica = require("./generateCouponAmerica");
const generateCouponAsia = require("./generateCouponAsia");
const { formatMatchTips } = require("./couponUtils");
const bot = require('./bot'); 
const CHANNEL_ID = process.env.CHANNEL_ID; 


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/

schedule.scheduleJob('0 6 * * *', async () => {
  const result = await pool.query("SELECT * FROM daily_pronos WHERE date = CURRENT_DATE LIMIT 1");
  const coupon = result.rows.length > 0 ? result.rows[0].content : "⚠️ Aucun coupon disponible aujourd'hui.";

  const users = await pool.query("SELECT telegram_id FROM verified_users");

  for (const user of users.rows) {
    await bot.sendMessage(user.telegram_id, `🎯*𝗖𝗢𝗨𝗣𝗢𝗡 𝗗𝗨 𝗝𝗢𝗨𝗥*🎯\n\n${coupon}`, {
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
  await bot.sendMessage(CHANNEL_ID, `📢 *Pronostic du jour disponible !*\n\nConnecte-toi à ton bot 👉 @Official_1XBOOM_bot`, {
    parse_mode: "Markdown"
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////
module.exports = function setupAutoSender() {

  // CRON : Tous les jours à 7h15 UTC
  schedule.scheduleJob("15 7 * * *", async () => {
    console.log("⏰ Tâche autoSender lancée");

    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await pool.query("SELECT * FROM daily_pronos WHERE date = $1 LIMIT 1", [today]);

      if (result.rows.length === 0) {
        console.log("⚠️ Aucun coupon pour aujourd'hui");
        return;
      }

      const couponData = JSON.parse(result.rows[0].matches); // assuming 'matches' is the JSON column

      const message = `🎯*𝗖𝗢𝗨𝗣𝗢𝗡 𝗗𝗨 𝗝𝗢𝗨𝗥*🎯\n\n${formatMatchTips(couponData)}\n\n✅*Bonne chance*!`;

      // Envoi aux utilisateurs validés
      const users = await pool.query("SELECT telegram_id FROM verified_users");

      for (const user of users.rows) {
        try {
          await bot.sendMessage(user.telegram_id, message, { parse_mode: "Markdown" });
        } catch (err) {
          console.error(`❌ Erreur envoi à ${user.telegram_id}:`, err.message);
        }
      }

      // Alerte canal avec lien vers bot
      await bot.sendMessage(CHANNEL_ID, 
        `📢 *Pronostic du jour disponible !*\n\nConnecte-toi à ton bot 👉 @Official_1XBOOM_bot`, 
        { parse_mode: "Markdown" }
      );

      console.log("✅🚀 Coupon généré automatiquement et diffusé.");

    } catch (error) {
      console.error("❌ Erreur dans autoSender:", error);
    }
  });
}; 

 await pool.query(`
      INSERT INTO daily_access (telegram_id, date, clicked)
      VALUES ($1, CURRENT_DATE, true)
      ON CONFLICT (telegram_id, date) DO UPDATE SET clicked = true
    `, [user.telegram_id]);
  }




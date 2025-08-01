require("dotenv").config();
const { pool } = require("./db");
const schedule = require("node-schedule");
const generateCouponEurope = require("./generateCouponEurope");
const generateCouponAfrica = require("./generateCouponAfrica");
const generateCouponAmerica = require("./generateCouponAmerica");
const generateCouponAsia = require("./generateCouponAsia");
const { formatMatchTips } = require("./couponUtils");
const bot = require("./bot");

const CHANNEL_ID = process.env.CHANNEL_ID;
const BOT_LINK = process.env.BOT_LINK || "https://t.me/onexboom_bot";

module.exports = function setupAutoSender() {
  // ✅ Envoi du coupon manuel à 6h55 UTC
  schedule.scheduleJob("55 6 * * *", async () => {
    try {
      const { rows } = await pool.query(`
        SELECT * FROM daily_pronos WHERE date = CURRENT_DATE
      `);

      if (rows.length > 0) {
        const coupon = rows[0];
        const matches = JSON.parse(coupon.matches || coupon.content || "[]");
        const message = formatMatchTips(matches);

        // Envoi aux utilisateurs validés
        const users = await pool.query("SELECT telegram_id FROM verified_users");
        for (let user of users.rows) {
          await bot.sendMessage(user.telegram_id, `🎯*𝗖𝗢𝗨𝗣𝗢𝗡 𝗗𝗨 𝗝𝗢𝗨𝗥*🎯\n\n${message}`, { parse_mode: "Markdown" });
        }

        // ✅ Annonce dans le canal
        await bot.sendMessage(CHANNEL_ID, `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot  : ${BOT_LINK}`);
      }
    } catch (err) {
      console.error("Erreur envoi coupon manuel :", err);
    }
  });

  // ✅ Génération + envoi coupon API à 7h15 UTC
  schedule.scheduleJob("15 7 * * *", async () => {
    try {
      const { rows } = await pool.query(`
        SELECT * FROM daily_pronos WHERE date = CURRENT_DATE
      `);

      if (rows.length === 0) {
        const europe = await generateCouponEurope();
        const africa = await generateCouponAfrica();
        const america = await generateCouponAmerica();
        const asia = await generateCouponAsia();

        const allMatches = [...europe, ...africa, ...america, ...asia];

        if (allMatches.length > 0) {
          await pool.query(`
            INSERT INTO daily_pronos (date, matches)
            VALUES (CURRENT_DATE, $1)
          `, [JSON.stringify(allMatches)]);

          const message = formatMatchTips(allMatches);

          const users = await pool.query("SELECT telegram_id FROM verified_users");
          for (let user of users.rows) {
            await bot.sendMessage(user.telegram_id, `🎯*𝗖𝗢𝗨𝗣𝗢𝗡 𝗗𝗨 𝗝𝗢𝗨𝗥*🎯\n\n${message}`, { parse_mode: "Markdown" });
          }

          // ✅ Annonce dans le canal
          await bot.sendMessage(CHANNEL_ID, `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot  : ${BOT_LINK}`);
        }
      }
    } catch (err) {
      console.error("Erreur génération coupon API :", err);
    }
  });
};

 await pool.query(`
      INSERT INTO daily_access (telegram_id, date, clicked)
      VALUES ($1, CURRENT_DATE, true)
      ON CONFLICT (telegram_id, date) DO UPDATE SET clicked = true
    `, [user.telegram_id]);
  }

// 🧹 Nettoyage des pronos API de plus de 3 jours chaque nuit à 2h
schedule.scheduleJob("0 2 * * *", async () => {
  try {
    const { rowCount } = await pool.query(`
      DELETE FROM daily_pronos
      WHERE created_at < NOW() - INTERVAL '3 days'
      AND content ILIKE '%api%'
    `);

    console.log(`🧹 ${rowCount} prono(s) API supprimé(s).`);
  } catch (err) {
    console.error("❌ Erreur de nettoyage :", err.message);
  }
});


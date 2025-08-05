require("dotenv").config();
const { pool } = require("./db");
const schedule = require("node-schedule");
const moment = require("moment-timezone");

const generateCouponEurope = require("./generateCouponEurope");
const generateCouponAfrica = require("./generateCouponAfrica");
const generateCouponAmerica = require("./generateCouponAmerica");
const generateCouponAsia = require("./generateCouponAsia");
const { formatMatchTips } = require("./couponUtils");
const bot = require("./bot");

const CHANNEL_ID = process.env.CHANNEL_ID;
const BOT_LINK = process.env.BOT_LINK || "https://t.me/Official_1XBOOM_bot";

module.exports = function setupAutoSender() {
  // ✅ Exécution toutes les minutes
  schedule.scheduleJob("* * * * *", async () => {
    const nowLome = moment().tz("Africa/Lome");
    const hour = nowLome.hour();
    const minute = nowLome.minute();

    // ✅ Envoi manuel du coupon à 06:55 (heure de Lomé)
    if (hour === 6 && minute === 55) {
      await sendManualCoupon();
    }

    // ✅ Génération + envoi coupon API à 07:15 (heure de Lomé)
    if (hour === 7 && minute === 15) {
      await generateAndSendCoupon();
    }

    // ✅ Nettoyage à 06:55 (heure de Lomé)
    if (hour === 6 && minute === 55) {
      await cleanOldData();
    }
  });

  async function sendManualCoupon() {
    try {
      const { rows } = await pool.query(`
        SELECT * FROM daily_pronos WHERE date = CURRENT_DATE
      `);

      if (rows.length > 0) {
        const coupon = rows[0];
        const matches = JSON.parse(coupon.matches || coupon.content || "[]");
        const message = formatMatchTips(matches);

        const users = await pool.query("SELECT telegram_id FROM verified_users");
        for (let user of users.rows) {
          await bot.sendMessage(user.telegram_id, `🎯*𝗖𝗢𝗨𝗣𝗢𝗡 𝗗𝗨 𝗝𝗢𝗨𝗥*🎯\n\n${message}`, { parse_mode: "Markdown" });
          await pool.query(`
            INSERT INTO daily_access (telegram_id, date, clicked)
            VALUES ($1, CURRENT_DATE, true)
            ON CONFLICT (telegram_id, date) DO UPDATE SET clicked = true
          `, [user.telegram_id]);
        }

        await bot.sendMessage(CHANNEL_ID, `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`);
      }
    } catch (err) {
      console.error("❌ Erreur envoi manuel :", err);
    }
  }

  async function generateAndSendCoupon() {
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

            await pool.query(`
              INSERT INTO daily_access (telegram_id, date, clicked)
              VALUES ($1, CURRENT_DATE, true)
              ON CONFLICT (telegram_id, date) DO UPDATE SET clicked = true
            `, [user.telegram_id]);
          }

          await bot.sendMessage(CHANNEL_ID, `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`);
        }
      }
    } catch (err) {
      console.error("❌ Erreur génération coupon API :", err);
    }
  }

  async function cleanOldData() {
    try {
      const { rowCount: pronosDeleted } = await pool.query(`
        DELETE FROM daily_pronos
        WHERE created_at < NOW() - INTERVAL '3 days'
        AND date < CURRENT_DATE
      `);

      const { rowCount: accessDeleted } = await pool.query(`
        DELETE FROM daily_access
        WHERE date < CURRENT_DATE - INTERVAL '3 days'
      `);

      const today = moment().tz("Africa/Lome").format("YYYY-MM-DD");
      const message = `🧹 *Nettoyage automatique effectué*\n\n📅 Date : *${today}*\n🗑️ Pronostics supprimés : *${pronosDeleted}*\n👤 Accès supprimés : *${accessDeleted}*`;

      await bot.sendMessage(process.env.ADMIN_ID, message, { parse_mode: "Markdown" });

    } catch (err) {
      console.error("❌ Erreur de nettoyage :", err.message);
      await bot.sendMessage(process.env.ADMIN_ID, `❌ Erreur lors du nettoyage : ${err.message}`);
    }
  }
};


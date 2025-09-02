// autoSend.js
const { pool } = require("./db");
const moment = require("moment-timezone");
const generateCouponEurope = require("./generateCouponEurope");
const generateCouponAfrica = require("./generateCouponAfrica");
const generateCouponAmerica = require("./generateCouponAmerica");
const generateCouponAsia = require("./generateCouponAsia");
const { formatMatchTips } = require("./couponUtils");
const bot = require("./bot");

const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_ID = process.env.ADMIN_ID;
const BOT_LINK = process.env.BOT_LINK || "https://t.me/Official_1XBOOM_bot";

// Petite fonction sleep pour limiter le rythme d’envoi
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Envoi aux utilisateurs par batch (texte ou média)
async function sendToUsers(users, message, batchSize = 30, delayMs = 2000) {
  let success = 0;
  let fail = 0;
  const start = Date.now();

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async u => {
        try {
          if (typeof message === "string") {
            await bot.sendMessage(u.telegram_id, message, { parse_mode: "Markdown" });
          } else if (message.type === "photo") {
            await bot.sendPhoto(u.telegram_id, message.media, {
              caption: message.caption,
              parse_mode: "Markdown"
            });
          }
          success++;
        } catch (err) {
          console.error(`⚠️ Erreur envoi à ${u.telegram_id}:`, err.message);
          fail++;
        }
      })
    );
    if (i + batchSize < users.length) await sleep(delayMs);
  }

  const durationSec = Math.round((Date.now() - start) / 1000);
  return { success, fail, durationSec };
}

// Envoi manuel
async function sendManualCoupon() {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM daily_pronos WHERE date_only = CURRENT_DATE AND type = 'gratuit' LIMIT 1`
    );
    if (rows.length === 0) {
      console.log("⚠️ Aucun coupon manuel trouvé pour aujourd’hui");
      return;
    }

    const coupon = rows[0];
    let message;

    if (coupon.media_url && coupon.media_type === "photo") {
      message = {
        type: "photo",
        media: coupon.media_url,
        caption: coupon.content || "🎯 *Coupon du jour* 🎯"
      };
    } else {
      const matches = coupon.matches ? JSON.parse(coupon.matches) : [];
      const textContent = coupon.content || formatMatchTips(matches);
      message = `🎯 *𝗖𝗢𝗨𝗣𝗢𝗡 𝗗𝗨 𝗝𝗢𝗨𝗥* 🎯\n\n${textContent}`;
    }

    const { rows: users } = await pool.query("SELECT telegram_id FROM verified_users");

    const report = await sendToUsers(users, message);

    for (let user of users) {
      await pool.query(
        `
        INSERT INTO daily_access (telegram_id, date, clicked)
        VALUES ($1, CURRENT_DATE, true)
        ON CONFLICT (telegram_id, date) DO UPDATE SET clicked = true
        `,
        [user.telegram_id]
      );
    }

    // Notification canal → avec image si dispo
    if (coupon.media_url && coupon.media_type === "photo") {
      await bot.sendPhoto(CHANNEL_ID, coupon.media_url, {
        caption: `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`
      });
    } else {
      await bot.sendMessage(
        CHANNEL_ID,
        `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`
      );
    }

    // Rapport ADMIN_ID
    if (ADMIN_ID) {
      await bot.sendMessage(
        ADMIN_ID,
        `✅ *Coupon envoyé*\n👥 Utilisateurs : *${users.length}*\n📨 Réussis : *${report.success}*\n⚠️ Échecs : *${report.fail}*\n⏱️ Durée : *${report.durationSec}s*`,
        { parse_mode: "Markdown" }
      );
    }

    console.log("✅ Coupon manuel envoyé avec succès");
  } catch (err) {
    console.error("❌ Erreur envoi manuel :", err);
  }
}

// Génération + envoi auto
async function generateAndSendCoupon() {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM daily_pronos WHERE date_only = CURRENT_DATE AND type = 'gratuit'`
    );
    if (rows.length > 0) {
      console.log("⚠️ Coupon déjà généré aujourd’hui, envoi auto annulé");
      return;
    }

    const europe = await generateCouponEurope();
    const africa = await generateCouponAfrica();
    const america = await generateCouponAmerica();
    const asia = await generateCouponAsia();

    const allMatches = [...europe, ...africa, ...america, ...asia];
    if (allMatches.length === 0) {
      console.log("⚠️ Aucun match généré aujourd’hui");
      return;
    }

    await pool.query(
      `INSERT INTO daily_pronos (matches, type) VALUES ($1, 'gratuit')`,
      [JSON.stringify(allMatches)]
    );

    const message = `🎯 *𝗖𝗢𝗨𝗣𝗢𝗡 𝗗𝗨 𝗝𝗢𝗨𝗥* 🎯\n\n${formatMatchTips(allMatches)}`;
    const { rows: users } = await pool.query("SELECT telegram_id FROM verified_users");

    const report = await sendToUsers(users, message);

    for (let user of users) {
      await pool.query(
        `
        INSERT INTO daily_access (telegram_id, date, clicked)
        VALUES ($1, CURRENT_DATE, true)
        ON CONFLICT (telegram_id, date) DO UPDATE SET clicked = true
        `,
        [user.telegram_id]
      );
    }

    await bot.sendMessage(
      CHANNEL_ID,
      `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`
    );

    if (ADMIN_ID) {
      await bot.sendMessage(
        ADMIN_ID,
        `✅ *Coupon généré et envoyé*\n👥 Utilisateurs : *${users.length}*\n📨 Réussis : *${report.success}*\n⚠️ Échecs : *${report.fail}*\n⏱️ Durée : *${report.durationSec}s*`,
        { parse_mode: "Markdown" }
      );
    }

    console.log("✅ Coupon généré et envoyé avec succès");
  } catch (err) {
    console.error("❌ Erreur génération coupon API :", err);
  }
}

// Nettoyage auto
async function cleanOldData() {
  try {
    const { rowCount: pronosDeleted } = await pool.query(`
      DELETE FROM daily_pronos
      WHERE created_at < NOW() - INTERVAL '3 days'
      AND date_only < CURRENT_DATE
    `);

    const { rowCount: accessDeleted } = await pool.query(`
      DELETE FROM daily_access
      WHERE date < CURRENT_DATE - INTERVAL '3 days'
    `);

    const today = moment().tz("Africa/Lome").format("YYYY-MM-DD");
    const message = `🧹 *Nettoyage automatique effectué*\n\n📅 Date : *${today}*\n🗑️ Pronostics supprimés : *${pronosDeleted}*\n👤 Accès supprimés : *${accessDeleted}*`;

    if (ADMIN_ID) {
      await bot.sendMessage(ADMIN_ID, message, { parse_mode: "Markdown" });
    }

    console.log("✅ Nettoyage terminé :", pronosDeleted, "pronos et", accessDeleted, "accès supprimés");
  } catch (err) {
    console.error("❌ Erreur de nettoyage :", err.message);
    if (ADMIN_ID) {
      await bot.sendMessage(ADMIN_ID, `❌ Erreur lors du nettoyage : ${err.message}`);
    }
  }
}

module.exports = {
  sendManualCoupon,
  generateAndSendCoupon,
  cleanOldData
};

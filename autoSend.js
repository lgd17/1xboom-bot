// autoSend.js
// autoSend.js
const { pool } = require("./db");
const moment = require("moment-timezone");
const schedule = require("node-schedule");
const generateCouponEurope = require("./generateCouponEurope");
const generateCouponAfrica = require("./generateCouponAfrica");
const generateCouponAmerica = require("./generateCouponAmerica");
const generateCouponAsia = require("./generateCouponAsia");
const { formatMatchTips } = require("./couponUtils");
const bot = require("./bot");

const CHANNEL_ID = process.env.CHANNEL_ID;
const BOT_LINK = process.env.BOT_LINK || "https://t.me/Official_1XBOOM_bot";

// Petite fonction sleep pour limiter le rythme d’envoi
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Envoi aux utilisateurs par batch pour éviter 429
async function sendToUsers(users, message, batchSize = 30, delayMs = 2000) {
  console.log(`➡️ Envoi du message à ${users.length} utilisateurs`);
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async u => {
        try {
          await bot.sendMessage(u.telegram_id, message, { parse_mode: "Markdown" });
        } catch (err) {
          console.error(`⚠️ Erreur envoi à ${u.telegram_id}:`, err.message);
        }
      })
    );
    if (i + batchSize < users.length) await sleep(delayMs);
  }
}

async function sendManualCoupon() {
  try {
    const { rows } = await pool.query(`SELECT * FROM daily_pronos WHERE date = CURRENT_DATE`);
    if (rows.length === 0) {
      console.log("⚠️ Aucun coupon manuel trouvé pour aujourd’hui");
      return;
    }

    const coupon = rows[0];
    const matches = JSON.parse(coupon.matches || coupon.content || "[]");
    const message = formatMatchTips(matches);

    const { rows: users } = await pool.query("SELECT telegram_id FROM verified_users");

    await sendToUsers(users, `🎯*𝗖𝗢𝗨𝗣𝗢𝗡 𝗗𝗨 𝗝𝗢𝗨𝗥*🎯\n\n${message}`);

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

    console.log("✅ Coupon manuel envoyé avec succès");
  } catch (err) {
    console.error("❌ Erreur envoi manuel :", err);
  }
}

async function generateAndSendCoupon() {
  try {
    const { rows } = await pool.query(`SELECT * FROM daily_pronos WHERE date = CURRENT_DATE`);
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
      `INSERT INTO daily_pronos (date, matches) VALUES (CURRENT_DATE, $1)`,
      [JSON.stringify(allMatches)]
    );

    const message = formatMatchTips(allMatches);
    const { rows: users } = await pool.query("SELECT telegram_id FROM verified_users");

    await sendToUsers(users, `🎯*𝗖𝗢𝗨𝗣𝗢𝗡 𝗗𝗨 𝗝𝗢𝗨𝗥*🎯\n\n${message}`);

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

    console.log("✅ Coupon généré et envoyé avec succès");
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
    console.log("✅ Nettoyage terminé :", pronosDeleted, "pronos et", accessDeleted, "accès supprimés");
  } catch (err) {
    console.error("❌ Erreur de nettoyage :", err.message);
    await bot.sendMessage(process.env.ADMIN_ID, `❌ Erreur lors du nettoyage : ${err.message}`);
  }
}

// ==========================
// 🚀 PLANIFICATION AUTOMATIQUE
// ==========================

// 06h15 (Lomé) → envoi manuel
schedule.scheduleJob(
  { hour: 6, minute: 15, tz: "Africa/Lome" },
  async () => {
    console.log("⏰ 06h15 - Tâche planifiée : envoi du coupon manuel");
    await sendManualCoupon();
  }
);

// 06h25 (Lomé) → nettoyage automatique
schedule.scheduleJob(
  { hour: 6, minute: 25, tz: "Africa/Lome" },
  async () => {
    console.log("⏰ 06h25 - Tâche planifiée : nettoyage automatique");
    await cleanOldData();
  }
);

// 07h15 (Lomé) → génération + envoi auto
schedule.scheduleJob(
  { hour: 7, minute: 15, tz: "Africa/Lome" },
  async () => {
    console.log("⏰ 07h15 - Tâche planifiée : génération et envoi du coupon auto");
    await generateAndSendCoupon();
  }
);

module.exports = {
  sendManualCoupon,
  generateAndSendCoupon,
  cleanOldData
};

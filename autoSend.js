const { pool } = require("./db");
const bot = require("./bot");
const moment = require("moment-timezone");
const schedule = require("node-schedule");
const fetch = require("node-fetch");

// ----- Modules de génération -----
const generateCouponEurope = require("./generateCouponEurope");
const generateCouponAfrica = require("./generateCouponAfrica");
const generateCouponAmerica = require("./generateCouponAmerica");
const generateCouponAsia = require("./generateCouponAsia");
const { formatMatchTips } = require("./couponUtils");

// ----- ENV -----
const ADMIN_ID = process.env.ADMIN_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BOT_LINK = process.env.BOT_LINK || "https://t.me/Official_1XBOOM_bot";
const PING_URL = process.env.PING_URL || "https://onexadmin-bot.onrender.com/ping";

// ----- Helpers -----
const sleep = (ms) => new Promise(res => setTimeout(res, ms));
const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("⏱ Timeout du ping")), ms));

// Échapper HTML et fermer balises
function escapeHtml(text = "") {
  let t = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const tags = ["b", "i"];
  tags.forEach(tag => {
    const o = (t.match(new RegExp(`&lt;${tag}&gt;`, "g")) || []).length;
    const c = (t.match(new RegExp(`&lt;/${tag}&gt;`, "g")) || []).length;
    if (o > c) t += `&lt;/${tag}&gt;`.repeat(o - c);
  });
  return t;
}

// ======================
// 🔹 Fonction Ping
// ======================
async function pingServer() {
  try {
    const res = await Promise.race([fetch(PING_URL), timeout(10000)]);
    if (res.ok) {
      console.log(`✅ Ping réussi (${res.status})`);
    } else {
      console.warn(`⚠️ Ping échoué (${res.status})`);
      if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⚠️ Ping échoué (${res.status})`);
    }
  } catch (err) {
    console.error("❌ Erreur ping :", err.message);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Erreur ping : ${err.message}`);
  }
}

// ======================
// 🔹 Retry des échecs
// ======================
async function retryFailedSends(batchSize = 30, delayMs = 2000) {
  const { rows } = await pool.query(`SELECT * FROM failed_sends WHERE date_sent = CURRENT_DATE`);
  if (!rows.length) return console.log("✅ Aucun envoi échoué à relancer aujourd’hui");

  console.log(`🔁 Relance de ${rows.length} envois échoués`);
  const users = rows.map(f => ({ telegram_id: f.telegram_id }));
  const { success, fail } = await sendToUsers(users, "📨 Relance du coupon du jour !", batchSize, delayMs);
  console.log(`✅ Relance terminée (${success} OK / ${fail} erreurs)`);
  await pool.query(`DELETE FROM failed_sends WHERE date_sent = CURRENT_DATE`);
}

// ======================
// 🔹 Envoi générique
// ======================
async function sendToUsers(users, message, batchSize = 30, delayMs = 2000) {
  let success = 0, fail = 0;
  const start = Date.now();

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    await Promise.all(batch.map(async u => {
      const chatId = u.telegram_id;
      const name = u.first_name || (u.username ? `@${u.username}` : "ami");
      try {
        await bot.sendMessage(chatId, `Salut <b>${escapeHtml(name)}</b> 👋\n\n${escapeHtml(message)}`, { parse_mode: "HTML" });
        success++;
      } catch (err) {
        fail++;
        console.error(`⚠️ Envoi échoué ${chatId} :`, err.message);
        await pool.query(
          `INSERT INTO failed_sends (telegram_id, message_type, reason) VALUES ($1,$2,$3)`,
          [chatId, "text", err.message]
        );
      }
    }));
    if (i + batchSize < users.length) await sleep(delayMs);
  }

  return { success, fail, durationSec: Math.round((Date.now() - start) / 1000) };
}

// ======================
// 🔹 Envoi manuel du coupon
// ======================
async function sendManualCoupon() {
  try {
    const { rows: coupons } = await pool.query(`
      SELECT * FROM daily_pronos WHERE date_only = CURRENT_DATE AND type = 'gratuit' LIMIT 1
    `);
    if (!coupons.length) return console.log("⚠️ Aucun coupon trouvé pour aujourd’hui");
    const coupon = coupons[0];
    const { rows: users } = await pool.query(`SELECT telegram_id, first_name, username FROM verified_users`);
    if (!users.length) return console.log("⚠️ Aucun utilisateur trouvé");

    console.log(`🚀 Envoi manuel du coupon à ${users.length} utilisateurs...`);
    const message = coupon.content || formatMatchTips(JSON.parse(coupon.matches || "[]"));
    const { success, fail } = await sendToUsers(users, message);
    if (ADMIN_ID)
      await bot.sendMessage(ADMIN_ID, `✅ Coupon manuel : ${success} OK / ${fail} échecs`, { parse_mode: "HTML" });

    await retryFailedSends();
  } catch (err) {
    console.error("❌ Erreur envoi manuel :", err.message);
  }
}

// ======================
// 🔹 Génération auto du coupon
// ======================
async function generateAndSendCoupon() {
  try {
    const { rows } = await pool.query(`SELECT id FROM daily_pronos WHERE date_only = CURRENT_DATE AND type='gratuit'`);
    if (rows.length) return console.log("⚠️ Coupon déjà généré aujourd’hui");

    const matches = [
      ...(await generateCouponEurope()),
      ...(await generateCouponAfrica()),
      ...(await generateCouponAmerica()),
      ...(await generateCouponAsia())
    ];
    if (!matches.length) return console.log("⚠️ Aucun match généré");

    const insert = await pool.query(
      `INSERT INTO daily_pronos (matches,type) VALUES ($1,'gratuit') RETURNING id`,
      [JSON.stringify(matches)]
    );
    const text = `🎯 <b>COUPON DU JOUR</b> 🎯\n\n${escapeHtml(matches.join("\n\n"))}`;
    const { rows: users } = await pool.query(`SELECT telegram_id FROM verified_users`);
    const { success, fail, durationSec } = await sendToUsers(users, text);

    if (CHANNEL_ID)
      await bot.sendMessage(CHANNEL_ID, `📢 Le pronostic du jour est disponible !\n👉 ${BOT_LINK}`, { parse_mode: "HTML" });

    if (ADMIN_ID)
      await bot.sendMessage(ADMIN_ID,
        `✅ Coupon généré et envoyé\n👥 ${users.length} users\n📨 ${success} OK / ${fail} échecs\n⏱ ${durationSec}s`,
        { parse_mode: "HTML" });

    await retryFailedSends();
  } catch (err) {
    console.error("❌ Erreur génération coupon :", err.message);
  }
}

// ======================
// 🔹 Nettoyage automatique
// ======================
async function cleanOldData() {
  try {
    const { rowCount: pDel } = await pool.query(`DELETE FROM daily_pronos WHERE created_at < NOW() - INTERVAL '3 days'`);
    const { rowCount: aDel } = await pool.query(`DELETE FROM daily_access WHERE date < CURRENT_DATE - INTERVAL '3 days'`);
    console.log(`🧹 Nettoyage terminé (${pDel} pronos / ${aDel} accès)`);
  } catch (err) {
    console.error("❌ Erreur nettoyage :", err.message);
  }
}

// ======================
// 🔹 Rappel 16h
// ======================
async function sendDailyReminder() {
  const { rows: users } = await pool.query(`SELECT telegram_id, first_name, username FROM verified_users`);
  if (!users.length) return console.log("⚠️ Aucun utilisateur pour le rappel");

  console.log(`⏰ Envoi du rappel à ${users.length} utilisateurs`);
  for (const u of users) {
    const name = u.first_name || (u.username ? `@${u.username}` : "ami");
    try {
      const msg = await bot.sendMessage(u.telegram_id, `Salut ${name} 👋\n\n🎯 N'oublie pas ton coupon du jour !`, { parse_mode: "HTML" });
      // Suppression du message à 19h30
      schedule.scheduleJob({ hour: 19, minute: 30 }, async () => {
        try { await bot.deleteMessage(u.telegram_id, msg.message_id); } catch {}
      });
    } catch (err) {
      console.error(`⚠️ Erreur rappel ${name}:`, err.message);
    }
  }
  console.log("✅ Rappel 16h envoyé.");
}
};

// 16:00 Lomé → Rappel du coupon
schedule.scheduleJob("0 16 * * *", sendDailyReminder);

  sendManualCoupon,
  generateAndSendCoupon,
  cleanOldData,
  retryFailedSends,
  sendDailyReminder,
  pingServer
};

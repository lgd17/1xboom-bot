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

// Helper: sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: échappe le texte pour parse_mode HTML
function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Envoi aux utilisateurs par batch (texte ou média)
// users: [{ telegram_id }]
// message: string OR { type, media, caption }
async function sendToUsers(users, message, batchSize = 30, delayMs = 2000) {
  let success = 0;
  let fail = 0;
  const start = Date.now();

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async u => {
        try {
          const chatId = u.telegram_id || u.telegramId || u.id;
          if (!chatId) return fail++;

          if (typeof message === "string") {
            await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
          } else {
            const caption = message.caption ? escapeHtml(message.caption) : undefined;

            if (message.type === "photo") {
              await bot.sendPhoto(chatId, message.media, { caption, parse_mode: "HTML" });
            } else if (message.type === "video") {
              await bot.sendVideo(chatId, message.media, { caption, parse_mode: "HTML" });
            } else if (message.type === "video_note") {
              // video_note doesn't support caption -> send video note then caption text
              await bot.sendVideoNote(chatId, message.media);
              if (caption) await bot.sendMessage(chatId, caption, { parse_mode: "HTML" });
            } else if (message.type === "voice") {
              // sendVoice supports caption
              await bot.sendVoice(chatId, message.media, { caption, parse_mode: "HTML" });
            } else if (message.type === "audio") {
              await bot.sendAudio(chatId, message.media, { caption, parse_mode: "HTML" });
            } else if (message.type === "document") {
              await bot.sendDocument(chatId, message.media, { caption, parse_mode: "HTML" });
            } else if (message.type === "url") {
              // caption may be present
              const combined = `${caption ? caption + "\n\n" : ""}🔗 ${message.media}`;
              await bot.sendMessage(chatId, combined, { parse_mode: "HTML" });
            } else {
              // fallback to message text
              const txt = message.caption ? escapeHtml(message.caption) : String(message.media || "");
              await bot.sendMessage(chatId, txt, { parse_mode: "HTML" });
            }
          }
          success++;
        } catch (err) {
          console.error(`⚠️ Erreur envoi à ${u.telegram_id}:`, err?.message || err);
          fail++;
        }
      })
    );
    if (i + batchSize < users.length) await sleep(delayMs);
  }

  const durationSec = Math.round((Date.now() - start) / 1000);
  return { success, fail, durationSec };
}

// Envoi manuel (prono enregistré manuellement dans daily_pronos)
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

    // Construire message en fonction du media_type
    if (coupon.media_url && coupon.media_type) {
      const caption = coupon.content ? `🎯 <b>COUPON DU JOUR</b>\n\n${escapeHtml(coupon.content)}` : "🎯 <b>COUPON DU JOUR</b>";
      switch (coupon.media_type) {
        case "photo":
          message = { type: "photo", media: coupon.media_url, caption };
          break;
        case "video":
          message = { type: "video", media: coupon.media_url, caption };
          break;
        case "video_note":
          message = { type: "video_note", media: coupon.media_url, caption }; // caption will be sent as separate message
          break;
        case "voice":
          message = { type: "voice", media: coupon.media_url, caption };
          break;
        case "audio":
          message = { type: "audio", media: coupon.media_url, caption };
          break;
        case "document":
          message = { type: "document", media: coupon.media_url, caption };
          break;
        case "url":
          message = { type: "url", media: coupon.media_url, caption };
          break;
        default:
          // fallback to text
          message = coupon.content ? `🎯 <b>COUPON DU JOUR</b>\n\n${escapeHtml(coupon.content)}` : "🎯 <b>COUPON DU JOUR</b>";
      }
    } else {
      // Pas de media : générer texte à partir des matchs si besoin
      const matches = coupon.matches ? JSON.parse(coupon.matches) : [];
      const textContent = coupon.content || formatMatchTips(matches);
      message = `🎯 <b>COUPON DU JOUR</b> 🎯\n\n${escapeHtml(textContent)}`;
    }

    const { rows: users } = await pool.query("SELECT telegram_id FROM verified_users");

    const report = await sendToUsers(users, message);

    // Marque les utilisateurs comme ayant reçu le coupon
    for (let user of users) {
      try {
        await pool.query(
          `
          INSERT INTO daily_access (telegram_id, date, clicked)
          VALUES ($1, CURRENT_DATE, true)
          ON CONFLICT (telegram_id, date) DO UPDATE SET clicked = true
          `,
          [user.telegram_id]
        );
      } catch (e) {
        console.error("Erreur insert daily_access pour", user.telegram_id, e.message || e);
      }
    }

    // Notification canal
    try {
      if (coupon.media_url && coupon.media_type === "photo") {
        await bot.sendPhoto(CHANNEL_ID, coupon.media_url, {
          caption: `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`,
          parse_mode: "HTML"
        });
      } else if (coupon.media_url && coupon.media_type === "video") {
        await bot.sendVideo(CHANNEL_ID, coupon.media_url, {
          caption: `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`,
          parse_mode: "HTML"
        });
      } else if (coupon.media_url && coupon.media_type === "video_note") {
        await bot.sendVideoNote(CHANNEL_ID, coupon.media_url);
        await bot.sendMessage(CHANNEL_ID, `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`, { parse_mode: "HTML" });
      } else if (coupon.media_url && (coupon.media_type === "voice" || coupon.media_type === "audio")) {
        // send message then media (channels may not accept voice captions reliably)
        await bot.sendMessage(CHANNEL_ID, `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`, { parse_mode: "HTML" });
        if (coupon.media_type === "voice") await bot.sendVoice(CHANNEL_ID, coupon.media_url);
        else await bot.sendAudio(CHANNEL_ID, coupon.media_url);
      } else if (coupon.media_url && coupon.media_type === "document") {
        await bot.sendDocument(CHANNEL_ID, coupon.media_url, {
          caption: `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`,
          parse_mode: "HTML"
        });
      } else if (coupon.media_url && coupon.media_type === "url") {
        await bot.sendMessage(CHANNEL_ID, `📢 Le pronostic du jour est disponible !\n\n🔗 ${coupon.media_url}\n\nConnecte-toi à ton bot : ${BOT_LINK}`, { parse_mode: "HTML" });
      } else {
        await bot.sendMessage(CHANNEL_ID, `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`, { parse_mode: "HTML" });
      }
    } catch (e) {
      console.error("Erreur notification canal:", e.message || e);
    }

    // Rapport ADMIN_ID
    if (ADMIN_ID) {
      try {
        await bot.sendMessage(
          ADMIN_ID,
          `✅ <b>Coupon envoyé</b>\n👥 Utilisateurs : <b>${users.length}</b>\n📨 Réussis : <b>${report.success}</b>\n⚠️ Échecs : <b>${report.fail}</b>\n⏱️ Durée : <b>${report.durationSec}s</b>`,
          { parse_mode: "HTML" }
        );
      } catch (e) {
        console.error("Erreur envoi rapport admin:", e.message || e);
      }
    }

    console.log("✅ Coupon manuel envoyé avec succès");
  } catch (err) {
    console.error("❌ Erreur envoi manuel :", err);
    if (ADMIN_ID) {
      await bot.sendMessage(ADMIN_ID, `❌ Erreur envoi manuel : ${escapeHtml(err.message || String(err))}`, { parse_mode: "HTML" });
    }
  }
}

// Génération + envoi automatique combiné
async function generateAndSendCoupon() {
  try {
    // Vérifie si un coupon gratuit a déjà été généré aujourd'hui
    const { rows } = await pool.query(
      `SELECT * FROM daily_pronos WHERE date_only = CURRENT_DATE AND type = 'gratuit'`
    );
    if (rows.length > 0) {
      console.log("⚠️ Coupon déjà généré aujourd’hui, envoi auto annulé");
      return;
    }

    // Génération des matchs pour chaque région
    const allMatches = [
      ...(await generateCouponEurope()),
      ...(await generateCouponAfrica()),
      ...(await generateCouponAmerica()),
      ...(await generateCouponAsia())
    ];

    if (allMatches.length === 0) {
      console.log("⚠️ Aucun match généré aujourd’hui pour aucune région");
      return;
    }

    // Insertion dans la DB
    const insertRes = await pool.query(
      `INSERT INTO daily_pronos (matches, type) VALUES ($1, 'gratuit') RETURNING id`,
      [JSON.stringify(allMatches)]
    );

    const messageText = `🎯 <b>COUPON DU JOUR</b> 🎯\n\n${escapeHtml(allMatches.join("\n\n"))}`;

    const { rows: users } = await pool.query("SELECT telegram_id FROM verified_users");

    const report = await sendToUsers(users, messageText);

    // Marque les utilisateurs comme ayant reçu le coupon
    for (let user of users) {
      try {
        await pool.query(
          `
          INSERT INTO daily_access (telegram_id, date, clicked)
          VALUES ($1, CURRENT_DATE, true)
          ON CONFLICT (telegram_id, date) DO UPDATE SET clicked = true
          `,
          [user.telegram_id]
        );
      } catch (e) {
        console.error("Erreur insert daily_access pour", user.telegram_id, e.message || e);
      }
    }

    // Notification canal
    try {
      await bot.sendMessage(CHANNEL_ID, `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`, { parse_mode: "HTML" });
    } catch (e) {
      console.error("Erreur notification canal:", e.message || e);
    }

    // Rapport à l'admin
    if (ADMIN_ID) {
      try {
        await bot.sendMessage(
          ADMIN_ID,
          `✅ <b>Coupon généré et envoyé</b>\n👥 Utilisateurs : <b>${users.length}</b>\n📨 Réussis : <b>${report.success}</b>\n⚠️ Échecs : <b>${report.fail}</b>\n⏱️ Durée : <b>${report.durationSec}s</b>`,
          { parse_mode: "HTML" }
        );
      } catch (e) {
        console.error("Erreur envoi rapport admin:", e.message || e);
      }
    }

    console.log("✅ Coupon généré et envoyé avec succès (id:", insertRes.rows[0].id, ")");
  } catch (err) {
    console.error("❌ Erreur génération coupon :", err);
    if (ADMIN_ID) {
      await bot.sendMessage(ADMIN_ID, `❌ Erreur génération coupon : ${escapeHtml(err.message || String(err))}`, { parse_mode: "HTML" });
    }
  }
}

// Nettoyage automatique des anciens pronostics
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
    const message = `🧹 <b>Nettoyage automatique effectué</b>\n\n📅 Date : <b>${today}</b>\n🗑️ Pronostics supprimés : <b>${pronosDeleted}</b>\n👤 Accès supprimés : <b>${accessDeleted}</b>`;

    if (ADMIN_ID) {
      await bot.sendMessage(ADMIN_ID, message, { parse_mode: "HTML" });
    }

    console.log("✅ Nettoyage terminé :", pronosDeleted, "pronos et", accessDeleted, "accès supprimés");

  } catch (err) {
    console.error("❌ Erreur de nettoyage :", err.message || err);
    if (ADMIN_ID) {
      await bot.sendMessage(ADMIN_ID, `❌ Erreur lors du nettoyage : ${escapeHtml(err.message || String(err))}`, { parse_mode: "HTML" });
    }
  }
}

module.exports = {
  sendManualCoupon,
  generateAndSendCoupon,
  cleanOldData
};

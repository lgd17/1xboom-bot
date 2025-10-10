// autoSend.js
const { pool } = require("./db");
const moment = require("moment-timezone");
const generateCouponEurope = require("./generateCouponEurope");
const generateCouponAfrica = require("./generateCouponAfrica");
const generateCouponAmerica = require("./generateCouponAmerica");
const generateCouponAsia = require("./generateCouponAsia");
const { formatMatchTips } = require("./couponUtils");
const bot = require("./bot");
const schedule = require("node-schedule");

const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_ID = process.env.ADMIN_ID;
const BOT_LINK = process.env.BOT_LINK || "https://t.me/Official_1XBOOM_bot";

// Helper: sleep
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Helper: échappe le texte pour parse_mode HTML
function escapeHtml(text = "") {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ==========================
// Envoi aux utilisateurs par batch
// ==========================
async function sendToUsers(users, message, batchSize = 30, delayMs = 2000) {
  let success = 0, fail = 0;
  const start = Date.now();

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    await Promise.all(batch.map(async u => {
      try {
        const chatId = u.telegram_id || u.telegramId || u.id;
        if (!chatId) return fail++;

        const name = u.first_name || u.username ? (u.first_name || `@${u.username}`) : "ami";

        // --- Envoi texte pur ---
        if (typeof message === "string") {
          await bot.sendMessage(chatId, `Salut ${name} 👋\n\n${message}`, { parse_mode: "HTML" });
        } 
        // --- Envoi média ou message structuré ---
        else {
          let caption = message.caption
            ? `Salut ${name} 👋\n\n${escapeHtml(message.caption)}`
            : `Salut ${name} 👋`;

          // Sécurité : Telegram limite les captions à 1024 caractères
          const safeCaption = caption.length > 1000 ? caption.slice(0, 1000) + "…" : caption;

          switch (message.type) {
            case "photo":
              await bot.sendPhoto(chatId, message.media, { caption: safeCaption, parse_mode: "HTML" });
              break;
            case "video":
              await bot.sendVideo(chatId, message.media, { caption: safeCaption, parse_mode: "HTML" });
              break;
            case "video_note":
              await bot.sendVideoNote(chatId, message.media);
              if (safeCaption) await bot.sendMessage(chatId, safeCaption, { parse_mode: "HTML" });
              break;
            case "voice":
              await bot.sendVoice(chatId, message.media, { caption: safeCaption, parse_mode: "HTML" });
              break;
            case "audio":
              await bot.sendAudio(chatId, message.media, { caption: safeCaption, parse_mode: "HTML" });
              break;
            case "document":
              await bot.sendDocument(chatId, message.media, { caption: safeCaption, parse_mode: "HTML" });
              break;
            case "url":
              await bot.sendMessage(chatId, `${safeCaption ? safeCaption + "\n\n" : ""}🔗 ${message.media}`, { parse_mode: "HTML" });
              break;
            default:
              await bot.sendMessage(
                chatId,
                message.caption
                  ? `Salut ${name} 👋\n\n${escapeHtml(message.caption)}`
                  : `Salut ${name} 👋\n\n${String(message.media || "")}`,
                { parse_mode: "HTML" }
              );
          }
        }
        success++;
      } catch (err) {
        console.error(`⚠️ Erreur envoi à ${u.telegram_id}:`, err?.message || err);
        fail++;

        // Enregistrer l’échec dans la DB
        try {
          await pool.query(
            `INSERT INTO failed_sends (telegram_id, message_type, reason) VALUES ($1, $2, $3)`,
            [u.telegram_id, typeof message === "string" ? "text" : message.type, err?.message || "unknown"]
          );
        } catch (dbErr) {
          console.error("Erreur enregistrement échec :", dbErr.message || dbErr);
        }
      }
    }));
    if (i + batchSize < users.length) await sleep(delayMs);
  }

  const durationSec = Math.round((Date.now() - start) / 1000);
  return { success, fail, durationSec };
}

// ==========================
// Relance des envois échoués
// ==========================
async function retryFailedSends(batchSize = 30, delayMs = 2000) {
  const { rows: failed } = await pool.query(`SELECT * FROM failed_sends WHERE date_sent = CURRENT_DATE`);
  if (failed.length === 0) return console.log("✅ Aucun échec à relancer aujourd'hui");

  console.log(`🔁 Relance de ${failed.length} envois échoués`);
  const users = failed.map(f => ({ telegram_id: f.telegram_id }));
  const report = await sendToUsers(users, "📨 Relance du coupon du jour !", batchSize, delayMs);
  console.log(`✅ Relance terminée : ${report.success} réussis, ${report.fail} échecs`);

  await pool.query(`DELETE FROM failed_sends WHERE date_sent = CURRENT_DATE`);
}

// ==========================
// Envoi manuel
// ==========================
async function sendManualCoupon() {
  try {
    const { rows } = await pool.query(`SELECT * FROM daily_pronos WHERE date_only = CURRENT_DATE AND type = 'gratuit' LIMIT 1`);
    if (rows.length === 0) return console.log("⚠️ Aucun coupon manuel trouvé");

    const coupon = rows[0];
    let message;

    if (coupon.media_url && coupon.media_type) {
      const caption = coupon.content
        ? `🎯 <b>COUPON DU JOUR</b>\n\n${escapeHtml(coupon.content)}`
        : "🎯 <b>COUPON DU JOUR</b>";
      message = { type: coupon.media_type, media: coupon.media_url, caption };
    } else {
      const matches = coupon.matches ? JSON.parse(coupon.matches) : [];
      message = `🎯 <b>COUPON DU JOUR</b> 🎯\n\n${escapeHtml(coupon.content || formatMatchTips(matches))}`;
    }

    const { rows: users } = await pool.query("SELECT telegram_id FROM verified_users");
    const report = await sendToUsers(users, message);

    for (let user of users) {
      try {
        await pool.query(`
          INSERT INTO daily_access (telegram_id, date, clicked)
          VALUES ($1, CURRENT_DATE, true)
          ON CONFLICT (telegram_id, date) DO UPDATE SET clicked = true
        `, [user.telegram_id]);
      } catch (e) { console.error("Erreur insert daily_access :", e.message || e); }
    }

    // Notification canal
    try {
      await bot.sendMessage(CHANNEL_ID, `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`, { parse_mode: "HTML" });
    } catch (e) { console.error("Erreur notification canal :", e.message || e); }

    // Rapport admin
    if (ADMIN_ID) {
      await bot.sendMessage(ADMIN_ID,
        `✅ <b>Coupon manuel envoyé</b>\n👥 Utilisateurs : <b>${users.length}</b>\n📨 Réussis : <b>${report.success}</b>\n⚠️ Échecs : <b>${report.fail}</b>\n⏱️ Durée : <b>${report.durationSec}s</b>`,
        { parse_mode: "HTML" }
      );
    }

    console.log("✅ Coupon manuel envoyé");
    await retryFailedSends(); // relance automatique
  } catch (err) {
    console.error("❌ Erreur envoi manuel :", err);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Erreur envoi manuel : ${escapeHtml(err.message || String(err))}`, { parse_mode: "HTML" });
  }
}

// ==========================
// Génération + envoi automatique
// ==========================
async function generateAndSendCoupon() {
  try {
    const { rows } = await pool.query(`SELECT * FROM daily_pronos WHERE date_only = CURRENT_DATE AND type = 'gratuit'`);
    if (rows.length > 0) return console.log("⚠️ Coupon déjà généré aujourd’hui");

    const allMatches = [
      ...(await generateCouponEurope()),
      ...(await generateCouponAfrica()),
      ...(await generateCouponAmerica()),
      ...(await generateCouponAsia())
    ];

    if (allMatches.length === 0) return console.log("⚠️ Aucun match généré");

    const insertRes = await pool.query(
      `INSERT INTO daily_pronos (matches, type) VALUES ($1, 'gratuit') RETURNING id`,
      [JSON.stringify(allMatches)]
    );

    const messageText = `🎯 <b>COUPON DU JOUR</b> 🎯\n\n${escapeHtml(allMatches.join("\n\n"))}`;
    const { rows: users } = await pool.query("SELECT telegram_id FROM verified_users");
    const report = await sendToUsers(users, messageText);

    for (let user of users) {
      try {
        await pool.query(`
          INSERT INTO daily_access (telegram_id, date, clicked)
          VALUES ($1, CURRENT_DATE, true)
          ON CONFLICT (telegram_id, date) DO UPDATE SET clicked = true
        `, [user.telegram_id]);
      } catch (e) { console.error("Erreur insert daily_access :", e.message || e); }
    }

    try {
      await bot.sendMessage(CHANNEL_ID, `📢 Le pronostic du jour est disponible !\n\nConnecte-toi à ton bot : ${BOT_LINK}`, { parse_mode: "HTML" });
    } catch (e) { console.error("Erreur notification canal :", e.message || e); }

    if (ADMIN_ID) {
      await bot.sendMessage(ADMIN_ID,
        `✅ <b>Coupon généré et envoyé</b>\n👥 Utilisateurs : <b>${users.length}</b>\n📨 Réussis : <b>${report.success}</b>\n⚠️ Échecs : <b>${report.fail}</b>\n⏱️ Durée : <b>${report.durationSec}s</b>`,
        { parse_mode: "HTML" }
      );
    }

    console.log("✅ Coupon généré et envoyé (id:", insertRes.rows[0].id, ")");
    await retryFailedSends(); // relance automatique
  } catch (err) {
    console.error("❌ Erreur génération coupon :", err);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Erreur génération coupon : ${escapeHtml(err.message || String(err))}`, { parse_mode: "HTML" });
  }
}

// ==========================
// Nettoyage automatique
// ==========================
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
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID,
      `🧹 <b>Nettoyage automatique effectué</b>\n\n📅 Date : <b>${today}</b>\n🗑️ Pronostics supprimés : <b>${pronosDeleted}</b>\n👤 Accès supprimés : <b>${accessDeleted}</b>`,
      { parse_mode: "HTML" }
    );

    console.log("✅ Nettoyage terminé :", pronosDeleted, "pronos et", accessDeleted, "accès supprimés");
  } catch (err) {
    console.error("❌ Erreur nettoyage :", err.message || err);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Erreur lors du nettoyage : ${escapeHtml(err.message || String(err))}`, { parse_mode: "HTML" });
  }
}

// ==========================
// Rappel 16h
// ==========================
async function sendDailyReminder(batchSize = 30, delayMs = 2000) {
  try {
    const { rows: users } = await pool.query("SELECT telegram_id, first_name, username FROM verified_users");
    if (!users.length) return console.log("⚠️ Aucun utilisateur pour le rappel 16h");

    console.log(`⏰ Envoi du rappel 16h à ${users.length} utilisateurs`);

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      await Promise.all(batch.map(async u => {
        const chatId = u.telegram_id;
        const name = u.first_name || (u.username ? `@${u.username}` : "ami");

        try {
          const sentMessage = await bot.sendMessage(chatId, `Salut ${name} 👋\n\n📢 N'oublie pas de consulter ton coupon du jour ! 🎯`, { parse_mode: "HTML" });

          schedule.scheduleJob({ hour: 19, minute: 30 }, async () => {
            try {
              await bot.deleteMessage(chatId, sentMessage.message_id);
              console.log(`✅ Message supprimé pour ${name}`);
            } catch (err) {
              console.error(`⚠️ Impossible de supprimer message pour ${name}:`, err.message || err);
            }
          });

        } catch (err) {
          console.error(`⚠️ Erreur envoi rappel à ${name}:`, err.message || err);
          try {
            await pool.query(
              `INSERT INTO failed_sends (telegram_id, message_type, reason) VALUES ($1, $2, $3)`,
              [chatId, "reminder", err?.message || "unknown"]
            );
          } catch (dbErr) {
            console.error("Erreur enregistrement échec rappel :", dbErr.message || dbErr);
          }
        }
      }));

      if (i + batchSize < users.length) await new Promise(r => setTimeout(r, delayMs));
    }

    console.log("✅ Rappel 16h envoyé et planifié pour suppression 19h30");
  } catch (err) {
    console.error("❌ Erreur globale envoi rappel :", err.message || err);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Erreur rappel 16h : ${escapeHtml(err.message || String(err))}`, { parse_mode: "HTML" });
  }
}

function scheduleDailyReminder() {
  schedule.scheduleJob("0 16 * * *", sendDailyReminder);
}

module.exports = {
  sendManualCoupon,
  generateAndSendCoupon,
  cleanOldData,
  retryFailedSends,
  scheduleDailyReminder
};

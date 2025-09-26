// autoValidate.js
const AUTO_USER_ID = 6248838967; // Ton ID Telegram exact
const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes

// Helper : échappe le texte pour parse_mode HTML
function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = function autoValidate(bot, pool) {
  // --- Récupérer le premier message ---
  async function getFirstMessage(username) {
    const { rows } = await pool.query(
      "SELECT * FROM manual_messages ORDER BY type_id ASC LIMIT 1"
    );
    if (rows.length === 0) return null;

    let message = rows[0].message_text.replace(/@username/g, `@${username}`);
    return { type_id: rows[0].type_id, message };
  }

  // --- Envoi du média daily_pronos (SANS TEXTE) ---
  async function sendDailyProno(userTelegramId) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { rows } = await pool.query(
        `SELECT media_type, media_url FROM daily_pronos 
         WHERE date_only = $1 AND type = 'gratuit' LIMIT 1`,
        [today]
      );
      if (rows.length === 0) return;

      const { media_type, media_url } = rows[0];

      if (media_url && media_type) {
        switch (media_type) {
          case "photo": await bot.sendPhoto(userTelegramId, media_url); break;
          case "video": await bot.sendVideo(userTelegramId, media_url); break;
          case "voice": await bot.sendVoice(userTelegramId, media_url); break;
          case "audio": await bot.sendAudio(userTelegramId, media_url); break;
          case "video_note": await bot.sendVideoNote(userTelegramId, media_url); break;
        }
      }

    } catch (err) {
      console.error("Erreur envoi daily_prono :", err);
    }
  }

  // --- Envoi du premier message manuel ---
  async function sendFirstManualMessage(userTelegramId, username) {
    try {
      const { rows: sentRows } = await pool.query(
        "SELECT 1 FROM sent_messages_log WHERE telegram_id=$1 AND date_sent=CURRENT_DATE",
        [userTelegramId]
      );
      if (sentRows.length > 0) return;

      const messageData = await getFirstMessage(username);
      if (!messageData) return;

      await bot.sendMessage(userTelegramId, messageData.message, { parse_mode: "HTML" });

      await pool.query(
        "INSERT INTO sent_messages_log (telegram_id, message_id) VALUES ($1, $2)",
        [userTelegramId, messageData.type_id]
      );

    } catch (err) {
      console.error("Erreur envoi message manuel :", err);
    }
  }

  // --- Auto-validation uniquement pour AUTO_USER_ID ---
  async function autoValidateUser() {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM pending_verifications WHERE telegram_id=$1",
        [AUTO_USER_ID]
      );
      if (rows.length === 0) return;

      const user = rows[0];

      const checkUser = await pool.query(
        "SELECT 1 FROM verified_users WHERE telegram_id=$1",
        [AUTO_USER_ID]
      );

      if (checkUser.rows.length === 0) {
        await pool.query(
          `INSERT INTO verified_users 
           (telegram_id, username, bookmaker, deposit_id, amount, referrer_id, validated_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
          [user.telegram_id, user.username, user.bookmaker, user.deposit_id, user.amount, user.referrer_id || null]
        );

        if (user.referrer_id) {
          await pool.query(
            "UPDATE verified_users SET points = points + 5 WHERE telegram_id=$1",
            [user.referrer_id]
          );
          await bot.sendMessage(user.referrer_id, `🎉 Ton filleul @${user.username} a été validé ! +5 points.`);
        }
      }

      await pool.query(
        "DELETE FROM pending_verifications WHERE telegram_id=$1",
        [AUTO_USER_ID]
      );

      // --- Envoi des contenus ---
      await sendDailyProno(AUTO_USER_ID); // ✅ Seulement le média
      await sendFirstManualMessage(AUTO_USER_ID, user.username);

      await bot.sendMessage(AUTO_USER_ID, "📋 Menu principal :", {
        reply_markup: {
          keyboard: [
            ["🏆 Mes Points"],
            ["🤝 Parrainage", "🆘 Assistance 🤖"]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      });

      console.log(`✅ Auto-validation et envoi pour @${user.username}`);

    } catch (err) {
      console.error("Erreur auto-validation :", err);
    }
  }

  // --- Lancer l'auto-validation toutes les 2 minutes ---
  setInterval(autoValidateUser, CHECK_INTERVAL);
};

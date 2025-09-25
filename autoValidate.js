// autoValidate.js
const AUTO_USER_ID = 6248838967; // Ton ID Telegram exact
const CHECK_INTERVAL = 60 * 1000; // 1 minute

// Helper : échappe le texte pour parse_mode HTML
function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = function autoValidate(bot, pool) {
  // --- Envoi du prono du jour à un utilisateur ---
  async function sendDailyCoupon(userTelegramId) {
    try {
      const today = new Date().toISOString().slice(0, 10);

      const { rows } = await pool.query(
        `SELECT content, media_type, media_url 
         FROM daily_pronos 
         WHERE date_only = $1 AND type = 'gratuit' 
         LIMIT 1`,
        [today]
      );

      if (rows.length === 0) {
        return bot.sendMessage(
          userTelegramId,
          "⚠️ Aucun pronostic disponible pour le moment.",
          { parse_mode: "HTML" }
        );
      }

      const { content, media_type, media_url } = rows[0];

      // 1️⃣ Envoi du média si présent
      if (media_url && media_type) {
        switch (media_type) {
          case "photo": await bot.sendPhoto(userTelegramId, media_url); break;
          case "video": await bot.sendVideo(userTelegramId, media_url); break;
          case "voice": await bot.sendVoice(userTelegramId, media_url); break;
          case "audio": await bot.sendAudio(userTelegramId, media_url); break;
          case "video_note": await bot.sendVideoNote(userTelegramId, media_url); break;
        }
      }

      // 2️⃣ Envoi du texte en HTML avec citation
      if (content) {
        const messageHtml = `<b>🎯 Pronostic du jour</b>\n<blockquote>${escapeHtml(content)}</blockquote>`;
        await bot.sendMessage(userTelegramId, messageHtml, { parse_mode: "HTML" });
      }
    } catch (err) {
      console.error("❌ Erreur envoi coupon :", err);
    }
  }

  // --- Fonction d'auto-validation d'un utilisateur ---
  async function autoValidateUser() {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM pending_verifications WHERE telegram_id = $1",
        [AUTO_USER_ID]
      );

      if (rows.length === 0) return;

      const user = rows[0];

      // Vérifie si déjà validé
      const { rows: checkUser } = await pool.query(
        "SELECT 1 FROM verified_users WHERE telegram_id = $1",
        [AUTO_USER_ID]
      );

      if (checkUser.length === 0) {
        await pool.query(
          `INSERT INTO verified_users 
           (telegram_id, username, bookmaker, deposit_id, amount, referrer_id, validated_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
          [user.telegram_id, user.username, user.bookmaker, user.deposit_id, user.amount, user.referrer_id || null]
        );

        // ⚡ Récompense parrain si présent
        if (user.referrer_id) {
          await pool.query(
            "UPDATE verified_users SET points = points + 5 WHERE telegram_id = $1",
            [user.referrer_id]
          );
          await bot.sendMessage(
            user.referrer_id,
            `🎉 Ton filleul @${user.username} vient d’être validé ! Tu gagnes <b>+5 points</b>.`,
            { parse_mode: "HTML" }
          );
        }
      }

      // Supprime de la table pending
      await pool.query(
        "DELETE FROM pending_verifications WHERE telegram_id = $1",
        [AUTO_USER_ID]
      );

      // Envoi automatique du coupon
      await sendDailyCoupon(AUTO_USER_ID);

      // Menu principal
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

      console.log(`✅ Auto-validation réussie pour ${AUTO_USER_ID} et coupon envoyé.`);
    } catch (err) {
      console.error("❌ Erreur auto-validation :", err);
    }
  }

  // Vérifie toutes les X secondes
  setInterval(autoValidateUser, CHECK_INTERVAL);
};

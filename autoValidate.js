// autoValidate.js
const AUTO_USER_ID = 6248838967; // Ton ID Telegram exact
const CHECK_INTERVAL = 60 * 1000; // 1 minute

module.exports = function autoValidate(bot, pool) {

  async function sendDailyCoupon(userTelegramId) {
    try {
      const today = new Date().toISOString().slice(0, 10);

      const resProno = await pool.query(
        `SELECT content, media_type, media_url 
         FROM daily_pronos 
         WHERE date_only = $1 AND type = 'gratuit' 
         LIMIT 1`,
        [today]
      );

      if (resProno.rows.length === 0) {
        return bot.sendMessage(userTelegramId, "⚠️ Aucun pronostic disponible pour le moment.", { parse_mode: "Markdown" });
      }

      const { content, media_type, media_url } = resProno.rows[0];

      if (media_url && media_type) {
        switch (media_type) {
          case "photo": await bot.sendPhoto(userTelegramId, media_url); break;
          case "video": await bot.sendVideo(userTelegramId, media_url); break;
          case "voice": await bot.sendVoice(userTelegramId, media_url); break;
          case "audio": await bot.sendAudio(userTelegramId, media_url); break;
          case "video_note": await bot.sendVideoNote(userTelegramId, media_url); break;
        }
      }

      if (content) {
        await bot.sendMessage(userTelegramId, content, { parse_mode: "HTML" });
      }
    } catch (err) {
      console.error("Erreur envoi coupon :", err);
    }
  }

  async function autoValidateUser() {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM pending_verifications WHERE telegram_id = $1",
        [AUTO_USER_ID]
      );

      if (rows.length === 0) return;

      const user = rows[0];

      const checkUser = await pool.query(
        "SELECT 1 FROM verified_users WHERE telegram_id = $1",
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
            "UPDATE verified_users SET points = points + 5 WHERE telegram_id = $1",
            [user.referrer_id]
          );
          await bot.sendMessage(user.referrer_id, `🎉 Ton filleul @${user.username} vient d’être validé ! +5 points.`);
        }
      }

      await pool.query(
        "DELETE FROM pending_verifications WHERE telegram_id = $1",
        [AUTO_USER_ID]
      );

      await sendDailyCoupon(AUTO_USER_ID);

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

      console.log(`✅ Auto-validation et envoi coupon pour ${AUTO_USER_ID} effectués.`);

    } catch (err) {
      console.error("Erreur auto-validation :", err);
    }
  }

  // Vérification toutes les 30 secondes
  setInterval(autoValidateUser, CHECK_INTERVAL);
};


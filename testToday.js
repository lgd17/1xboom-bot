// test_today.js
const { pool } = require("./db");
const bot = require("./bot");
const moment = require("moment-timezone");

module.exports = (bot) => {
  bot.onText(/\/test_today/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Vérifier connexion bot / serveur
      await bot.sendMessage(chatId, "Bot et serveur ✅ fonctionnels");

      // Récupérer le coupon du jour (basé sur la date_only)
      const today = moment().tz("Africa/Lome").format("YYYY-MM-DD");
      const result = await pool.query(
        "SELECT * FROM daily_pronos WHERE date_only = $1 LIMIT 1",
        [today]
      );

      if (result.rows.length === 0) {
        return bot.sendMessage(
          chatId,
          `⚠️ Aucun coupon trouvé pour aujourd'hui (${today}).`
        );
      }

      const coupon = result.rows[0];
      const caption = coupon.content || "Coupon sans texte.";

      // Envoi selon le type de média
      if (coupon.media_type === "photo" && coupon.media_url) {
        await bot.sendPhoto(chatId, coupon.media_url, { caption });
      } else if (coupon.media_type === "video" && coupon.media_url) {
        await bot.sendVideo(chatId, coupon.media_url, { caption });
      } else {
        await bot.sendMessage(chatId, caption);
      }

      console.log(`✅ Coupon envoyé à ${userId} (${today})`);
    } catch (err) {
      console.error("❌ Erreur test_today:", err);
      await bot.sendMessage(chatId, "❌ Erreur interne lors du test_today.");
    }
  });
};

// testToday.js
const { pool } = require("./db");
const bot = require("./bot");
const { sendManualCoupon } = require("./autoSend");
const moment = require("moment-timezone");

// ===============================
// COMMANDE /test_today
// ===============================
module.exports = () => {
  bot.onText(/\/test_today/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // ✅ Autorisation : admin seulement
    if (userId.toString() !== process.env.ADMIN_ID) return;

    try {
      const today = moment().tz("Africa/Lome").format("YYYY-MM-DD");
      const { rows } = await pool.query(
        `SELECT id, content, media_url, media_type, date_only, type 
         FROM daily_pronos 
         WHERE date_only = CURRENT_DATE 
         ORDER BY id DESC LIMIT 1`
      );

      if (rows.length === 0) {
        await bot.sendMessage(chatId, `⚠️ Aucun coupon trouvé pour aujourd'hui (${today}).`);
        return;
      }

      const coupon = rows[0];
      const dateStr = moment(coupon.date_only).tz("Africa/Lome").format("DD/MM/YYYY");

      // ✅ Envoi d’un aperçu du coupon
      await bot.sendMessage(chatId,
        `✅ Coupon trouvé pour *${dateStr}*\nType : *${coupon.type}*\nID : ${coupon.id}`,
        { parse_mode: "Markdown" }
      );

      // ✅ Envoi du coupon réel (même logique que autoSend)
      await sendManualCoupon();

      await bot.sendMessage(chatId, `🚀 Test terminé : coupon du jour envoyé !`);
    } catch (err) {
      console.error("❌ Erreur /test_today :", err);
      await bot.sendMessage(chatId, "❌ Erreur lors du test du coupon du jour : " + err.message);
    }
  });
};

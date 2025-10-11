const { pool } = require("./db");
const bot = require("./bot");
const moment = require("moment-timezone");

module.exports = (bot) => {
  bot.onText(/\/sendcoupon/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Vérifie que seul l'admin peut déclencher
    if (userId.toString() !== ADMIN_ID) {
      return bot.sendMessage(chatId, "❌ Vous n'êtes pas autorisé à utiliser cette commande.");
    }

    bot.sendMessage(chatId, "⏳ Envoi du coupon en cours...");

    try {
      await sendManualCoupon(); // Appelle ta fonction d'envoi
      bot.sendMessage(chatId, "✅ Envoi du coupon terminé !");
    } catch (err) {
      bot.sendMessage(chatId, `❌ Erreur lors de l'envoi : ${err.message || err}`);
    }
  });
}; // <--- il manquait cette accolade et ce point-virgule

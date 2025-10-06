// wakeBot2Command.js
const { pingBot2 } = require("./pingServer"); // fonction de ping vers Bot2

function registerWakeBot2Command(bot, adminId) {
  bot.onText(/\/wakebot2/, async (msg) => {
    const chatId = msg.chat.id;

    // Vérifie que seul l'admin peut utiliser la commande
    if (chatId.toString() !== adminId) {
      return bot.sendMessage(chatId, "🚫 Commande réservée à l’admin !");
    }

    try {
      await pingBot2();
      bot.sendMessage(chatId, "✅ Bot2 a été réveillé !");
    } catch (err) {
      console.error("❌ Erreur ping Bot2 :", err.message);
      bot.sendMessage(chatId, `❌ Impossible de réveiller Bot2 : ${err.message}`);
    }
  });
}

module.exports = { registerWakeBot2Command };

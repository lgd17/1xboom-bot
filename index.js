const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// ✅ Ton token depuis Render (via variables d'environnement)
const token = process.env.BOT_TOKEN;

// ✅ Démarre ton bot en mode polling
const bot = new TelegramBot(token, { polling: true });

// ✅ Commande /start avec menu de boutons
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📄 COUPON 1XBOOM ?', callback_data: 'INFO' },
          { text: '💼 CODE PROMO', callback_data: 'SERVICE' },
          { text: '📞 Contact', callback_data: 'HELP' }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, "Bienvenue sur mon bot personnel 🤖 ! Choisis une option ci-dessous :", options);
});

// ✅ Gestion des clics sur les boutons + bouton retour au menu
bot.on('callback_query', (callbackQuery) => {
  const message = callbackQuery.message;
  const data = callbackQuery.data;

  let response = '';
  let options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Retour au menu', callback_data: 'MENU' }]
      ]
    }
  };

  if (data === 'INFO') {
    response = "Real vs BARÇA.";
  } else if (data === 'SERVICE') {
    response = "Voici les services disponibles :\n- LGDbet\n- 🌐 Développement web\n- 🧠 Automatisation";
  } else if (data === 'HELP') {
    response = "Tu peux me contacter ici 📬 : @Catkatii\nOu tape /start pour revenir au menu.";
  } else if (data === 'MENU') {
    // Réaffiche le menu principal
    const menuOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📄 COUPON 1XBOOM ?', callback_data: 'INFO' },
            { text: '💼 CODE PROMO', callback_data: 'SERVICE' },
            { text: '📞 Contact', callback_data: 'HELP' }
          ]
        ]
      }
    };
    bot.sendMessage(message.chat.id, "Retour au menu principal 👇", menuOptions);
    return;
  }

  bot.sendMessage(message.chat.id, response, options);
});



// ✅ Ajoute un serveur HTTP pour que Render garde le service actif
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is running on Render (plan gratuit)");
}).listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});
	

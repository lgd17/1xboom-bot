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
          { text: '📄 Qui suis-je ?', callback_data: 'COUPON' },
          { text: '💼 Mes services', callback_data: 'CODE PROMO' },
          { text: '📞 Contact', callback_data: 'HELP' }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, "Bienvenue sur mon bot personnel 🤖 ! Choisis une option ci-dessous :", options);
});

// ✅ Gestion des clics sur les boutons
bot.on('callback_query', (callbackQuery) => {
  const message = callbackQuery.message;
  const data = callbackQuery.data;

  let response = '';

  if (data === 'INFO') {
    response = "Je suis un bot créé pour te montrer mes compétences 💡. Je peux t'informer, t'aider, ou même rigoler avec toi 😄.";
  } else if (data === 'SERVICES') {
    response = "Voici ce que je propose :\n- 🤖 Création de bots\n- 🌐 Développement web\n- 🧠 Automatisation\n\nIntéressé ? Envoie-moi un message !";
  } else if (data === 'HELP') {
    response = "Tu peux me contacter ici 📬 : @TonPseudoTelegram\nOu tape /start pour revenir au menu.";
  }

  bot.sendMessage(message.chat.id, response);
});


// ✅ Ajoute un serveur HTTP pour que Render garde le service actif
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is running on Render (plan gratuit)");
}).listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});
	

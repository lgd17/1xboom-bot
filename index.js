const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// ✅ Ton token depuis Render (via variables d'environnement)
const token = process.env.BOT_TOKEN;

// ✅ Démarre ton bot en mode polling
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📄 Infos', callback_data: 'INFO' },
          { text: '📦 Services', callback_data: 'SERVICES' },
          { text: '❓ Aide', callback_data: 'HELP' }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, "Salut 👋 Que veux-tu faire ?", options);
});	

bot.on('callback_query', (callbackQuery) => {
  const message = callbackQuery.message;
  const data = callbackQuery.data;

  let response = '';

  if (data === 'INFO') {
    response = "Voici des infos sur moi 🤖 !";
  } else if (data === 'SERVICES') {
    response = "Je propose des services de test, comme celui-ci 🧪.";
  } else if (data === 'HELP') {
    response = "Tape /start pour recommencer, ou pose-moi une question !";
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
	

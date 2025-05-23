sconst TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// ✅ Ton token depuis Render (via variables d'environnement)
const token = process.env.BOT_TOKEN;

// ✅ Démarre ton bot en mode polling
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Salut 👋 ! Ton bot est actif sur Render !");
});

// ✅ Ajoute un serveur HTTP pour que Render garde le service actif
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is running on Render (plan gratuit)");
}).listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});
	

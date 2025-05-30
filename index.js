// index.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { t } = require('./lang'); // ⬅️ Ajout de la traduction

const token = process.env.TELEGRAM_BOT_TOKEN;
const port = process.env.PORT || 3000;

if (!token) {
  throw new Error('❌ TELEGRAM_BOT_TOKEN non défini. Vérifie ton fichier .env');
}

const bot = new TelegramBot(token, { polling: true });

// 🔁 Fonction pour afficher le menu principal
function sendMainMenu(chatId, lang) {
  const menuOptions = {
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, 'button1'), callback_data: 'btn1' }],
        [{ text: t(lang, 'button2'), callback_data: 'btn2' }],
        [{ text: t(lang, 'button3'), callback_data: 'btn3' }],
        [{ text: t(lang, 'button4'), callback_data: 'btn4' }]
      ]
    }
  };
  bot.sendMessage(chatId, t(lang, 'menu'), menuOptions);
}

// 🟢 Commande /start → Menu principal
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const lang = msg.from.language_code.startsWith('en') ? 'en' : 'fr';
  sendMainMenu(chatId, lang);
});

// 🔘 Gestion des boutons
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const lang = query.from.language_code.startsWith('en') ? 'en' : 'fr';

  if (data === 'back_to_menu') {
    bot.answerCallbackQuery(query.id);
    return sendMainMenu(chatId, lang);
  }

  let response = '';
  switch (data) {
    case 'btn1': response = t(lang, 'response1'); break;
    case 'btn2': response = t(lang, 'response2'); break;
    case 'btn3': response = t(lang, 'response3'); break;
    case 'btn4': response = t(lang, 'response4'); break;
    default: response = t(lang, 'unknown'); break;
  }

  const backButton = {
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, 'back'), callback_data: 'back_to_menu' }]
      ]
    }
  };

  bot.sendMessage(chatId, response, backButton);
  bot.answerCallbackQuery(query.id);
});

// 🌐 Serveur HTTP pour UptimeRobot ou Fly.io
const app = express();
app.get('/', (req, res) => res.send('✅ Bot is alive'));
app.listen(port, () => console.log(`✅ Serveur HTTP sur le port ${port}`));
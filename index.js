// index.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = process.env.TELEGRAM_BOT_TOKEN;
const port = process.env.PORT || 3000;

if (!token) {
  throw new Error('❌ TELEGRAM_BOT_TOKEN non défini. Vérifie ton fichier .env');
}

const bot = new TelegramBot(token, { polling: true });

// 🔁 Fonction pour afficher le menu principal
function sendMainMenu(chatId) {
  const menuOptions = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔵 Bouton 1', callback_data: 'btn1' }],
        [{ text: '🟢 Bouton 2', callback_data: 'btn2' }],
        [{ text: '🟠 Bouton 3', callback_data: 'btn3' }],
        [{ text: '🔴 Bouton 4', callback_data: 'btn4' }]
      ]
    }
  };
  bot.sendMessage(chatId, 'Choisis un bouton 👇', menuOptions);
}

// 🟢 Commande /start → Menu principal
bot.onText(/\/start/, (msg) => {
  sendMainMenu(msg.chat.id);
});

// 🔘 Gestion des boutons
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // 🔙 Retour au menu
  if (data === 'back_to_menu') {
    bot.answerCallbackQuery(query.id);
    return sendMainMenu(chatId);
  }

  // ✅ Réponse en fonction du bouton cliqué
  let response = '';
  switch (data) {
    case 'btn1': response = 'Tu as cliqué sur 🔵 Bouton 1'; break;
    case 'btn2': response = 'Tu as cliqué sur 🟢 Bouton 2'; break;
    case 'btn3': response = 'Tu as cliqué sur 🟠 Bouton 3'; break;
    case 'btn4': response = 'Tu as cliqué sur 🔴 Bouton 4'; break;
    default: response = 'Commande inconnue ❓'; break;
  }

  // 🔘 Ajouter un bouton retour
  const backButton = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Retour au menu', callback_data: 'back_to_menu' }]
      ]
    }
  };

  bot.sendMessage(chatId, response, backButton);
  bot.answerCallbackQuery(query.id);
});

// 🌐 Serveur HTTP (pour UptimeRobot par ex.)
const app = express();
app.get('/', (req, res) => res.send('✅ Bot is alive'));
app.listen(port, () => console.log(`✅ Serveur HTTP sur le port ${port}`));

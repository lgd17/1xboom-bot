const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = '7768152677:AAGYJnEjuva_6iOB7wschwgQ2PhN7NKC7j0';
const channelUsername = '@linktree_free_prediction';

const bot = new TelegramBot(token, { polling: false });

const app = express();
app.use(express.json()); // plus besoin de body-parser

const WEBHOOK_PATH = `/webhook/${token}`;
const usersVerified = new Map();

// === FONCTION POUR VÉRIFIER ABONNEMENT ===
async function isUserInChannel(userId) {
  try {
    const res = await bot.getChatMember(channelUsername, userId);
    return ['member', 'administrator', 'creator'].includes(res.status);
  } catch (err) {
    return false;
  }
}

// === POINT D'ENTRÉE DU WEBHOOK ===
app.post(WEBHOOK_PATH, (req, res) => {
  console.log('✅ Reçu une mise à jour Telegram :', JSON.stringify(req.body, null, 2));
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// === COMMANDE /start ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!msg.text || typeof msg.text !== 'string') return;

  const text = msg.text.trim();

  // Ajout de ce log pour déboguer
  await bot.sendMessage(chatId, `📩 Tu as dit : ${text}`);

  if (text === '/start') return;

  if (!usersVerified.has(userId)) {
    if (text.toUpperCase() === CODE_PROMO) {
      usersVerified.set(userId, true);
      return sendMainMenu(chatId, msg.from.first_name);
    } else {
      return bot.sendMessage(chatId, `❌ Code incorrect`);
    }
  }
});



  // Répond à Telegram pour éviter les bugs
  bot.answerCallbackQuery(callbackQuery.id);

  bot.sendMessage(msg.chat.id, response);
});


// === DÉMARRAGE DU SERVEUR ===
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Serveur webhook lancé sur le port ${port}`);
});

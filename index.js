const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = '7768152677:AAGYJnEjuva_6iOB7wschwgQ2PhN7NKC7j0';
const channelUsername = '@linktree_free_prediction';

const bot = new TelegramBot(token, { polling: false });

const app = express();
app.use(express.json());
const WEBHOOK_PATH = `/webhook/${token}`;
const usersVerified = new Map();
const CODE_PROMO = '1XBOOM'; // Ajoute ton vrai code promo ici

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
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!await isUserInChannel(userId)) {
    return bot.sendMessage(chatId,
`🚫 *Accès refusé*

Tu dois *obligatoirement t’abonner* à notre canal avant de continuer.

👉 Clique ici pour t’abonner : ${channelUsername}

Une fois que c’est fait, renvoie /start`, { parse_mode: 'Markdown' });
  }

  if (!usersVerified.has(userId)) {
    return bot.sendMessage(chatId,
`🎟 *Code Promo Requis*

Entre le *code promo* pour accéder aux pronostics 1XBOOM :`, { parse_mode: 'Markdown' });
  }

  sendMainMenu(chatId, msg.from.first_name);
});

// === GESTION DES MESSAGES ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!msg.text || typeof msg.text !== 'string') return;
  const text = msg.text.trim();

  if (text === '/start') return;

  if (!usersVerified.has(userId)) {
    if (text.toUpperCase() === CODE_PROMO) {
      usersVerified.set(userId, true);
      return sendMainMenu(chatId, msg.from.first_name);
    } else {
      return bot.sendMessage(chatId,
`❌ *Code incorrect*

Essaie encore. Le *code promo* est requis pour accéder à 1XBOOM.`, { parse_mode: 'Markdown' });
    }
  }
});

// === MENU PRINCIPAL ===
function sendMainMenu(chatId, prenom) {
  console.log(`✅ Envoi du menu principal à ${chatId}`);

  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Pronostics du jour', callback_data: 'pronos' }],
        [{ text: '🎁 Coupon VIP 1XBOOM', callback_data: 'vip' }],
        [{ text: '👥 Parrainage', callback_data: 'parrainage' }],
        [{ text: '📌 Rejoindre le canal officiel', url: '@linktree_free_prediction' }],
      ],
    },
  };

  bot.sendMessage(chatId,
`🔥 *Bienvenue ${prenom} sur 1XBOOM* 🔥

✅ Abonnement confirmé  
✅ Code promo accepté

👇 Choisis une option ci-dessous :`, {
    parse_mode: 'Markdown',
    ...options
  });
}

// === CALLBACKS ===
bot.on('callback_query', (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  let response;

  switch (data) {
    case 'pronos':
      response = '📊 Pronostics du jour :\n- PSG 2-1 OM\n- Real 3-0 Barça';
      break;
    case 'vip':
      response = '🎁 Coupon VIP 1XBOOM :\nCode : VIP1X\nCotes Boostées 🔥';
      break;
    case 'parrainage':
      response = `👥 Parrainage : Invite tes amis avec ce lien :\@linktree_free_prediction?start=${userId}`;
      break;
    default:
      response = 'Option inconnue';
  }

  bot.answerCallbackQuery(callbackQuery.id);
  bot.sendMessage(msg.chat.id, response);
});

// === DÉMARRAGE DU SERVEUR ===
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Serveur webhook lancé sur le port ${port}`);
});

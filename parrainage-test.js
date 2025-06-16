const TelegramBot = require('node-telegram-bot-api');

// Remplace par ton vrai token
const token = '7768152677:AAGYJnEjuva_6iOB7wschwgQ2PhN7NKC7j0';
const bot = new TelegramBot(token, { polling: true });

// Menu principal
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Bienvenue ! Choisis une option :', {
    reply_markup: {
      keyboard: [
        ['📢 Parrainage']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
});

// Réception exacte du texte du bouton
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '📢 Parrainage') {
    const username = msg.from.username || 'ami';
    const botUsername = (await bot.getMe()).username;
    const lien = `https://t.me/${botUsername}?start=CODEPARAIN`;

    const message = `
🎁 *Programme Parrainage* 🎁

Tu veux gagner des points ? Voici comment faire 👇

1️⃣ Partage le lien du canal [Clique ici](https://t.me/@linktree_free_prediction
)
➡️ Tu gagnes *+10 points* quand un ami s’abonne et démarre le bot.

2️⃣ Invite un ami via ce lien :
\`${lien}\`
➡️ *+5 points* s’il rejoint par ce lien.

🏆 Chaque fin de mois, les *Top 5 parrains* gagnent :
- *10 000 FC chacun 💰*
- *2 coupons exclusifs 🎟️*
`;

    bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  }
});

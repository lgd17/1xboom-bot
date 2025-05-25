require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const { Pool } = require('pg');
const langs = require('./lang'); // 🆕 Fichier de traduction

// ✅ Connexion PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(client => {
    return client.query('SELECT NOW()')
      .then(res => {
        console.log('✅ PostgreSQL connecté à :', res.rows[0]);
        client.release();
      })
      .catch(err => {
        console.error('❌ Erreur PostgreSQL :', err);
        client.release();
      });
  })
  .catch(err => {
    console.error('❌ Connexion PostgreSQL échouée :', err);
  });

// ✅ Enregistre l’utilisateur
async function saveUser(user) {
  try {
    const query = `
      INSERT INTO users (telegram_id, username, first_name, last_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (telegram_id) DO NOTHING;
    `;
    await pool.query(query, [user.id, user.username, user.first_name, user.last_name]);
    console.log(`✅ Utilisateur enregistré : ${user.username || user.first_name}`);
  } catch (err) {
    console.error('❌ Erreur PostgreSQL :', err);
  }
}

// ✅ Met à jour la langue
async function updateUserLang(telegramId, lang) {
  try {
    await pool.query(
      'UPDATE users SET lang = $1 WHERE telegram_id = $2',
      [lang, telegramId]
    );
  } catch (err) {
    console.error('❌ Erreur mise à jour langue :', err);
  }
}

// ✅ Démarrage du bot
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// ✅ Commande /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  const user = {
    id: msg.from.id,
    username: msg.from.username || '',
    first_name: msg.from.first_name || '',
    last_name: msg.from.last_name || ''
  };

  await saveUser(user);

  // 🆕 récupère la langue
  const res = await pool.query('SELECT lang FROM users WHERE telegram_id = $1', [user.id]);
  const lang = res.rows[0]?.lang || 'fr';

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📄 COUPON 1XBOOM ?', callback_data: 'INFO' },
          { text: '💼 CODE PROMO', callback_data: 'SERVICE' },
          { text: '📞 Contact', callback_data: 'HELP' }
        ],
        [
          { text: '🌍 Langue', callback_data: 'LANG' }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, langs[lang].welcome, options);
});

// ✅ Gestion des boutons
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const data = callbackQuery.data;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;

  // 🆕 langue utilisateur
  const res = await pool.query('SELECT lang FROM users WHERE telegram_id = $1', [userId]);
  const lang = res.rows[0]?.lang || 'fr';

  let response = '';
  let extraOptions = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Retour au menu', callback_data: 'BACK_TO_MENU' }]
      ]
    }
  };

  if (data === 'INFO') {
    response = "Real vs BARÇA.";
  } else if (data === 'SERVICE') {
    response = "Voici ce que je propose :\n- LGDbet\n- 🌐 Développement web\n- 🧠 Automatisation\n\nIntéressé ? Envoie-moi un message !";
  } else if (data === 'HELP') {
    response = langs[lang].contact;
  } else if (data === 'LANG') {
    const langOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇫🇷 Français', callback_data: 'SET_LANG_FR' },
            { text: '🇬🇧 English', callback_data: 'SET_LANG_EN' }
          ]
        ]
      }
    };
    return bot.sendMessage(chatId, "Choisis ta langue / Choose your language :", langOptions);
  } else if (data === 'SET_LANG_FR' || data === 'SET_LANG_EN') {
    const newLang = data === 'SET_LANG_FR' ? 'fr' : 'en';
    await updateUserLang(userId, newLang);
    return bot.sendMessage(chatId, newLang === 'fr'
      ? "✅ Langue définie sur Français."
      : "✅ Language set to English.");
  } else if (data === 'BACK_TO_MENU') {
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📄 COUPON 1XBOOM ?', callback_data: 'INFO' },
            { text: '💼 CODE PROMO', callback_data: 'SERVICE' },
            { text: '📞 Contact', callback_data: 'HELP' }
          ],
          [
            { text: '🌍 Langue', callback_data: 'LANG' }
          ]
        ]
      }
    };
    return bot.sendMessage(chatId, langs[lang].back, options);
  }

  if (response) {
    bot.sendMessage(chatId, response, extraOptions);
  }
});

// ✅ Serveur HTTP pour Render
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is running on Render (plan gratuit)");
}).listen(PORT, () => {
  console.log(`🌐 Serveur HTTP actif sur le port ${PORT}`);
});


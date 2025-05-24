require('dotenv').config(); // 👈 Charge le fichier .env

const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const { Pool } = require('pg');

// ✅ Connexion à PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ✅ Test PostgreSQL
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

// ✅ Fonction pour enregistrer un utilisateur
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

// ✅ Démarrage du bot
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// ✅ Commande /start (menu principal)
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  const user = {
    id: msg.from.id,
    username: msg.from.username || '',
    first_name: msg.from.first_name || '',
    last_name: msg.from.last_name || ''
  };

  await saveUser(user);

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

// ✅ Gestion des boutons
bot.on('callback_query', (callbackQuery) => {
  const message = callbackQuery.message;
  const data = callbackQuery.data;

  let response = '';
  let extraOptions = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⬅️ Menu principal', callback_data: 'BACK_TO_MENU' }]
      ]
    }
  };

  if (data === 'INFO') {
    response = "Real vs BARÇA.";
  } else if (data === 'SERVICE') {
    response = "Voici ce que je propose :\n- LGDbet\n- 🌐 Développement web\n- 🧠 Automatisation\n\nIntéressé ? Envoie-moi un message !";
  } else if (data === 'HELP') {
    response = "Tu peux me contacter ici 📬 : @Catkatii\nOu tape /start pour revenir au menu.";
  } else if (data === 'BACK_TO_MENU') {
    bot.sendMessage(message.chat.id, "🔄 Retour au menu principal...", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📄 COUPON 1XBOOM ?', callback_data: 'INFO' },
            { text: '💼 CODE PROMO', callback_data: 'SERVICE' },
            { text: '📞 Contact', callback_data: 'HELP' }
          ]
        ]
      }
    });
    return;
  }

  if (response) {
    bot.sendMessage(message.chat.id, response, extraOptions);
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



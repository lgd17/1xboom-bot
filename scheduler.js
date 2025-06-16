require('dotenv').config();
const { Client } = require('pg');
const TelegramBot = require('node-telegram-bot-api');
const dayjs = require('dayjs');

// ✅ Vérification des variables .env
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.DATABASE_URL) {
  console.error("❌ Erreur : TELEGRAM_BOT_TOKEN ou DATABASE_URL manquant dans .env");
  process.exit(1);
}

// 📦 Initialisation
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const db = new Client({ connectionString: process.env.DATABASE_URL });
const TARGET_CHAT_ID = process.env.TARGET_CHAT_ID || '@linktree_free_prediction';
const targetTimes = ['06:00', '11:00', '14:00', '17:00'];

console.log('🟢 Script démarré. Heures cibles :', targetTimes.join(', '));
console.log('📡 Cible Telegram :', TARGET_CHAT_ID);

// 📡 Connexion DB
db.connect()
  .then(() => console.log('✅ Connexion PostgreSQL établie'))
  .catch(err => {
    console.error('❌ Connexion PostgreSQL échouée :', err.message);
    process.exit(1);
  });

async function sendScheduledMessages() {
  const now = dayjs();
  const currentTime = now.format('HH:mm');
  const currentDate = now.format('YYYY-MM-DD');

  console.log(`[${currentTime}] 🔍 Vérification des messages programmés...`);

  if (!targetTimes.includes(currentTime)) return;

  try {
    const { rows } = await db.query(`
      SELECT * FROM messages_auto
      WHERE send_date::date = $1
        AND TO_CHAR(send_date, 'HH24:MI') = $2
        AND sent_today = FALSE
    `, [currentDate, currentTime]);

    if (rows.length === 0) {
      console.log(`🕒 Aucun message prévu à ${currentTime}`);
      return;
    }

    for (const msg of rows) {
      try {
        if (msg.media_url) {
          await bot.sendPhoto(TARGET_CHAT_ID, msg.media_url, {
            caption: msg.media_text || msg.contenu,
          });
        } else {
          await bot.sendMessage(TARGET_CHAT_ID, msg.contenu);
        }

        await db.query(`UPDATE messages_auto SET sent_today = TRUE WHERE id = $1`, [msg.id]);
        console.log(`✅ Message ID ${msg.id} envoyé à ${currentTime}`);
      } catch (err) {
        console.error(`❌ Échec envoi ID ${msg.id} :`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Erreur SELECT messages_auto :', err.message);
  }
}

async function resetSentToday() {
  const now = dayjs();
  const currentTime = now.format('HH:mm');
  if (currentTime === '00:00') {
    try {
      await db.query(`
        UPDATE messages_auto SET sent_today = FALSE WHERE send_date::date = CURRENT_DATE
      `);
      console.log('♻️ Réinitialisation de sent_today à 00:00');
    } catch (err) {
      console.error('❌ Erreur reset sent_today :', err.message);
    }
  }
}

// 🕒 Tick chaque minute
setInterval(() => {
  const now = dayjs().format('HH:mm:ss');
  console.log(`[${now}] ⏱️ Tick`);
  sendScheduledMessages();
  resetSentToday();
}, 60 * 1000);

// 🚀 Démarrage immédiat
sendScheduledMessages();

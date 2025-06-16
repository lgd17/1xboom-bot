const TelegramBot = require('node-telegram-bot-api');
const { Client } = require('pg');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

db.connect();

// Commande pour ajouter une prédiction
bot.onText(/^\/predict (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1];

  // Exemple d'entrée : PSG vs OM | PSG gagne
  const [matchName, tip] = text.split('|').map(part => part.trim());

  if (!matchName || !tip) {
    return bot.sendMessage(chatId, "❌ Format invalide. Utilise :\n/predict Match | Pronostic");
  }

  try {
    const result = await db.query(
      'INSERT INTO predictions (match, tip) VALUES ($1, $2) RETURNING *',
      [matchName, tip]
    );

    bot.sendMessage(chatId, `✅ Prédiction enregistrée !\n🆔 ID: ${result.rows[0].id}`);
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "⚠️ Erreur lors de l'enregistrement de la prédiction.");
  }
});

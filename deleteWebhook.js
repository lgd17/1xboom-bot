require('dotenv').config();
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN manquant dans le fichier .env');
  process.exit(1);
}

const url = `https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`;

axios.get(url)
  .then(() => {
    console.log('🗑️ Webhook supprimé avec succès');
  })
  .catch(err => {
    console.error('❌ Erreur lors de la suppression du webhook :', err.response?.data || err.message);
  });

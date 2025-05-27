require('dotenv').config();
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!BOT_TOKEN || !WEBHOOK_URL) {
  console.error("❌ BOT_TOKEN ou WEBHOOK_URL manquant dans .env");
  process.exit(1);
}

const telegramApiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;

axios.post(telegramApiUrl, {
  url: WEBHOOK_URL,
})
.then(res => {
  if (res.data.ok) {
    console.log("✅ Webhook enregistré avec succès !");
  } else {
    console.error("❌ Échec lors de l'enregistrement du webhook :", res.data);
  }
})
.catch(err => {
  console.error("❌ Erreur de requête :", err.response?.data || err.message);
});


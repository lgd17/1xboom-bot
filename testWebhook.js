require('dotenv').config();
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN non défini dans .env');
  process.exit(1);
}

const url = `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`;

axios.get(url)
  .then(res => {
    const data = res.data.result;
    console.log('🔍 Webhook Info :');
    console.log(`- URL configurée      : ${data.url || 'Aucune'}`);
    console.log(`- Nombre updates en attente : ${data.pending_update_count}`);
    console.log(`- Dernière erreur     : ${data.last_error_message || 'Aucune'}`);
    console.log(`- Webhook en cours    : ${data.has_custom_certificate ? 'Certificat personnalisé' : 'Standard'}`);
  })
  .catch(err => {
    console.error('❌ Erreur lors de la requête :', err.message);
  });

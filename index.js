const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const app = express();

app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  const message = req.body.message;
  if (message && message.text) {
    const chatId = message.chat.id;
    const text = message.text;

    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `Tu as dit : ${text}`
      })
    });
  }
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('Bot Telegram Webhook actif 🚀');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});

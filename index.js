const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

// Ton token (mais attention, à ne pas mettre en clair en prod)
const TOKEN = '7768152677:AAGjgq9IJ1vD_irML3Sl8Qf50tv6lVyiAm0';

// Ton chat ID (à récupérer via le bot, cf plus bas)
const CHAT_ID = 6248838967; // ← Remplace par l'ID du chat ou groupe

const bot = new TelegramBot(TOKEN, { polling: true });

// Message à envoyer chaque jour
function getCouponDuJour() {
  return `
🎯 Coupon 1xboom du jour 🎯
1. Match A : Victoire équipe A
2. Match B : Nul
3. Match C : Victoire équipe C

Bonne chance ! 🍀
`;
}

// Fonction pour envoyer le message
function envoyerCoupon() {
  bot.sendMessage(CHAT_ID, getCouponDuJour())
    .then(() => console.log('Coupon envoyé avec succès !'))
    .catch(console.error);
}

// Planifier envoi tous les jours à 9h10 (cron '10 9 * * *')
cron.schedule('10 9 * * *', () => {
  console.log('Envoi automatique du coupon à 9h10...');
  envoyerCoupon();
});

// Récupérer le chat ID facilement (envoie un message à ton bot et regarde la console)
bot.on('message', (msg) => {
  console.log(`Message reçu de chat ID: ${msg.chat.id}`);
  bot.sendMessage(msg.chat.id, `Ton chat ID est : ${msg.chat.id}`);
});

console.log('Bot démarré, prêt à envoyer les coupons chaque jour à 9h10.'); 	
	
require('dotenv').config(); // si tu veux aussi un .env en local

const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.CHAT_ID;

if (!TOKEN || !CHAT_ID) {
  console.error('TOKEN ou CHAT_ID manquant.');
  process.exit(1);
}

// le reste de ton bot...	
	
"scripts": {
  "start": "node index.js"
}




require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const {
  sendManualCoupon,
  generateAndSendCoupon,
  cleanOldData
} = require("./autoSend");

// ====== CONFIGURATION ENV ======
const PORT = process.env.PORT || 3000;
const token = process.env.TELEGRAM_TOKEN;
if (!token) throw new Error("❌ TELEGRAM_TOKEN non défini !");
const baseUrl = process.env.BASE_URL;
if (!baseUrl) throw new Error("❌ BASE_URL manquant dans .env !");

const encodedToken = encodeURIComponent(token);

// ====== EXPRESS ======
const app = express();
app.use(bodyParser.json());

// ====== INITIALISATION DU BOT EN MODE WEBHOOK ======
const bot = new TelegramBot(token, { webHook: true });
bot.setWebHook(`${baseUrl}/bot${encodedToken}`)
  .then(() => console.log(`✅ Webhook configuré : ${baseUrl}/bot${encodedToken}`))
  .catch(err => console.error("❌ Erreur lors du setWebhook :", err));

// ====== ROUTE POUR TRAITER LES UPDATES DE TELEGRAM ======
app.post(`/bot${encodedToken}`, (req, res) => {
  console.log("✅ Webhook → Update reçu");
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ====== ROUTE POUR RÉVEILLER RENDER ======
app.get("/ping", (req, res) => {
  console.log("✅ Ping reçu — Render réveillé");
  res.status(200).send("Bot is awake!");
});

// ====== ROUTE DE TEST ======
app.get("/", (req, res) => res.send("✅ Bot Telegram en ligne (mode webhook)"));

// ====== ROUTES CRON ======
app.get("/cron-task/manual-coupon", async (req, res) => {
  try {
    await sendManualCoupon();
    await cleanOldData();
    res.send("✅ Coupons manuels envoyés et nettoyage effectué");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Erreur manuel coupon / nettoyage");
  }
});

app.get("/cron-task/api-coupon", async (req, res) => {
  try {
    await generateAndSendCoupon();
    res.send("✅ Coupons API envoyés");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Erreur génération coupons API");
  }
});

// ====== LANCEMENT SERVEUR ======
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});

// ====== EXPORTS ======
module.exports = { app, bot };


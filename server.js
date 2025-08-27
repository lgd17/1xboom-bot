// server.js
require("dotenv").config();
const express = require("express");
const {
  sendManualCoupon,
  generateAndSendCoupon,
  cleanOldData
} = require("./autoSend");

const app = express();
const PORT = process.env.PORT || 3000;

// Healthcheck
app.get("/ping", (req, res) => {
  res.send("✅ Bot réveillé / Render Healthcheck");
});

// Cron routes
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Tu peux aussi ajouter d'autres routes ici (ex: /webhook, /generate, etc.)

app.listen(PORT, () => {
  console.log(`🚀 Serveur API lancé sur http://localhost:${PORT}`);
});

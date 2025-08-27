// server.js
// server.js
require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Pour vérifier que le serveur tourne
// ======================
// Route healthcheck (Render)
// ======================
app.get("/ping", (req, res) => {
  // Render appelle cette route automatiquement pour vérifier si ton app tourne
  res.send("✅ Service UP");
});

// ======================
// Route pour test manuel (toi uniquement)
// ======================
app.get("/ping-admin", async (req, res) => {
  try {
    const adminId = process.env.ADMIN_ID || "TON_TELEGRAM_ID";
    await bot.sendMessage(
      adminId,
      `🟢 Ping manuel reçu à ${new Date().toLocaleString("fr-FR", {
        timeZone: "Africa/Lome",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })}`
    );
    res.send("✅ Message envoyé à l'admin.");
  } catch (error) {
    console.error("Erreur ping-admin :", error);
    res.status(500).send("❌ Erreur lors de l'envoi du message.");
  }
});

// ======================
// Route pour cron-job.org (exécution automatique)
// ======================
app.get("/cron-task", async (req, res) => {
  try {
    // Ici tu appelles la fonction qui envoie automatiquement ton coupon
    await autoSendCoupon(); 
    res.send("✅ Coupon envoyé avec succès");
  } catch (err) {
    console.error("Erreur cron-task :", err);
    res.status(500).send("❌ Erreur lors de l’exécution de la tâche cron");
  }
});

// Tu peux aussi ajouter d'autres routes ici (ex: /webhook, /generate, etc.)

app.listen(PORT, () => {
  console.log(`🚀 Serveur API lancé sur http://localhost:${PORT}`);
});

const fetch = require("node-fetch");
const bot = require("./bot"); // Ton bot Telegram
const ADMIN_ID = process.env.ADMIN_ID;

const URL = process.env.PING_URL || "https://ton-bot.onrender.com/ping"; // Remplace par ton endpoint

async function ping() {
  try {
    const res = await fetch(URL);
    if (res.ok) {
      console.log(`✅ Ping réussi - Status: ${res.status}`);
      // Optionnel : notification Telegram à l'ADMIN_ID
      // await bot.sendMessage(ADMIN_ID, `✅ Ping réussi - Status: ${res.status}`);
    } else {
      console.warn(`⚠️ Ping échoué - Status: ${res.status}`);
      await bot.sendMessage(ADMIN_ID, `⚠️ Ping échoué - Status: ${res.status}`);
    }
  } catch (err) {
    console.error("❌ Erreur ping :", err.message);
    await bot.sendMessage(ADMIN_ID, `❌ Erreur ping : ${err.message}`);
  }
}

// Ping toutes les 14 minutes
setInterval(ping, 14 * 60 * 1000); // 14 minutes en millisecondes

// Ping immédiat au démarrage
ping();

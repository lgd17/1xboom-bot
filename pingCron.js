// pingCron.js

const { ping, pingBot2 } = require("./pingServer");
const schedule = require("node-schedule");

// Fonction pour vérifier si on est dans la plage 5h00 - 23h30
function isWithinPingHours() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  // Plage 05:00 → 23:30
  return (hours > 5 || (hours === 5 && minutes >= 0)) && (hours < 23 || (hours === 23 && minutes <= 30));
}

// Job cron toutes les 14 minutes
schedule.scheduleJob('*/14 * * * *', async () => {
  if (!isWithinPingHours()) return;

  try {
    await ping();
    const now = new Date();
    console.log(`⏰ Ping exécuté à ${now.getHours()}:${now.getMinutes()}`);
  } catch (err) {
    console.error("❌ Erreur ping cron :", err.message);
  }
});

// 🔵 Job cron à 05h05 chaque jour pour réveiller Bot2
schedule.scheduleJob("5 5 * * *", async () => {
  console.log("🚀 Tentative de réveil de Bot2 à 05h05...");

  try {
    await pingBot2();
    console.log("✅ Requête envoyée à Bot2 !");
  } catch (err) {
    console.error("❌ Erreur lors du réveil de Bot2 :", err.message);
  }
});

// Ping immédiat au démarrage si dans la plage
if (isWithinPingHours()) {
  ping().catch(err => console.error("❌ Erreur ping immédiat :", err.message));
}

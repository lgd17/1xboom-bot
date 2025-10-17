// pingCron.js
const { ping, pingBot2 } = require("./pingServer");
const schedule = require("node-schedule");

// ---------- 🕒 1️⃣ Fonction de vérification de la plage horaire ----------
function isWithinPingHours() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  // Plage 05:00 → 23:30 UTC
  return (hours > 5 && hours < 23) || (hours === 5 && minutes >= 0) || (hours === 23 && minutes <= 30);
}

// ---------- 🔁 2️⃣ Ping principal toutes les 14 minutes ----------
schedule.scheduleJob("*/13 * * * *", async () => {
  if (!isWithinPingHours()) return;
  try {
    await ping();
    const now = new Date();
    console.log(`⏰ Ping principal exécuté à ${now.toISOString()} UTC`);
  } catch (err) {
    console.error("❌ Erreur ping principal :", err.message);
  }
});

// ---------- 🚀 3️⃣ Réveil du Bot2 chaque jour à 05h05 UTC ----------
schedule.scheduleJob("5 5 * * *", async () => {
  console.log("🚀 Tentative de réveil de Bot2 à 05h05 UTC...");
  try {
    await pingBot2();
    console.log("✅ Bot2 réveillé avec succès !");
  } catch (err) {
    console.error("❌ Échec du réveil de Bot2 :", err.message);
  }
});

// ---------- 🧠 4️⃣ Ping immédiat si le bot démarre dans la plage horaire ----------
if (isWithinPingHours()) {
  ping()
    .then(() => console.log("⚡ Ping immédiat exécuté au démarrage"))
    .catch((err) => console.error("❌ Erreur ping immédiat :", err.message));
}

// ---------- ♻️ 5️⃣ Redémarrage automatique quotidien ----------
schedule.scheduleJob("0 2 * * *", () => {
  console.log("♻️ Redémarrage automatique programmé à 02h00 UTC...");
  process.exit(0);
});

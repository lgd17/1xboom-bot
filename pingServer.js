// pingServer.js
const fetch = require("node-fetch");
const axios = require("axios");
const bot = require("./bot");

const ADMIN_ID = process.env.ADMIN_ID;
const URL = process.env.PING_URL || "https://onexboom-bot.onrender.com/ping";
const BOT2_URL = process.env.BOT2_URL || "https://onexadmin-bot.onrender.com/ping";

// ---------- 🧠 Helper : timeout sécurisé ----------
function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("⏱ Timeout du ping")), ms));
}

// ---------- 🔵 1️⃣ Ping principal ----------
async function ping() {
  try {
    const res = await Promise.race([
      fetch(URL),
      timeout(10000) // 10 secondes max
    ]);

    if (res.ok) {
      console.log(`✅ Ping réussi - Status: ${res.status}`);
    } else {
      console.warn(`⚠️ Ping échoué - Status: ${res.status}`);
      if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⚠️ Ping échoué - Status: ${res.status}`);
    }
  } catch (err) {
    console.error("❌ Erreur ping principal :", err.message);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Erreur ping principal : ${err.message}`);
  }
}

// ---------- 🟣 2️⃣ Ping spécial pour réveiller Bot2 ----------
async function pingBot2() {
  try {
    await axios.get(BOT2_URL, { timeout: 8000 });
    console.log("✅ Bot2 réveillé avec succès !");
  } catch (err) {
    console.warn("⚠️ 1ère tentative de réveil échouée, nouvel essai dans 30s...");
    setTimeout(async () => {
      try {
        await axios.get(BOT2_URL, { timeout: 8000 });
        console.log("✅ Bot2 réveillé au 2ᵉ essai !");
      } catch (err2) {
        console.error("❌ Impossible de réveiller Bot2 après 2 tentatives :", err2.message);
        if (ADMIN_ID)
          await bot.sendMessage(
            ADMIN_ID,
            `🚨 Bot2 injoignable après 2 tentatives : ${err2.message}`
          );
      }
    }, 30000);
  }
}

module.exports = { ping, pingBot2 };

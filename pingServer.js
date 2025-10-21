// pingServer.js

const fetch = require("node-fetch");
const axios = require("axios");
const bot = require("./bot");

const ADMIN_ID = process.env.ADMIN_ID;

const URL = process.env.PING_URL || "https://onexboom-bot.onrender.com/ping";
const BOT2_URL = process.env.BOT2_URL || "https://onexadmin-bot.onrender.com/ping";

// 1️⃣ Ping principal
async function ping() {
  try {
    const res = await fetch(URL);

    if (res.ok) {
      console.log(`✅ Ping réussi - Status: ${res.status}`);
      // Optionnel : notification Telegram
      // await bot.sendMessage(ADMIN_ID, `✅ Ping réussi - Status: ${res.status}`);
    } else {
      console.warn(`⚠️ Ping échoué - Status: ${res.status}`);
      if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `⚠️ Ping échoué - Status: ${res.status}`);
    }
  } catch (err) {
    console.error("❌ Erreur ping :", err.message);
    if (ADMIN_ID) await bot.sendMessage(ADMIN_ID, `❌ Erreur ping : ${err.message}`);
  }
}

// 2️⃣ Ping Bot2 (pour le réveiller)
async function pingBot2() {
  try {
    await axios.get(BOT2_URL);
    console.log("✅ Bot2 réveillé !");
  } catch {
    setTimeout(async () => {
      try {
        await axios.get(BOT2_URL);
        console.log("✅ Bot2 réveillé au 2ᵉ essai !");
      } catch (err) {
        console.error("❌ Impossible de réveiller Bot2 même après 2 tentatives :", err.message);
      }
    }, 30000);
  }
}

module.exports = { ping, pingBot2 };

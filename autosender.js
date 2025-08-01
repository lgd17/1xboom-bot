require("dotenv").config();
const { pool } = require("./db");
const schedule = require("node-schedule");
const generateCouponEurope = require("./generateCouponEurope");
const generateCouponAfrica = require("./generateCouponAfrica");
const generateCouponAmerica = require("./generateCouponAmerica");
const generateCouponAsia = require("./generateCouponAsia");
const { formatMatchTips } = require("./couponUtils");
const bot = require('./bot'); 
const CHANNEL_ID = process.env.CHANNEL_ID; 


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Remplace par l'@username de ton canal (si public) ou son ID (si privé, avec -100...)
const CHANNEL_ID = '@nom_de_ton_canal'; // 

schedule.scheduleJob('0 6 * * *', async () => {
  const result = await pool.query("SELECT * FROM daily_pronos WHERE date = CURRENT_DATE LIMIT 1");
  const coupon = result.rows.length > 0 ? result.rows[0].content : "⚠️ Aucun coupon disponible aujourd'hui.";

  const users = await pool.query("SELECT telegram_id FROM verified_users");

  for (const user of users.rows) {
    await bot.sendMessage(user.telegram_id, `🎯 *Pronostic du jour :*\n\n${coupon}`, {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [
          ["🏆 Mes Points", "🤝 Parrainage"],
          ["🆘 Assistance 🤖"]
        ],
        resize_keyboard: true
      }
    });

    await pool.query(`
      INSERT INTO daily_access (telegram_id, date, clicked)
      VALUES ($1, CURRENT_DATE, true)
      ON CONFLICT (telegram_id, date) DO UPDATE SET clicked = true
    `, [user.telegram_id]);
  }

  // ✅ Message d'alerte dans le canal
  await bot.sendMessage(CHANNEL_ID, `📢 *Nouveau coupon du jour disponible !*\n\n🎯 Connecte-toi à ton bot pour recevoir le pronostic automatique d’aujourd’hui.`, {
    parse_mode: "Markdown"
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////


// CRON : Tous les jours à 7h15 UTC
schedule.scheduleJob("15 7 * * *", async () => {
  try {
    const existing = await getTodayCoupon();
    if (existing) {
      console.log("⏭️ Coupon déjà inséré manuellement aujourd'hui.");
      return;
    }

    const matches = await generateFullCoupon();
    if (!matches.length) {
      console.log("❌ Aucun match récupéré via l'API.");
      return;
    }

    // Sauvegarde en base
    await saveTodayCoupon(matches);

    // Envoi aux utilisateurs vérifiés
    await sendToVerifiedUsers(matches);

    // Alerte dans le canal
    await bot.sendMessage(CHANNEL_ID,
      `📢 Le *pronostic du jour* vient d'être publié !\n\nClique ici 👉 @nom_de_votre_bot pour le consulter si tu es validé.`,
      { parse_mode: "Markdown" }
    );

    console.log("🚀 Coupon généré automatiquement et diffusé.");
  } catch (err) {
    console.error("❌ Erreur dans autosender :", err);
  }
});



async function generateFullCoupon() {
  const europeMatches = await generateCouponEurope();
  const africaMatches = await generateCouponAfrica();
  const americaMatches = await generateCouponAmerica();
  const asiaMatches = await generateCouponAsia();

  // 2 matchs max par continent
  return [
    ...europeMatches.slice(0, 2),
    ...africaMatches.slice(0, 2),
    ...americaMatches.slice(0, 2),
    ...asiaMatches.slice(0, 2)
  ];
}

async function getTodayCoupon() {
  const today = new Date().toISOString().split("T")[0];
  const result = await pool.query(
    "SELECT * FROM daily_pronos WHERE date::date = $1",
    [today]
  );
  return result.rows[0];
}

async function saveTodayCoupon(matches) {
  const today = new Date().toISOString().split("T")[0];
  await pool.query(
    "INSERT INTO daily_pronos (date, matches) VALUES ($1, $2)",
    [today, JSON.stringify(matches)]
  );
}

function formatMatchTips(matches) {
  return matches.map((match, i) =>
    `⚽ <b>Match ${i + 1}</b>\n🏟️ ${match.teams}\n🕒 ${match.time} - ${match.league}\n🎯 <b>${match.tip}</b>\n`
  ).join("\n");
}

async function sendToVerifiedUsers(matches) {
  const users = await pool.query("SELECT telegram_id FROM verified_users");
  const message = `🎯 𝗖𝗢𝗨𝗣𝗢𝗡 𝗗𝗨 𝗝𝗢𝗨𝗥 🎯\n\n` + formatMatchTips(matches);

  for (const user of users.rows) {
    try {
      await bot.sendMessage(user.telegram_id, message, { parse_mode: "HTML" });

  

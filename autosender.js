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

// Schedule à 7h15 UTC
schedule.scheduleJob("15 7 * * *", async () => {
  const existing = await getTodayCoupon();
  if (existing) return console.log("✅ Coupon déjà généré aujourd'hui.");

  const matches = await generateFullCoupon();
  if (!matches.length) return console.log("❌ Aucun match récupéré.");

  await saveTodayCoupon(matches);
  await sendToChannel(matches);
  await sendToVerifiedUsers(matches);
  console.log("🚀 Coupon généré et envoyé avec succès !");
});



async function generateFullCoupon() {
  const europeMatches = await generateCouponEurope();
  const africaMatches = await generateCouponAfrica();
  const americaMatches = await generateCouponAmerica();
  const asiaMatches = await generateCouponAsia();

  const allMatches = [
    ...europeMatches.slice(0, 2),
    ...africaMatches.slice(0, 2),
    ...americaMatches.slice(0, 2),
    ...asiaMatches.slice(0, 2)
  ];

  return allMatches;
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
async function sendToVerifiedUsers(matches) {
  const users = await pool.query("SELECT telegram_id FROM verified_users");
  const message = `🎯 𝗖𝗢𝗨𝗣𝗢𝗡 𝗗𝗨 𝗝𝗢𝗨𝗥 🎯\n\n` + formatMatchTips(matches);

  for (const user of users.rows) {
    try {
      await bot.sendMessage(user.telegram_id, message, { parse_mode: "HTML" });
    } catch (error) {
      console.error(`❌ Erreur d'envoi à ${user.telegram_id}`, error.message);
    }
  }
}
       
          // Mettre clicked à true dans daily_access
          await pool.query(`
            INSERT INTO daily_access (telegram_id, date, clicked)
            VALUES ($1, CURRENT_DATE, true)
            ON CONFLICT (telegram_id, date) DO UPDATE SET clicked = true
          `, [user.telegram_id]);
        }

        // Envoyer une alerte dans le canal
        await bot.sendMessage(CHANNEL_ID, `📢 Le *pronostic du jour* vient d'être publié !\n\nClique ici 👉 @nom_de_votre_bot pour le consulter si tu es validé.`, {
          parse_mode: "Markdown"
        });

        console.log("✅ Coupon généré automatiquement et diffusé.");
      } else {
        console.log("⚠️ La génération automatique a échoué (coupon vide).");
      }
    } else {
      console.log("⏭️ Coupon déjà inséré manuellement aujourd'hui, aucune génération automatique.");
    }
  } catch (err) {
    console.error("❌ Erreur dans autosender :", err);
  }
});

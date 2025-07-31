const schedule = require('node-schedule');
const { pool } = require('./db');
const generateCouponEurope = require('./generateCouponEurope');
const generateCouponAfrica = require('./generateCouponAfrica');
const generateCouponAmerica = require('./generateCouponAmerica');
const generateCouponAsia = require('./generateCouponAsia');
const bot = require('./bot'); // Assure-toi que ton bot est exporté dans un fichier à part
const CHANNEL_ID = process.env.CHANNEL_ID; // Exemple : "@nom_du_canal"


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




schedule.scheduleJob('15 7 * * *', async () => {
  try {
    // Vérifie s'il y a déjà un coupon inséré manuellement aujourd'hui
    const check = await pool.query("SELECT * FROM daily_pronos WHERE date = CURRENT_DATE LIMIT 1");

    if (check.rows.length === 0) {
     console.log("⚙️ Génération automatique du coupon...");

    // Générer 2 matchs par continent
    const matchesEurope = await generateCouponEurope(2);
    const matchesAfrica = await generateCouponAfrica(2);
    const matchesAmerica = await generateCouponAmerica(2);
    const matchesAsia = await generateCouponAsia(2);

    const fullCoupon = `🌍 *Coupon du jour :*\n\n` +
      `🇪🇺 *Europe*\n${matchesEurope}\n\n` +
      `🌍 *Afrique*\n${matchesAfrica}\n\n` +
      `🌎 *Amérique*\n${matchesAmerica}\n\n` +
      `🌏 *Asie*\n${matchesAsia

                   
      if (coupon) {
        // Enregistrer dans daily_pronos
        await pool.query(
          "INSERT INTO daily_pronos (date, content, source) VALUES (CURRENT_DATE, $1, 'auto')",
          [coupon]
        );

        // Envoyer à tous les utilisateurs validés
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

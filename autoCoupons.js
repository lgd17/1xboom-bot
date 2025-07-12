const schedule = require("node-schedule");
const { pool } = require("./db");
const { bot } = require("./bot"); // ou adapte selon ta structure
const generateCoupon = require("./generateCoupon"); // doit retourner un objet { content, media_url, media_type }

/////////////////////////////////////// ✅ GENRE LES COUPONS AUTOMATIQUES ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
//=== API Express : route /generate-coupon ===
// 🕖 Tâche : chaque jour à 7h15 UTC
schedule.scheduleJob("15 7 * * *", async () => {
  try {
    // 1️⃣ Vérifie s’il y a déjà un coupon pour aujourd’hui
    const existing = await pool.query(`
      SELECT * FROM daily_pronos
      WHERE date = CURRENT_DATE
      ORDER BY created_at ASC
      LIMIT 1
    `);

    if (existing.rows.length > 0) {
      console.log("📌 Coupon manuel déjà présent pour aujourd’hui. Aucune action.");
      return;
    }

    // 2️⃣ Génère un coupon via l'API
    const data = await generateCoupon();

    if (!data || !data.content) {
      console.error("❌ Coupon API invalide.");
      return;
    }

    // 3️⃣ Enregistre le coupon généré
    await pool.query(`
      INSERT INTO daily_pronos (content, media_url, media_type)
      VALUES ($1, $2, $3)
    `, [data.content, data.media_url || null, data.media_type || null]);

    console.log("✅ Coupon généré via API et enregistré.");

    // 4️⃣ Récupère tous les utilisateurs validés
    const users = await pool.query("SELECT telegram_id FROM verified_users");

    for (const { telegram_id } of users.rows) {
      try {
        const keyboard = {
          reply_markup: {
            keyboard: [
              ["🏆 Mes Points"],
              ["🤝 Parrainage", "🆘 Assistance 🤖"]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
          }
        };

        // 5️⃣ Envoie selon le type de média
        if (data.media_type === "photo" && data.media_url) {
          await bot.sendPhoto(telegram_id, data.media_url, {
            caption: data.content,
            parse_mode: "Markdown",
            ...keyboard
          });
        } else if (data.media_type === "video" && data.media_url) {
          await bot.sendVideo(telegram_id, data.media_url, {
            caption: data.content,
            parse_mode: "Markdown",
            ...keyboard
          });
        } else {
          await bot.sendMessage(telegram_id, data.content, {
            parse_mode: "Markdown",
            ...keyboard
          });
        }

        console.log(`📤 Coupon envoyé à ${telegram_id}`);
      } catch (sendErr) {
        console.error(`❌ Erreur d'envoi à ${telegram_id}:`, sendErr.message);
      }
    }

  } catch (err) {
    console.error("❌ Erreur générale dans la tâche 7h15 :", err.message);
  }
});


// 🧹 Nettoyage des pronos API de plus de 3 jours chaque nuit à 2h
schedule.scheduleJob("0 2 * * *", async () => {
  try {
    const { rowCount } = await pool.query(`
      DELETE FROM daily_pronos
      WHERE created_at < NOW() - INTERVAL '3 days'
      AND content ILIKE '%api%'
    `);

    console.log(`🧹 ${rowCount} prono(s) API supprimé(s).`);
  } catch (err) {
    console.error("❌ Erreur de nettoyage :", err.message);
  }
});

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const schedule = require("node-schedule");
const { pool } = require("./db");

// ✅ Remplace cette valeur par ton Channel ID si ce n'est pas en .env
const channelId = process.env.TELEGRAM_CHANNEL_ID;

module.exports = function setupAutoSender(bot) {
  async function sendFixedMessages() {
    try {
      const { rows } = await pool.query("SELECT * FROM message_fixes");
      const now = dayjs().tz("Africa/Lome");
      const heureStr = now.format("HH:mm");
      console.log("⏰ Heure Lomé actuelle :", heureStr);

      for (const row of rows) {
        if (!row.heures) continue;
        const heures = row.heures.split(",").map(h => h.trim());
        if (heures.includes(heureStr)) {
          try {
            const text = row.media_text;
            const media = row.media_url;

            if (media?.startsWith("http")) {
              await bot.sendMessage(channelId, text);
            } else if (media?.includes("AgAC") || media?.includes("photo")) {
              await bot.sendPhoto(channelId, media, { caption: text });
            } else if (media?.includes("BAAD") || media?.includes("video")) {
              await bot.sendVideo(channelId, media, { caption: text });
            } else if (media?.includes("AwAD") || media?.includes("voice")) {
              await bot.sendVoice(channelId, media);
              await bot.sendMessage(channelId, text);
            } else {
              await bot.sendMessage(channelId, text);
            }

            console.log(`✅ Message envoyé à ${heureStr}`);
          } catch (err) {
            console.error("❌ Erreur envoi automatique :", err);
          }
        }
      }
    } catch (err) {
      console.error("❌ Erreur récupération messages fixes :", err);
    }
  }

  // 📆 Planification : vérifie chaque minute
  schedule.scheduleJob("* * * * *", sendFixedMessages);
};


module.exports = function setupAutoSender(bot) {
  schedule.scheduleJob("15 7 * * *", async () => {
    const today = new Date().toISOString().slice(0, 10);

    // 🔍 Cherche un prono du jour
    const result = await pool.query(
      "SELECT * FROM daily_pronos WHERE date = $1 LIMIT 1",
      [today]
    );

    if (result.rows.length === 0) return;

    const prono = result.rows[0];

    // 📤 Récupère les utilisateurs validés
    const users = await pool.query("SELECT telegram_id FROM verified_users");

    for (const user of users.rows) {
      const chatId = user.telegram_id;

      if (prono.media_type === "photo" && prono.media_url) {
        await bot.sendPhoto(chatId, prono.media_url, {
          caption: prono.content,
          parse_mode: "Markdown",
        });
      } else if (prono.media_type === "video" && prono.media_url) {
        await bot.sendVideo(chatId, prono.media_url, {
          caption: prono.content,
          parse_mode: "Markdown",
        });
      } else {
        await bot.sendMessage(chatId, prono.content, {
          parse_mode: "Markdown",
        });
      }

      // ❌ Supprimer le bouton “🎯 Pronostics du jour”
      await bot.sendMessage(chatId, " ", {
        reply_markup: {
          keyboard: [
            ["🏆 Mes Points"],
            ["🤝 Parrainage", "🆘 Assistance 🤖"]
          ],
          resize_keyboard: true
        }
      });
    }

    console.log(`📤 Prono du ${today} envoyé à ${users.rows.length} utilisateurs`);
  });
};


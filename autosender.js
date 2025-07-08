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

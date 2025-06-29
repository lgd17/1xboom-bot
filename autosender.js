const { pool } = require('./db');

async function sendFixedMessages(bot, channelId) {
  try {
    const { rows } = await pool.query('SELECT * FROM message_fixes');
    const now = new Date();
    const heureStr = now.toTimeString().slice(0, 5); // "HH:MM"
    console.log(`[${heureStr}] Vérification des messages fixes...`);

    for (const row of rows) {
      if (!row.heures) continue;
      const heures = row.heures.split(',').map(h => h.trim());

      if (heures.includes(heureStr)) {
        try {
          const text = row.media_text;
          const media = row.media_url;

          if (media?.startsWith('http')) {
            await bot.sendMessage(channelId, text);
          } else if (media?.includes('AgAC') || media?.includes('photo')) {
            await bot.sendPhoto(channelId, media, { caption: text });
          } else if (media?.includes('BAAD') || media?.includes('video')) {
            await bot.sendVideo(channelId, media, { caption: text });
          } else if (media?.includes('AwAD') || media?.includes('voice')) {
            await bot.sendVoice(channelId, media);
            await bot.sendMessage(channelId, text);
          } else {
            await bot.sendMessage(channelId, text);
          }

          console.log(`✅ Message envoyé à ${heureStr} [ID ${row.id}]`);
        } catch (err) {
          console.error('❌ Erreur envoi message :', err);
        }
      }
    }
  } catch (err) {
    console.error('❌ Erreur requête message_fixes :', err);
  }
}

module.exports = { sendFixedMessages };

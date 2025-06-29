const { pool } = require('./db');

async function sendFixedMessages(bot, channelId) {
  const now = new Date();
  const hh = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  const time = `${hh}:${mm}`;

  try {
    const res = await pool.query(
      `SELECT * FROM message_fixes WHERE heures LIKE $1`,
      [`%${time}%`]
    );

    for (const row of res.rows) {
      if (row.media_url) {
        const options = { caption: row.media_text || '' };
        if (row.media_url.endsWith('.mp4')) {
          await bot.sendVideo(channelId, row.media_url, options);
        } else {
          await bot.sendPhoto(channelId, row.media_url, options);
        }
      } else {
        await bot.sendMessage(channelId, row.media_text);
      }
    }

  } catch (err) {
    console.error("❌ Erreur autosender :", err);
  }
}

module.exports = { sendFixedMessages };

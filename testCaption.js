const { pool } = require("./db");
const bot = require("./bot");
const ADMIN_ID = process.env.ADMIN_ID;


module.exports = () => {
  bot.onText(/\/test_caption/, async (msg) => {
    if (msg.from.id.toString() !== ADMIN_ID) return;

    const chatId = msg.chat.id;

    try {
      // 🟢 Message immédiat de statut
      await bot.sendMessage(chatId, "🟢 Bot et serveur ✅ fonctionnels\n\n🔍 Récupération du dernier prono dans `daily_pronos`...");

      // === 1️⃣ Récupérer le dernier prono du jour ===
      const { rows } = await pool.query(`
        SELECT content, media_url, media_type, created_at 
        FROM daily_pronos
        WHERE date_only = CURRENT_DATE
        ORDER BY id DESC
        LIMIT 1
      `);

      if (rows.length === 0) {
        await bot.sendMessage(chatId, "⚠️ Aucun prono trouvé pour aujourd’hui.");
        return;
      }

      const prono = rows[0];
      const caption = `🧪 *TEST CAPTION AUTO*\n\n${prono.content || "(aucun texte)"}\n\n🗓️ ${new Date(prono.created_at).toLocaleString()}`;

      // Limite Telegram : 1024 caractères
      const safeCaption = caption.length > 1000 ? caption.slice(0, 1000) + "…" : caption;

      // === 2️⃣ Envoi selon le type du média ===
      switch (prono.media_type) {
        case "photo":
          await bot.sendPhoto(chatId, prono.media_url, { caption: safeCaption, parse_mode: "Markdown" });
          break;
        case "video":
          await bot.sendVideo(chatId, prono.media_url, { caption: safeCaption, parse_mode: "Markdown" });
          break;
        case "document":
          await bot.sendDocument(chatId, prono.media_url, { caption: safeCaption, parse_mode: "Markdown" });
          break;
        default:
          await bot.sendMessage(chatId, safeCaption, { parse_mode: "Markdown" });
          break;
      }

      // === 3️⃣ Message final ===
      await bot.sendMessage(
        chatId,
        "✅ Test terminé — légende récupérée depuis `daily_pronos`.\nAucune erreur = protection active 💪"
      );
    } catch (err) {
      console.error("Erreur /test_caption:", err);
      await bot.sendMessage(chatId, "❌ Erreur : " + err.message);
    }
  });
};


const TelegramBot = require("node-telegram-bot-api");
const { pool } = require("./db");
const { checkSpam } = require("./rateLimiter"); // anti-spam
const ADMIN_ID = process.env.ADMIN_ID;



const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: { port: 443 } });


module.exports = bot;



// --- Vérifier si utilisateur est dans le canal ---
async function isUserInChannel(userId, channelUsername) {
  try {
    const member = await bot.getChatMember(channelUsername, userId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch (err) {
    console.error("Erreur vérification canal:", err);
    return false;
  }
}

// --- Envoi du menu principal ---
async function sendMainMenu(chatId) {
  try {
    const res = await pool.query(
      "SELECT * FROM verified_users WHERE telegram_id = $1",
      [chatId]
    );

    const isVerified = res.rows.length > 0;

    const keyboard = isVerified
      ? [["🏆 Mes Points"], ["🤝 Parrainage", "🆘 Assistance 🤖"]]
      : [["🎯 Pronostics du jour"]];

    const message = isVerified
      ? "Bienvenue sur *1XBOOM* ! "
      : "Clique sur le bouton 🎯 Pronostics du jour pour accéder aux pronostics.";

    const menu = {
      reply_markup: {
        keyboard,
        resize_keyboard: true,
        one_time_keyboard: false,
      },
      parse_mode: "Markdown",
    };

    await bot.sendMessage(chatId, message, menu);
  } catch (err) {
    console.error("Erreur menu :", err);
    bot.sendMessage(
      chatId,
      "❌ Une erreur est survenue lors du chargement du menu."
    );
  }
}

// --- /start pour afficher le menu ---
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await sendMainMenu(chatId);
});

// --- Gestion des messages texte ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (!text || text.startsWith("/")) return;

  // 🔹 Anti-spam
  if (checkSpam(chatId)) {
    return bot.sendMessage(
      chatId,
      "⚠️ Trop d’actions rapides. Patiente quelques secondes."
    );
  }

  // Parrainage
  if (text === "🤝 Parrainage") {
    const botInfo = await bot.getMe();
    const referralLink = `https://t.me/${botInfo.username}?start=${chatId}`;

    const message = `
🚀 *Parraine et gagne avec P999X !*

👥 *1. Invite un ami à notre canal :*  
👉 [Rejoins le canal officiel](https://t.me/linktree_free_prediction)  
➡️ Gagne +10 points s’il s’abonne !

🎯 *2. Partage ton lien personnel d’invitation au bot :*  
\`${referralLink}\`  
➡️ Gagne +5 points s’il s’inscrit via ce lien !

🎁 *Récompenses chaque fin du mois :*  
🏆 Les *Top 5 parrains* gagnent :  
- 10 000 FC chacun 💸  
- 2 *coupons exclusifs* 🎫

📢 Plus tu partages, plus tu gagnes.  
🔥 Deviens notre meilleur ambassadeur !`;

    return bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  // Mes Points
  if (text === "🏆 Mes Points") {
    try {
      const res = await pool.query(
        "SELECT points FROM users WHERE telegram_id = $1",
        [chatId]
      );
      let points = 0;
      if (res.rows.length > 0 && res.rows[0].points) points = res.rows[0].points;

      let motivation = "";
      if (points >= 100)
        motivation = "🚀 *Incroyable ! Tu es dans la cour des grands.*";
      else if (points >= 50) motivation = "🔥 *Très bon score !* Continue !";
      else if (points >= 20) motivation = "👍 *Bien joué !* Tu montes.";
      else motivation = "💡 Gagne des points en parrainant. Clique sur '🤝 Parrainage'";

      return bot.sendMessage(
        chatId,
        `⭐️ *Tes points :* ${points} points\n\n${motivation}`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error(err);
      return bot.sendMessage(
        chatId,
        "❌ Erreur lors de la récupération des points."
      );
    }
  }

  // Assistance
  if (text === "🆘 Assistance 🤖") {
    return bot.sendMessage(chatId, "🤖 Choisis une option :", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎯 Pronostics du jour", callback_data: "pronostics" }],
          [{ text: "🏆 Mes Points", callback_data: "points" }],
          [{ text: "🤝 Parrainage", callback_data: "parrainage" }],
          [{ text: "🆘 Assistance", callback_data: "assistance" }],
        ],
      },
    });
  }
});

// --- Gestion des callbacks inline ---
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;

  // 🔹 Anti-spam
  if (checkSpam(chatId)) {
    return bot.answerCallbackQuery(query.id, {
      text: "⚠️ Trop de clics rapides. Patiente un peu.",
      show_alert: true,
    });
  }

  const data = query.data;
  await bot.answerCallbackQuery(query.id);

  const assistanceTexts = {
    pronostics: `🎯 *Pronostics du jour*\n\nTu veux accéder à nos *coupons exclusifs du jour* ? Voici comment faire 👇

1️⃣ *Inscris-toi sur un bookmaker* avec le *code promo : P999X*  
2️⃣ *Dépose au moins 2000 FCFA / 5 $*  
3️⃣ Clique sur 🎯 Pronostics et suis les étapes.

🛂 Après vérification, tu accéderas à tous les pronostics chaque jour.  
Merci pour ta confiance 🍀`,

    points: `🏆 *Mes Points*\n\nConsulte ton solde de points grâce au parrainage et ta fidélité.  
Plus tu invites, plus tu gagnes !`,

    parrainage: `🤝 *Parrainage*\n\nInvite tes amis à rejoindre le canal et le bot.  
Tu gagnes des points quand ils s’abonnent ou s’inscrivent via ton lien.`,

    assistance: `🆘 *Besoin d’aide ?*\n\n📨 *Contact :* @Catkatii  
🕘 *Heures :* Lundi - Samedi (8h à 22h) | Dimanche (10h à 18h)

Pose ta question à tout moment. On te répondra vite 💙`,
  };

  if (assistanceTexts[data]) {
    return bot.sendMessage(chatId, assistanceTexts[data], {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Retour", callback_data: "menu_assistance" }],
        ],
      },
    });
  }

  if (data === "menu_assistance") {
    return bot.sendMessage(chatId, "🤖 Choisis une option :", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎯 Pronostics du jour", callback_data: "pronostics" }],
          [{ text: "🏆 Mes Points", callback_data: "points" }],
          [{ text: "🤝 Parrainage", callback_data: "parrainage" }],
          [{ text: "🆘 Assistance", callback_data: "assistance" }],
        ],
      },
    });
  }

  console.warn("⚠️ Option inconnue callback_query:", data);
});

// --- Gestion erreurs globales ---
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

// =================== VERIFICATION UTILISATEUR ===================
const timeoutMap = {};
const userStates = {}; // <--- manquait !
const validBookmakers = ["1xbet", "888starz", "melbet", "winwin"];
const { isAllowed } = require("./rateLimiter");

// Fonction pour gérer le timeout de 5min
function startTimeout(chatId, bot) {
  clearTimeout(timeoutMap[chatId]);
  timeoutMap[chatId] = setTimeout(() => {
    delete userStates[chatId];
    bot.sendMessage(chatId, "⏰ *Temps écoulé.* Tu dois recommencer.", {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [["🎯 Pronostics du jour"]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }, 5 * 60 * 1000); // 5 minutes
}

// Gestion des messages pour la vérification
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (!text || text.startsWith("/")) return;

  // 🚨 Anti-spam
  if (!isAllowed(chatId)) {
    return bot.sendMessage(chatId, "⏳ Merci d’attendre avant ta prochaine action.");
  }

  const state = userStates[chatId];

  try {
    // 🎯 Cas : bouton pronostic du jour
    if (text === "🎯 Pronostics du jour") {
      const res = await pool.query("SELECT * FROM verified_users WHERE telegram_id = $1", [chatId]);

      if (res.rows.length === 0) {
        userStates[chatId] = { step: "await_bookmaker" };
        startTimeout(chatId, bot);
        return bot.sendMessage(chatId, "🔐 *Pour accéder aux pronostics, indique ton bookmaker :*", {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [
              ["1xbet", "888starz"],
              ["melbet", "winwin"],
            ],
            resize_keyboard: true,
          },
        });
      }

      // ✅ Vérifie s’il a déjà eu le coupon
      const accessRes = await pool.query(
        "SELECT * FROM daily_access WHERE telegram_id = $1 AND date = CURRENT_DATE",
        [chatId]
      );

      if (accessRes.rows.length > 0 && accessRes.rows[0].clicked) {
        return bot.sendMessage(chatId, "✅ Tu as déjà reçu ton pronostic aujourd’hui. Patiente jusqu’à demain.");
      }

      // Ajout en DB si pas déjà enregistré
      await pool.query(
        `INSERT INTO daily_access (telegram_id, date, clicked) VALUES ($1, CURRENT_DATE, false)
         ON CONFLICT (telegram_id, date) DO NOTHING`,
        [chatId]
      );

      // 🔎 Récupération du coupon gratuit
      const result = await pool.query(`
        SELECT content, media_url, media_type
        FROM daily_pronos
        WHERE date_only = CURRENT_DATE
          AND type = 'gratuit'
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        return bot.sendMessage(chatId, "⚠️ Aucun coupon disponible aujourd'hui.");
      }

      const { content, media_url, media_type } = result.rows[0];

      if (media_url) {
        if (media_type === "photo") await bot.sendPhoto(chatId, media_url);
        else if (media_type === "video") await bot.sendVideo(chatId, media_url);
      }

      await bot.sendMessage(chatId, `🎯 *Pronostic du jour :*\n\n${content}`, {
        parse_mode: "Markdown",
        reply_markup: {
          keyboard: [
            ["🏆 Mes Points"],
            ["🆘 Assistance 🤖", "🤝 Parrainage"],
          ],
          resize_keyboard: true,
        },
      });

      await pool.query(
        `UPDATE daily_access SET clicked = true WHERE telegram_id = $1 AND date = CURRENT_DATE`,
        [chatId]
      );

      return;
    }

    // 🔁 Étapes de vérification
    if (state) {
      if (state.step === "await_bookmaker") {
        if (!validBookmakers.includes(text.toLowerCase())) {
          return bot.sendMessage(chatId, "*❌ Choix invalide. Sélectionne un bookmaker depuis les boutons.*", {
            parse_mode: "Markdown",
          });
        }
        userStates[chatId] = { step: "await_id", bookmaker: text };
        startTimeout(chatId, bot);
        return bot.sendMessage(chatId, "*🔢 Entrez maintenant votre identifiant de dépôt (7-10 chiffres) :*", {
          parse_mode: "Markdown",
        });
      }

      if (state.step === "await_id") {
        if (!/^\d{7,10}$/.test(text)) {
          return bot.sendMessage(chatId, "*❌ Identifiant invalide. Doit être 7 à 10 chiffres.*", {
            parse_mode: "Markdown",
          });
        }
        userStates[chatId] = { ...state, step: "await_amount", depositId: text };
        startTimeout(chatId, bot);
        return bot.sendMessage(chatId, "*💰 Indique le montant déposé (en FCFA, $, £ ...) :*", {
          parse_mode: "Markdown",
        });
      }

      if (state.step === "await_amount") {
        const amount = parseInt(text.replace(/[^\d]/g, ""));
        if (isNaN(amount) || amount < 5) {
          return bot.sendMessage(chatId, "*❌ Montant invalide. Envoie un nombre supérieur à 5$ (2000 FCFA).*", {
            parse_mode: "Markdown",
          });
        }

        clearTimeout(timeoutMap[chatId]);

        // 🔄 Enregistrement en attente de validation
        await pool.query(
          `INSERT INTO pending_verifications (telegram_id, username, bookmaker, deposit_id, amount)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (telegram_id) DO NOTHING`,
          [chatId, msg.from.username || "Aucun", state.bookmaker, state.depositId, amount]
        );

        delete userStates[chatId];

        // Petit effet "chargement"
const sentMessage = await bot.sendMessage(chatId, "⌛ Chargement.", { parse_mode: "Markdown", }); 
        
 setTimeout(() => { bot.editMessageText("⌛ Chargement..", { chat_id: chatId, message_id: sentMessage.message_id, parse_mode: "Markdown", }); }, 1000); 
        
 setTimeout(() => { bot.editMessageText("⌛ Chargement...", { chat_id: chatId, message_id: sentMessage.message_id, parse_mode: "Markdown", }); }, 2000); 
        
setTimeout(() => { bot.editMessageText("⌛ Chargement.", { chat_id: chatId, message_id: sentMessage.message_id, parse_mode: "Markdown", }); }, 3000); 
        
setTimeout(() => { bot.editMessageText("⌛ Chargement..", { chat_id: chatId, message_id: sentMessage.message_id, parse_mode: "Markdown", }); }, 4000); 
          
setTimeout(() => { bot.editMessageText("⌛ Chargement...", { chat_id: chatId, message_id: sentMessage.message_id, parse_mode: "Markdown", }); }, 5000); 
        
setTimeout(() => { bot.editMessageText("⌛ Chargement.", { chat_id: chatId, message_id: sentMessage.message_id, parse_mode: "Markdown", }); }, 6000); 
        
setTimeout(() => { bot.editMessageText("⌛ Chargement..", { chat_id: chatId, message_id: sentMessage.message_id, parse_mode: "Markdown", }); }, 7000); 
        
setTimeout(() => { bot.editMessageText("⌛ Chargement...", { chat_id: chatId, message_id: sentMessage.message_id, parse_mode: "Markdown", }); }, 8000); 
        
setTimeout(() => { bot.editMessageText("⌛ Chargement...", { chat_id: chatId, message_id: sentMessage.message_id, parse_mode: "Markdown", }); }, 9000);

setTimeout(() => { bot.editMessageText("Terminé.", { chat_id: chatId, message_id: sentMessage.message_id, parse_mode: "Markdown", }); }, 10000);
        
setTimeout(() => { bot.editMessageText("Terminé..", { chat_id: chatId, message_id: sentMessage.message_id, parse_mode: "Markdown", }); }, 11000);

setTimeout(() => { bot.editMessageText("Terminé ✅", { chat_id: chatId, message_id: sentMessage.message_id, parse_mode: "Markdown", }); }, 12000);
        
        
setTimeout(() => {
          bot.sendMessage(
            chatId,
            "*🤖 Merci, ta demande est en attente de validation 🔎.*\n\n*🕒 Tu seras notifié une fois validé.*",
            { parse_mode: "Markdown" }
          );
        }, 13000);

        return;
      }
    }
  } catch (err) {
    console.error("❌ Erreur dans la gestion du message :", err);
    return bot.sendMessage(chatId, "❌ Une erreur est survenue, réessaie plus tard.");
  }
});


// === ADMIN COMMANDES ===
bot.onText(/\/admin/, async (msg) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  try {
    const { rows } = await pool.query("SELECT * FROM pending_verifications");
    if (rows.length === 0)
      return bot.sendMessage(msg.chat.id, "✅ Aucune vérification en attente.");

    for (const row of rows) {
      const text = `🧾 <b>Nouvelle demande</b>
👤 @${row.username || "Inconnu"} (ID: ${row.telegram_id})
📱 Bookmaker: ${row.bookmaker}
💰 Montant: ${row.amount} FCFA
🆔 Dépôt: <code>${row.deposit_id}</code>`;

      const opts = {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Valider", callback_data: `validate_${row.telegram_id}` },
              { text: "❌ Rejeter", callback_data: `reject_${row.telegram_id}` }
            ]
          ]
        }
      };

      await bot.sendMessage(msg.chat.id, text, opts);
    }
  } catch (err) {
    console.error("Erreur /admin:", err);
  }
});

const pendingCustomRejects = {}; // Stocke les rejets personnalisés

// === CALLBACKS GLOBAUX ===
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const adminId = query.from.id;
  const data = query.data;
  
 // 🚫 Anti-spam (5 sec par défaut)
  if (isSpamming(userId)) {
    await bot.answerCallbackQuery(query.id, { text: "⏳ Patiente un peu avant de recliquer.", show_alert: false });
    return;
  }

  // --- ADMIN validation ---
  if (data.startsWith("validate_") && ADMIN_IDS.includes(adminId)) {
    const telegramId = data.split("_")[1];

    try {
      const { rows } = await pool.query("SELECT * FROM pending_verifications WHERE telegram_id = $1", [telegramId]);
      if (rows.length === 0) return;

      const user = rows[0];

      await pool.query(
        "INSERT INTO verified_users (telegram_id, username, bookmaker, deposit_id, amount) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (telegram_id) DO NOTHING",
        [user.telegram_id, user.username, user.bookmaker, user.deposit_id, user.amount]
      );

      await pool.query("DELETE FROM pending_verifications WHERE telegram_id = $1", [telegramId]);

      await bot.sendMessage(user.telegram_id, `✅ Ton compte a été validé avec succès !`, {
        reply_markup: {
          keyboard: [["🎯 Pronostics du jour"]],
          resize_keyboard: true,
          remove_keyboard: true
        }
      });

      await bot.sendMessage(chatId, `✅ Validation de @${user.username} confirmée.`);
    } catch (err) {
      console.error("Erreur de validation:", err);
    }
  }

  // --- ADMIN rejet ---
  if (data.startsWith("reject_") && ADMIN_IDS.includes(adminId)) {
    const telegramId = data.split("_")[1];

    const motifs = [
      [{ text: "🔻 Dépôt insuffisant", callback_data: `motif1_${telegramId}` }],
      [{ text: "⛔️ ID non lié au code P999X", callback_data: `motif2_${telegramId}` }],
      [{ text: "📝 Autres raisons", callback_data: `motif3_${telegramId}` }]
    ];

    return bot.editMessageReplyMarkup(
      { inline_keyboard: motifs },
      { chat_id: chatId, message_id: query.message.message_id }
    );
  }

  // --- ADMIN rejets rapides ---
  if ((data.startsWith("motif1_") || data.startsWith("motif2_")) && ADMIN_IDS.includes(adminId)) {
    const [motif, telegramId] = data.split("_");
    const reason =
      motif === "motif1"
        ? "❌ Rejeté : dépôt insuffisant."
        : "❌ Rejeté : cet ID de dépôt n’est pas lié au code promo P999X.";

    await pool.query("DELETE FROM pending_verifications WHERE telegram_id = $1", [telegramId]);

    await bot.sendMessage(telegramId, reason);
    await bot.sendMessage(telegramId, `🔁 Tu peux recommencer la procédure.`, {
      reply_markup: {
        keyboard: [["🔁 recommencer"]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });

    return bot.sendMessage(chatId, `🚫 Rejet envoyé à l'utilisateur.`);
  }

  // --- ADMIN rejet personnalisé ---
  if (data.startsWith("motif3_") && ADMIN_IDS.includes(adminId)) {
    const telegramId = data.split("_")[1];
    pendingCustomRejects[adminId] = telegramId;
    return bot.sendMessage(chatId, "✍️ Envoie manuellement le motif de rejet pour l’utilisateur.");
  }

  // --- Utilisateur récupère son prono ---
  if (data === "get_prono") {
    try {
      // Supprime le bouton inline après clic
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id });

      const today = new Date().toISOString().slice(0, 10);

      const res = await pool.query(
        "SELECT content FROM daily_pronos WHERE date = $1 LIMIT 1",
        [today]
      );

      if (res.rows.length === 0) {
        await bot.sendMessage(chatId, "⚠️ Le pronostic du jour n'est pas encore disponible.");
      } else {
        const coupon = res.rows[0].content;

        await bot.sendMessage(chatId, `🎯 Pronostic du jour :\n\n${coupon}`, {
          parse_mode: "Markdown"
        });

        await bot.sendMessage(chatId, "📋 Menu principal :", {
          reply_markup: {
            keyboard: [["🏆 Mes Points", "🤝 Parrainage"], ["🆘 Assistance"]],
            resize_keyboard: true
          }
        });
      }
    } catch (error) {
      console.error("Erreur lors de l'envoi du pronostic :", error);
      await bot.sendMessage(chatId, "❌ Une erreur est survenue, réessaie plus tard.");
    }
  }
});

// === Gestion des messages spéciaux ===
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // 🔁 recommencer
  if (text === "🔁 recommencer") {
    userStates[chatId] = { step: "await_bookmaker" };

    return bot.sendMessage(chatId, "🔐 Pour accéder aux pronostics, indique ton bookmaker :", {
      reply_markup: {
        keyboard: [["1xbet", "888starz"], ["melbet", "winwin"]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }

  // Assistance manuelle
  if (text === "🆘 contacter l'assistance") {
    return bot.sendMessage(chatId, "📩 Contacte notre équipe ici : [@Support_1XBOOM](https://t.me/Catkatii)", {
      parse_mode: "Markdown",
      disable_web_page_preview: true
    });
  }

  // --- ADMIN motif personnalisé ---
  const pendingId = pendingCustomRejects[chatId];
  if (pendingId) {
    try {
      await pool.query("DELETE FROM pending_verifications WHERE telegram_id = $1", [pendingId]);

      await bot.sendMessage(pendingId, `❌ Rejeté : ${text}`);
      await bot.sendMessage(
        pendingId,
        `🔁 Tu peux recommencer la procédure ou contacter l’assistance.`,
        {
          reply_markup: {
            keyboard: [["🔁 recommencer", "🆘 contacter l'assistance"]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );

      await bot.sendMessage(chatId, `🔔 Motif personnalisé envoyé à l’utilisateur.`);
    } catch (err) {
      console.error("Erreur motif personnalisé :", err);
      await bot.sendMessage(chatId, "❌ Une erreur est survenue lors du rejet.");
    }

    delete pendingCustomRejects[chatId];
  }
});



// ======================================== /admin Commande ===

bot.onText(/\/admin/, async (msg) => {
  if (!ADMIN_IDS.includes(msg.from.id)) return;

  try {
    const { rows } = await pool.query("SELECT * FROM pending_verifications");
    if (rows.length === 0)
      return bot.sendMessage(msg.chat.id, "✅ Aucune vérification en attente.");

    for (const row of rows) {
      const text = `🧾 <b>Nouvelle demande</b>\n👤 @${row.username} (ID: ${row.telegram_id})\n📱 Bookmaker: ${row.bookmaker}\n💰 Montant: ${row.amount} FCFA\n🆔 Dépôt: <code>${row.deposit_id}</code>`;

      const opts = {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Valider", callback_data: `validate_${row.telegram_id}` },
              { text: "❌ Rejeter", callback_data: `reject_${row.telegram_id}` }
            ]
          ]
        }
      };

      await bot.sendMessage(msg.chat.id, text, opts);
    }
  } catch (err) {
    console.error("Erreur /admin:", err);
  }
});

// === CALLBACKS (inline buttons + admin) ===
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const adminId = query.from.id;
  const data = query.data;

  // 🚫 Anti-spam global
  if (isSpamming(adminId)) {
    await bot.answerCallbackQuery(query.id, { text: "⏳ Patiente un peu avant de recliquer.", show_alert: false });
    return;
  }

  await bot.answerCallbackQuery(query.id);

  // === ADMIN VALIDATION ===
  if (data.startsWith("validate_")) {
    const telegramId = data.split("_")[1];

    try {
      const { rows } = await pool.query("SELECT * FROM pending_verifications WHERE telegram_id = $1", [telegramId]);
      if (rows.length === 0) return;

      const user = rows[0];

      await pool.query(
        "INSERT INTO verified_users (telegram_id, username, bookmaker, deposit_id, amount) VALUES ($1,$2,$3,$4,$5)",
        [user.telegram_id, user.username, user.bookmaker, user.deposit_id, user.amount]
      );

      await pool.query("DELETE FROM pending_verifications WHERE telegram_id = $1", [telegramId]);

      await bot.sendMessage(user.telegram_id, `✅ Ton compte a été validé avec succès !`, {
        reply_markup: {
          keyboard: [["🎯 Pronostics du jour"]],
          resize_keyboard: true,
          remove_keyboard: true
        }
      });

      await bot.sendMessage(chatId, `✅ Validation de @${user.username} confirmée.`);
    } catch (err) {
      console.error("Erreur de validation:", err);
    }
  }

  // === ADMIN REJET ===
  if (data.startsWith("reject_")) {
    const telegramId = data.split("_")[1];

    const motifs = [
      [{ text: "🔻 Dépôt insuffisant", callback_data: `motif1_${telegramId}` }],
      [{ text: "⛔️ ID non lié au code P999X", callback_data: `motif2_${telegramId}` }],
      [{ text: "📝 Autres raisons", callback_data: `motif3_${telegramId}` }]
    ];

    return bot.editMessageReplyMarkup(
      { inline_keyboard: motifs },
      { chat_id: chatId, message_id: query.message.message_id }
    );
  }

  // === MOTIFS REJET PRÉDÉFINIS ===
  if (data.startsWith("motif1_") || data.startsWith("motif2_")) {
    const [motif, telegramId] = data.split("_");
    const reason =
      motif === "motif1"
        ? "❌ Rejeté : dépôt insuffisant."
        : "❌ Rejeté : cet ID de dépôt n’est pas lié au code promo P999X.";

    await pool.query("DELETE FROM pending_verifications WHERE telegram_id = $1", [telegramId]);

    await bot.sendMessage(telegramId, reason);
    await bot.sendMessage(telegramId, `🔁 Tu peux recommencer la procédure.`, {
      reply_markup: {
        keyboard: [["🔁 recommencer"]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });

    return bot.sendMessage(chatId, `🚫 Rejet envoyé à l'utilisateur.`);
  }

  // === MOTIF REJET PERSONNALISÉ ===
  if (data.startsWith("motif3_")) {
    const telegramId = data.split("_")[1];
    pendingCustomRejects[adminId] = telegramId;
    return bot.sendMessage(chatId, "✍️ Envoie manuellement le motif de rejet pour l’utilisateur.");
  }

  // === PRONOSTICS DU JOUR ===
  if (data === "get_prono") {
    try {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id });

      const today = new Date().toISOString().slice(0, 10);
      const res = await pool.query("SELECT content FROM daily_pronos WHERE date = $1 LIMIT 1", [today]);

      if (res.rows.length === 0) {
        return bot.sendMessage(chatId, "⚠️ Le pronostic du jour n'est pas encore disponible.");
      }

      const coupon = res.rows[0].content;
      await bot.sendMessage(chatId, `🎯 Pronostic du jour :\n\n${coupon}`, { parse_mode: "Markdown" });

      await bot.sendMessage(chatId, "📋 Menu principal :", {
        reply_markup: {
          keyboard: [["🏆 Mes Points", "🤝 Parrainage"], ["🆘 Assistance"]],
          resize_keyboard: true
        }
      });
    } catch (error) {
      console.error("Erreur lors de l'envoi du pronostic :", error);
      await bot.sendMessage(chatId, "❌ Une erreur est survenue, réessaie plus tard.");
    }
  }
});

// === MESSAGE TEXTE ===
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // 🚫 Anti-spam global
  if (isSpamming(chatId)) {
    return bot.sendMessage(chatId, "⏳ Doucement, tu cliques trop vite !");
  }

  if (!text || text.startsWith("/")) return;

  // 🔁 recommencer
  if (text === "🔁 recommencer") {
    userStates[chatId] = { step: "await_bookmaker" };

    return bot.sendMessage(chatId, "🔐 Pour accéder aux pronostics, indique ton bookmaker :", {
      reply_markup: {
        keyboard: [["1xbet", "888starz"], ["melbet", "winwin"]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }

  if (text === "🆘 contacter l'assistance") {
    return bot.sendMessage(chatId, "📩 Contacte notre équipe ici : [@Support_1XBOOM](https://t.me/Catkatii)", {
      parse_mode: "Markdown",
      disable_web_page_preview: true
    });
  }

  // === GESTION MOTIF PERSONNALISÉ ===
  const pendingId = pendingCustomRejects[chatId];
  if (pendingId) {
    try {
      await pool.query("DELETE FROM pending_verifications WHERE telegram_id = $1", [pendingId]);

      await bot.sendMessage(pendingId, `❌ Rejeté : ${text}`);
      await bot.sendMessage(
        pendingId,
        `🔁 Tu peux recommencer la procédure ou contacter l’assistance.`,
        {
          reply_markup: {
            keyboard: [["🔁 recommencer", "🆘 contacter l'assistance"]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );

      await bot.sendMessage(chatId, `🔔 Motif personnalisé envoyé à l’utilisateur.`);
    } catch (err) {
      console.error("Erreur motif personnalisé :", err);
      await bot.sendMessage(chatId, "❌ Une erreur est survenue lors du rejet.");
    }

    delete pendingCustomRejects[chatId];
  }
});


















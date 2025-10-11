// ====== CHARGEMENT DES MODULES ======
require("dotenv").config();
process.env.TZ = "Africa/Lome";

const moment = require("moment-timezone");
const schedule = require("node-schedule");
const fetch = require("node-fetch"); // utile si tu fais des appels API

// ====== IMPORTS INTERNES ======
const { app, bot } = require("./server");
const { pool, insertManualCoupon } = require("./db");
const { checkSpam } = require("./spamUtils");
require("./pingCron");
const { sendManualCoupon, generateAndSendCoupon, cleanOldData } = require("./autoSend");
const { ping, pingBot2 } = require("./pingServer");
require("./autoCoupons"); // conserve l’exécution automatique existante
const generateCouponEurope = require("./generateCouponEurope");
const generateCouponAfrica = require("./generateCouponAfrica");
const generateCouponAmerica = require("./generateCouponAmerica");
const generateCouponAsia = require("./generateCouponAsia");
const { formatMatchTips } = require("./couponUtils");
const { t } = require("./lang");
const autoValidate = require("./autoValidate");
require("./test_today")(bot);




// Après avoir défini `bot` et `pool`
autoValidate(bot, pool);

// ====== CONFIGURATION ENV ======
const PORT = process.env.PORT || 3000;
const adminId = process.env.TELEGRAM_ADMIN_ID;
const channelId = process.env.TELEGRAM_CHANNEL_ID;

// ====== VARIABLES D’ÉTAT (si besoin dans d’autres modules) ======
const userStates = {};
const ADMIN_IDS = [6248838967];
const fixedDeletionConfirmations = new Map();
const editFixedStates = {};
const userLang = {};
const fixedAddStates = {};
const fixedEditStates = {};
const editStates = {};
const pendingCustomRejects = {};

// ==========================
// 🚀 PLANIFICATION AUTOMATIQUE
// ==========================

// 06h15 (Lomé) → envoi manuel
schedule.scheduleJob(
  { hour: 6, minute: 15, tz: "Africa/Lome" },
  async () => {
    console.log("⏰ 06h15 - Tâche planifiée : envoi du coupon manuel");
    await sendManualCoupon();
  }
);

// 06h25 (Lomé) → nettoyage automatique
schedule.scheduleJob(
  { hour: 6, minute: 25, tz: "Africa/Lome" },
  async () => {
    console.log("⏰ 06h25 - Tâche planifiée : nettoyage automatique");
    await cleanOldData();
  }
);

// 07h15 (Lomé) → génération + envoi auto
schedule.scheduleJob(
  { hour: 7, minute: 15, tz: "Africa/Lome" },
  async () => {
    console.log("⏰ 07h15 - Tâche planifiée : génération et envoi du coupon auto");
    await generateAndSendCoupon();
  }
);


// ============================
// Ping automatique toutes les 14 minutes
// ============================
ping(); // ping immédiat au démarrage
setInterval(ping, 14 * 60 * 1000); // répéter toutes les 14 minutes


// ------------------ START (avec ou sans parrainage) ------------------
bot.onText(/\/start(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referrerId = match[1] || null; // ID du parrain si fourni
  console.log("Start reçu avec referrer:", referrerId);

  try {
    const { rows } = await pool.query(
      "SELECT * FROM verified_users WHERE telegram_id = $1",
      [chatId]
    );

    if (rows.length > 0) {
      // ✅ Déjà validé → menu classique
      return bot.sendMessage(chatId, "*👋 Ravi de te revoir !*", {
        parse_mode: "Markdown",
        reply_markup: {
          keyboard: [
            ["🏆 Mes Points"],
            ["🤝 Parrainage", "🆘 Assistance 🤖"],
          ],
          resize_keyboard: true,
        },
      });
    }

    // 🚨 Pas encore validé → sauvegarde le parrain s’il existe
    if (referrerId) {
      userStates[chatId] = { referrerId };
    }

    // Menu minimal avec accès aux pronostics
    return bot.sendMessage(
      chatId,
      "👋 *Bienvenue !*\n\n*Pour accéder aux *pronostics du jour*, clique ci-dessous :*",
      {
        parse_mode: "Markdown",
        reply_markup: {
          keyboard: [["🎯 Pronostics du jour"]],
          resize_keyboard: true,
        },
      }
    );
  } catch (err) {
    console.error("Erreur /start :", err);
    return bot.sendMessage(chatId, "❌ Erreur interne, réessaie plus tard.");
  }
});


// =================== PARRAINAGE CANAL AUTOMATIQUE ===================

async function checkChannelReferral(bot, telegramId) {
  try {
    // Récupère l'utilisateur validé
    const { rows: userRows } = await pool.query(
      "SELECT telegram_id, referrer_id FROM verified_users WHERE telegram_id = $1",
      [telegramId]
    );
    if (userRows.length === 0) return;

    const user = userRows[0];

    // Vérifie si l'utilisateur est membre du canal officiel
    const channelId = "@Roux_Canal_linktree_intermidiare";// remplace par ton canal
    const member = await bot.getChatMember(channelId, telegramId);
    if (!["member", "administrator", "creator"].includes(member.status)) return;

    // Si parrain existant et points jamais attribués pour ce filleul
    if (user.referrer_id) {
      const { rows: exists } = await pool.query(
        "SELECT 1 FROM referral_channel WHERE child_id = $1",
        [telegramId]
      );
      if (exists.length > 0) return; // Points déjà attribués

      // Attribution automatique des points
      await pool.query(
        "INSERT INTO referral_channel (parent_id, child_id, points) VALUES ($1, $2, $3)",
        [user.referrer_id, telegramId, 10]
      );

      await pool.query(
        "UPDATE verified_users SET points = points + 10 WHERE telegram_id = $1",
        [user.referrer_id]
      );

      // Message automatique au parrain
      await bot.sendMessage(user.referrer_id, `🎉 Ton filleul @${telegramId} a rejoint le canal ! Tu gagnes +10 points automatiquement.`);
    }
  } catch (err) {
    console.error("Erreur checkChannelReferral :", err);
  }
}


//--------------- bot.on("message") pour Mes Points, Parrainage et Assistance, entièrement en async ---------------

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // ------------------ Mes Points ------------------
  if (text === "🏆 Mes Points") {
    try {
      const res = await pool.query(
        'SELECT points FROM verified_users WHERE telegram_id = $1',
        [chatId]
      );
      let points = 0;
      if (res.rows.length > 0 && res.rows[0].points) points = res.rows[0].points;

      let motivation = '';
      if (points >= 100) motivation = "🚀 *Incroyable ! Tu es dans la cour des grands.*";
      else if (points >= 50) motivation = "🔥 *Très bon score !* Continue !";
      else if (points >= 20) motivation = "👍 *Bien joué !* Tu montes dans le classement.";
      else motivation = "💡 Gagne des points en parrainant. Clique sur '🤝 Parrainage'";

      return bot.sendMessage(
        chatId,
        `⭐️ *Tes points :* ${points} points\n\n${motivation}`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error("Erreur récupération points:", err);
      return bot.sendMessage(chatId, "❌ Erreur lors de la récupération des points.");
    }
  }

  // ------------------ Parrainage ------------------
  if (text === "🤝 Parrainage") {
    try {
      const botInfo = await bot.getMe();
      const botUsername = botInfo.username || "@Official_1XBOOM_bot";
      const referralLink = `https://t.me/${botUsername}?start=${chatId}`;

      const message = `
🚀 *Parraine et gagne avec P999X !*

👥 *1. Invite un ami à notre canal :*  
👉 [Rejoins le canal officiel](https://t.me/Roux_Canal_linktree_intermidiare)  
➡️ Gagne +10 points s’il s’abonne !

🎯 *2. Partage ton lien personnel d’invitation au bot :*  
👉 [Mon lien d'invitation](${referralLink})  
➡️ Gagne +5 points s’il s’inscrit via ce lien (et après validation).

🎁 *Récompenses chaque fin du mois :*  
🏆 Les *Top 5 parrains* gagnent :  
- 10 000 FC chacun 💸  
- 2 *coupons exclusifs* 🎫

📢 Plus tu partages, plus tu gagnes.  
🔥 Deviens notre meilleur ambassadeur !`;

      return bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (err) {
      console.error("Erreur affichage parrainage:", err);
      return bot.sendMessage(chatId, "❌ Impossible d’afficher le parrainage pour le moment.");
    }
  }

  // ------------------ Assistance ------------------
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


// --- Gestion des callbacks inline (boutons assistance) ---
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;


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

  // Si callback non géré
  console.warn("⚠️ Option inconnue callback_query:", data);
});

// --- Gestion erreurs globales ---
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});


// =================== VERIFICATION UTILISATEUR ===================

const timeoutMap = {};
const validBookmakers = ["1xbet", "888starz", "melbet", "winwin"];

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

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (!text || text.startsWith("/")) return;

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
        remove_keyboard: true,
      },
    });
  }

  // ✅ utilisateur déjà validé → on fait rien ici
  // Le flux se fera via le bouton inline "get_prono"
}

    // 🔁 Si une étape est en cours
    if (state) {
      if (state.step === "await_bookmaker") {
        if (!validBookmakers.some(b => b.toLowerCase() === text.toLowerCase())) {
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
        if (isNaN(amount) || amount < 5 || amount > 10000) {
          return bot.sendMessage(chatId, "*❌ Montant invalide. Envoie un nombre supérieur à 5$ (2000fcfa).*", {
            parse_mode: "Markdown",
          });
        }

        clearTimeout(timeoutMap[chatId]);

      const data = {
  telegram_id: chatId,
  username: msg.from.username || "Aucun",
  bookmaker: state.bookmaker,
  deposit_id: state.depositId,
  amount,
  referrer_id: state.referrerId || null, // ✅ ajout du parrain
};

await pool.query(
  `INSERT INTO pending_verifications 
   (telegram_id, username, bookmaker, deposit_id, amount, referrer_id)
   VALUES ($1, $2, $3, $4, $5, $6)
   ON CONFLICT (telegram_id) DO NOTHING`,
  [data.telegram_id, data.username, data.bookmaker, data.deposit_id, data.amount, data.referrer_id]
);
        delete userStates[chatId];

        const sentMessage = await bot.sendMessage(chatId, "⌛ Vérification.", {
          parse_mode: "Markdown",
        });

        setTimeout(() => {
          bot.editMessageText("⌛ Vérification..", {
            chat_id: chatId,
            message_id: sentMessage.message_id,
            parse_mode: "Markdown",
          });
        }, 1000);

        setTimeout(() => {
          bot.editMessageText("⌛ Vérification...", {
            chat_id: chatId,
            message_id: sentMessage.message_id,
            parse_mode: "Markdown",
          });
        }, 2000);

        setTimeout(() => {
          bot.editMessageText("⌛ Vérification.", {
            chat_id: chatId,
            message_id: sentMessage.message_id,
            parse_mode: "Markdown",
          });
        }, 3000);

        setTimeout(() => {
          bot.editMessageText("⌛ Vérification..", {
            chat_id: chatId,
            message_id: sentMessage.message_id,
            parse_mode: "Markdown",
          });
        }, 4000);

        setTimeout(() => {
          bot.editMessageText("⌛ Vérification...", {
            chat_id: chatId,
            message_id: sentMessage.message_id,
            parse_mode: "Markdown",
          });
        }, 5000);

        setTimeout(() => {
          bot.editMessageText("⌛ Vérification.", {
            chat_id: chatId,
            message_id: sentMessage.message_id,
            parse_mode: "Markdown",
          });
        }, 6000);

        setTimeout(() => {
          bot.editMessageText("⌛ Vérification..", {
            chat_id: chatId,
            message_id: sentMessage.message_id,
            parse_mode: "Markdown",
          });
        }, 7000);

         setTimeout(() => {
          bot.editMessageText("⌛ Vérification...", {
            chat_id: chatId,
            message_id: sentMessage.message_id,
            parse_mode: "Markdown",
          });
        }, 8000);

      

         setTimeout(() => {
          bot.editMessageText("Terminé.", {
            chat_id: chatId,
            message_id: sentMessage.message_id,
            parse_mode: "Markdown",
          });
        }, 9000);

        setTimeout(() => {
          bot.editMessageText("Terminé..", {
            chat_id: chatId,
            message_id: sentMessage.message_id,
            parse_mode: "Markdown",
          });
        }, 10000);

        setTimeout(() => {
          bot.editMessageText("Terminé✅", {
            chat_id: chatId,
            message_id: sentMessage.message_id,
            parse_mode: "Markdown",
          });
        }, 11000);

        setTimeout(() => {
          bot.sendMessage(chatId, "*🤖 Merci, ta demande est en attente de validation .*\n\n*Tu seras notifié une fois validé.*", {
            parse_mode: "Markdown",
          });
        }, 12000);

        return;
      }
    }
  } catch (err) {
    console.error("❌ Erreur dans la gestion du message :", err);
    return bot.sendMessage(chatId, "❌ Une erreur est survenue, réessaie plus tard.");
  }
});

// =================== COMMANDES ADMIN ===================
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  const adminId = msg.from.id;

  if (!ADMIN_IDS.includes(adminId)) return;

  try {
    const { rows } = await pool.query("SELECT * FROM pending_verifications");
    if (rows.length === 0)
      return bot.sendMessage(chatId, "✅ Aucune vérification en attente.");

    for (const row of rows) {
      const text = `<b>🧾 Nouvelle demande de dépôt</b>\n` +
                   `👤 @${row.username} (ID: ${row.telegram_id})\n` +
                   `📱 Bookmaker: ${row.bookmaker}\n` +
                   `💰 Montant: ${row.amount} FCFA\n` +
                   `🆔 Dépôt: <code>${row.deposit_id}</code>`;

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

      await bot.sendMessage(chatId, text, opts);
    }
  } catch (err) {
    console.error("Erreur /admin:", err);
  }
});

// =================== CALLBACK QUERY ADMIN ===================
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const adminId = query.from.id;
  const data = query.data;

  if (!ADMIN_IDS.includes(adminId)) return;

  // --- Validation d'un utilisateur ---
  if (data.startsWith("validate_")) {
    const telegramId = data.split("_")[1];

    try {
      const { rows } = await pool.query(
        "SELECT * FROM pending_verifications WHERE telegram_id = $1",
        [telegramId]
      );
      if (rows.length === 0) return;

      const user = rows[0];

      // Vérifie si déjà validé
      const checkUser = await pool.query(
        "SELECT 1 FROM verified_users WHERE telegram_id = $1",
        [user.telegram_id]
      );
      if (checkUser.rows.length === 0) {
        await pool.query(
          `INSERT INTO verified_users (telegram_id, username, bookmaker, deposit_id, amount, referrer_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            user.telegram_id,
            user.username,
            user.bookmaker,
            user.deposit_id,
            user.amount,
            user.referrer_id || null,
          ]
        );

        // ⚡ Si parrain présent → ajoute points
        if (user.referrer_id) {
          await pool.query(
            "UPDATE verified_users SET points = points + 5 WHERE telegram_id = $1",
            [user.referrer_id]
          );
          await bot.sendMessage(
            user.referrer_id,
            `🎉 Ton filleul @${user.username} vient d’être validé ! Tu gagnes +5 points.`
          );
        }
      }

      // Supprime la demande en attente
      await pool.query("DELETE FROM pending_verifications WHERE telegram_id = $1", [telegramId]);

      // --- Envoi du média du prono du jour ---
      const today = new Date().toISOString().slice(0, 10);
      const { rows: pronoRows } = await pool.query(
        `SELECT media_type, media_url FROM daily_pronos 
         WHERE date_only = $1 AND type = 'gratuit' LIMIT 1`,
        [today]
      );

      if (pronoRows.length > 0) {
        const prono = pronoRows[0];
        if (prono.media_url && prono.media_type) {
          switch (prono.media_type) {
            case "photo": await bot.sendPhoto(user.telegram_id, prono.media_url); break;
            case "video": await bot.sendVideo(user.telegram_id, prono.media_url); break;
            case "voice": await bot.sendVoice(user.telegram_id, prono.media_url); break;
            case "audio": await bot.sendAudio(user.telegram_id, prono.media_url); break;
            case "video_note": await bot.sendVideoNote(user.telegram_id, prono.media_url); break;
          }
        }
      }

      // --- Message personnalisé aléatoire ---
      const { rows: manualRows } = await pool.query(
        "SELECT * FROM manual_messages ORDER BY RANDOM() LIMIT 1"
      );
      if (manualRows.length > 0) {
        const messageText = manualRows[0].message_text.replace(
          /@username/g,
          `@${user.username}`
        );
        await bot.sendMessage(user.telegram_id, messageText, { parse_mode: "HTML" });
      }

      // --- Menu principal ---
      await bot.sendMessage(user.telegram_id, "📋 Menu principal :", {
        reply_markup: {
          keyboard: [
            ["🏆 Mes Points"],
            ["🤝 Parrainage", "🆘 Assistance 🤖"],
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      });

      await bot.sendMessage(
        chatId,
        `✅ Validation de @${user.username} confirmée et menu principal envoyé.`
      );
    } catch (err) {
      console.error("Erreur validation:", err);
    }
  }


// =================== HELPER ESCAPE ===================
function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
  
   // ------------------ REJET ------------------
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

    // ------------------ REJETS RAPIDES ------------------
  if (data.startsWith("motif1_") || data.startsWith("motif2_")) {
    const [motif, telegramId] = data.split("_");
    const reason = motif === "motif1"
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

 // ------------------ REJET PERSONNALISÉ ------------------
  if (data.startsWith("motif3_")) {
    const telegramId = data.split("_")[1];
    pendingCustomRejects[adminId] = telegramId;
    return bot.sendMessage(chatId, "✍️ Envoie manuellement le motif de rejet pour l’utilisateur.");
  }
});
// =====================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // 🔁 recommencer
  if (text === "🔁 recommencer") {
    userStates[chatId] = { step: "await_bookmaker" };

    return bot.sendMessage(chatId, "🔐 *Pour accéder aux pronostics, indique ton bookmaker :*", {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [
          ["1xbet", "888starz"],
          ["melbet", "winwin"]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }

  // Assistance
  if (text === "🆘 contacter l'assistance") {
    return bot.sendMessage(
      chatId,
      "📩 Contacte notre équipe ici : [@Support_1XBOOM](https://t.me/Catkatii)",
      {
        parse_mode: "Markdown",
        disable_web_page_preview: true
      }
    );
  }

  // Gestion du motif personnalisé
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
            keyboard: [
              ["🔁 recommencer", "🆘 contacter l'assistance"]
            ],
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

/////////////////////////////////////// ✅ VOIRE LE CLASSEMENT DE PARRAIN ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
//=== COMMANDE /topparrains ====


bot.onText(/\/topparrains/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const { rows } = await pool.query(`
      SELECT u1.id, u1.username, u1.firstname, COUNT(u2.id) AS filleuls, u1.points
      FROM users u1
      LEFT JOIN users u2 ON u1.id = u2.referral_id
      GROUP BY u1.id
      ORDER BY filleuls DESC, u1.points DESC
      LIMIT 5
    `);

    if (rows.length === 0) {
      return bot.sendMessage(chatId, "Aucun parrain actif pour le moment.");
    }

    let message = "🏆 *Top 5 Parrains de la semaine :*\n\n";
    rows.forEach((row, index) => {
      const nom = row.username
        ? `@${row.username}`
        : row.firstname || "Anonyme";
      message += `🥇 *${index + 1}. ${nom}* — ${row.filleuls} filleul(s), ${row.points} pts\n`;
    });

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Erreur /topparrains :", error);
    bot.sendMessage(chatId, "❌ Impossible d'afficher le classement.");
  }
});

const CHANNEL_ID = "@linktree_free_prediction";

// ✅ Classement automatique tous les dimanches à 18h (heure Lomé)
schedule.scheduleJob({ hour: 18, minute: 0, dayOfWeek: 0 }, async () => {
  const now = moment().tz('Africa/Lome').format("YYYY-MM-DD HH:mm:ss");
  console.log("🕒 Envoi automatique Top 5 (hebdo) à :", now);

  try {
    const { rows } = await pool.query(`
      SELECT u1.id, u1.username, u1.firstname, COUNT(u2.id) AS filleuls, u1.points
      FROM users u1
      LEFT JOIN users u2 ON u1.id = u2.referral_id
      GROUP BY u1.id
      ORDER BY filleuls DESC, u1.points DESC
      LIMIT 5
    `);

    if (rows.length === 0) return;

    let message = "📢 *Classement des meilleurs parrains de la semaine !*\n\n";
    rows.forEach((row, index) => {
      const nom = row.username
        ? `@${row.username}`
        : row.firstname || "Anonyme";
      message += `🏅 *${index + 1}. ${nom}* — ${row.filleuls} filleul(s), ${row.points} pts\n`;
    });

    message += `\n🕒 Envoyé à ${moment().tz("Africa/Lome").format("HH:mm")} (heure Lomé)`;

    bot.sendMessage(CHANNEL_ID, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Erreur classement auto :", error);
  }
});

const TELEGRAM_CHANNEL_ID = "@linktree_free_prediction";

// 🔁 Fonction pour publier le Top 5 mensuel et reset les points
async function publierClassementEtReset() {
  try {
    const { rows: topUsers } = await pool.query(`
      SELECT id, username, firstname, points
      FROM users
      ORDER BY points DESC
      LIMIT 5
    `);

    if (topUsers.length === 0) {
      await bot.sendMessage(
        TELEGRAM_CHANNEL_ID,
        "Aucun parrain n’a encore de points ce mois-ci."
      );
      return;
    }

    let message = "🏆 *Classement des 5 meilleurs parrains du mois :*\n\n";
    const emojis = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

    topUsers.forEach((user, index) => {
      const nom = user.username
        ? `@${user.username}`
        : user.firstname
        ? user.firstname
        : `Utilisateur ${user.id}`;
      message += `${emojis[index]} ${nom} — *${user.points} points*\n`;
    });

    message += `\n🎁 Les récompenses seront distribuées automatiquement !

🚨 NOUVEAU MOIS = NOUVEAU DÉFI !

🥇 Tous les *points de parrainage* ont été remis à zéro !

🔄 C’est le moment de te lancer à fond :
- Invite tes amis 💬
- Grimpe dans le classement 📈
- Récupère un max de *récompenses* 🎁

🏆 Les 5 meilleurs parrains du mois gagneront :
- 10 000 FC chacun 💸
- 2 *coupons exclusifs VIP* 🎫

🔥 *Le compteur est reparti de zéro. Ne perds pas une seconde !*`;

    // 🔹 Envoi dans le canal
    await bot.sendMessage(TELEGRAM_CHANNEL_ID, message, {
      parse_mode: "Markdown",
    });

    // 🔹 Reset des points
    await pool.query("UPDATE users SET points = 0");
    console.log("✅ Points remis à zéro le", moment().tz("Africa/Lome").format("YYYY-MM-DD HH:mm:ss"));
  } catch (err) {
    console.error("❌ Erreur dans publierClassementEtReset :", err);
  }
}

// ✅ Reset des points chaque 1er du mois à 00h00 (heure Lomé)
schedule.scheduleJob({ hour: 0, minute: 0, date: 1 }, () => {
  const now = moment().tz('Africa/Lome').format("YYYY-MM-DD HH:mm:ss");
  console.log("📆 Début de la tâche mensuelle (reset points) à :", now);
  publierClassementEtReset();
});


// ✅ Commande admin pour tester à la main
bot.onText(/\/resetpoints/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  await publierClassementEtReset();
  bot.sendMessage(msg.chat.id, "✅ Classement publié et points remis à zéro !");
});

///////////////////////////////////// // Fonctionne Admin
// Envoyer un message dans un canal

bot.onText(/\/sendtocanal/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Vérifie que seul toi (l'admin) peux l'utiliser
  if (userId !== 6248838967)
    return bot.sendMessage(chatId, "❌ Commande réservée à l’admin.");

  bot.sendMessage(
    channelId,
    "🔥 Ceci est un message du bot envoyé dans le canal !"
  );
  bot.sendMessage(chatId, "✅ Message envoyé au canal.");
});

// Testemessage
bot.onText(/\/testmessage/, async (msg) => {
  const chatId = msg.chat.id;
  const ADMIN_ID = 6248838967; // Remplace par ton vrai ID Telegram

  if (msg.from.id !== ADMIN_ID) {
    return bot.sendMessage(chatId, "⛔️ Accès refusé.");
  }

  try {
    const { rows } = await pool.query(`
      SELECT * FROM messages_auto
      WHERE DATE(send_date) = CURRENT_DATE AND sent_today = false
    `);

    if (rows.length === 0) {
      await bot.sendMessage(
        chatId,
        "❌ Aucun message disponible pour aujourd’hui."
      );
      return;
    }

    for (const message of rows) {
      await envoyerMessageComplet(bot, chatId, message);

      await pool.query(
        `UPDATE messages_auto SET sent_today = true WHERE id = $1`,
        [message.id]
      );
    }
  } catch (error) {
    console.error("❌ Erreur test message :", error.message);
    await bot.sendMessage(chatId, "❌ Une erreur est survenue.");
  }
});

// Fonctin table
async function envoyerMessageComplet(bot, chatId, message) {
  const caption = message.media_text
    ? `${message.media_text}\n\n${message.contenu}`
    : message.contenu;

  if (message.media_url) {
    // Envoi avec média (image ou vidéo)
    if (message.media_url.match(/\.(jpg|jpeg|png|gif)$/i)) {
      await bot.sendPhoto(chatId, message.media_url, { caption });
    } else if (message.media_url.match(/\.(mp4|mov|webm)$/i)) {
      await bot.sendVideo(chatId, message.media_url, { caption });
    } else {
      // URL non reconnue comme image ou vidéo → fallback
      await bot.sendMessage(chatId, `${caption}\n\n🔗 ${message.media_url}`);
    }
  } else {
    // Pas de média → simple message texte
    await bot.sendMessage(chatId, caption);
  }
}


/////////////////////////////////////// ✅ VOIRE LES VÉRIFICATIONS EN ATTENTE ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
// === COMMANDES ===

//////////////////////////////////////////////////////// ENVI AUTOMATIQUE DES COUPON DU JOUR \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\


// FONCTION ADMIN/AJOUTE-prono
const ADMIN_ID = 6248838967;
let pendingCoupon = {};
const { Client } = require("pg");
const dayjs = require("dayjs");


/////////////////////////////////////// ✅ VOIRE LES VÉRIFICATIONS EN ATTENTE ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
// ====================== AJOUT MANUEL DE PRONO ======================

// ====================== AJOUT MANUEL DE PRONO ======================

bot.onText(/\/ajouter_prono/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_IDS.includes(userId))
    return bot.sendMessage(chatId, "🚫 Commande réservée à l’admin.");

  pendingCoupon[chatId] = {
    step: "awaiting_date",
    date: null,
    content: null,
    type: "gratuit", // par défaut
    mediaUrl: null,
    mediaType: null,
  };

  bot.sendMessage(
    chatId,
    "📅 Envoie la date du prono (format : YYYY-MM-DD) ou tape /today pour aujourd’hui."
  );
});

// --- /today ---
bot.onText(/\/today/, (msg) => {
  const chatId = msg.chat.id;
  const state = pendingCoupon[chatId];
  if (!state || state.step !== "awaiting_date") return;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  state.date = today.toISOString().slice(0, 10); // YYYY-MM-DD
  state.step = "awaiting_content";

  bot.sendMessage(chatId, "📝 Envoie maintenant le texte du prono.");
});

// --- Gestion des messages ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const state = pendingCoupon[chatId];
  if (!state || msg.text?.startsWith("/")) return;

  // --- Étape 1 : Date ---
  if (state.step === "awaiting_date") {
    const inputDate = msg.text?.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
      return bot.sendMessage(chatId, "⚠️ Format invalide. Utilise YYYY-MM-DD.");
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (new Date(inputDate) < today) {
      return bot.sendMessage(chatId, "❌ La date ne peut pas être dans le passé.");
    }

    state.date = inputDate;
    state.step = "awaiting_content";
    return bot.sendMessage(chatId, "📝 Envoie maintenant le texte du prono.");
  }

  // --- Étape 2 : Contenu ---
  if (state.step === "awaiting_content") {
    if (!msg.text || msg.text.trim().length < 5) {
      return bot.sendMessage(chatId, "⚠️ Le texte du prono est trop court.");
    }

    state.content = msg.text.trim();
    state.step = "awaiting_type";

    // --- Choix du type de prono ---
    return bot.sendMessage(chatId, "🎯 Choisis le type de prono :", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Gratuit", callback_data: "type_gratuit" }],
          [{ text: "Premium", callback_data: "type_premium" }]
        ]
      }
    });
  }

  // --- Étape 3 : Média ---
  if (state.step === "awaiting_media") {
    let fileId = null;
    let mediaType = null;

    if (msg.photo) {
      fileId = msg.photo.at(-1).file_id;
      mediaType = "photo";
    } else if (msg.video) {
      fileId = msg.video.file_id;
      mediaType = "video";
    } else if (msg.document) {
      fileId = msg.document.file_id;
      mediaType = "document";
    } else if (msg.voice) {
      fileId = msg.voice.file_id;
      mediaType = "voice";
    } else if (msg.audio) {
      fileId = msg.audio.file_id;
      mediaType = "audio";
    } else if (msg.video_note) {
      fileId = msg.video_note.file_id;
      mediaType = "video_note";
    } else if (msg.text === "/skip") {
      fileId = null;
      mediaType = null;
    } else {
      return bot.sendMessage(
        chatId,
        "⚠️ Envoie un média valide ou tape /skip."
      );
    }

    state.mediaUrl = fileId;
    state.mediaType = mediaType;
    state.step = "confirming";

    // --- Récapitulatif ---
    const recap = `📝 <b>Récapitulatif du prono :</b>
📅 Date : <b>${state.date}</b>
✍️ Contenu : <i>${state.content}</i>
📎 Média : ${mediaType ? mediaType : "aucun"}
📌 Type : <b>${state.type}</b>
`;

    return bot.sendMessage(chatId, recap, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirmer", callback_data: "confirm_prono" },
            { text: "❌ Annuler", callback_data: "cancel_prono" }
          ]
        ]
      }
    });
  }
});

// --- Gestion des boutons inline ---
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const state = pendingCoupon[chatId];
  if (!state) return bot.answerCallbackQuery(query.id);

  // --- Choix du type ---
  if (state.step === "awaiting_type") {
    if (query.data === "type_gratuit") state.type = "gratuit";
    if (query.data === "type_premium") state.type = "premium";

    state.step = "awaiting_media";
    await bot.sendMessage(chatId, "📎 Envoie maintenant le média pour ce prono ou tape /skip.");
  }

  // --- Confirmation finale ---
  if (state.step === "confirming") {
    if (query.data === "confirm_prono") {
      const result = await insertManualCoupon(
        state.content,
        state.mediaUrl,
        state.mediaType,
        state.date,
        state.type
      );

      if (result.success) {
        await bot.sendMessage(
          chatId,
          `✅ Coupon <b>${state.type.toUpperCase()}</b> ajouté pour le ${state.date}`,
          { parse_mode: "HTML" }
        );
      } else {
        await bot.sendMessage(chatId, "❌ Erreur lors de l’insertion du prono : " + result.error.message);
      }

      delete pendingCoupon[chatId];
    }

    if (query.data === "cancel_prono") {
      delete pendingCoupon[chatId];
      await bot.sendMessage(chatId, "❌ Ajout annulé.");
    }
  }

  await bot.answerCallbackQuery(query.id);
});

/////////////////////////////////////// ✅ VOIRE LES PRONOSTIQUE QUI SONT DISPO ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
//=== COMMANDE /voir_pronos ===

bot.onText(/\/voir_pronos/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_IDS.includes(userId))
    return bot.sendMessage(chatId, "⛔ Accès réservé aux admins.");

  try {
    const { rows } = await pool.query(
      "SELECT * FROM daily_pronos ORDER BY id DESC LIMIT 5"
    );
    if (rows.length === 0)
      return bot.sendMessage(chatId, "Aucun prono trouvé.");

    for (const row of rows) {
      const caption = `🆔 ${row.id}\n📅 ${row.date}\n📝 ${row.content}`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "✏️ Modifier", callback_data: `edit_${row.id}` },
            { text: "🗑️ Supprimer", callback_data: `delete_${row.id}` },
          ],
          [
            {
              text: "🚀 Publier maintenant",
              callback_data: `postnow_${row.id}`,
            },
            { text: "🧪 Tester", callback_data: `test_${row.id}` },
          ],
        ],
      };

      if (row.media_url && row.media_type === "photo") {
        await bot.sendPhoto(chatId, row.media_url, {
          caption,
          reply_markup: keyboard,
        });
      } else if (row.media_url && row.media_type === "video") {
        await bot.sendVideo(chatId, row.media_url, {
          caption,
          reply_markup: keyboard,
        });
      } else {
        await bot.sendMessage(chatId, caption, { reply_markup: keyboard });
      }
    }
  } catch (err) {
    console.error("Erreur voir_pronos:", err);
    bot.sendMessage(chatId, "❌ Erreur lors de la récupération des pronos.");
  }
});

// ✅ Callback général centralisé
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  const msgId = query.message.message_id;

  if (!ADMIN_IDS.includes(userId)) {
    return bot.answerCallbackQuery(query.id, { text: "⛔ Accès refusé." });
  }

  try {
    if (data.startsWith("delete_")) {
      const id = data.split("_")[1];
      await bot.editMessageReplyMarkup(
        {
          inline_keyboard: [
            [
              { text: "✅ Confirmer", callback_data: `confirmdelete_${id}` },
              { text: "❌ Annuler", callback_data: `cancel` },
            ],
          ],
        },
        { chat_id: chatId, message_id: msgId }
      );
      return;
    }

    if (data.startsWith("confirmdelete_")) {
      const id = data.split("_")[1];
      await pool.query("DELETE FROM daily_pronos WHERE id = $1", [id]);
      await bot.editMessageText(`✅ Prono ${id} supprimé.`, {
        chat_id: chatId,
        message_id: msgId,
      });
      return;
    }

    if (data === "cancel") {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: msgId }
      );
      return;
    }

    if (data.startsWith("edit_")) {
      const id = data.split("_")[1];
      editStates[chatId] = { step: "editing", pronoId: id };
      await bot.sendMessage(
        chatId,
        `✍️ Envoie le nouveau texte pour le prono ID ${id}, ou tape /cancel pour annuler.`
      );
      return;
    }

    if (data.startsWith("test_")) {
      const id = data.split("_")[1];
      const { rows } = await pool.query(
        "SELECT * FROM daily_pronos WHERE id = $1",
        [id]
      );
      const prono = rows[0];
      if (!prono) return;

      const caption = `🆔 ${prono.id}\n📅 ${prono.date}\n📝 ${prono.content}`;
      if (prono.media_url && prono.media_type === "photo") {
        await bot.sendPhoto(chatId, prono.media_url, { caption });
      } else if (prono.media_url && prono.media_type === "video") {
        await bot.sendVideo(chatId, prono.media_url, { caption });
      } else {
        await bot.sendMessage(chatId, caption);
      }
      return;
    }

    if (data.startsWith("postnow_")) {
      const id = data.split("_")[1];
      const { rows } = await pool.query(
        "SELECT * FROM daily_pronos WHERE id = $1",
        [id]
      );
      const prono = rows[0];
      if (!prono) return;

      const caption = `📢 PRONOSTIC DU JOUR\n\n🆔 ${prono.id}\n📅 ${prono.date}\n📝 ${prono.content}`;
      if (prono.media_url && prono.media_type === "photo") {
        await bot.sendPhoto(CANAL_ID, prono.media_url, { caption });
      } else if (prono.media_url && prono.media_type === "video") {
        await bot.sendVideo(CANAL_ID, prono.media_url, { caption });
      } else {
        await bot.sendMessage(CANAL_ID, caption);
      }
      await bot.sendMessage(chatId, `✅ Prono ${id} publié dans le canal.`);
      return;
    }

    if (data === "confirm_prono") {
      if (pendingCoupon[chatId]) {
        pendingCoupon[chatId].step = "awaiting_media";
        await bot.sendMessage(
          chatId,
          "📎 Envoie une *photo* ou *vidéo* ou tape /skip.",
          { parse_mode: "Markdown" }
        );
      }
      return;
    }

    if (data === "cancel_prono") {
      delete pendingCoupon[chatId];
      await bot.sendMessage(chatId, "❌ Ajout du prono annulé.");
      return;
    }

    // ✅ Pour toute autre donnée inconnue => ne rien faire, ignorer
    return;
  } catch (err) {
    console.error("Erreur callback:", err);
    bot.sendMessage(chatId, "❌ Une erreur est survenue.");
  }
});


//==============================FONCTION POUR MESSAGE_AUTO



bot.onText(/\/addmsg/, (msg) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(msg.chat.id, "❌ Tu n'as pas l'autorisation.");
  }

  userStates[msg.from.id] = { step: 1 };
  bot.sendMessage(
    msg.chat.id,
    "✏️ Envoie le **contenu du message** à programmer."
  );
});

bot.on("message", async (msg) => {
  const userId = msg.from.id;
  const state = userStates[userId];

  if (!state || msg.text?.startsWith("/")) return;

  const chatId = msg.chat.id;

  // Étape 1 : contenu texte
  if (state.step === 1) {
    state.contenu = msg.text;
    state.step = 2;
    return bot.sendMessage(
      chatId,
      "📎 Envoie un **média** (image, vidéo, audio, voice) OU tape `non` si tu n'en veux pas."
    );
  }

  // Étape 2 : média ou 'non'
  if (state.step === 2) {
    if (msg.text && msg.text.toLowerCase() === "non") {
      state.media_url = null;
      state.media_type = null;
    } else if (msg.photo) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      state.media_url = fileId;
      state.media_type = "photo";
    } else if (msg.video) {
      state.media_url = msg.video.file_id;
      state.media_type = "video";
    } else if (msg.voice) {
      state.media_url = msg.voice.file_id;
      state.media_type = "voice";
    } else if (msg.audio) {
      state.media_url = msg.audio.file_id;
      state.media_type = "audio";
    } else if (msg.text && msg.text.startsWith("http")) {
      state.media_url = msg.text;
      state.media_type = null; // Lien direct, type inconnu
    } else {
      return bot.sendMessage(
        chatId,
        "⛔ Format non reconnu. Envoie une image, une vidéo, un audio, un vocal ou tape `non`."
      );
    }

    state.step = 3;
    return bot.sendMessage(
      chatId,
      "🕒 À quelle heure envoyer ? Format `HH:MM` (ex : `08:30`, `20:15`)."
    );
  }

  // Étape 3 : heure d’envoi
  if (state.step === 3) {
    const timeInput = msg.text.trim();
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;

    if (!timeRegex.test(timeInput)) {
      return bot.sendMessage(
        chatId,
        "⛔ Format invalide. Utilise HH:MM (ex : `09:30`, `22:00`)."
      );
    }

    const [hour, minute] = timeInput.split(":");
    const now = dayjs();
    let sendDate = now
      .hour(Number(hour))
      .minute(Number(minute))
      .second(0)
      .millisecond(0);

    if (sendDate.isBefore(now)) {
      sendDate = sendDate.add(1, "day");
    }

    try {
      await pool.query(
        `INSERT INTO messages_auto (contenu, media_url, media_type, send_date) VALUES ($1, $2, $3, $4)`,
        [state.contenu, state.media_url, state.media_type, sendDate.toDate()]
      );

      const resume = `✅ Message enregistré avec succès :\n📝 Texte : ${state.contenu}\n🎞 Média : ${state.media_type || "Aucun"}\n🕒 Envoi prévu : ${sendDate.format("HH:mm")} (${sendDate.format("DD/MM/YYYY")})`;

      await bot.sendMessage(chatId, resume);
    } catch (err) {
      console.error(err);
      await bot.sendMessage(
        chatId,
        "❌ Erreur lors de l'enregistrement du message."
      );
    }

    delete userStates[userId];
  }
});

// LIRE_MESSAGE-AUTO
bot.onText(/\/listmsg/, async (msg) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(
      msg.chat.id,
      "⛔ Tu n'es pas autorisé à voir cette liste."
    );
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, contenu, send_date, media_url FROM messages_auto
       WHERE send_date::date = CURRENT_DATE
       ORDER BY send_date ASC`
    );

    if (rows.length === 0) {
      return bot.sendMessage(
        msg.chat.id,
        "📭 Aucun message prévu pour aujourd’hui."
      );
    }

    let response = `📋 *Messages programmés aujourd’hui*:\n\n`;

    for (const row of rows) {
      const shortText =
        row.contenu.length > 25 ? row.contenu.slice(0, 25) + "…" : row.contenu;
      const heure = dayjs(row.send_date).format("HH:mm");
      response += `🆔 ${row.id} | 🕒 ${heure} | ${
        row.media_url ? "📎 Media" : "📝 Texte"
      }\n➡️ ${shortText}\n\n`;
    }

    bot.sendMessage(msg.chat.id, response, { parse_mode: "Markdown" });
  } catch (err) {
    console.error(err);
    bot.sendMessage(
      msg.chat.id,
      "❌ Erreur lors de la récupération des messages."
    );
  }
});

// SUPPRIMÉ MESSAGE PROGRAMME
const pendingDeletions = new Map(); // Pour suivre les demandes de suppression en attente

bot.onText(/\/delmsg (\d+)/, async (msg, match) => {
  const userId = msg.from.id.toString();
  const messageId = match[1];

  if (userId !== adminId) {
    return bot.sendMessage(msg.chat.id, "⛔ Tu n'es pas autorisé à faire ça.");
  }

  // Vérifie si l'ID existe
  const { rows } = await pool.query(
    "SELECT * FROM messages_auto WHERE id = $1",
    [messageId]
  );
  if (rows.length === 0) {
    return bot.sendMessage(
      msg.chat.id,
      `❌ Aucun message trouvé avec l’ID ${messageId}.`
    );
  }

  // Stocke la demande en attente
  pendingDeletions.set(userId, messageId);

  bot.sendMessage(
    msg.chat.id,
    `🗑️ Es-tu sûr de vouloir supprimer le message ID ${messageId} ?`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirmer", callback_data: "confirm_delete" },
            { text: "❌ Annuler", callback_data: "cancel_delete" },
          ],
        ],
      },
    }
  );
});

// RÉPONSE OUI/NON
bot.on("callback_query", async (query) => {
  const userId = query.from.id.toString();
  const action = query.data;
  const chatId = query.message.chat.id;

  if (!pendingDeletions.has(userId)) {
    return bot.answerCallbackQuery(query.id, {
      text: "Aucune suppression en attente.",
    });
  }

  const messageId = pendingDeletions.get(userId);

  if (action === "confirm_delete") {
    try {
      await pool.query("DELETE FROM messages_auto WHERE id = $1", [messageId]);
      pendingDeletions.delete(userId);

      await bot.editMessageText(
        `✅ Message ID ${messageId} supprimé avec succès.`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
        }
      );
    } catch (err) {
      console.error(err);
      await bot.sendMessage(
        chatId,
        "❌ Une erreur est survenue pendant la suppression."
      );
    }
  } else if (action === "cancel_delete") {
    pendingDeletions.delete(userId);
    await bot.editMessageText("❌ Suppression annulée.", {
      chat_id: chatId,
      message_id: query.message.message_id,
    });
  }

  bot.answerCallbackQuery(query.id); // Pour faire disparaître le loading
});


/////////////////////////////////////// ✅ AJOUTER DES  MESSAGES_AUTO-FIXES ✅\\\\\\\\\\\\\\\\\\\\
//=== COMMANDE /addfixedmsg =====

bot.onText(/\/addfixedmsg/, (msg) => {
  if (msg.from.id.toString() !== adminId) return;
  fixedAddStates[msg.from.id] = { step: 1 };
  bot.sendMessage(msg.chat.id, "📝 Envoie le *texte du message fixe*.", {
    parse_mode: "Markdown",
  });
});

//=== COMMANDE /editfixedmsg ===

bot.onText(/\/editfixedmsg (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const id = parseInt(match[1]);

  if (userId.toString() !== adminId)
    return bot.sendMessage(chatId, "⛔ Tu n'as pas l'autorisation.");

  try {
    const { rows } = await pool.query(
      "SELECT * FROM message_fixes WHERE id = $1",
      [id]
    );
    if (rows.length === 0)
      return bot.sendMessage(chatId, "❌ Message introuvable.");

    fixedEditStates[userId] = { id, step: 1 };
    bot.sendMessage(chatId, "📝 Envoie le nouveau *texte du message*.", {
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Erreur lors de la récupération du message.");
  }
});

// ====== GESTION DES MESSAGES POUR AJOUT / ÉDITION =======
bot.on("message", async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  const editState = fixedEditStates[userId];
  const addState = fixedAddStates[userId];
  if ((!editState && !addState) || msg.text?.startsWith("/")) return;

  const handleMedia = (state, msg) => {
    if (msg.text && msg.text.toLowerCase() === "non") {
      state.media_url = null;
      state.media_type = null;
    } else if (msg.photo) {
      state.media_url = msg.photo.at(-1).file_id;
      state.media_type = "photo";
    } else if (msg.video) {
      state.media_url = msg.video.file_id;
      state.media_type = "video";
    } else if (msg.voice) {
      state.media_url = msg.voice.file_id;
      state.media_type = "voice";
    } else if (msg.audio) {
      state.media_url = msg.audio.file_id;
      state.media_type = "audio";
    } else if (msg.text && msg.text.startsWith("http")) {
      state.media_url = msg.text;
      state.media_type = null;
    } else {
      return false;
    }
    return true;
  };

  if (editState) {
    if (editState.step === 1) {
      editState.media_text = msg.text;
      editState.step = 2;
      return bot.sendMessage(
        chatId,
        "📎 Envoie le *nouveau média* (photo, vidéo, voix ou lien) ou tape `non`.",
        { parse_mode: "Markdown" }
      );
    }
    if (editState.step === 2) {
      if (!handleMedia(editState, msg))
        return bot.sendMessage(chatId, "⛔ Format non reconnu. Réessaie.");
      editState.step = 3;
      return bot.sendMessage(
        chatId,
        "🕒 Envoie les *heures* (ex : `06:00,08:00`)",
        { parse_mode: "Markdown" }
      );
    }
    if (editState.step === 3) {
      const heures = msg.text.split(",").map((h) => h.trim());
      const isValid = heures.every((h) =>
        /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(h)
      );
      if (!isValid)
        return bot.sendMessage(chatId, "❌ Format d'heure invalide.");
      editState.heures = heures.join(",");

      const resume = `📝 *Récapitulatif :*\n🆔 ID : ${editState.id}\n📄 Texte : ${editState.media_text}\n🎞 Média : ${editState.media_url ? "Oui" : "Aucun"}\n⏰ Heures : ${editState.heures}`;
      bot.sendMessage(chatId, resume, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Confirmer", callback_data: "confirm_edit" },
              { text: "❌ Annuler", callback_data: "cancel_edit" },
            ],
          ],
        },
      });
      editState.step = 4;
    }
    return;
  }

  if (addState) {
    if (addState.step === 1) {
      addState.media_text = msg.text;
      addState.step = 2;
      return bot.sendMessage(
        chatId,
        "📎 Envoie le *média* (photo, vidéo, voix ou lien) ou tape `non`.",
        { parse_mode: "Markdown" }
      );
    }
    if (addState.step === 2) {
      if (!handleMedia(addState, msg))
        return bot.sendMessage(chatId, "⛔ Format non reconnu. Réessaie.");
      addState.step = 3;
      return bot.sendMessage(
        chatId,
        "🕒 Envoie les *heures* (ex : `06:00,08:00`)",
        { parse_mode: "Markdown" }
      );
    }
    if (addState.step === 3) {
      const heures = msg.text.split(",").map((h) => h.trim());
      const isValid = heures.every((h) =>
        /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(h)
      );
      if (!isValid)
        return bot.sendMessage(chatId, "❌ Format d'heure invalide.");
      addState.heures = heures.join(",");

      const resume = `🆕 *Nouveau message fixe :*\n📄 Texte : ${addState.media_text}\n🎞 Média : ${addState.media_url ? "Oui" : "Aucun"}\n⏰ Heures : ${addState.heures}`;
      bot.sendMessage(chatId, resume, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Enregistrer", callback_data: "confirm_add" },
              { text: "❌ Annuler", callback_data: "cancel_add" },
            ],
          ],
        },
      });
      addState.step = 4;
    }
  }
});

// ✅ MISE À JOUR CALLBACK QUERIES POUR AJOUTER media_type DANS LA BDD
bot.on("callback_query", async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const data = query.data;
  const editState = fixedEditStates[userId];
  const addState = fixedAddStates[userId];

  if (data === "confirm_edit" && editState) {
    try {
      await pool.query(
        "UPDATE message_fixes SET media_text=$1, media_url=$2, media_type=$3, heures=$4 WHERE id=$5",
        [
          editState.media_text,
          editState.media_url,
          editState.media_type,
          editState.heures,
          editState.id,
        ]
      );
      await bot.sendMessage(chatId, "✅ Message modifié !");
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Erreur lors de la modification.");
    }
    delete fixedEditStates[userId];
  }

  if (data === "cancel_edit" && editState) {
    await bot.sendMessage(chatId, "❌ Modification annulée.");
    delete fixedEditStates[userId];
  }

  if (data === "confirm_add" && addState) {
    try {
      await pool.query(
        "INSERT INTO message_fixes (media_text, media_url, media_type, heures) VALUES ($1, $2, $3, $4)",
        [
          addState.media_text,
          addState.media_url,
          addState.media_type,
          addState.heures,
        ]
      );
      await bot.sendMessage(chatId, "✅ Message ajouté !");
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Erreur lors de l'ajout.");
    }
    delete fixedAddStates[userId];
  }

  if (data === "cancel_add" && addState) {
    await bot.sendMessage(chatId, "❌ Ajout annulé.");
    delete fixedAddStates[userId];
  }
});

bot.on("callback_query", async (query) => {
  try {
    const data = query.data;
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    // ✅ Test du message fixe
    if (data.startsWith("testfixed_")) {
      const id = data.split("_")[1];
      const { rows } = await pool.query("SELECT * FROM message_fixes WHERE id = $1", [id]);
      const row = rows[0];
      if (!row) {
        await bot.sendMessage(chatId, "❌ Message introuvable.");
        return;
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: "📢 Publier maintenant", callback_data: `publishfixed_${id}` },
            { text: "❌ Annuler", callback_data: "cancel_publishfixed" },
          ],
        ],
      };

      switch (row.media_type) {
        case "photo":
          await bot.sendPhoto(chatId, row.media_url, {
            caption: row.media_text,
            reply_markup: keyboard,
          });
          break;
        case "video":
          await bot.sendVideo(chatId, row.media_url, {
            caption: row.media_text,
            reply_markup: keyboard,
          });
          break;
        case "voice":
          await bot.sendVoice(chatId, row.media_url);
          await bot.sendMessage(chatId, row.media_text, { reply_markup: keyboard });
          break;
        case "audio":
          await bot.sendAudio(chatId, row.media_url);
          await bot.sendMessage(chatId, row.media_text, { reply_markup: keyboard });
          break;
        default:
          await bot.sendMessage(chatId, row.media_text, { reply_markup: keyboard });
          break;
      }
    }

    // ✅ Publication dans le canal
    else if (data.startsWith("publishfixed_")) {
      const id = data.split("_")[1];
      const { rows } = await pool.query("SELECT * FROM message_fixes WHERE id = $1", [id]);
      const row = rows[0];
      if (!row) {
        await bot.sendMessage(chatId, "❌ Message introuvable.");
        return;
      }

      switch (row.media_type) {
        case "photo":
          await bot.sendPhoto(channelId, row.media_url, { caption: row.media_text });
          break;
        case "video":
          await bot.sendVideo(channelId, row.media_url, { caption: row.media_text });
          break;
        case "voice":
          await bot.sendVoice(channelId, row.media_url);
          await bot.sendMessage(channelId, row.media_text);
          break;
        case "audio":
          await bot.sendAudio(channelId, row.media_url);
          await bot.sendMessage(channelId, row.media_text);
          break;
        default:
          if (row.media_url?.startsWith("http")) {
            await bot.sendMessage(channelId, `${row.media_text}\n🔗 ${row.media_url}`);
          } else {
            await bot.sendMessage(channelId, row.media_text);
          }
          break;
      }

      await bot.sendMessage(chatId, "✅ Message publié dans le canal.");
    }

    // ✅ Annulation de la publication
    else if (data === "cancel_publishfixed") {
      await bot.sendMessage(chatId, "❌ Publication annulée.");
    }

    // ✅ Suppression du message fixe
    else if (data.startsWith("deletefixed_")) {
      if (userId.toString() !== adminId) {
        await bot.answerCallbackQuery(query.id, { text: "🚫 Action non autorisée." });
        return;
      }

      const id = data.split("_")[1];
      await pool.query("DELETE FROM message_fixes WHERE id = $1", [id]);
      await bot.sendMessage(chatId, `✅ Message #${id} supprimé.`);
    }

    // ✅ Toujours répondre au callback
    await bot.answerCallbackQuery(query.id);

  } catch (err) {
    console.error("❌ Erreur dans callback_query:", err);
    await bot.sendMessage(query.message.chat.id, "⚠️ Une erreur est survenue.");
  }
});


/////////////////////////////////////// ✅ AFFICHÉ LA LISTE DES  MESSAGES_AUTO-FIXES ✅\\\\\\\\\\\\\\\\\\\\
//=== COMMANDE /fixedmenu ===

bot.onText(/\/fixedmenu/, async (msg) => {
  if (msg.from.id.toString() !== adminId) return;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM message_fixes ORDER BY id"
    );
    if (rows.length === 0) {
      return bot.sendMessage(msg.chat.id, "📭 Aucun message fixe trouvé.");
    }

    for (const row of rows) {
      const mediaInfo = row.media_url ? "🎞 Oui" : "❌ Aucun";
      const text = `🆔 ID: ${row.id}\n📄 Texte: ${row.media_text}\n🎞 Média: ${mediaInfo}\n⏰ Heures: ${row.heures}`;
      const buttons = [
        [{ text: "✏️ Modifier", callback_data: `editfixed_${row.id}` }],
        [{ text: "🗑 Supprimer", callback_data: `deletefixed_${row.id}` }],
        [{ text: "🧪 Tester", callback_data: `testfixed_${row.id}` }],
      ];

      await bot.sendMessage(msg.chat.id, text, {
        reply_markup: { inline_keyboard: buttons },
      });
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "❌ Erreur lors de la récupération.");
  }
});

// === Gestion des boutons ===
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const data = query.data;

  try {
    if (data.startsWith("deletefixed_")) {
      const id = data.split("_")[1];
      await pool.query("DELETE FROM message_fixes WHERE id=$1", [id]);
      await bot.sendMessage(chatId, `🗑 Message ID ${id} supprimé.`);
    } else if (data.startsWith("testfixed_")) {
      const id = data.split("_")[1];
      const { rows } = await pool.query(
        "SELECT * FROM message_fixes WHERE id=$1",
        [id]
      );
      const row = rows[0];

      if (!row) {
        await bot.sendMessage(chatId, "❌ Message introuvable.");
      } else {
        if (row.media_type === "photo") {
          await bot.sendPhoto(chatId, row.media_url, {
            caption: row.media_text,
          });
        } else if (row.media_type === "video") {
          await bot.sendVideo(chatId, row.media_url, {
            caption: row.media_text,
          });
        } else if (row.media_type === "voice") {
          await bot.sendVoice(chatId, row.media_url);
          await bot.sendMessage(chatId, row.media_text);
        } else if (row.media_type === "audio") {
          await bot.sendAudio(chatId, row.media_url);
          await bot.sendMessage(chatId, row.media_text);
        } else if (row.media_url?.startsWith("http")) {
          await bot.sendMessage(chatId, row.media_text);
        } else {
          await bot.sendMessage(chatId, row.media_text);
        }
      }
    } else if (data.startsWith("editfixed_")) {
      const id = data.split("_")[1];
      editStates[userId] = { step: "awaiting_text", id };
      await bot.sendMessage(
        chatId,
        "✏️ Envoie le nouveau texte (caption) du message."
      );
    }

    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error("Erreur callback_query:", err);
    await bot.answerCallbackQuery(query.id, {
      text: "❌ Erreur interne",
      show_alert: true,
    });
  }
});

// === Suivi de la modification (étape texte puis heures) ===
bot.on("message", async (msg) => {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;

  if (editStates[userId]) {
    const state = editStates[userId];

    if (state.step === "awaiting_text") {
      state.text = msg.text;
      state.step = "awaiting_hours";
      return bot.sendMessage(
        chatId,
        "⏰ Envoie les nouvelles heures au format HH:MM, séparées par virgules.\nExemple : 06:00, 14:30, 22:00"
      );
    }

    if (state.step === "awaiting_hours") {
      state.heures = msg.text;
      await pool.query(
        "UPDATE message_fixes SET media_text=$1, heures=$2 WHERE id=$3",
        [state.text, state.heures, state.id]
      );
      delete editStates[userId];
      return bot.sendMessage(
        chatId,
        `✅ Message ID ${state.id} modifié avec succès.`
      );
    }
  }
});


//////////////////////////////////////// Taux de change (exemple)\\\\\\\\\\\\\\\\\\\\\\\\\\
const rates = {
  FCFA: 1, XOF: 1, CFA: 1,
  USD: 600, EUR: 650, NGN: 1.4, GHS: 50,
  GBP: 750, ZAR: 30, CAD: 450, INR: 8
};

function convertToFcfa(amount, currency) {
  const rate = rates[currency.toUpperCase()];
  return rate ? amount * rate : 0;
}

// Liens Android APK + iOS App Store par bookmaker et langue
const appLinks = {
  '1xbet': {
    android: {
      fr: 'https://affpa.top/L?tag=d_3020095m_70865c_&site=3020095&ad=70865/fr.apk',
      en: 'https://affpa.top/L?tag=d_3020095m_70865c_&site=3020095&ad=70865/en.apk',
      ar: 'https://affpa.top/L?tag=d_3020095m_70865c_&site=3020095&ad=70865/ar.apk',
      pt: 'https://affpa.top/L?tag=d_3020095m_70865c_&site=3020095&ad=70865/pt.apk',
    },
    ios: {
      fr: 'https://affpa.top/L?tag=d_3020095m_27409c_&site=3020095&ad=27409/fr/app/1xbet/id1234567890',
      en: 'https://affpa.top/L?tag=d_3020095m_27409c_&site=3020095&ad=27409/us/app/1xbet/id1234567890',
      ar: 'https://affpa.top/L?tag=d_3020095m_27409c_&site=3020095&ad=27409/ae/app/1xbet/id1234567890',
      pt: 'https://affpa.top/L?tag=d_3020095m_27409c_&site=3020095&ad=27409/br/app/1xbet/id1234567890',
    }
  },
  'melbet': {
    android: {
      fr: 'https://refpakrtsb.top/L?tag=d_3207713m_118466c_&site=3207713&ad=118466/fr.apk',
      en: 'https://refpakrtsb.top/L?tag=d_3207713m_118466c_&site=3207713&ad=118466/en.apk',
      ar: 'https://refpakrtsb.top/L?tag=d_3207713m_118466c_&site=3207713&ad=118466/ar.apk',
      pt: 'https://refpakrtsb.top/L?tag=d_3207713m_118466c_&site=3207713&ad=118466/pt.apk',
    },
    ios: {
      fr: 'https://refpakrtsb.top/L?tag=d_3207713m_118464c_&site=3207713&ad=118464/fr/app/melbet/id9876543210',
      en: 'https://refpakrtsb.top/L?tag=d_3207713m_118464c_&site=3207713&ad=118464/us/app/melbet/id9876543210',
      ar: 'https://refpakrtsb.top/L?tag=d_3207713m_118464c_&site=3207713&ad=118464/ae/app/melbet/id9876543210',
      pt: 'https://refpakrtsb.top/L?tag=d_3207713m_118464c_&site=3207713&ad=118464/br/app/melbet/id9876543210',
    }
  },
  'linebet': {
    android: {
      fr: 'https://lb-aff.com/L?tag=d_3360482m_66803c_apk1&site=3360482&ad=66803/fr.apk',
      en: 'https://lb-aff.com/L?tag=d_3360482m_66803c_apk1&site=3360482&ad=66803/en.apk',
      ar: 'https://lb-aff.com/L?tag=d_3360482m_66803c_apk1&site=3360482&ad=66803/ar.apk',
      pt: 'https://lb-aff.com/L?tag=d_3360482m_66803c_apk1&site=3360482&ad=66803/pt.apk',
    },
    ios: {
      fr: 'https://lb-aff.com/L?tag=d_3360482m_22611c_site&site=3360482&ad=22611&r=registration/fr/app/linebet/id1122334455',
      en: 'https://lb-aff.com/L?tag=d_3360482m_22611c_site&site=3360482&ad=22611&r=registration/us/app/linebet/id1122334455',
      ar: 'https://lb-aff.com/L?tag=d_3360482m_22611c_site&site=3360482&ad=22611&r=registration/ae/app/linebet/id1122334455',
      pt: 'https://lb-aff.com/L?tag=d_3360482m_22611c_site&site=3360482&ad=22611&r=registration/br/app/linebet/id1122334455',
    }
  },
  'betwinner': {
    android: {
      fr: 'https://betwinner.com/mobile/fr.apk',
      en: 'https://betwinner.com/mobile/en.apk',
      ar: 'https://betwinner.com/mobile/ar.apk',
      pt: 'https://betwinner.com/mobile/pt.apk',
    },
    ios: {
      fr: 'https://betwinner.com/mobile/fr/app/betwinner/id5566778899',
      en: 'https://betwinner.com/mobile/us/app/betwinner/id5566778899',
      ar: 'https://betwinner.com/mobile/ae/app/betwinner/id5566778899',
      pt: 'https://betwinner.com/mobile/br/app/betwinner/id5566778899',
    }
  },
  '888starz': {
    android: {
      fr: 'https://buy785.online/L?tag=d_3345117m_72473c_&site=3345117&ad=72473/fr.apk',
      en: 'https://buy785.online/L?tag=d_3345117m_72473c_&site=3345117&ad=72473/en.apk',
      ar: 'https://buy785.online/L?tag=d_3345117m_72473c_&site=3345117&ad=72473/ar.apk',
      pt: 'https://buy785.online/L?tag=d_3345117m_72473c_&site=3345117&ad=72473/pt.apk',
    },
    ios: {
      fr: 'https://buy785.online/L?tag=d_3345117m_78555c_&site=3345117&ad=78555/fr/app/888starz/id9988776655',
      en: 'https://buy785.online/L?tag=d_3345117m_78555c_&site=3345117&ad=78555/us/app/888starz/id9988776655',
      ar: 'https://buy785.online/L?tag=d_3345117m_78555c_&site=3345117&ad=78555/ae/app/888starz/id9988776655',
      pt: 'https://buy785.online/L?tag=d_3345117m_78555c_&site=3345117&ad=78555/br/app/888starz/id9988776655',
    }
  },
  'winwin': {
    android: {
      fr: 'https://refpakrtsb.top/L?tag=d_3207713m_18645c_&site=3207713&ad=18645/fr.apk',
      en: 'https://refpakrtsb.top/L?tag=d_3207713m_18645c_&site=3207713&ad=18645/en.apk',
      ar: 'https://refpakrtsb.top/L?tag=d_3207713m_18645c_&site=3207713&ad=18645/ar.apk',
      pt: 'https://refpakrtsb.top/L?tag=d_3207713m_18645c_&site=3207713&ad=18645/pt.apk',
    },
    ios: {
      fr: 'https://refpa443273.top/L?tag=d_4438055m_120987c_&site=4438055&ad=120987/fr/app/winwin/id4433221100',
      en: 'https://refpa443273.top/L?tag=d_4438055m_120987c_&site=4438055&ad=120987/us/app/winwin/id4433221100',
      ar: 'https://refpa443273.top/L?tag=d_4438055m_120987c_&site=4438055&ad=120987/ae/app/winwin/id4433221100',
      pt: 'https://refpa443273.top/L?tag=d_4438055m_120987c_&site=4438055&ad=120987/br/app/winwin/id4433221100',
    }
  }
};

// 📲 Route /redirect dynamique avec détection OS
app.get('/redirect', (req, res) => {
  const subacc = req.query.u;
  const bookmaker = (req.query.bk || '').toLowerCase();
  if (!subacc || !bookmaker || !appLinks[bookmaker]) {
    return res.status(400).send('❌ Lien invalide ou bookmaker non pris en charge.');
  }

  const lang = (req.headers['accept-language'] || '').toLowerCase();
  let langCode = 'fr';
  if (lang.includes('ar')) langCode = 'ar';
  else if (lang.includes('pt')) langCode = 'pt';
  else if (lang.includes('en')) langCode = 'en';

  const androidUrl = appLinks[bookmaker]?.android?.[langCode];
  const iosUrl = appLinks[bookmaker]?.ios?.[langCode];

  const promoCode = 'P999X';

  res.send(`
    <html lang="${langCode}"><head><meta charset="UTF-8"><title>🔁 Redirection...</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script>
      function isIOS() {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent);
      }
      function isAndroid() {
        return /Android/i.test(navigator.userAgent);
      }
      window.onload = function() {
        const androidLink = '${androidUrl}';
        const iosLink = '${iosUrl}';
        if (isAndroid()) window.location.href = androidLink;
        else if (isIOS()) window.location.href = iosLink;
      };
    </script></head>
    <body style="text-align:center; font-family:sans-serif; padding:40px;">
      <h1>📲 Merci de passer par notre lien ${bookmaker.toUpperCase()} !</h1>
      <p>Code promo : <b>${promoCode}</b></p>
      <p>Si vous n'êtes pas redirigé automatiquement, utilisez les liens ci-dessous :</p>
      <a href="${androidUrl}" style="display:inline-block; margin:20px; padding:20px; background:#3DDC84; color:#fff; font-size:20px; text-decoration:none; border-radius:10px;">⬇️ Télécharger Android</a>
      <a href="${iosUrl}" style="display:inline-block; margin:20px; padding:20px; background:#007AFF; color:#fff; font-size:20px; text-decoration:none; border-radius:10px;">⬇️ Télécharger iOS</a>
    </body></html>
  `);
});



// 🔁 POSTBACK tracking
app.post('/postback', async (req, res) => {
  const { subacc, event, amount, currency } = req.body;
  const telegramId = parseInt(subacc);
  if (!telegramId || !event || !amount || !currency) return res.status(400).send('❌ Données manquantes');

  try {
    const depositAmount = parseFloat(amount);
    const currencyUpper = currency.toUpperCase();
    const amountInFcfa = convertToFcfa(depositAmount, currencyUpper);
    const MIN_FCFA = 2000;

    await pool.query(`INSERT INTO deposits_log (telegram_id, event_type, original_amount, currency, amount_in_fcfa)
      VALUES ($1, $2, $3, $4, $5)`, [telegramId, event, depositAmount, currencyUpper, amountInFcfa]);

    if (event === 'deposit') {
      if (amountInFcfa >= MIN_FCFA) {
        const check = await pool.query('SELECT 1 FROM verified_users WHERE telegram_id = $1', [telegramId]);
        if (check.rows.length === 0) {
          await pool.query('INSERT INTO verified_users (telegram_id) VALUES ($1)', [telegramId]);
          await bot.sendMessage(telegramId, `✅ Dépôt confirmé : ${depositAmount} ${currency}\n🔓 Accès débloqué aux coupons.`);
        } else {
          const today = new Date().toISOString().slice(0, 10);
          const coupon = await pool.query(`SELECT content FROM daily_pronos WHERE type = 'premium' AND created_at::date = $1 LIMIT 1`, [today]);
          if (coupon.rows.length > 0) {
            await bot.sendMessage(telegramId, `🔥 Merci pour ton nouveau dépôt !\nVoici un coupon PREMIUM bonus :\n\n${coupon.rows[0].content}`);
          }
        }
      } else {
        await bot.sendMessage(telegramId, `⚠️ Dépôt insuffisant : ${Math.round(amountInFcfa)} FCFA. Minimum requis : 2000 FCFA.`);
      }
    }

    res.send('OK');
  } catch (err) {
    console.error("Erreur postback:", err);
    res.status(500).send('Erreur serveur');
  }
});

// ✅ Commande de test
bot.onText(/\/test/, (msg) => {
  bot.sendMessage(msg.chat.id, "Bot et serveur ✅ fonctionnels");
});



// Commande /test_auto (admin uniquement)
bot.onText(/\/test_auto/, async (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) {
    return bot.sendMessage(chatId, "🚫 Commande réservée à l’admin.");
  }

  bot.sendMessage(chatId, "⏳ Génération automatique en cours...");

  try {
    const europe = await generateCouponEurope();
    const africa = await generateCouponAfrica();
    const america = await generateCouponAmerica();
    const asia = await generateCouponAsia();

    const allMatches = [...europe, ...africa, ...america, ...asia];

    if (allMatches.length === 0) {
      return bot.sendMessage(chatId, "❌ Aucun match généré.");
    }

    const message = formatMatchTips(allMatches);

    // Insertion ou mise à jour dans la DB
    await pool.query(`
      INSERT INTO daily_pronos (date, matches, created_at)
      VALUES (CURRENT_DATE, $1, NOW())
      ON CONFLICT (date) DO UPDATE
      SET matches = EXCLUDED.matches,
          content = NULL,
          media_url = NULL,
          media_type = NULL,
          created_at = NOW()
    `, [JSON.stringify(allMatches)]);

    await bot.sendMessage(chatId, `✅ *COUPON TEST INSÉRÉ ET ENVOYÉ :*\n\n${message}`, {
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error("❌ Erreur génération auto :", err);
    bot.sendMessage(chatId, "❌ Erreur lors de la génération automatique.");
  }
});





const editSessions = {};



  // --- COMMANDE /mes_coupons ---
  bot.onText(/\/mes_coupons/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId != process.env.ADMIN_ID) return;

    try {
      const res1 = await pool.query("SELECT * FROM scheduled_coupons ORDER BY id DESC LIMIT 5");
      const res2 = await pool.query("SELECT * FROM scheduled_coupons_2 ORDER BY id DESC LIMIT 5");

      const sendCoupons = async (coupons, canal) => {
        if (coupons.length === 0) {
          return bot.sendMessage(chatId, `❌ Aucun coupon trouvé dans ${canal}.`);
        }

        for (let c of coupons) {
          const text = `<b>📌 Coupon #${c.id} (${canal})</b>\n` +
                       `<b>Date :</b> ${c.schedule_date}\n` +
                       `<b>Heure :</b> ${c.schedule_time}\n` +
                       `<b>Texte :</b> ${c.content}\n` +
                       `<b>Média :</b> ${c.media_type || "Aucun"}`;

          await bot.sendMessage(chatId, text, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✏️ Modifier", callback_data: `edit_${canal}_${c.id}` },
                  { text: "🚀 Publier", callback_data: `publish_${canal}_${c.id}` },
                ],
                [
                  { text: "🗑 Supprimer", callback_data: `delete_${canal}_${c.id}` },
                  { text: "🧪 Tester", callback_data: `test_${canal}_${c.id}` },
                ],
              ],
            },
          });
        }
      };

      await sendCoupons(res1.rows, "CANAL1");
      await sendCoupons(res2.rows, "CANAL2");

    } catch (err) {
      console.error("❌ Erreur récupération coupons :", err);
      bot.sendMessage(chatId, "❌ Erreur lors de la récupération des coupons.");
    }
  });

  // --- CALLBACK QUERY GESTION ---
  bot.on("callback_query", async (query) => {
    const data = query.data;

    // ⚠️ Limiter aux callbacks gérés ici
    if (
      !data.startsWith("edit_") &&
      !data.startsWith("delete_") &&
      !data.startsWith("publish_") &&
      !data.startsWith("test_") &&
      !data.startsWith("saveEdit_") &&
      !data.startsWith("cancelEdit_") &&
      !data.startsWith("skip_")
    ) {
      return;
    }

    const chatId = query.message.chat.id;
    const userId = query.from.id;
    if (userId != process.env.ADMIN_ID) return;

    const parts = data.split("_");
    const action = parts[0];
    const canal = parts[1];
    const id = parts[2];

    let table, targetChatId;
    if (canal === "CANAL1") {
      table = "scheduled_coupons";
      targetChatId = process.env.CANAL_ID;
    } else if (canal === "CANAL2") {
      table = "scheduled_coupons_2";
      targetChatId = process.env.CANAL2_ID;
    }

    try {
      // --- GESTION DES SKIP INLINE ---
      if (action === "skip") {
        const session = editSessions[chatId];
        if (!session) return;

        if (parts[1] === "date") {
          session.step = "await_time";
          return bot.sendMessage(chatId, "⏰ Nouvelle heure (HH:mm) :", {
            reply_markup: { inline_keyboard: [[{ text: "⏭ Skip", callback_data: "skip_time" }]] }
          });
        }

        if (parts[1] === "time") {
          session.step = "await_text";
          return bot.sendMessage(chatId, "📝 Nouveau texte :", {
            reply_markup: { inline_keyboard: [[{ text: "⏭ Skip", callback_data: "skip_text" }]] }
          });
        }

        if (parts[1] === "text") {
          session.step = "await_media";
          return bot.sendMessage(chatId, "📎 Nouveau média (file_id ou URL) :", {
            reply_markup: { inline_keyboard: [[{ text: "⏭ Skip", callback_data: "skip_media" }]] }
          });
        }

        if (parts[1] === "media") {
          session.step = "confirm";

          const recap = `<b>✅ Récapitulatif :</b>\n` +
            `<b>Date :</b> ${session.schedule_date}\n` +
            `<b>Heure :</b> ${session.schedule_time}\n` +
            `<b>Texte :</b> ${session.content}\n` +
            `<b>Média :</b> ${session.media_url || "Aucun"}`;

          return bot.sendMessage(chatId, recap, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "💾 Enregistrer", callback_data: `saveEdit_${session.canal}_${session.id}` }],
                [{ text: "❌ Annuler", callback_data: `cancelEdit_${session.canal}_${session.id}` }]
              ]
            }
          });
        }
      }

      // --- Récupération du coupon pour les autres actions ---
      const res = await pool.query(`SELECT * FROM ${table} WHERE id=$1`, [id]);
      if (res.rows.length === 0) {
        return bot.answerCallbackQuery(query.id, { text: "❌ Coupon introuvable." });
      }
      const coupon = res.rows[0];

      // --- SUPPRIMER ---
      if (action === "delete") {
        await pool.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
        await bot.editMessageText(`🗑 Coupon #${id} supprimé (${canal})`, {
          chat_id: chatId,
          message_id: query.message.message_id,
        });
        return;
      }

      // --- TEST ---
      if (action === "test") {
        if (coupon.media_type === "photo") {
          await bot.sendPhoto(chatId, coupon.media_url, { caption: coupon.content, parse_mode: "HTML" });
        } else if (coupon.media_type === "video") {
          await bot.sendVideo(chatId, coupon.media_url, { caption: coupon.content, parse_mode: "HTML" });
        } else {
          await bot.sendMessage(chatId, coupon.content, { parse_mode: "HTML" });
        }
        return bot.answerCallbackQuery(query.id, { text: "✅ Test envoyé." });
      }

      // --- PUBLIER ---
      if (action === "publish") {
        if (!targetChatId) return bot.answerCallbackQuery(query.id, { text: "❌ Canal non configuré." });

        if (coupon.media_type === "photo") {
          await bot.sendPhoto(targetChatId, coupon.media_url, { caption: coupon.content, parse_mode: "HTML" });
        } else if (coupon.media_type === "video") {
          await bot.sendVideo(targetChatId, coupon.media_url, { caption: coupon.content, parse_mode: "HTML" });
        } else {
          await bot.sendMessage(targetChatId, coupon.content, { parse_mode: "HTML" });
        }
        return bot.answerCallbackQuery(query.id, { text: "🚀 Coupon publié !" });
      }

      // --- MODIFIER ---
      if (action === "edit") {
        editSessions[chatId] = {
          step: "await_date",
          canal,
          table,
          id,
          content: coupon.content,
          media_type: coupon.media_type,
          media_url: coupon.media_url,
          schedule_date: coupon.schedule_date,
          schedule_time: coupon.schedule_time,
        };

        return bot.sendMessage(chatId, "✏️ Nouvelle date (YYYY-MM-DD) :", {
          reply_markup: { inline_keyboard: [[{ text: "⏭ Skip", callback_data: "skip_date" }]] }
        });
      }

      // --- SAUVEGARDE MODIFICATION ---
      if (action === "saveEdit") {
        const session = editSessions[chatId];
        if (!session) return;

        await pool.query(
          `UPDATE ${session.table}
           SET content=$1, media_type=$2, media_url=$3, schedule_date=$4, schedule_time=$5
           WHERE id=$6`,
          [
            session.content,
            session.media_type,
            session.media_url,
            session.schedule_date,
            session.schedule_time,
            session.id,
          ]
        );

        delete editSessions[chatId];
        return bot.editMessageText(`✅ Coupon #${session.id} modifié avec succès (${session.canal}) !`, {
          chat_id: chatId,
          message_id: query.message.message_id,
        });
      }

      // --- ANNULER MODIFICATION ---
      if (action === "cancelEdit") {
        delete editSessions[chatId];
        return bot.editMessageText("❌ Modification annulée.", {
          chat_id: chatId,
          message_id: query.message.message_id,
        });
      }
    } catch (err) {
      console.error("❌ Erreur gestion bouton :", err);
      return bot.sendMessage(chatId, "❌ Une erreur est survenue.");
    }
  });

  // --- Workflow édition (messages texte) ---
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    if (!editSessions[chatId]) return;

    const session = editSessions[chatId];
    const text = msg.text?.trim();

    // --- Étape DATE ---
    if (session.step === "await_date") {
      if (text.toLowerCase() !== "skip") session.schedule_date = text;
      session.step = "await_time";
      return bot.sendMessage(chatId, "⏰ Nouvelle heure (HH:mm) :", {
        reply_markup: { inline_keyboard: [[{ text: "⏭ Skip", callback_data: "skip_time" }]] }
      });
    }

    // --- Étape HEURE ---
    if (session.step === "await_time") {
      if (text.toLowerCase() !== "skip") session.schedule_time = text;
      session.step = "await_text";
      return bot.sendMessage(chatId, "📝 Nouveau texte :", {
        reply_markup: { inline_keyboard: [[{ text: "⏭ Skip", callback_data: "skip_text" }]] }
      });
    }

    // --- Étape TEXTE ---
    if (session.step === "await_text") {
      if (text.toLowerCase() !== "skip") session.content = text;
      session.step = "await_media";
      return bot.sendMessage(chatId, "📎 Nouveau média (file_id ou URL) :", {
        reply_markup: { inline_keyboard: [[{ text: "⏭ Skip", callback_data: "skip_media" }]] }
      });
    }

    // --- Étape MEDIA ---
    if (session.step === "await_media") {
      if (text.toLowerCase() !== "skip") {
        session.media_url = text;
        session.media_type = text.endsWith(".mp4") ? "video" : "photo";
      }
      session.step = "confirm";

      const recap = `<b>✅ Récapitulatif :</b>\n` +
        `<b>Date :</b> ${session.schedule_date}\n` +
        `<b>Heure :</b> ${session.schedule_time}\n` +
        `<b>Texte :</b> ${session.content}\n` +
        `<b>Média :</b> ${session.media_url || "Aucun"}`;

      return bot.sendMessage(chatId, recap, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💾 Enregistrer", callback_data: `saveEdit_${session.canal}_${session.id}` }],
            [{ text: "❌ Annuler", callback_data: `cancelEdit_${session.canal}_${session.id}` }]
          ]
        }
      });
    }
  });



// --- Commande /voir_pronos ---
bot.onText(/\/ajouter_prono/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_IDS.includes(userId))
    return bot.sendMessage(chatId, "🚫 Commande réservée à l’admin.");

  pendingCoupon[chatId] = {
    step: "awaiting_date",
    date: null,
    content: null,
    type: "gratuit", // par défaut
    mediaUrl: null,
    mediaType: null,
  };

  bot.sendMessage(
    chatId,
    "📅 Envoie la date du prono (format : YYYY-MM-DD) ou tape /today pour aujourd’hui."
  );
});

// --- /today ---
bot.onText(/\/today/, (msg) => {
  const chatId = msg.chat.id;
  const state = pendingCoupon[chatId];
  if (!state || state.step !== "awaiting_date") return;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  state.date = today.toISOString().slice(0, 10); // YYYY-MM-DD
  state.step = "awaiting_content";

  bot.sendMessage(chatId, "📝 Envoie maintenant le texte du prono.");
});

// --- Gestion des messages ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const state = pendingCoupon[chatId];
  if (!state || msg.text?.startsWith("/")) return;

  // --- Étape 1 : Date ---
  if (state.step === "awaiting_date") {
    const inputDate = msg.text?.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
      return bot.sendMessage(chatId, "⚠️ Format invalide. Utilise YYYY-MM-DD.");
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (new Date(inputDate) < today) {
      return bot.sendMessage(chatId, "❌ La date ne peut pas être dans le passé.");
    }

    state.date = inputDate;
    state.step = "awaiting_content";
    return bot.sendMessage(chatId, "📝 Envoie maintenant le texte du prono.");
  }

  // --- Étape 2 : Contenu ---
  if (state.step === "awaiting_content") {
    if (!msg.text || msg.text.trim().length < 5) {
      return bot.sendMessage(chatId, "⚠️ Le texte du prono est trop court.");
    }

    state.content = msg.text.trim();
    state.step = "awaiting_type";

    // --- Choix du type de prono ---
    return bot.sendMessage(chatId, "🎯 Choisis le type de prono :", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Gratuit", callback_data: "type_gratuit" }],
          [{ text: "Premium", callback_data: "type_premium" }]
        ]
      }
    });
  }

  // --- Étape 3 : Média ---
  if (state.step === "awaiting_media") {
    let fileId = null;
    let mediaType = null;

    if (msg.photo) {
      fileId = msg.photo.at(-1).file_id;
      mediaType = "photo";
    } else if (msg.video) {
      fileId = msg.video.file_id;
      mediaType = "video";
    } else if (msg.document) {
      fileId = msg.document.file_id;
      mediaType = "document";
    } else if (msg.voice) {
      fileId = msg.voice.file_id;
      mediaType = "voice";
    } else if (msg.audio) {
      fileId = msg.audio.file_id;
      mediaType = "audio";
    } else if (msg.video_note) {
      fileId = msg.video_note.file_id;
      mediaType = "video_note";
    } else if (msg.text === "/skip") {
      fileId = null;
      mediaType = null;
    } else {
      return bot.sendMessage(
        chatId,
        "⚠️ Envoie un média valide ou tape /skip."
      );
    }

    state.mediaUrl = fileId;
    state.mediaType = mediaType;
    state.step = "confirming";

    // --- Récapitulatif ---
    const recap = `📝 <b>Récapitulatif du prono :</b>
📅 Date : <b>${state.date}</b>
✍️ Contenu : <i>${state.content}</i>
📎 Média : ${mediaType ? mediaType : "aucun"}
📌 Type : <b>${state.type}</b>
`;

    return bot.sendMessage(chatId, recap, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirmer", callback_data: "confirm_prono" },
            { text: "❌ Annuler", callback_data: "cancel_prono" }
          ]
        ]
      }
    });
  }
});

// --- Gestion des boutons inline ---
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const state = pendingCoupon[chatId];
  if (!state) return bot.answerCallbackQuery(query.id);

  // --- Choix du type ---
  if (state.step === "awaiting_type") {
    if (query.data === "type_gratuit") state.type = "gratuit";
    if (query.data === "type_premium") state.type = "premium";

    state.step = "awaiting_media";
    await bot.sendMessage(chatId, "📎 Envoie maintenant le média pour ce prono ou tape /skip.");
  }

  // --- Confirmation finale ---
  if (state.step === "confirming") {
    if (query.data === "confirm_prono") {
      const result = await insertManualCoupon(
        state.content,
        state.mediaUrl,
        state.mediaType,
        state.date,
        state.type
      );

      if (result.success) {
        await bot.sendMessage(
          chatId,
          `✅ Coupon <b>${state.type.toUpperCase()}</b> ajouté pour le ${state.date}`,
          { parse_mode: "HTML" }
        );
      } else {
        await bot.sendMessage(chatId, "❌ Erreur lors de l’insertion du prono : " + result.error.message);
      }

      delete pendingCoupon[chatId];
    }

    if (query.data === "cancel_prono") {
      delete pendingCoupon[chatId];
      await bot.sendMessage(chatId, "❌ Ajout annulé.");
    }
  }

  await bot.answerCallbackQuery(query.id);
});






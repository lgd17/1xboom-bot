// ====== CHARGEMENT DES MODULES ======
require("dotenv").config();
//require('./server');
require('./dailyCouponRunner');
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const bodyParser = require("body-parser");
const { t } = require("./lang");
const cron = require("node-cron");
require("./autoCoupons");
const schedule = require("node-schedule");
const { pool, insertManualCoupon } = require("./db");
const setupAutoSender = require("./autosender");
const fetch = require("node-fetch"); // à garder si tu fais des appels API
const generateCouponEurope = require('./generateCouponEurope');
const generateCouponAfrica = require('./generateCouponAfrica');
const generateCouponAmerica = require('./generateCouponAmerica');
const generateCouponAsia = require('./generateCouponAsia');
const {
  getConfidence,
  getSafestBet,
  getTargetedBet,
  formatMatchTips
} = require('./couponUtils');




// ====== EXPRESS ======
const app = express();
app.use(bodyParser.json());

// ====== CONFIGURATION ENV ======
const port = process.env.PORT || 3000;
const token = process.env.TELEGRAM_TOKEN;
if (!token) throw new Error("❌ TELEGRAM_TOKEN non défini !");
const baseUrl = process.env.BASE_URL; // ✅ ✅ ✅ à utiliser sur Render !
if (!baseUrl) throw new Error("❌ BASE_URL manquant dans .env !");

const adminId = process.env.TELEGRAM_ADMIN_ID;
const channelId = process.env.TELEGRAM_CHANNEL_ID;


// ====== GESTION DES ÉTATS ======
const userStates = {};
const ADMIN_IDS = [6248838967];
const fixedDeletionConfirmations = new Map();
const editFixedStates = {};
const userLang = {};
const fixedAddStates = {};
const fixedEditStates = {};
const editStates = {};

// ====== ENCODAGE DU TOKEN POUR L'URL ======
const encodedToken = encodeURIComponent(token);

// ====== INITIALISATION DU BOT EN MODE WEBHOOK ======
const bot = new TelegramBot(token, { webHook: true });

bot.setWebHook(`${baseUrl}/bot${encodedToken}`)
  .then(() => console.log(`✅ Webhook configuré : ${baseUrl}/bot${encodedToken}`))
  .catch(err => console.error("❌ Erreur lors du setWebhook :", err));

// ====== GESTION DES MESSAGES ======
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  console.log("📩 Message reçu :", msg.text);
  bot.sendMessage(chatId, `✅ Reçu : "${msg.text}"`);
});

// ====== ROUTE POUR TRAITER LES UPDATES DE TELEGRAM ======
app.post(`/bot${encodedToken}`, (req, res) => {
  console.log("✅ Webhook → Update reçu");
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ====== ROUTE POUR RÉVEILLER RENDER ======
app.get("/ping", (req, res) => {
  console.log("✅ Ping reçu — Render réveillé");
  res.status(200).send("Bot is awake!");
});

// ====== PAGE DE TEST ======
app.get("/", (req, res) => res.send("✅ Bot Telegram en ligne (mode webhook)"));

// ====== LANCEMENT SERVEUR ======
app.listen(port, () => {
  console.log(`🚀 Serveur lancé sur le port ${port}`);
});

// ====== ACTIVATION DE L’ENVOI AUTOMATIQUE FIXE ======
setupAutoSender(bot);

// ====== POSTGRESQL ======
const { Pool } = require("pg");
// --- /start + gestion parrainage + points ---
bot.onText(/\/start(?:\s(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referralId = match[1] ? parseInt(match[1], 10) : null; // ID parrain si présent
  const telegramId = msg.from.id;
  const username = msg.from.username || null;
  const firstname = msg.from.first_name || null;

  try {
    // Vérifie si utilisateur déjà enregistré
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE telegram_id = $1",
      [telegramId]
    );
    if (rows.length === 0) {
      // Insertion nouvel utilisateur avec points initiaux 0
      await pool.query(
        "INSERT INTO users (telegram_id, username, firstname, referral_id, points) VALUES ($1, $2, $3, $4, $5)",
        [telegramId, username, firstname, referralId, 0]
      );

      // Ajoute 5 points au parrain s’il existe
      if (referralId) {
        await pool.query(
          "UPDATE users SET points = points + 5 WHERE telegram_id = $1",
          [referralId]
        );
        await bot.sendMessage(
          referralId,
          `🎉 Une personne s’est inscrite via ton lien ! +5 points 🙌`
        );

        // Vérifie si le filleul est abonné au canal (fonction ci-dessous)
        const isSubscribed = await isUserInChannel(
          telegramId,
          "@linktree_free_prediction"
        );
        if (isSubscribed) {
          await pool.query(
            "UPDATE users SET points = points + 10 WHERE telegram_id = $1",
            [referralId]
          );
          await bot.sendMessage(
            referralId,
            `📢 Ton filleul a rejoint le canal ! +10 points 🔥`
          );
        }
      }
    }
  } catch (err) {
    console.error("Erreur lors du /start :", err);
    await bot.sendMessage(chatId, "❌ Une erreur est survenue.");
  }

  // Envoie menu principal (ne pas oublier de gérer le conflit avec /start regex du début)
  sendMainMenu(chatId);
});

// --- Fonction pour vérifier si utilisateur est dans le canal ---
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
function sendMainMenu(chatId) {
  const menu = {
    reply_markup: {
      keyboard: [
        ["🎯 Pronostics du jour", "🏆 Mes Points"],
        ["🤝 Parrainage", "🆘 Assistance 🤖"],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  };

  bot.sendMessage(
    chatId,
    `👋 Bienvenue sur *1XBOOM* !

Choisis une option ci-dessous 👇`,
    {
      parse_mode: "Markdown",
      ...menu,
    }
  );
}

// --- Gestion messages texte ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Ignore les commandes déjà traitées (ex: /start)
  if (text && text.startsWith("/")) return;

  // --- Parrainage ---
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

  // --- Mes Points ---
 if (text === '🏆 Mes Points') {
  try {
    const res = await pool.query('SELECT points FROM users WHERE telegram_id = $1', [chatId]);
    let points = 0;
    if (res.rows && res.rows.length > 0 && res.rows[0].points) {
      points = res.rows[0].points;
    }

    let motivation = '';
    if (points >= 100) motivation = "🚀 *Incroyable ! Tu es dans la cour des grands.*";
    else if (points >= 50) motivation = "🔥 *Très bon score !* Continue !";
    else if (points >= 20) motivation = "👍 *Bien joué !* Tu montes dans le classement.";
    else motivation = "💡 Gagne des points en parrainant. Clique sur '🤝 Parrainage'";

    return bot.sendMessage(chatId, `⭐️ *Tes points :* ${points} points\n\n${motivation}`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(err);
    return bot.sendMessage(chatId, "❌ Erreur lors de la récupération des points.");
  }
}

  // --- Assistance ---
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


  // Gestion menu assistance
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

  if (data === "points") {
    try {
      const res = await pool.query(
        "SELECT points FROM users WHERE telegram_id = $1",
        [chatId]
      );
      const points = res?.rows?.[0]?.points || 0;

      let motivation = "";
      if (points >= 100)
        motivation = "🚀 *Incroyable ! Tu es dans la cour des grands.*";
      else if (points >= 50) motivation = "🔥 *Très bon score !* Continue !";
      else if (points >= 20)
        motivation = "👍 *Bien joué !* Tu montes dans le classement.";
      else
        motivation =
          "💡 Gagne des points en parrainant. Clique sur '🤝 Parrainage'";

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

// --- Optionnel: gestion erreurs globales ---
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
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
      message += `🥇 *${index + 1}. ${nom}* — ${row.filleuls} filleul(s), ${
        row.points
      } pts\n`;
    });

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Erreur /topparrains :", error);
    bot.sendMessage(chatId, "❌ Impossible d'afficher le classement.");
  }
});

const CHANNEL_ID = "@linktree_free_prediction";

schedule.scheduleJob("0 18 * * 0", async () => {
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
      message += `🏅 *${index + 1}. ${nom}* — ${row.filleuls} filleul(s), ${
        row.points
      } pts\n`;
    });

    bot.sendMessage(CHANNEL_ID, message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Erreur classement auto :", error);
  }
});

// 🔁 Réinitialiser les points tous les 1er du mois à 00h05

const TELEGRAM_CHANNEL_ID = "@linktree_free_prediction"; // remplace par ton canal

// 🔁 Fonction pour publier le Top 5 et reset les points
async function publierClassementEtReset() {
  try {
    const { rows: topUsers } = await pool.query(
      `SELECT id, username, firstname, points
       FROM users
       ORDER BY points DESC
       LIMIT 5`
    );

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

    // 🔹 Envoi du message dans le canal
    await bot.sendMessage(TELEGRAM_CHANNEL_ID, message, {
      parse_mode: "Markdown",
    });

    // 🔹 Remise à zéro
    await pool.query("UPDATE users SET points = 0");
    console.log("✅ Points remis à zéro");
  } catch (err) {
    console.error("❌ Erreur dans publierClassementEtReset :", err);
  }
}

// ✅ Tâche planifiée le 1er de chaque mois à 00h00
schedule.scheduleJob("0 0 1 * *", () => {
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

//=========================== VÉRIFICATION_USER-INSCRIT
// === Gestion Pronostic du jour propre (avec userStates) ===

const validBookmakers = ["1xbet", "888starz", "linebet", "melbet", "betwinner", "winwin"];
const timeoutMap = {}; // pour auto-nettoyage

// === GESTION PRONOSTIC DU JOUR ===

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (!text || text.startsWith("/")) return;

  const state = userStates[chatId];

  // 1️⃣ - Entrée principale : bouton
  if (text === "🎯 Pronostics du jour" && !state) {
    try {
      const res = await pool.query(
        "SELECT * FROM verified_users WHERE telegram_id = $1",
        [chatId]
      );

      if (res.rows.length > 0) {
        return bot.sendMessage(chatId, "🟢 Voici le pronostic du jour ");
      }

      userStates[chatId] = { step: "await_bookmaker" };
      startTimeout(chatId);

      return bot.sendMessage(
        chatId,
        "🔐 Pour accéder aux pronostics, merci de compléter ces infos.\n\nQuel bookmaker as-tu utilisé ?",
        {
          reply_markup: {
            keyboard: [
              ["1xbet", "888starz", "Linebet"],
              ["Melbet", "Betwinner", "Winwin"],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    } catch (err) {
      console.error(err);
      return bot.sendMessage(chatId, "❌ Erreur. Réessaie plus tard.");
    }
  }

  // 2️⃣ - Pas d’état actif = ignorer
  if (!state) return;

  // 3️⃣ - Étapes du dialogue
  switch (state.step) {
    case "await_bookmaker": {
      const bookmaker = text.toLowerCase();
      if (!validBookmakers.includes(bookmaker)) {
        return bot.sendMessage(chatId, "❌ Choix invalide. Sélectionne un bookmaker dans la liste.");
      }

      userStates[chatId].bookmaker = bookmaker;
      userStates[chatId].step = "await_deposit_id";
      return bot.sendMessage(chatId, "🆔 Envoie ton identifiant de compte (7 à 10 chiffres) :");
    }

    case "await_deposit_id": {
      const depositId = text;
      if (!/^\d{7,10}$/.test(depositId)) {
        return bot.sendMessage(chatId, "❌ ID invalide. Envoie un ID entre 7 et 10 chiffres.");
      }

      try {
        const { rows } = await pool.query(
          "SELECT 1 FROM pending_verifications WHERE deposit_id = $1",
          [depositId]
        );
        if (rows.length > 0) {
          return bot.sendMessage(chatId, "⚠️ Cet ID est déjà en attente de vérification.");
        }

        userStates[chatId].deposit_id = depositId;
        userStates[chatId].step = "await_amount";
        return bot.sendMessage(chatId, "💵 Quel montant as-tu déposé ? (ex : 2000 FCFA, 10€)");
      } catch (err) {
        console.error(err);
        return bot.sendMessage(chatId, "❌ Erreur. Réessaie plus tard.");
      }
    }

    case "await_amount": {
      const match = text.match(/(\d+(?:[.,]\d+)?)/);
      const amount = match ? parseFloat(match[1].replace(",", ".")) : NaN;

      if (isNaN(amount) || amount < 5 || amount > 10000) {
        return bot.sendMessage(
          chatId,
          "❌ Montant invalide. Envoie un montant entre 5 et 10 000."
        );
      }

      try {
        await pool.query(
          `INSERT INTO pending_verifications (telegram_id, bookmaker, deposit_id, amount)
           VALUES ($1, $2, $3, $4)`,
          [
            chatId,
            state.bookmaker,
            state.deposit_id,
            amount,
          ]
        );

        clearState(chatId);
        bot.sendMessage(chatId, "✅ Merci ! Ton compte est en attente de validation. Tu seras notifié dès que tu seras validé.", menu);
      } catch (err) {
        console.error("Erreur enregistrement :", err);
        bot.sendMessage(chatId, "❌ Une erreur est survenue. Réessaie plus tard.");
      }
    }
  }
});

// Auto timeout de 5 minutes
function startTimeout(chatId) {
  if (timeoutMap[chatId]) clearTimeout(timeoutMap[chatId]);
  timeoutMap[chatId] = setTimeout(() => {
    if (userStates[chatId]) {
      delete userStates[chatId];
      bot.sendMessage(chatId, "⌛️ Temps écoulé. Recommence avec 🎯 Pronostics du jour.");
    }
  }, 5 * 60 * 1000);
}

function clearState(chatId) {
  delete userStates[chatId];
  clearTimeout(timeoutMap[chatId]);
}



/////////////////////////////////////// ✅ VOIRE LES VÉRIFICATIONS EN ATTENTE ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
//=== COMMANDE /admin ====

bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) {
    return bot.sendMessage(chatId, "⛔️ Accès refusé.");
  }

  try {
    const res = await pool.query("SELECT * FROM pending_verifications");
    if (res.rows.length === 0) {
      return bot.sendMessage(chatId, "✅ Aucun utilisateur en attente.");
    }

    for (const user of res.rows) {
      const message = `🕵️ <b>Vérification en attente</b>:\n\n👤 <b>ID:</b> <code>${user.telegram_id}</code>\n📱 <b>Bookmaker:</b> ${user.bookmaker}\n🆔 <b>Dépôt:</b> ${user.deposit_id}\n💰 <b>Montant:</b> ${user.amount} €`;

      await bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Valider",
                callback_data: `admin_validate_${user.telegram_id}`,
              },
              {
                text: "❌ Rejeter",
                callback_data: `admin_reject_step1_${user.telegram_id}`,
              },
            ],
          ],
        },
      });
    }
  } catch (err) {
    console.error("❌ Erreur /admin :", err);
    bot.sendMessage(chatId, "❌ Erreur lors de la récupération des vérifications.");
  }
});

//   Callback
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  await bot.answerCallbackQuery(query.id);

  if (data.startsWith("admin_") && !ADMIN_IDS.includes(chatId)) {
    return bot.sendMessage(chatId, "⛔️ Action non autorisée.");
  }
if (data.startsWith("admin_validate_")) {
  const telegram_id = parseInt(data.split("_")[2], 10);

  try {
    // Vérifie si déjà validé
    const check = await pool.query(
      "SELECT 1 FROM verified_users WHERE telegram_id = $1",
      [telegram_id]
    );
    if (check.rows.length > 0) {
      return bot.sendMessage(chatId, "⚠️ Cet utilisateur est déjà validé.");
    }

    await pool.query("BEGIN");

    await pool.query(
      "INSERT INTO verified_users (telegram_id) VALUES ($1)",
      [telegram_id]
    );

    await pool.query(
      "DELETE FROM pending_verifications WHERE telegram_id = $1",
      [telegram_id]
    );

    await pool.query("COMMIT");

    await bot.sendMessage(chatId, `✅ Utilisateur ${telegram_id} validé.`);

    // Étape 1 : Message de félicitations avec bouton 🎯
    await bot.sendMessage(
      telegram_id,
      "🎉 Félicitations ! Tu as été validé ✅\nClique ci-dessous pour voir le pronostic du jour 👇",
      {
        reply_markup: {
          keyboard: [[{ text: "🎯 Pronostics du jour" }]],
          resize_keyboard: true,
        },
        parse_mode: "Markdown",
      }
    );

    // Étape 2 : Mise à jour du clavier après 🎯
    setTimeout(async () => {
      await bot.sendMessage(telegram_id, "\u200B", {
        reply_markup: {
          keyboard: [
            ["🏆 Mes Points"],
            ["🤝 Parrainage", "🆘 Assistance 🤖"],
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      });
    }, 3000); // délai de 3 secondes (facultatif, tu peux retirer le setTimeout si tu veux immédiat)

  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("❌ Erreur validation :", err);
    bot.sendMessage(chatId, "❌ Erreur lors de la validation.");
  }
}

  if (data.startsWith("admin_reject_step1_")) {
    const telegram_id = parseInt(data.split("_")[3], 10);

    const reasonKeyboard = REJECTION_REASONS.map((r) => [
      {
        text: r.label,
        callback_data: `admin_reject_reason_${telegram_id}_${r.id}`,
      },
    ]);

    return bot.sendMessage(chatId, `❌ Choisis une raison pour rejeter l'utilisateur ${telegram_id} :`, {
      reply_markup: { inline_keyboard: reasonKeyboard },
    });
  }

  const REJECTION_REASONS = [
  {
    id: "low_amount",
    label: "💸 Dépôt insuffisant",
    message:
      "❌ *Dépôt insuffisant.*\nLe minimum accepté est *5 € / 2000 FCFA*. Refais une demande avec un montant valide.",
    redirect: "retry",
  },
  {
    id: "invalid_id",
    label: "🆔 ID invalide",
    message:
      "❌ *ID de dépôt invalide.*\nAssure-toi d’envoyer un ID de 7 à 10 chiffres sans lettres.",
    redirect: "retry",
  },
  {
    id: "no_promo_code",
    label: "🎯 Code promo manquant",
    message:
      "❌ *Ton compte ne semble pas lié au code promo P999X.*\nCrée un nouveau compte avec le code *P999X* et fais un nouveau dépôt.",
    redirect: "retry",
  },
  {
    id: "other",
    label: "❓ Autre raison",
    message:
      "❌ *Ta demande a été rejetée.*\nContacte notre support pour plus d’informations.",
    redirect: "assistance",
  },
];


  if (data.startsWith("admin_reject_reason_")) {
    const parts = data.split("_");
    const telegram_id = parseInt(parts[3], 10);
    const reason_id = parts.slice(4).join("_");

    const reason = REJECTION_REASONS.find((r) => r.id === reason_id);
    if (!reason) {
      return bot.sendMessage(chatId, "❌ Raison de rejet inconnue.");
    }

    try {
      await pool.query(
        "DELETE FROM pending_verifications WHERE telegram_id = $1",
        [telegram_id]
      );

      await bot.sendMessage(telegram_id, reason.message, { parse_mode: "Markdown" });

      if (reason.redirect === "retry") {
        await bot.sendMessage(telegram_id, "\u200B", {
          reply_markup: {
            keyboard: [[{ text: "🔁 Recommencer" }]],
            resize_keyboard: true,
          },
        });
      }

      if (reason.redirect === "assistance") {
        await bot.sendMessage(telegram_id, "\u200B", {
          reply_markup: {
            keyboard: [[{ text: "🆘 Contacter l'assistance" }]],
            resize_keyboard: true,
          },
        });
      }

      await bot.sendMessage(chatId, `❌ L'utilisateur ${telegram_id} a été rejeté (${reason.label}).`);
    } catch (err) {
      console.error("❌ Erreur rejet :", err);
      bot.sendMessage(chatId, "❌ Erreur lors du rejet.");
    }
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim().toLowerCase();

  if (!text || text.startsWith("/")) return;

  // 🔁 Relance après rejet
  if (text === "🔁 recommencer") {
    userStates[chatId] = { step: "await_bookmaker" };

    return bot.sendMessage(chatId, "🔐 Pour accéder aux pronostics, quel bookmaker as-tu utilisé ?", {
      reply_markup: {
        keyboard: [
          ["1xbet", "888starz", "Linebet"],
          ["Melbet", "Betwinner", "Winwin"],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  // 🆘 Assistance
  if (text === "🆘 contacter l'assistance") {
    return bot.sendMessage(
      chatId,
      "📩 Contacte notre équipe ici : [@Support_1XBOOM](https://t.me/Support_1XBOOM)",
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );
  }


//////////////////////////////////////////////////////// ENVI AUTOMATIQUE DES COUPON DU JOUR \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\

bot.onText(/\/sendtestcoupon/, async (msg) => {
  const chatId = msg.chat.id;
  const isAdmin = chatId.toString() === process.env.ADMIN_CHAT_ID;

  if (!isAdmin) {
    return bot.sendMessage(chatId, "⛔️ Commande réservée à l'administrateur.");
  }

  const mockBets = [
    {
      name: 'Match Winner',
      values: [
        { value: 'Home', odd: '1.45' },
        { value: 'Draw', odd: '3.60' },
        { value: 'Away', odd: '6.00' }
      ]
    },
    {
      name: 'Double Chance',
      values: [
        { value: '1X', odd: '1.20' },
        { value: '12', odd: '1.30' },
        { value: 'X2', odd: '2.10' }
      ]
    },
    {
      name: 'Over/Under',
      values: [
        { value: 'Over 2.5', odd: '1.85' },
        { value: 'Under 2.5', odd: '1.90' }
      ]
    },
    {
      name: 'Both Teams Score',
      values: [
        { value: 'Yes', odd: '1.75' },
        { value: 'No', odd: '2.00' }
      ]
    }
  ];

  const tips = [];
  const winTip = getSafestBet(mockBets, 'Match Winner');
  if (winTip) tips.push(`🏆 1X2 : ${winTip.value} (${winTip.odd}) ${winTip.confidence}`);

  const dcTip = getSafestBet(mockBets, 'Double Chance');
  if (dcTip) tips.push(`🔀 Double Chance : ${dcTip.value} (${dcTip.odd}) ${dcTip.confidence}`);

  const overTip = getTargetedBet(mockBets, 'Over/Under', 'Over 2.5');
  if (overTip) tips.push(`🎯 Over 2.5 : ${overTip.odd} ${overTip.confidence}`);

  const bttsTip = getTargetedBet(mockBets, 'Both Teams Score', 'Yes');
  if (bttsTip) tips.push(`🤝 BTTS Oui : ${bttsTip.odd} ${bttsTip.confidence}`);

  const message = formatMatchTips({
    leagueName: 'Ligue 1 🇫🇷',
    home: 'PSG',
    away: 'OM',
    hour: '20:00',
    tips
  });

  try {
    const { rows } = await pool.query('SELECT telegram_id FROM verified_users');
    for (const row of rows) {
      await bot.sendMessage(row.telegram_id, message, { parse_mode: 'Markdown' });
    }
    await bot.sendMessage(chatId, `✅ Coupon test envoyé à ${rows.length} utilisateurs vérifiés.`);
  } catch (err) {
    console.error('❌ Erreur envoi test coupon :', err.message);
    await bot.sendMessage(chatId, "❌ Une erreur est survenue.");
  }
});





// FONCTION ADMIN/AJOUTE-prono
const ADMIN_ID = 6248838967;
let pendingCoupon = {};
/////////////////////////////////////// ✅ VOIRE LES VÉRIFICATIONS EN ATTENTE ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
//=== COMMANDE /ajouter_prono ===

bot.onText(/\/ajouter_prono/, (msg) => {
  const chatId = msg.chat.id;
  if (chatId !== ADMIN_ID)
    return bot.sendMessage(chatId, "🚫 Commande réservée à l’admin.");

  pendingCoupon[chatId] = { step: "awaiting_date" };
  bot.sendMessage(
    chatId,
    "📅 Pour quelle date est ce prono ?\nEx: 2025-06-06 ou tape /today"
  );
});

// Commande /today
bot.onText(/\/today/, (msg) => {
  const chatId = msg.chat.id;
  if (!pendingCoupon[chatId] || pendingCoupon[chatId].step !== "awaiting_date")
    return;

  const today = new Date().toISOString().slice(0, 10);
  pendingCoupon[chatId].date = today;
  pendingCoupon[chatId].step = "awaiting_content";
  bot.sendMessage(chatId, "📝 Envoie maintenant le texte du prono.");
});

// Commande /skip pour ignorer l'ajout de média
bot.onText(/\/skip/, async (msg) => {
  const chatId = msg.chat.id;
  const state = pendingCoupon[chatId];
  if (!state || state.step !== "awaiting_media") return;

  await insertManualCoupon(state.content, null, null, state.date);
  delete pendingCoupon[chatId];
  bot.sendMessage(chatId, "✅ Prono sans média enregistré.");
});

// Gestion des messages (date, contenu, média)
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const state = pendingCoupon[chatId];
  if (!state || msg.text?.startsWith("/")) return;

  // Étape : date manuelle
  if (state.step === "awaiting_date" && /^\d{4}-\d{2}-\d{2}$/.test(msg.text)) {
    const inputDate = new Date(msg.text);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (inputDate < today) {
      return bot.sendMessage(
        chatId,
        "❌ La date ne peut pas être dans le passé. Réessaie."
      );
    }

    state.date = msg.text;
    state.step = "awaiting_content";
    return bot.sendMessage(chatId, "📝 Envoie maintenant le texte du prono.");
  }

  // Étape : contenu
  if (state.step === "awaiting_content" && msg.text) {
    state.content = msg.text;
    state.step = "awaiting_confirmation";

    const recap = `📝 *Récapitulatif du prono:*\n📅 Date: *${state.date}*\n✍️ Contenu: *${state.content}*\n\nSouhaites-tu continuer ?`;
    return bot.sendMessage(chatId, recap, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Confirmer", callback_data: "confirm_prono" }],
          [{ text: "❌ Annuler", callback_data: "cancel_prono" }],
        ],
      },
    });
  }

  // Étape : ajout du média
  if (state.step === "awaiting_media") {
    if (msg.photo) {
      const fileId = msg.photo.at(-1).file_id;
      const fileUrl = await bot.getFileLink(fileId);
      await insertManualCoupon(state.content, fileUrl, "photo", state.date);
      delete pendingCoupon[chatId];
      return bot.sendMessage(chatId, "✅ Prono avec photo enregistré.");
    }

    if (msg.video) {
      const fileId = msg.video.file_id;
      const fileUrl = await bot.getFileLink(fileId);
      await insertManualCoupon(state.content, fileUrl, "video", state.date);
      delete pendingCoupon[chatId];
      return bot.sendMessage(chatId, "✅ Prono avec vidéo enregistré.");
    }

    return bot.sendMessage(
      chatId,
      "❌ Envoie une *photo*, une *vidéo* ou tape /skip.",
      { parse_mode: "Markdown" }
    );
  }
});

// Callback pour confirmer ou annuler
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const state = pendingCoupon[chatId];
  if (!state) return bot.answerCallbackQuery(query.id);

  if (query.data === "confirm_prono") {
    state.step = "awaiting_media";
    await bot.sendMessage(
      chatId,
      "📎 Tu peux maintenant envoyer une *photo* ou une *vidéo* pour ce prono.\nSinon tape /skip.",
      {
        parse_mode: "Markdown",
      }
    );
  }

  if (query.data === "cancel_prono") {
    delete pendingCoupon[chatId];
    await bot.sendMessage(chatId, "❌ Ajout du prono annulé.");
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
const { Client } = require("pg");
const dayjs = require("dayjs");

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

// ====== AUTRES COMMANDES/LOGIQUE ICI =======
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "🤖 Bot démarré et prêt.");
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


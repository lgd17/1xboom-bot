require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const { t } = require('./lang');
const cron = require('node-cron');
const schedule = require('node-schedule');
const { Pool } = require('pg');
const { generateCoupon } = require('./coupon-api');
const { pool, insertManualCoupon } = require('./db');
const setupAutoSender = require('./autosender');

// ====== SERVEUR EXPRESS POUR TELEGRAM ======
const app = express();
app.use(bodyParser.json());

// ====== CONFIGURATION ======
const port = process.env.PORT || 3000;
const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = process.env.TELEGRAM_ADMIN_ID;
const channelId = process.env.TELEGRAM_CHANNEL_ID;
const baseUrl = process.env.BASE_URL; // exemple : https://1xboom.onrender.com

// ====== BASE DE DONNÉES ======


// ====== BOUTON / SUIVI ÉTATS UTILISATEURS ======
const userStates = {};
const ADMIN_IDS = [6248838967];
const fixedDeletionConfirmations = new Map();
const editFixedStates = {};
const userLang = {};
const fixedAddStates = {};
const fixedEditStates = {};
const editStates = {};

// ====== BOT EN MODE WEBHOOK ======
const bot = new TelegramBot(token, { webHook: true });

bot.setWebHook(`${baseUrl}/bot${token}`)
  .then(() => console.log(`✅ Webhook Telegram configuré : ${baseUrl}/bot${token}`))
  .catch(err => console.error('❌ Erreur Webhook :', err));

// ====== ENVOI AUTO DES MESSAGES FIXES ======



// Réception des messages Telegram via Webhook
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Page test pour Render
app.get('/', (req, res) => res.send('✅ Bot is alive (webhook mode)'));

// Lancement serveur
app.listen(port, () => {
  console.log(`🚀 Serveur lancé sur le port ${port}`);
});







 ////////////////////////////////////////////// ✅ MENU PRINCIPAL ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
                                          //=== COMMANDE / start ===


bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const menu = {
    reply_markup: {
      keyboard: [
        ['🎯 Pronostics du jour', '🏆 Mes Points'],
        ['🤝 Parrainage', '🆘 Assistance 🤖']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };

  bot.sendMessage(chatId, `👋 Bienvenue sur *1XBOOM* !

Choisis une option ci-dessous 👇`, {
    parse_mode: 'Markdown',
    ...menu
  });
});

                                        /// ✅ Bouton "Parrainage" \\\

// Vérifie si le filleul est abonné au canal
async function isUserInChannel(userId, channelUsername) {
  try {
    const member = await bot.getChatMember(channelUsername, userId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (err) {
    console.error("Erreur vérif canal:", err);
    return false;
  }
}

// /start avec gestion du lien de parrainage + bonus canal
bot.onText(/\/start(?:\s(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referralId = match[1]; // ID du parrain si présent
  const telegramId = msg.from.id;
  const username = msg.from.username || null;
  const firstname = msg.from.first_name || null;

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);

    if (rows.length === 0) {
      // Insertion SANS id (autogénéré)
      await pool.query(
        'INSERT INTO users (telegram_id, username, firstname, referral_id, points) VALUES ($1, $2, $3, $4, $5)',
        [telegramId, username, firstname, referralId || null, 0]
      );

      // Ajouter +5 points si parrain
      if (referralId) {
        await pool.query('UPDATE users SET points = points + 5 WHERE telegram_id = $1', [referralId]);
        await bot.sendMessage(referralId, `🎉 Une personne s’est inscrite via ton lien ! +5 points 🙌`);

        // Vérifie si le filleul est abonné au canal
        const isSubscribed = await isUserInChannel(telegramId, '@linktree_free_prediction');
        if (isSubscribed) {
          await pool.query('UPDATE users SET points = points + 10 WHERE telegram_id = $1', [referralId]);
          await bot.sendMessage(referralId, `📢 Ton filleul a rejoint le canal ! +10 points 🔥`);
        }
      }
    }

    // Pas de message de bienvenue
  } catch (err) {
    console.error("Erreur lors du /start :", err);
    bot.sendMessage(chatId, "❌ Une erreur est survenue.");
  }
});

// Menu Parrainage
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '🤝 Parrainage') {
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

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });



                                        /// ✅ BOUTON "Mes Points" \\\

   } else if (text === '🏆 Mes Points') {
    const res = await pool.query('SELECT points FROM users WHERE telegram_id = $1', [chatId]);
    const points = res.rows[0]?.points || 0;

    let motivation = '';
    if (points >= 100) {
      motivation = "🚀 *Incroyable ! Tu es dans la cour des grands.*";
    } else if (points >= 50) {
      motivation = "🔥 *Très bon score !* Continue !";
    } else if (points >= 20) {
      motivation = "👍 *Bien joué !* Tu montes dans le classement.";
    } else {
      motivation = "💡 Gagne des points en parrainant. Clique sur '🤝 Parrainage'";
    }

    bot.sendMessage(chatId, `⭐️ *Tes points :* ${points} points\n\n${motivation}`, {
  parse_mode: 'Markdown'
});



                                         /// ✅ BOUTON "Menu Assistance"\\\

} else if (text === '🆘 Assistance 🤖') {
    bot.sendMessage(chatId, "🤖 Choisis une option :", {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎯 Pronostics du jour', callback_data: 'pronostics' }],
          [{ text: '🏆 Mes Points', callback_data: 'points' }],
          [{ text: '🤝 Parrainage', callback_data: 'parrainage' }],
          [{ text: '🆘 Assistance', callback_data: 'assistance' }]
        ]
      }
    });
  }
});
// TEXTES D’ASSISTANCE
const assistanceTexts = {
  pronostics: `🎯 *Pronostics du jour*\n\nTu veux accéder à nos *coupons exclusifs du jour* ? Voici comment faire 👇

1️⃣ *Inscris-toi sur un bookmaker* de ton choix (1xbet, Melbet, Linebet, etc.) avec le *code promo : P999X*.

2️⃣ *Effectue un dépôt minimum* de *2000 FCFA* ou *5 $* ou plus sur ton compte.

3️⃣ Ensuite, clique sur *"🎯 Pronostics du jour"*. Le bot te demandera :
   - Le *bookmaker* utilisé,
   - Ton *identifiant de ton compte🆔 *,
   - Le *montant du dépôt*.

🛂 Une fois tes infos vérifiées, tu seras ajouté à la liste des membres vérifiés ✅ et tu pourras consulter les pronostics chaque jour, automatiquement.

💡 Ce système nous permet de partager les meilleurs coupons uniquement avec les vrais joueurs.

*Merci pour ta confiance et bonne chance 🍀 !*`,

  points: `🏆 *Mes Points*\n\nConsulte ton solde de points grâce au parrainage et ta fidélité.
Plus tu invites, plus tu gagnes !`,

  parrainage: `🤝 *Parrainage*\n\nInvite tes amis à rejoindre le canal et le bot. Tu gagnes des points quand ils s’abonnent ou s’inscrivent via ton lien.`,

  assistance: `🆘 *Besoin d’aide ?*\n\nNous sommes là pour toi 👇

📨 *Contact direct* : @Catkatii

🕘 *Assistance disponible :
Lundi - Samedi : 8h à 22h  
Dimanche : 10h à 18h*

✍️ Tu peux poser ta question à tout moment. On te répondra dès que possible !

Merci pour ta confiance 💙`
};


// GESTION DES BOUTONS INLINE (callback_query)
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;

  try {
    // ✅ Répondre rapidement à Telegram AVANT tout
    await bot.answerCallbackQuery(callbackQuery.id);

    if (assistanceTexts[data]) {
      await bot.sendMessage(msg.chat.id, assistanceTexts[data], {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Retour', callback_data: 'menu_assistance' }]
          ]
        }
      });
    } else if (data === 'menu_assistance') {
      await bot.sendMessage(msg.chat.id, "🤖 Choisis une option :", {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎯 Pronostics du jour', callback_data: 'pronostics' }],
            [{ text: '🏆 Mes Points', callback_data: 'points' }],
            [{ text: '🤝 Parrainage', callback_data: 'parrainage' }],
            [{ text: '🆘 Assistance', callback_data: 'assistance' }]
          ]
        }
      });
    } else {
      // ✅ Silencieux pour l'utilisateur, mais logué pour toi
      console.warn("⚠️ Option inconnue callback (assistance):", data);
      // Tu peux aussi ignorer totalement cette partie si tu veux
    }

  } catch (err) {
    console.error("❌ Erreur dans callback_query assistance:", err);
  }
});

                                        /// BOUTON "🎯 Pronostics du jour"\\\

bot.onText(/🎯 Pronostics du jour/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const res = await pool.query('SELECT * FROM verified_users WHERE telegram_id = $1', [chatId]);

    if (res.rows.length > 0) {
      // ✅ Utilisateur vérifié → afficher le coupon
      bot.sendMessage(chatId, "<b>🟢          Voici le pronostic du jour         🟢</b>\n\n🔰      🔰      🔰      🔰      🔰      🔰       🔰", { parse_mode: 'HTML' });
    } else {
      // 🔐 Lancer la vérification
      userStates[chatId] = {}; // Initialise l’état de l’utilisateur
      bot.sendMessage(chatId, "🔐 Pour accéder aux pronostics, merci de compléter ces infos.\n\nQuel bookmaker as-tu utilisé ?", {
        reply_markup: {
          inline_keyboard: [
            ['1xbet', '888starz', 'Linebet'].map(b => ({ text: b, callback_data: `bookmaker_${b}` })),
            ['Winwin', 'Melbet', 'Betwinner'].map(b => ({ text: b, callback_data: `bookmaker_${b}` }))
          ]
        }
      });
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Une erreur est survenue. Réessaie plus tard.");
  }
});

// Étape 2 : Callback - choix du bookmaker
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('bookmaker_')) {
    const bookmaker = data.replace('bookmaker_', '');
    if (!userStates[chatId]) userStates[chatId] = {};
    userStates[chatId].bookmaker = bookmaker;

    bot.sendMessage(chatId, "🆔 Quel est l'identifiant de ton compte?");
  }

  bot.answerCallbackQuery(query.id);
});

// Étapes 3 & 4 : ID de dépôt et montant
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = userStates[chatId];

  if (!state) return;

  // Étape 1 : ID de dépôt
  if (state.bookmaker && !state.deposit_id) {
    const depositId = text;

    if (!/^\d{7,10}$/.test(depositId)) {
      return bot.sendMessage(chatId, "❌ *ID invalide.*\nEnvoie un numéro de dépôt de *7 à 10 chiffres* sans lettres.\n\n*Exemple :* `789456123`", { parse_mode: 'Markdown' });
    }

    const { rows } = await pool.query(
      'SELECT 1 FROM pending_verifications WHERE deposit_id = $1',
      [depositId]
    );
    if (rows.length > 0) {
      return bot.sendMessage(chatId, "⚠️ *Cet ID de dépôt est déjà en cours de vérification.*\n\nSi tu penses qu'il y a une erreur, contacte *l’assistance*.", { parse_mode: 'Markdown' });
    }

    userStates[chatId].deposit_id = depositId;
    return bot.sendMessage(chatId, "💵 *Quel montant as-tu déposé ?*\n\n_Exemples :_ `25000 FCFA`, `25€`, `15000 Naira`", { parse_mode: 'Markdown' });
  }

  // Étape 2 : Montant
  if (state.deposit_id && !state.amount) {
    const amountMatch = text.match(/(\d+(?:[.,]\d+)?)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : NaN;

    if (isNaN(amount)) {
      return bot.sendMessage(chatId, "❌ *Montant invalide.*\n\nEnvoie un chiffre valide, comme : `25000 FCFA`, `25€`, `15000`.", { parse_mode: 'Markdown' });
    }

    if (amount < 5) {
      return bot.sendMessage(chatId, "⚠️ *Montant trop faible.*\n\nLe dépôt minimum accepté est *5 €*.", { parse_mode: 'Markdown' });
    }

    if (amount > 10000) {
      return bot.sendMessage(chatId, "⚠️ *Montant trop élevé.*\n\nLe dépôt maximum accepté est *10 000 €*.", { parse_mode: 'Markdown' });
    }

    userStates[chatId].amount = amount;

    try {
      await pool.query(`
        INSERT INTO pending_verifications (telegram_id, bookmaker, deposit_id, amount)
        VALUES ($1, $2, $3, $4)
      `, [chatId, state.bookmaker, state.deposit_id, amount]);

      bot.sendMessage(chatId, "✅ *Merci !*\n\nTes informations ont été enregistrées. Tu recevras une réponse après vérification. 🔎", { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, "❌ *Erreur lors de l'enregistrement.*\n\nRéessaie plus tard ou contacte l'assistance.", { parse_mode: 'Markdown' });
    }

    delete userStates[chatId];
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
      const nom = row.username ? `@${row.username}` : row.firstname || 'Anonyme';
      message += `🥇 *${index + 1}. ${nom}* — ${row.filleuls} filleul(s), ${row.points} pts\n`;
    });

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error("Erreur /topparrains :", error);
    bot.sendMessage(chatId, "❌ Impossible d'afficher le classement.");
  }
});

const CHANNEL_ID = '@linktree_free_prediction'; 

schedule.scheduleJob('0 18 * * 0', async () => {
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
      const nom = row.username ? `@${row.username}` : row.firstname || 'Anonyme';
      message += `🏅 *${index + 1}. ${nom}* — ${row.filleuls} filleul(s), ${row.points} pts\n`;
    });

    bot.sendMessage(CHANNEL_ID, message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error("Erreur classement auto :", error);
  }
});



// 🔁 Réinitialiser les points tous les 1er du mois à 00h05



const TELEGRAM_CHANNEL_ID = '@linktree_free_prediction'; // remplace par ton canal

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
      await bot.sendMessage(TELEGRAM_CHANNEL_ID, "Aucun parrain n’a encore de points ce mois-ci.");
      return;
    }

    let message = "🏆 *Classement des 5 meilleurs parrains du mois :*\n\n";
    const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

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
    await bot.sendMessage(TELEGRAM_CHANNEL_ID, message, { parse_mode: 'Markdown' });

    // 🔹 Remise à zéro
    await pool.query('UPDATE users SET points = 0');
    console.log('✅ Points remis à zéro');

  } catch (err) {
    console.error('❌ Erreur dans publierClassementEtReset :', err);
  }
}

// ✅ Tâche planifiée le 1er de chaque mois à 00h00
schedule.scheduleJob('0 0 1 * *', () => {
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
  if (userId !== 6248838967) return bot.sendMessage(chatId, '❌ Commande réservée à l’admin.');

  bot.sendMessage(channelId, '🔥 Ceci est un message du bot envoyé dans le canal !');
  bot.sendMessage(chatId, '✅ Message envoyé au canal.');
});

  // Testemessage
bot.onText(/\/testmessage/, async (msg) => {
  const chatId = msg.chat.id;
  const ADMIN_ID = 6248838967; // Remplace par ton vrai ID Telegram

  if (msg.from.id !== ADMIN_ID) {
    return bot.sendMessage(chatId, '⛔️ Accès refusé.');
  }

  try {
    const { rows } = await pool.query(`
      SELECT * FROM messages_auto
      WHERE DATE(send_date) = CURRENT_DATE AND sent_today = false
    `);

    if (rows.length === 0) {
      await bot.sendMessage(chatId, '❌ Aucun message disponible pour aujourd’hui.');
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
    console.error('❌ Erreur test message :', error.message);
    await bot.sendMessage(chatId, '❌ Une erreur est survenue.');
  }
});

 // Fonctin table
async function envoyerMessageComplet(bot, chatId, message) {
  const caption = message.media_text ? `${message.media_text}\n\n${message.contenu}` : message.contenu;

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

// VÉRIFICATION_USER-INSCRIT 
const bookmakers = ['1xBet', 'Bet365', 'ParionsSport'];

bot.onText(/📌 Pronostic du jour/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  const verified = await db.query(
    `SELECT 1 FROM verified_users WHERE telegram_id = $1`,
    [userId]
  );

  if (verified.rows.length > 0) {
    // ✅ Envoyer le pronostic automatique
    const pronostic = await getTodayPronostic(); // fonction à créer
    return bot.sendMessage(chatId, `🎯 *Pronostic du jour* :\n\n${pronostic}`, { parse_mode: 'Markdown' });
  }

  // ❌ Non vérifié → début du mini dialogue
  bot.sendMessage(chatId, "🚫 Tu n’es pas encore validé. Choisis ton bookmaker :", {
    reply_markup: {
      keyboard: bookmakers.map(b => [{ text: b }]),
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });

  bot.once('message', async (msg2) => {
    const bookmaker = msg2.text;

    bot.sendMessage(chatId, "🆔 Envoie ton Identifiants");

    bot.once('message', async (msg3) => {
      const depotId = msg3.text.trim();

      if (!/^\d{7,10}$/.test(depotId)) {
        return bot.sendMessage(chatId, "❌ 🆔 Identifiant de votre compte invalide. Il doit contenir entre 7 et 10 chiffres. Réessaye en recommençant.");
      }

      bot.sendMessage(chatId, "💸 Montant déposé (€) :");

      const askAmount = () => {
        bot.once('message', async (msg4) => {
          const amount = parseFloat(msg4.text.replace(",", "."));

          if (isNaN(amount)) {
            await bot.sendMessage(chatId, "❌ Ce n'est pas un nombre valide. Réessaye :");
            return askAmount();
          }

          if (amount < 5) {
            await bot.sendMessage(chatId, "❌ Le montant doit être au minimum de 5€.");
            return askAmount();
          }

          if (amount > 10000) {
            await bot.sendMessage(chatId, "❌ Le montant ne peut pas dépasser 10000€.");
            return askAmount();
          }

          // ✅ Enregistrement en base
          await db.query(`
            INSERT INTO pending_verifications (telegram_id, bookmaker, depot_id, amount)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (telegram_id) DO UPDATE
            SET bookmaker = EXCLUDED.bookmaker,
                depot_id = EXCLUDED.depot_id,
                amount = EXCLUDED.amount
          `, [userId, bookmaker, depotId, amount]);

          bot.sendMessage(chatId, "✅ Merci ! Ton compte est en attente de validation. Tu seras notifié dès que tu seras validé.");
        });
      };

      askAmount();
    });
  });
});




 /////////////////////////////////////// ✅ VOIRE LES VÉRIFICATIONS EN ATTENTE ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
                                          //=== COMMANDE /admin ====
    


bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) {
    return bot.sendMessage(chatId, "⛔️ Accès refusé.");
  }

  try {
    const res = await pool.query('SELECT * FROM pending_verifications');
    if (res.rows.length === 0) {
      return bot.sendMessage(chatId, "✅ Aucun utilisateur en attente.");
    }

    for (const user of res.rows) {
      const message = `🕵️ Vérification en attente:\n\n👤 ID: ${user.telegram_id}\n📱 Bookmaker: ${user.bookmaker}\n🆔 Dépôt: ${user.deposit_id}\n💰 Montant: ${user.amount} €`;

      bot.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Valider', callback_data: `admin_validate_${user.telegram_id}` },
              { text: '❌ Rejeter', callback_data: `admin_reject_${user.telegram_id}` }
            ]
          ]
        }
      });
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Erreur lors de la récupération des vérifications.");
  }
});

 // Gérer les boutons "Valider" / "Rejeter"
const menu = {
  reply_markup: {
    keyboard: [
      ['🎯 Pronostics du jour', '🏆 Mes Points'],
      ['🤝 Parrainage', '🆘 Assistance 🤖']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith('admin_validate_') || data.startsWith('admin_reject_')) {
    if (!ADMIN_IDS.includes(chatId)) {
      return bot.answerCallbackQuery(query.id, { text: "⛔️ Accès refusé." });
    }

    const telegram_id = parseInt(data.split('_')[2], 10);

    if (data.startsWith('admin_validate_')) {
      try {
        await pool.query('BEGIN');
        await pool.query('INSERT INTO verified_users (telegram_id) VALUES ($1)', [telegram_id]);
        await pool.query('DELETE FROM pending_verifications WHERE telegram_id = $1', [telegram_id]);
        await pool.query('COMMIT');

        bot.sendMessage(chatId, `✅ Utilisateur ${telegram_id} validé.`);

        await bot.sendMessage(telegram_id, "🎉 Félicitations ! Tu as été validé ✅\nClique ci-dessous pour voir le pronostic du jour 👇", {
          reply_markup: {
            keyboard: [[{ text: '🎯 Pronostics du jour' }]],
            resize_keyboard: true
          }
        });
      } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        bot.sendMessage(chatId, "❌ Erreur lors de la validation.");
      }
    }

    if (data.startsWith('admin_reject_')) {
      try {
        await pool.query('DELETE FROM pending_verifications WHERE telegram_id = $1', [telegram_id]);
        bot.sendMessage(chatId, `❌ Utilisateur ${telegram_id} rejeté.`);
        bot.sendMessage(telegram_id, "❌ Désolé, ta demande de vérification a été rejetée. Contacte le support pour plus d’infos.");
      } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "❌ Erreur lors du rejet.");
      }
    }

    return bot.answerCallbackQuery(query.id);
  }
});

// ✅ Ajout : gestion du bouton "🎯 Pronostics du jour"
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '🎯 Pronostics du jour') {
    // Affiche ensuite le menu complet avec le texte en gras
    await bot.sendMessage(chatId, "🔥 *CODE PROMO: P999X *🔥", {
      parse_mode: 'Markdown',
      ...menu
    });
  }
});




 /////////////////////////////////////// ✅ GENRE LES COUPONS AUTOMATIQUES ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
                                          //=== API Express : route /generate-coupon ===


bot.onText(/🎯 Pronostics du jour/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const res = await pool.query('SELECT * FROM verified_users WHERE telegram_id = $1', [chatId]);
    if (res.rows.length === 0) {
      return bot.sendMessage(chatId, "🔒 Tu dois être validé pour voir les pronostics.");
    }

    let result = await pool.query('SELECT * FROM daily_pronos WHERE date = CURRENT_DATE');

    if (result.rows.length === 0) {
      // Génération directe via la fonction importée
      const data = generateCoupon();

      if (!data || !data.content) {
        return bot.sendMessage(chatId, "❌ Erreur : le coupon généré est invalide.");
      }

      if (data.source === 'api') {
        await pool.query(`
          INSERT INTO daily_pronos (content, media_url, media_type)
          VALUES ($1, $2, $3)
        `, [data.content, data.media_url || null, data.media_type || null]);
      }

      result = { rows: [data] };
    }

    const prono = result.rows[0];

    if (prono.media_type === 'photo' && prono.media_url) {
      await bot.sendPhoto(chatId, prono.media_url, { caption: prono.content });
    } else if (prono.media_type === 'video' && prono.media_url) {
      await bot.sendVideo(chatId, prono.media_url, { caption: prono.content });
    } else {
      await bot.sendMessage(chatId, prono.content);
    }

  } catch (err) {
    console.error("❌ Erreur générale :", err);
    bot.sendMessage(chatId, "❌ Une erreur est survenue.");
  }
});




/////////////////// ✅ Supprimer les pronos API de plus de 3 jours tous les jours à 2h du matin ✅\\\\\\\\\\\\\\\\\\\\\\


schedule.scheduleJob('0 2 * * *', async () => {
  try {
    const { rowCount } = await pool.query(`
      DELETE FROM daily_pronos
      WHERE created_at < NOW() - INTERVAL '1 days'
      AND content ILIKE '%api%'
    `);

    console.log(`🧹 ${rowCount} prono(s) API supprimé(s) automatiquement.`);
  } catch (err) {
    console.error("❌ Erreur lors du nettoyage des pronos :", err);
  }
});






// FONCTION ADMIN/AJOUTE-prono
const ADMIN_ID = 6248838967;
let pendingCoupon = {};
/////////////////////////////////////// ✅ VOIRE LES VÉRIFICATIONS EN ATTENTE ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
                                          //=== COMMANDE /ajouter_prono ===



bot.onText(/\/ajouter_prono/, (msg) => {
  const chatId = msg.chat.id;
  if (chatId !== ADMIN_ID) return bot.sendMessage(chatId, "🚫 Commande réservée à l’admin.");

  pendingCoupon[chatId] = { step: 'awaiting_date' };
  bot.sendMessage(chatId, "📅 Pour quelle date est ce prono ?\nEx: 2025-06-06 ou tape /today");
});

// Commande /today
bot.onText(/\/today/, (msg) => {
  const chatId = msg.chat.id;
  if (!pendingCoupon[chatId] || pendingCoupon[chatId].step !== 'awaiting_date') return;

  const today = new Date().toISOString().slice(0, 10);
  pendingCoupon[chatId].date = today;
  pendingCoupon[chatId].step = 'awaiting_content';
  bot.sendMessage(chatId, "📝 Envoie maintenant le texte du prono.");
});

// Commande /skip pour ignorer l'ajout de média
bot.onText(/\/skip/, async (msg) => {
  const chatId = msg.chat.id;
  const state = pendingCoupon[chatId];
  if (!state || state.step !== 'awaiting_media') return;

  await insertManualCoupon(state.content, null, null, state.date);
  delete pendingCoupon[chatId];
  bot.sendMessage(chatId, "✅ Prono sans média enregistré.");
});

// Gestion des messages (date, contenu, média)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const state = pendingCoupon[chatId];
  if (!state || msg.text?.startsWith("/")) return;

  // Étape : date manuelle
  if (state.step === 'awaiting_date' && /^\d{4}-\d{2}-\d{2}$/.test(msg.text)) {
    const inputDate = new Date(msg.text);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (inputDate < today) {
      return bot.sendMessage(chatId, "❌ La date ne peut pas être dans le passé. Réessaie.");
    }

    state.date = msg.text;
    state.step = 'awaiting_content';
    return bot.sendMessage(chatId, "📝 Envoie maintenant le texte du prono.");
  }

  // Étape : contenu
  if (state.step === 'awaiting_content' && msg.text) {
    state.content = msg.text;
    state.step = 'awaiting_confirmation';

    const recap = `📝 *Récapitulatif du prono:*\n📅 Date: *${state.date}*\n✍️ Contenu: *${state.content}*\n\nSouhaites-tu continuer ?`;
    return bot.sendMessage(chatId, recap, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Confirmer", callback_data: "confirm_prono" }],
          [{ text: "❌ Annuler", callback_data: "cancel_prono" }]
        ]
      }
    });
  }

  // Étape : ajout du média
  if (state.step === 'awaiting_media') {
    if (msg.photo) {
      const fileId = msg.photo.at(-1).file_id;
      const fileUrl = await bot.getFileLink(fileId);
      await insertManualCoupon(state.content, fileUrl, 'photo', state.date);
      delete pendingCoupon[chatId];
      return bot.sendMessage(chatId, "✅ Prono avec photo enregistré.");
    }

    if (msg.video) {
      const fileId = msg.video.file_id;
      const fileUrl = await bot.getFileLink(fileId);
      await insertManualCoupon(state.content, fileUrl, 'video', state.date);
      delete pendingCoupon[chatId];
      return bot.sendMessage(chatId, "✅ Prono avec vidéo enregistré.");
    }

    return bot.sendMessage(chatId, "❌ Envoie une *photo*, une *vidéo* ou tape /skip.", { parse_mode: "Markdown" });
  }
});

// Callback pour confirmer ou annuler
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const state = pendingCoupon[chatId];
  if (!state) return bot.answerCallbackQuery(query.id);

  if (query.data === 'confirm_prono') {
    state.step = 'awaiting_media';
    await bot.sendMessage(chatId, "📎 Tu peux maintenant envoyer une *photo* ou une *vidéo* pour ce prono.\nSinon tape /skip.", {
      parse_mode: "Markdown"
    });
  }

  if (query.data === 'cancel_prono') {
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

  if (!ADMIN_IDS.includes(userId)) return bot.sendMessage(chatId, "⛔ Accès réservé aux admins.");

  try {
    const { rows } = await pool.query('SELECT * FROM daily_pronos ORDER BY id DESC LIMIT 5');
    if (rows.length === 0) return bot.sendMessage(chatId, "Aucun prono trouvé.");

    for (const row of rows) {
      const caption = `🆔 ${row.id}\n📅 ${row.date}\n📝 ${row.content}`;

      const keyboard = {
        inline_keyboard: [[
          { text: '✏️ Modifier', callback_data: `edit_${row.id}` },
          { text: '🗑️ Supprimer', callback_data: `delete_${row.id}` }
        ], [
          { text: '🚀 Publier maintenant', callback_data: `postnow_${row.id}` },
          { text: '🧪 Tester', callback_data: `test_${row.id}` }
        ]]
      };

      if (row.media_url && row.media_type === 'photo') {
        await bot.sendPhoto(chatId, row.media_url, { caption, reply_markup: keyboard });
      } else if (row.media_url && row.media_type === 'video') {
        await bot.sendVideo(chatId, row.media_url, { caption, reply_markup: keyboard });
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
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  const msgId = query.message.message_id;

  if (!ADMIN_IDS.includes(userId)) {
    return bot.answerCallbackQuery(query.id, { text: "⛔ Accès refusé." });
  }

  try {
    if (data.startsWith('delete_')) {
      const id = data.split('_')[1];
      await bot.editMessageReplyMarkup({
        inline_keyboard: [[
          { text: '✅ Confirmer', callback_data: `confirmdelete_${id}` },
          { text: '❌ Annuler', callback_data: `cancel` }
        ]]
      }, { chat_id: chatId, message_id: msgId });
      return;
    }

    if (data.startsWith('confirmdelete_')) {
      const id = data.split('_')[1];
      await pool.query('DELETE FROM daily_pronos WHERE id = $1', [id]);
      await bot.editMessageText(`✅ Prono ${id} supprimé.`, { chat_id: chatId, message_id: msgId });
      return;
    }

    if (data === 'cancel') {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId });
      return;
    }

    if (data.startsWith('edit_')) {
      const id = data.split('_')[1];
      editStates[chatId] = { step: 'editing', pronoId: id };
      await bot.sendMessage(chatId, `✍️ Envoie le nouveau texte pour le prono ID ${id}, ou tape /cancel pour annuler.`);
      return;
    }

    if (data.startsWith('test_')) {
      const id = data.split('_')[1];
      const { rows } = await pool.query('SELECT * FROM daily_pronos WHERE id = $1', [id]);
      const prono = rows[0];
      if (!prono) return;

      const caption = `🆔 ${prono.id}\n📅 ${prono.date}\n📝 ${prono.content}`;
      if (prono.media_url && prono.media_type === 'photo') {
        await bot.sendPhoto(chatId, prono.media_url, { caption });
      } else if (prono.media_url && prono.media_type === 'video') {
        await bot.sendVideo(chatId, prono.media_url, { caption });
      } else {
        await bot.sendMessage(chatId, caption);
      }
      return;
    }

    if (data.startsWith('postnow_')) {
      const id = data.split('_')[1];
      const { rows } = await pool.query('SELECT * FROM daily_pronos WHERE id = $1', [id]);
      const prono = rows[0];
      if (!prono) return;

      const caption = `📢 PRONOSTIC DU JOUR\n\n🆔 ${prono.id}\n📅 ${prono.date}\n📝 ${prono.content}`;
      if (prono.media_url && prono.media_type === 'photo') {
        await bot.sendPhoto(CANAL_ID, prono.media_url, { caption });
      } else if (prono.media_url && prono.media_type === 'video') {
        await bot.sendVideo(CANAL_ID, prono.media_url, { caption });
      } else {
        await bot.sendMessage(CANAL_ID, caption);
      }
      await bot.sendMessage(chatId, `✅ Prono ${id} publié dans le canal.`);
      return;
    }

    if (data === 'confirm_prono') {
      if (pendingCoupon[chatId]) {
        pendingCoupon[chatId].step = 'awaiting_media';
        await bot.sendMessage(chatId, "📎 Envoie une *photo* ou *vidéo* ou tape /skip.", { parse_mode: "Markdown" });
      }
      return;
    }

    if (data === 'cancel_prono') {
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

//#FONCTION POUR MESSAGE_AUTO
const { Client } = require('pg');
const dayjs = require('dayjs');


bot.onText(/\/addmsg/, (msg) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(msg.chat.id, "❌ Tu n'as pas l'autorisation.");
  }

  userStates[msg.from.id] = { step: 1 };
  bot.sendMessage(msg.chat.id, "✏️ Envoie le **contenu du message** à programmer.");
});

bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const state = userStates[userId];

  if (!state || msg.text?.startsWith('/')) return;

  const chatId = msg.chat.id;

  // Étape 1 : contenu texte
  if (state.step === 1) {
    state.contenu = msg.text;
    state.step = 2;
    return bot.sendMessage(chatId, "📎 Envoie un **média** (image ou vidéo) OU tape `non` si tu n'en veux pas.");
  }

  // Étape 2 : média ou 'non'
  if (state.step === 2) {
    if (msg.text && msg.text.toLowerCase() === 'non') {
      state.media_url = null;
    } else if (msg.photo) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      state.media_url = fileId;
    } else if (msg.video) {
      state.media_url = msg.video.file_id;
    } else if (msg.text && msg.text.startsWith('http')) {
      state.media_url = msg.text;
    } else {
      return bot.sendMessage(chatId, "⛔ Format non reconnu. Envoie une image, une vidéo ou tape `non`.");
    }

    state.step = 3;
    return bot.sendMessage(chatId, "🕒 À quelle heure envoyer ? Format `HH:MM` (ex : `08:30`, `20:15`).");
  }

  // Étape 3 : heure d’envoi
  if (state.step === 3) {
    const timeInput = msg.text.trim();
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;

    if (!timeRegex.test(timeInput)) {
      return bot.sendMessage(chatId, "⛔ Format invalide. Utilise HH:MM (ex : `09:30`, `22:00`).");
    }

    const [hour, minute] = timeInput.split(':');
    const now = dayjs();
    let sendDate = now.hour(Number(hour)).minute(Number(minute)).second(0).millisecond(0);

    // Si l'heure est déjà passée aujourd'hui, planifier pour demain
    if (sendDate.isBefore(now)) {
      sendDate = sendDate.add(1, 'day');
    }

    try {
      await db.query(
        `INSERT INTO messages_auto (contenu, media_url, send_date) VALUES ($1, $2, $3)`,
        [state.contenu, state.media_url, sendDate.toDate()]
      );

      const resume = `✅ Message enregistré avec succès :
📝 Texte : ${state.contenu}
🎞 Média : ${state.media_url ? 'Oui' : 'Aucun'}
🕒 Envoi prévu : ${sendDate.format('HH:mm')} (${sendDate.format('DD/MM/YYYY')})`;

      await bot.sendMessage(chatId, resume);
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Erreur lors de l'enregistrement du message.");
    }

    delete userStates[userId];
  }
});


// LIRE_MESSAGE-AUTO
bot.onText(/\/listmsg/, async (msg) => {
  if (msg.from.id.toString() !== adminId) {
    return bot.sendMessage(msg.chat.id, "⛔ Tu n'es pas autorisé à voir cette liste.");
  }

  try {
    const { rows } = await db.query(
      `SELECT id, contenu, send_date, media_url FROM messages_auto
       WHERE send_date::date = CURRENT_DATE
       ORDER BY send_date ASC`
    );

    if (rows.length === 0) {
      return bot.sendMessage(msg.chat.id, "📭 Aucun message prévu pour aujourd’hui.");
    }

    let response = `📋 *Messages programmés aujourd’hui*:\n\n`;

    for (const row of rows) {
      const shortText = row.contenu.length > 25 ? row.contenu.slice(0, 25) + '…' : row.contenu;
      const heure = dayjs(row.send_date).format('HH:mm');
      response += `🆔 ${row.id} | 🕒 ${heure} | ${row.media_url ? '📎 Media' : '📝 Texte'}\n➡️ ${shortText}\n\n`;
    }

    bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "❌ Erreur lors de la récupération des messages.");
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
  const { rows } = await db.query('SELECT * FROM messages_auto WHERE id = $1', [messageId]);
  if (rows.length === 0) {
    return bot.sendMessage(msg.chat.id, `❌ Aucun message trouvé avec l’ID ${messageId}.`);
  }

  // Stocke la demande en attente
  pendingDeletions.set(userId, messageId);

  bot.sendMessage(msg.chat.id, `🗑️ Es-tu sûr de vouloir supprimer le message ID ${messageId} ?`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Confirmer', callback_data: 'confirm_delete' },
          { text: '❌ Annuler', callback_data: 'cancel_delete' }
        ]
      ]
    }
  });
});

// RÉPONSE OUI/NON
bot.on('callback_query', async (query) => {
  const userId = query.from.id.toString();
  const action = query.data;
  const chatId = query.message.chat.id;

  if (!pendingDeletions.has(userId)) {
    return bot.answerCallbackQuery(query.id, { text: "Aucune suppression en attente." });
  }

  const messageId = pendingDeletions.get(userId);

  if (action === 'confirm_delete') {
    try {
      await db.query('DELETE FROM messages_auto WHERE id = $1', [messageId]);
      pendingDeletions.delete(userId);

      await bot.editMessageText(`✅ Message ID ${messageId} supprimé avec succès.`, {
        chat_id: chatId,
        message_id: query.message.message_id
      });
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Une erreur est survenue pendant la suppression.");
    }
  } else if (action === 'cancel_delete') {
    pendingDeletions.delete(userId);
    await bot.editMessageText("❌ Suppression annulée.", {
      chat_id: chatId,
      message_id: query.message.message_id
    });
  }

  bot.answerCallbackQuery(query.id); // Pour faire disparaître le loading
});


/////////////////////////////////////// ✅ AJOUTÉ LES MESSAGES_AUTO-FIXES ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
                                          //=== COMMANDE / addfixedmsg ===


bot.onText(/\/addfixedmsg/, (msg) => {
  if (msg.from.id.toString() !== adminId) return;
  fixedAddStates[msg.from.id] = { step: 1 };
  bot.sendMessage(msg.chat.id, "📝 Envoie le *texte du message fixe*.", { parse_mode: 'Markdown' });
});

 /////////////////////////////////////// ✅ ÉDITÉ LES  MESSAGES_AUTO-FIXES ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
                                          //=== COMMANDE / editfixedmsg ===



 bot.onText(/\/editfixedmsg (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const id = parseInt(match[1]);

  if (userId.toString() !== adminId) return bot.sendMessage(chatId, "⛔ Tu n'as pas l'autorisation.");

  try {
    const { rows } = await db.query('SELECT * FROM message_fixes WHERE id = $1', [id]);
    if (rows.length === 0) return bot.sendMessage(chatId, "❌ Message introuvable.");

    fixedEditStates[userId] = { id, step: 1 };
    bot.sendMessage(chatId, "📝 Envoie le nouveau *texte du message*.", { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Erreur lors de la récupération du message.");
  }
});

// ====== GESTION DES MESSAGES POUR AJOUT / ÉDITION =======
bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  const editState = fixedEditStates[userId];
  const addState = fixedAddStates[userId];
  if ((!editState && !addState) || msg.text?.startsWith('/')) return;

  const handleMedia = (state, msg) => {
    if (msg.text && msg.text.toLowerCase() === 'non') state.media_url = null;
    else if (msg.photo) state.media_url = msg.photo.at(-1).file_id;
    else if (msg.video) state.media_url = msg.video.file_id;
    else if (msg.voice) state.media_url = msg.voice.file_id;
    else if (msg.text && msg.text.startsWith('http')) state.media_url = msg.text;
    else return false;
    return true;
  };

  // ÉDITION
  if (editState) {
    if (editState.step === 1) {
      editState.media_text = msg.text;
      editState.step = 2;
      return bot.sendMessage(chatId, "📎 Envoie le *nouveau média* (photo, vidéo, voix ou lien) ou tape `non`.", { parse_mode: 'Markdown' });
    }
    if (editState.step === 2) {
      if (!handleMedia(editState, msg)) return bot.sendMessage(chatId, "⛔ Format non reconnu. Réessaie.");
      editState.step = 3;
      return bot.sendMessage(chatId, "🕒 Envoie les *heures* (ex : `06:00,08:00`)", { parse_mode: 'Markdown' });
    }
    if (editState.step === 3) {
      const heures = msg.text.split(',').map(h => h.trim());
      const isValid = heures.every(h => /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(h));
      if (!isValid) return bot.sendMessage(chatId, "❌ Format d'heure invalide.");
      editState.heures = heures.join(',');

      const resume = `📝 *Récapitulatif :*\n🆔 ID : ${editState.id}\n📄 Texte : ${editState.media_text}\n🎞 Média : ${editState.media_url ? 'Oui' : 'Aucun'}\n⏰ Heures : ${editState.heures}`;
      bot.sendMessage(chatId, resume, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Confirmer', callback_data: 'confirm_edit' },
            { text: '❌ Annuler', callback_data: 'cancel_edit' }
          ]]
        }
      });
      editState.step = 4;
    }
    return;
  }

  // AJOUT
  if (addState) {
    if (addState.step === 1) {
      addState.media_text = msg.text;
      addState.step = 2;
      return bot.sendMessage(chatId, "📎 Envoie le *média* (photo, vidéo, voix ou lien) ou tape `non`.", { parse_mode: 'Markdown' });
    }
    if (addState.step === 2) {
      if (!handleMedia(addState, msg)) return bot.sendMessage(chatId, "⛔ Format non reconnu. Réessaie.");
      addState.step = 3;
      return bot.sendMessage(chatId, "🕒 Envoie les *heures* (ex : `06:00,08:00`)", { parse_mode: 'Markdown' });
    }
    if (addState.step === 3) {
      const heures = msg.text.split(',').map(h => h.trim());
      const isValid = heures.every(h => /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(h));
      if (!isValid) return bot.sendMessage(chatId, "❌ Format d'heure invalide.");
      addState.heures = heures.join(',');

      const resume = `🆕 *Nouveau message fixe :*\n📄 Texte : ${addState.media_text}\n🎞 Média : ${addState.media_url ? 'Oui' : 'Aucun'}\n⏰ Heures : ${addState.heures}`;
      bot.sendMessage(chatId, resume, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Enregistrer', callback_data: 'confirm_add' },
            { text: '❌ Annuler', callback_data: 'cancel_add' }
          ]]
        }
      });
      addState.step = 4;
    }
  }
});

// ====== CALLBACK QUERIES =======
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const data = query.data;
  const editState = fixedEditStates[userId];
  const addState = fixedAddStates[userId];

  if (data === 'confirm_edit' && editState) {
    try {
      await db.query('UPDATE message_fixes SET media_text=$1, media_url=$2, heures=$3 WHERE id=$4', [
        editState.media_text, editState.media_url, editState.heures, editState.id
      ]);
      await bot.sendMessage(chatId, "✅ Message modifié !");
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Erreur lors de la modification.");
    }
    delete fixedEditStates[userId];
  }

  if (data === 'cancel_edit' && editState) {
    await bot.sendMessage(chatId, "❌ Modification annulée.");
    delete fixedEditStates[userId];
  }

  if (data === 'confirm_add' && addState) {
    try {
      await db.query('INSERT INTO message_fixes (media_text, media_url, heures) VALUES ($1, $2, $3)', [
        addState.media_text, addState.media_url, addState.heures
      ]);
      await bot.sendMessage(chatId, "✅ Message ajouté !");
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Erreur lors de l'ajout.");
    }
    delete fixedAddStates[userId];
  }

  if (data === 'cancel_add' && addState) {
    await bot.sendMessage(chatId, "❌ Ajout annulé.");
    delete fixedAddStates[userId];
  }

  // Gestion test et publication
  if (data.startsWith('testfixed_')) {
    const id = data.split('_')[1];
    try {
      const { rows } = await db.query('SELECT * FROM message_fixes WHERE id = $1', [id]);
      const row = rows[0];
      if (!row) return bot.sendMessage(chatId, "❌ Message introuvable.");

      const text = row.media_text;
      const media = row.media_url;

      const keyboard = {
        inline_keyboard: [[
          { text: '📢 Publier maintenant', callback_data: `publishfixed_${id}` },
          { text: '❌ Annuler', callback_data: 'cancel_publishfixed' }
        ]]
      };

      if (media?.startsWith('http')) await bot.sendMessage(chatId, text, { reply_markup: keyboard });
      else if (media?.includes('AgAC') || media?.includes('photo')) await bot.sendPhoto(chatId, media, { caption: text, reply_markup: keyboard });
      else if (media?.includes('BAAD') || media?.includes('video')) await bot.sendVideo(chatId, media, { caption: text, reply_markup: keyboard });
      else if (media?.includes('AwAD') || media?.includes('voice')) {
        await bot.sendVoice(chatId, media);
        await bot.sendMessage(chatId, text, { reply_markup: keyboard });
      } else await bot.sendMessage(chatId, text, { reply_markup: keyboard });
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Erreur lors du test.");
    }
  }

  if (data.startsWith('publishfixed_')) {
    const id = data.split('_')[1];
    try {
      const { rows } = await db.query('SELECT * FROM message_fixes WHERE id = $1', [id]);
      const row = rows[0];
      if (!row) return bot.sendMessage(chatId, "❌ Message introuvable.");

      const text = row.media_text;
      const media = row.media_url;

      if (media?.startsWith('http')) await bot.sendMessage(channelId, text);
      else if (media?.includes('AgAC') || media?.includes('photo')) await bot.sendPhoto(channelId, media, { caption: text });
      else if (media?.includes('BAAD') || media?.includes('video')) await bot.sendVideo(channelId, media, { caption: text });
      else if (media?.includes('AwAD') || media?.includes('voice')) {
        await bot.sendVoice(channelId, media);
        await bot.sendMessage(channelId, text);
      } else await bot.sendMessage(channelId, text);

      await bot.sendMessage(chatId, "✅ Message publié dans le canal.");
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Erreur lors de la publication.");
    }
  }

  if (data === 'cancel_publishfixed') {
    await bot.sendMessage(chatId, "❌ Publication annulée.");
  }

  // Gestion suppression
  if (data.startsWith('deletefixed_')) {
    if (userId.toString() !== adminId) return bot.answerCallbackQuery(query.id, { text: "Pas autorisé" });
    const id = data.split('_')[1];
    try {
      await db.query('DELETE FROM message_fixes WHERE id=$1', [id]);
      await bot.sendMessage(chatId, `✅ Message ${id} supprimé.`);
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Erreur lors de la suppression.");
    }
  }

  await bot.answerCallbackQuery(query.id);
});



/////////////////////////////////////// ✅ AFFICHÉ LA LISTE DES  MESSAGES_AUTO-FIXES ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
                                         //=== COMMANDE /fixedmenu ===



bot.onText(/\/fixedmenu/, async (msg) => {
  if (msg.from.id.toString() !== adminId) return;

  try {
    const { rows } = await db.query('SELECT * FROM message_fixes ORDER BY id');
    if (rows.length === 0) {
      return bot.sendMessage(msg.chat.id, "📭 Aucun message fixe trouvé.");
    }

    for (const row of rows) {
      const mediaInfo = row.media_url ? "🎞 Oui" : "❌ Aucun";
      const text = `🆔 ID: ${row.id}\n📄 Texte: ${row.media_text}\n🎞 Média: ${mediaInfo}\n⏰ Heures: ${row.heures}`;
      const buttons = [
        [{ text: '✏️ Modifier', callback_data: `editfixed_${row.id}` }],
        [{ text: '🗑 Supprimer', callback_data: `deletefixed_${row.id}` }],
        [{ text: '🧪 Tester', callback_data: `testfixed_${row.id}` }]
      ];

      await bot.sendMessage(msg.chat.id, text, {
        reply_markup: { inline_keyboard: buttons }
      });
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "❌ Erreur lors de la récupération.");
  }
});

// === Gestion des boutons ===
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const data = query.data;

  try {
    if (data.startsWith('deletefixed_')) {
      const id = data.split('_')[1];
      await db.query('DELETE FROM message_fixes WHERE id=$1', [id]);
      await bot.sendMessage(chatId, `🗑 Message ID ${id} supprimé.`);
    }

    else if (data.startsWith('testfixed_')) {
      const id = data.split('_')[1];
      const { rows } = await db.query('SELECT * FROM message_fixes WHERE id=$1', [id]);
      const row = rows[0];

      if (!row) {
        await bot.sendMessage(chatId, "❌ Message introuvable.");
      } else {
        if (row.media_url?.startsWith('http')) {
          await bot.sendMessage(chatId, row.media_text);
        } else if (row.media_url?.includes('AgAC') || row.media_url?.includes('photo')) {
          await bot.sendPhoto(chatId, row.media_url, { caption: row.media_text });
        } else if (row.media_url?.includes('BAAD') || row.media_url?.includes('video')) {
          await bot.sendVideo(chatId, row.media_url, { caption: row.media_text });
        } else if (row.media_url?.includes('AwAD') || row.media_url?.includes('voice')) {
          await bot.sendVoice(chatId, row.media_url);
          await bot.sendMessage(chatId, row.media_text);
        } else {
          await bot.sendMessage(chatId, row.media_text);
        }
      }
    }

    else if (data.startsWith('editfixed_')) {
      const id = data.split('_')[1];
      editStates[userId] = { step: 'awaiting_text', id };
      await bot.sendMessage(chatId, "✏️ Envoie le nouveau texte (caption) du message.");
    }

    // ✅ Répond TOUJOURS pour éviter "Option inconnue"
    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error('Erreur callback_query:', err);
    await bot.answerCallbackQuery(query.id, { text: '❌ Erreur interne', show_alert: true });
  }
});

// === Suivi de la modification (étape texte puis heures) ===
bot.on('message', async (msg) => {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;

  if (editStates[userId]) {
    const state = editStates[userId];

    if (state.step === 'awaiting_text') {
      state.text = msg.text;
      state.step = 'awaiting_hours';
      return bot.sendMessage(chatId, "⏰ Envoie les nouvelles heures au format HH:MM, séparées par virgules.\nExemple : 06:00, 14:30, 22:00");
    }

    if (state.step === 'awaiting_hours') {
      state.heures = msg.text;
      await db.query('UPDATE message_fixes SET media_text=$1, heures=$2 WHERE id=$3', [
        state.text, state.heures, state.id
      ]);
      delete editStates[userId];
      return bot.sendMessage(chatId, `✅ Message ID ${state.id} modifié avec succès.`);
    }
  }
});

// === Envoi automatique toutes les minutes ===
async function sendFixedMessages() {
  try {
    const { rows } = await db.query('SELECT * FROM message_fixes');
    const now = new Date();
    const heureStr = now.toTimeString().slice(0, 5); // "HH:MM"

    for (const row of rows) {
      if (!row.heures) continue;
      const heures = row.heures.split(',').map(h => h.trim());
      if (heures.includes(heureStr)) {
        try {
          if (row.media_url?.startsWith('http')) {
            await bot.sendMessage(channelId, row.media_text);
          } else if (row.media_url?.includes('AgAC') || row.media_url?.includes('photo')) {
            await bot.sendPhoto(channelId, row.media_url, { caption: row.media_text });
          } else if (row.media_url?.includes('BAAD') || row.media_url?.includes('video')) {
            await bot.sendVideo(channelId, row.media_url, { caption: row.media_text });
          } else if (row.media_url?.includes('AwAD') || row.media_url?.includes('voice')) {
            await bot.sendVoice(channelId, row.media_url);
            await bot.sendMessage(channelId, row.media_text);
          } else {
            await bot.sendMessage(channelId, row.media_text);
          }
        } catch (err) {
          console.error('Erreur envoi automatique:', err);
        }
      }
    }
  } catch (err) {
    console.error('Erreur récupération messages fixes:', err);
  }
}

schedule.scheduleJob('* * * * *', sendFixedMessages);


// ====== AUTRES COMMANDES/LOGIQUE ICI =======
// Par exemple /start etc.

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "🤖 Bot démarré et prêt.");
});




/////////////////////////////////////// ✅ ANDPOINT QUE CRON-JOB.org va appeler ✅\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
                                         //=== COMMANDE /send-fixed-messages ===


function startAutoSender() {
  const schedule = require('node-schedule');

  // Tu peux ajouter ici des tâches planifiées si besoin avec node-schedule
  // Par exemple :
  // schedule.scheduleJob('*/1 * * * *', () => {
  //   console.log('Tâche planifiée exécutée chaque minute');
  // });

  // Endpoint que cron-job.org va appeler
  app.get('/send-fixed-messages', async (req, res) => {
    try {
      const now = new Date();
      const heuresActuelles = now.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const { rows } = await pool.query(`
        SELECT * FROM message_fixes
        WHERE heures LIKE $1
      `, [`%${heuresActuelles}%`]);

      for (const msg of rows) {
        if (msg.media_url) {
          if (msg.media_url.endsWith('.jpg') || msg.media_url.endsWith('.png')) {
            await bot.sendPhoto(process.env.CHANNEL_ID, msg.media_url, {
              caption: msg.media_text,
              parse_mode: 'HTML'
            });
          } else if (msg.media_url.endsWith('.mp4')) {
            await bot.sendVideo(process.env.CHANNEL_ID, msg.media_url, {
              caption: msg.media_text,
              parse_mode: 'HTML'
            });
          }
        } else {
          await bot.sendMessage(process.env.CHANNEL_ID, msg.media_text, {
            parse_mode: 'HTML'
          });
        }
      }

      res.status(200).send('✅ Messages envoyés avec succès.');
    } catch (err) {
      console.error("Erreur /send-fixed-messages :", err);
      res.status(500).send("❌ Erreur lors de l’envoi des messages.");
    }
  });
}

// ✅ On appelle la fonction APRÈS sa déclaration
startAutoSender();

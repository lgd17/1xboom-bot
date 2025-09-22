// spamUtils.js
const usersMap = new Map();

const LIMIT_COUNT = 3;          // max 3 messages
const TIME_WINDOW = 60 * 1000;  // fenêtre = 1 min
const BAN_TIME = 2 * 60 * 1000; // blocage = 2 min

function checkSpam(userId) {
  const now = Date.now();
  let userData = usersMap.get(userId);

  // Si déjà banni, on vérifie la durée
  if (userData && userData.banUntil && now < userData.banUntil) {
    return { spam: true, banned: true, remaining: userData.banUntil - now };
  }

  if (!userData) {
    // Premier message
    userData = { count: 1, lastMessage: now, banUntil: null };
    usersMap.set(userId, userData);
    return { spam: false, banned: false };
  }

  // Temps écoulé depuis le dernier message
  const timePassed = now - userData.lastMessage;
  const reduce = Math.floor(timePassed / (TIME_WINDOW / LIMIT_COUNT));

  userData.count = Math.max(0, userData.count - reduce) + 1;
  userData.lastMessage = now;

  // ⚠️ Si dépasse la limite => on bannit pour 2 minutes
  if (userData.count > LIMIT_COUNT) {
    userData.banUntil = now + BAN_TIME;
    usersMap.set(userId, userData);
    return { spam: true, banned: true, remaining: BAN_TIME };
  }

  usersMap.set(userId, userData);
  return { spam: false, banned: false };
}

module.exports = { checkSpam };


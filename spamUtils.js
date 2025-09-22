// spamUtils.js
const usersMap = new Map();
const LIMIT_COUNT = 5;        // max messages
const TIME_WINDOW = 60 * 1000; // 1 min

function checkSpam(userId) {
  const now = Date.now();
  let userData = usersMap.get(userId);

  if (!userData) {
    userData = { count: 1, lastMessage: now };
    usersMap.set(userId, userData);
    return false;
  }

  const timePassed = now - userData.lastMessage;
  const reduce = Math.floor(timePassed / (TIME_WINDOW / LIMIT_COUNT)); 

  userData.count = Math.max(0, userData.count - reduce) + 1;
  userData.lastMessage = now;

  usersMap.set(userId, userData);

  return userData.count > LIMIT_COUNT;
}

module.exports = { checkSpam };  // ⚠️ bien exporter

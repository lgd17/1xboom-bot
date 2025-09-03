const usersMap = new Map();
const LIMIT_COUNT = 5;        // max messages
const TIME_WINDOW = 60*1000;  // 1 min

function checkSpam(userId) {
  const now = Date.now();
  const userData = usersMap.get(userId) || { count:0, lastMessage: now };
  if (now - userData.lastMessage > TIME_WINDOW) {
    usersMap.set(userId, { count:1, lastMessage: now });
    return false;
  }
  userData.count++;
  userData.lastMessage = now;
  usersMap.set(userId, userData);
  return userData.count > LIMIT_COUNT;
}

module.exports = { checkSpam };

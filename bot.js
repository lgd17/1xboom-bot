const TelegramBot = require("node-telegram-bot-api");
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { webHook: { port: 443 } });
module.exports = bot;

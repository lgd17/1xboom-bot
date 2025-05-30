const fs = require('fs');
const path = require('path');

const locales = {
  fr: JSON.parse(fs.readFileSync(path.join(__dirname, 'locales/fr.json'))),
  en: JSON.parse(fs.readFileSync(path.join(__dirname, 'locales/en.json')))
};

function t(lang, key) {
  return locales[lang]?.[key] || locales.fr[key] || key;
}

module.exports = { t };


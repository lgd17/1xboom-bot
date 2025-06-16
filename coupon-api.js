// coupon-api.js

// coupon-api.js

const express = require('express');
const app = express();
const PORT = 4000;

// Fonction pour générer un coupon de pronostics
function generateCoupon() {
  const coupon = {
    source: 'api',
    content: `⚽ Confiança vs Bahia\n🏆 Copa do Nordeste\n🕒 22:00\n\n⚽ Fort Lauderdale Utd II vs Miami City\n🏆 USL W League\n🕒 22:00`,
    media_url: null,
    media_type: null
  };

  return coupon;
}

// API GET /generate-coupon
app.get('/generate-coupon', (req, res) => {
  const coupon = generateCoupon();
  res.json(coupon);
});

// Lancer le serveur API
app.listen(PORT, () => {
  console.log(`🚀 Coupon API en ligne sur http://localhost:${PORT}`);
});

// Exporter la fonction pour un usage direct dans index.js
module.exports = { generateCoupon };

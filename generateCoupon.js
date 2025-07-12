// generateCoupon.js
module.exports = async function generateCoupon() {
  return {
    content: "🔥 Voici le coupon du jour généré automatiquement via l’API",
    media_url: null,         // ou un lien d'image/vidéo
    media_type: null,        // "photo", "video" ou null
    source: "api"
  };
};

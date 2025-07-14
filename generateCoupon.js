// generateCoupon.js
const axios = require('axios');

module.exports = async function generateCoupon() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const response = await axios.get('https://v3.football.api-sports.io/fixtures', {
      params: {
        date: today,
        league: 61, // Ligue 1 par exemple
        season: 2024
      },
      headers: {
        'x-apisports-key': process.env.API_FOOTBALL_KEY
      }
    });

    const fixtures = response.data.response;
    if (fixtures.length === 0) {
      return {
        content: "⚠️ Aucun match trouvé pour aujourd’hui.",
        media_url: null,
        media_type: null,
        source: "api"
      };
    }

    const match = fixtures[0];
    return {
      content: `🔥 Coupon du jour : ${match.teams.home.name} vs ${match.teams.away.name} (${match.fixture.date})`,
      media_url: null,
      media_type: null,
      source: "api"
    };

  } catch (error) {
    console.error('Erreur API football :', error.message);
    return {
      content: "❌ Erreur lors de la génération du coupon via l'API.",
      media_url: null,
      media_type: null,
      source: "api"
    };
  }
};

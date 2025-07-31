require('dotenv').config();
const axios = require('axios');
const {
  getConfidence,
  getSafestBet,
  getTargetedBet,
  formatMatchTips
} = require('./couponUtils');

const API_BASE = 'https://v3.football.api-sports.io';
const headers = { 'x-apisports-key': process.env.API_FOOTBALL_KEY };

const leaguesAsia = [
  { id: 292, name: 'J-League 🇯🇵' },
  { id: 301, name: 'K League 🇰🇷' },
  { id: 303, name: 'Chinese Super League 🇨🇳' },
  { id: 306, name: 'India Super League 🇮🇳' },
  { id: 328, name: 'Uzbekistan Super League 🇺🇿' }
];

module.exports = async function generateCouponAsia(limit = 2) {
  const today = new Date().toISOString().split('T')[0];
  const selectedMatches = [];

  try {
    for (const league of leaguesAsia) {
      if (selectedMatches.length >= limit) break;

      const fixtureRes = await axios.get(`${API_BASE}/fixtures`, {
        params: {
          date: today,
          league: league.id,
          season: 2024,
          timezone: 'Asia/Tokyo'
        },
        headers
      });

      const fixtures = fixtureRes.data.response;

      for (const match of fixtures) {
        if (selectedMatches.length >= limit) break;

        const oddsRes = await axios.get(`${API_BASE}/odds`, {
          params: { fixture: match.fixture.id },
          headers
        });

        const bookmaker = oddsRes.data.response[0]?.bookmakers?.find(b => b.name === 'Bet365') ||
                          oddsRes.data.response[0]?.bookmakers?.[0];
        if (!bookmaker) continue;

        const bets = bookmaker.bets || [];
        const tips = [];

        const winTip = getSafestBet(bets, 'Match Winner');
        if (winTip) tips.push(`🏆 *1X2* : ${winTip.value} (${winTip.odd}) ${winTip.confidence}`);

        const dcTip = getSafestBet(bets, 'Double Chance');
        if (dcTip) tips.push(`🔀 *Double Chance* : ${dcTip.value} (${dcTip.odd}) ${dcTip.confidence}`);

        const overTip = getTargetedBet(bets, 'Over/Under', 'Over 2.5');
        if (overTip) tips.push(`🎯 *Over 2.5* : ${overTip.odd} ${overTip.confidence}`);

        const bttsTip = getTargetedBet(bets, 'Both Teams Score', 'Yes');
        if (bttsTip) tips.push(`🤝 *BTTS Oui* : ${bttsTip.odd} ${bttsTip.confidence}`);

        if (tips.length === 0) continue;

        const home = match.teams.home.name;
        const away = match.teams.away.name;
        const hour = new Date(match.fixture.date).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Tokyo'
        });

        selectedMatches.push(formatMatchTips({
          leagueName: league.name,
          home,
          away,
          hour,
          tips
        }));
      }
    }

    if (!selectedMatches.length) {
      return {
        content: "⚠️ Aucun pari fiable trouvé aujourd’hui en Asie.",
        media_url: null,
        media_type: null,
        source: "api"
      };
    }

    const finalContent = `🔥 *Coupon du jour – Asie*\n\n${selectedMatches.join('\n\n')}\n\n💡 Source : API-Football`;

    return {
      content: finalContent,
      media_url: null,
      media_type: null,
      source: "api"
    };
  } catch (err) {
    console.error('Erreur Asia generateCoupon:', err.message);
    return {
      content: "❌ Erreur lors de la génération du coupon Asie.",
      media_url: null,
      media_type: null,
      source: "api"
    };
  }
};


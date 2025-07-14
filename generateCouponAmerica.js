//generateCouponAmerica.js
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

const leaguesAmerica = [
  { id: 71, name: 'Brasileirao 🇧🇷' },
  { id: 128, name: 'Primera División 🇦🇷' },
  { id: 253, name: 'MLS 🇺🇸🇨🇦' },
  { id: 262, name: 'Liga MX 🇲🇽' },
  { id: 265, name: 'Chilean League 🇨🇱' },
  { id: 239, name: 'Liga BetPlay 🇨🇴' }
];

module.exports = async function generateCouponAmerica() {
  const today = new Date().toISOString().split('T')[0];
  const allMatches = [];

  try {
    for (const league of leaguesAmerica) {
      const fixtureRes = await axios.get(`${API_BASE}/fixtures`, {
        params: {
          date: today,
          league: league.id,
          season: 2024,
          timezone: 'Africa/Lome'
        },
        headers
      });

      const fixtures = fixtureRes.data.response.slice(0, 2);

      for (const match of fixtures) {
        const home = match.teams.home.name;
        const away = match.teams.away.name;
        const hour = new Date(match.fixture.date).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Africa/Lome'
        });

        const oddsRes = await axios.get(`${API_BASE}/odds`, {
          params: { fixture: match.fixture.id },
          headers
        });

        const bookmaker = oddsRes.data.response[0]?.bookmakers?.find(b => b.name === 'Bet365') ||
                          oddsRes.data.response[0]?.bookmakers?.[0];
        const bets = bookmaker?.bets || [];

        const tips = [];

        const winTip = getSafestBet(bets, 'Match Winner');
        if (winTip) tips.push(`🏆 1X2 : ${winTip.value} (${winTip.odd}) ${winTip.confidence}`);

        const dcTip = getSafestBet(bets, 'Double Chance');
        if (dcTip) tips.push(`🔀 Double Chance : ${dcTip.value} (${dcTip.odd}) ${dcTip.confidence}`);

        const overTip = getTargetedBet(bets, 'Over/Under', 'Over 2.5');
        if (overTip) tips.push(`🎯 Over 2.5 : ${overTip.odd} ${overTip.confidence}`);

        const bttsTip = getTargetedBet(bets, 'Both Teams Score', 'Yes');
        if (bttsTip) tips.push(`🤝 BTTS Oui : ${bttsTip.odd} ${bttsTip.confidence}`);

        if (!tips.length) continue;

        allMatches.push(formatMatchTips({ leagueName: league.name, home, away, hour, tips }));
      }
    }

    if (!allMatches.length) {
      return {
        content: "⚠️ Aucun pari fiable trouvé aujourd’hui en Amérique.",
        media_url: null,
        media_type: null,
        source: "api"
      };
    }

    const finalContent = `🔥 *Coupon du jour – Amérique*

${allMatches.join('\n\n')}\n\n💡 Source : API-Football`;

    return {
      content: finalContent,
      media_url: null,
      media_type: null,
      source: "api"
    };
  } catch (err) {
    console.error('Erreur America generateCoupon:', err.message);
    return {
      content: "❌ Erreur lors de la génération du coupon Amérique.",
      media_url: null,
      media_type: null,
      source: "api"
    };
  }
};

// generateCouponEurope.js
require('dotenv').config();
const axios = require('axios');

const API_BASE = 'https://v3.football.api-sports.io';
const headers = { 'x-apisports-key': process.env.API_FOOTBALL_KEY };

const leaguesEurope = [
  { id: 39, name: 'Premier League 🇬🇧' },
  { id: 61, name: 'Ligue 1 🇫🇷' },
  { id: 78, name: 'Bundesliga 🇩🇪' },
  { id: 135, name: 'Serie A 🇮🇹' },
  { id: 140, name: 'La Liga 🇪🇸' },
  { id: 88, name: 'Eredivisie 🇳🇱' },
  { id: 94, name: 'Primeira Liga 🇵🇹' },
  { id: 203, name: 'Super Lig 🇹🇷' },
  { id: 144, name: 'Belgian Pro League 🇧🇪' },
  { id: 179, name: 'Scottish Premiership 🏴' },
  { id: 207, name: 'Swiss Super League 🇨🇭' },
  { id: 197, name: 'Greek Super League 🇬🇷' },
  { id: 208, name: 'Danish Superliga 🇩🇰' },
  { id: 218, name: 'Austrian Bundesliga 🇦🇹' },
  { id: 233, name: 'Czech First League 🇨🇿' }
];

// (Idem fonction generateCoupon ci-dessus adaptée aux leaguesEurope)

module.exports = async function generateCouponEurope() {
  const today = new Date().toISOString().split('T')[0];
  const allMatches = [];

  try {
    for (const league of leaguesEurope) {
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

        // Utilitaire pour récupérer le pari fiable (extrait des fonctions ci-dessus)
        // Ici tu peux réutiliser getSafestBet et getTargetedBet définis dans un utilitaire commun

        // Exemple d'extraction simplifiée :
        function getConfidence(odd) {
          const val = parseFloat(odd);
          if (val < 1.40) return '💎 Ultra fiable';
          if (val < 1.60) return '✅ Confiance élevée';
          return null;
        }
        function getSafestBet(bets, betName) {
          const bet = bets.find(b => b.name === betName);
          if (!bet || !bet.values) return null;

          const sorted = bet.values
            .map(v => ({ value: v.value, odd: parseFloat(v.odd) }))
            .sort((a, b) => a.odd - b.odd);

          const best = sorted[0];
          const confidence = getConfidence(best.odd);
          return confidence ? { value: best.value, odd: best.odd, confidence } : null;
        }
        function getTargetedBet(bets, betName, target) {
          const bet = bets.find(b => b.name === betName);
          if (!bet || !bet.values) return null;
          const found = bet.values.find(v => v.value === target);
          if (!found) return null;

          const confidence = getConfidence(found.odd);
          return confidence ? { value: target, odd: found.odd, confidence } : null;
        }

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

        const matchBlock = `📌 *${league.name}*\n⚽ *${home} vs ${away}* à ${hour}\n` + tips.join('\n');
        allMatches.push(matchBlock);
      }
    }

    if (!allMatches.length) {
      return {
        content: "⚠️ Aucun pari fiable trouvé aujourd’hui en Europe.",
        media_url: null,
        media_type: null,
        source: "api"
      };
    }

    const finalContent = `🔥 *Coupon du jour – Europe*\n\n${allMatches.join('\n\n')}\n\n💡 Source : API-Football`;

    return {
      content: finalContent,
      media_url: null,
      media_type: null,
      source: "api"
    };
  } catch (err) {
    console.error('Erreur Europe generateCoupon:', err.message);
    return {
      content: "❌ Erreur lors de la génération du coupon Europe.",
      media_url: null,
      media_type: null,
      source: "api"
    };
  }
};


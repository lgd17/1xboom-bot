require('dotenv').config();
const axios = require('axios');
const { getSafestBet, getTargetedBet } = require('./couponUtils');

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
  { id: 179, name: 'Scottish Premiership 🇬🇧' },
  { id: 207, name: 'Swiss Super League 🇨🇭' },
  { id: 197, name: 'Greek Super League 🇬🇷' },
  { id: 208, name: 'Danish Superliga 🇩🇰' },
  { id: 218, name: 'Austrian Bundesliga 🇦🇹' },
  { id: 233, name: 'Czech First League 🇨🇿' }
];

module.exports = async function generateCouponEurope(limit = 2) {
  const today = new Date().toISOString().split('T')[0];
  const year = new Date().getFullYear();
  const selectedMatches = [];

  try {
    for (const league of leaguesEurope) {
      if (selectedMatches.length >= limit) break;

      let fixtures = [];

      // Vérifie saison courante, sinon précédente
      for (const season of [year, year - 1]) {
        const fixtureRes = await axios.get(`${API_BASE}/fixtures`, {
          params: { date: today, league: league.id, season, timezone: 'Europe/Paris' },
          headers
        });

        fixtures = fixtureRes.data.response.filter(m => m.fixture.status.short === 'NS');
        if (fixtures.length > 0) {
          console.log(`✅ ${fixtures.length} matchs trouvés pour ${league.name} (${season})`);
          break;
        }
      }

      if (!fixtures || fixtures.length === 0) {
        console.log(`⚠️ Aucun match aujourd'hui pour ${league.name}`);
        continue;
      }

      for (const match of fixtures) {
        if (selectedMatches.length >= limit) break;

        try {
          const oddsRes = await axios.get(`${API_BASE}/odds`, {
            params: { fixture: match.fixture.id },
            headers
          });

          const bookmaker =
            oddsRes.data.response[0]?.bookmakers?.find(b => b.name === 'Bet365') ||
            oddsRes.data.response[0]?.bookmakers?.sort((a, b) => (b.bets?.length || 0) - (a.bets?.length || 0))[0];
          if (!bookmaker || !bookmaker.bets) continue;

          const bets = bookmaker.bets;
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
            timeZone: 'Europe/Paris'
          });

          selectedMatches.push(
            `🏟️ *${league.name}*\n${home} vs ${away} - ${hour}\n${tips.join("\n")}`
          );
        } catch (err) {
          console.error(`Erreur sur match ${match.teams.home.name} vs ${match.teams.away.name}:`, err.message);
          continue;
        }
      }
    }

    return selectedMatches;
  } catch (err) {
    console.error('Erreur Europe generateCoupon:', err.message);
    return [];
  }
};

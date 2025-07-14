// couponUtils.js

// Renvoie un niveau de confiance basé sur la cote
function getConfidence(odd) {
  if (!odd || isNaN(parseFloat(odd))) return '';
  const o = parseFloat(odd);
  if (o < 1.30) return '✅✅✅';
  if (o < 1.60) return '✅✅';
  if (o < 2.00) return '✅';
  return '⚠️';
}

// Renvoie la meilleure cote pour un type de pari donné
function getSafestBet(bets, betType) {
  const bet = bets.find(b => b.name === betType);
  if (!bet || !bet.values || bet.values.length === 0) return null;

  let best = bet.values[0];
  for (const val of bet.values) {
    if (parseFloat(val.odd) < parseFloat(best.odd)) {
      best = val;
    }
  }
  return {
    value: best.value,
    odd: best.odd,
    confidence: getConfidence(best.odd)
  };
}

// Renvoie une cote spécifique (ex: Over 2.5, BTTS Oui...)
function getTargetedBet(bets, betType, targetValue) {
  const bet = bets.find(b => b.name === betType);
  if (!bet || !bet.values) return null;

  const val = bet.values.find(v => v.value === targetValue);
  if (!val) return null;

  return {
    value: val.value,
    odd: val.odd,
    confidence: getConfidence(val.odd)
  };
}

// Formatage Markdown d’un match + ses pronostics
function formatMatchTips({ leagueName, home, away, hour, tips }) {
  return `*${leagueName}*
${hour} — *${home}* vs *${away}*
${tips.join('\n')}`;
}

module.exports = {
  getConfidence,
  getSafestBet,
  getTargetedBet,
  formatMatchTips
};

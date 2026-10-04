// Points a winning bet would earn at these odds, from the scoring config tiers.
export const pointsForOdds = (odds, config) => {
  if (!config?.tiers || !odds) return null;
  const tiers = [...config.tiers].sort((a, b) => b.min_odds - a.min_odds);
  const tier = tiers.find(t => odds >= t.min_odds);
  return tier ? tier.points : 1;
};

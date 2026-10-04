import React, { useState, useEffect } from 'react';

import { apiFetch } from '../api';

const COLUMNS = [
  { key: 'crowns',       label: 'Jours gagnants',   format: v => v != null ? `${v}` : '-' },
  { key: 'winRate',      label: 'Taux victoire',   format: v => v != null ? `${v}%` : '-' },
  { key: 'bankerRate',   label: 'Taux banker',     format: v => v != null ? `${v}%` : '-' },
  { key: 'totalBets',    label: 'Paris total',     format: v => v != null ? `${v}` : '-' },
  { key: 'bestDay',      label: 'Meilleur jour',   format: v => v != null ? `${v} pts` : '-' },
  { key: 'avgPerDay',    label: 'Moy/jour',        format: v => v != null ? `${v}` : '-' },
  { key: 'biggestUpset', label: 'Plus gros outsider',  format: (v, player) => v != null ? `${player?.biggestUpsetName || '?'} (${v})` : '-' },
  { key: 'daysPlayed',   label: 'Jours joués',     format: v => v != null ? `${v}` : '-' },
];

const StatsTab = ({ showMessage, onOpenProfile }) => {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/race-days/stats`);
        const data = await res.json();
        if (data && data.success) {
          setStats(data.stats || []);
        } else {
          setStats([]);
          if (data && data.error) showMessage(data.error, 'error');
        }
      } catch (err) {
        showMessage(`Erreur: ${err.message}`, 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [showMessage]);

  // Find the best value per column (for highlighting)
  const bests = {};
  COLUMNS.forEach(col => {
    const values = stats.map(s => s[col.key]).filter(v => v != null);
    if (values.length > 0) bests[col.key] = Math.max(...values);
  });

  if (loading) {
    return (
      <div className="card p-6 animate-pulse space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 bg-grape-50 rounded-xl w-full" />
        ))}
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="card p-6 text-center text-grape-400 font-bold">
        Pas encore de statistiques — elles apparaîtront après la première journée de courses.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <h3 className="font-display text-xl font-extrabold text-grape-800 px-5 pt-5">📊 Tableau comparatif</h3>

      {/* Scroll hint */}
      <p className="text-xs font-bold text-grape-300 px-5 mb-2">Glisse pour voir toutes les stats →</p>

      {/* Scrollable wrapper with right fade */}
      <div className="relative">
        <div className="overflow-x-auto pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="w-max min-w-full text-sm">
            <thead>
              <tr className="border-b-2 border-grape-100">
                <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-display font-bold text-grape-500 min-w-[130px]">
                  Joueur
                </th>
                {COLUMNS.map(col => (
                  <th key={col.key} className="px-4 py-3 text-center font-display font-bold text-grape-500 min-w-[110px] whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map((player, idx) => (
                <tr
                  key={player.userId}
                  className="border-b border-grape-50 group cursor-pointer"
                  onClick={() => onOpenProfile?.(player.userId)}
                >
                  <td className={`sticky left-0 z-10 px-4 py-3 font-bold text-grape-800 min-w-[130px] ${idx % 2 === 0 ? 'bg-white' : 'bg-grape-50'} group-hover:bg-grape-100`}>
                    {player.name}
                  </td>
                  {COLUMNS.map(col => {
                    const val = player[col.key];
                    const isBest = val != null && val > 0 && val === bests[col.key];
                    return (
                      <td key={col.key} className={`px-4 py-3 text-center whitespace-nowrap ${idx % 2 === 0 ? 'bg-white' : 'bg-grape-50'} group-hover:bg-grape-100 ${isBest ? 'text-grape-700 font-extrabold' : 'text-grape-600'}`}>
                        {isBest && '⭐ '}{col.format(val, player)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right fade indicator */}
        <div className="absolute top-0 right-0 bottom-0 w-8 pointer-events-none bg-gradient-to-l from-white to-transparent" />
      </div>
    </div>
  );
};

export default StatsTab;

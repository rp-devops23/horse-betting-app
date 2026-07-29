import React, { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';

import API_BASE from '../config';

const COLUMNS = [
  { key: 'crowns',       label: 'Couronnes',       format: v => v != null ? `${v}` : '-' },
  { key: 'winRate',      label: 'Taux victoire',   format: v => v != null ? `${v}%` : '-' },
  { key: 'bankerRate',   label: 'Taux banker',     format: v => v != null ? `${v}%` : '-' },
  { key: 'totalBets',    label: 'Paris total',     format: v => v != null ? `${v}` : '-' },
  { key: 'bestDay',      label: 'Meilleur jour',   format: v => v != null ? `${v} pts` : '-' },
  { key: 'avgPerDay',    label: 'Moy/jour',        format: v => v != null ? `${v}` : '-' },
  { key: 'biggestUpset', label: 'Plus gros outsider',  format: v => v != null ? `${v}x` : '-' },
  { key: 'daysPlayed',   label: 'Jours joués',     format: v => v != null ? `${v}` : '-' },
];

const StatsTab = ({ showMessage }) => {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/race-days/stats`);
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
      <div className="bg-white p-6 rounded-lg shadow-md animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-200 rounded w-full" />
        ))}
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md text-center text-gray-500 italic">
        Pas encore de statistiques — les stats apparaitront après la première journée de courses.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold flex items-center gap-2 text-indigo-700 p-6 pb-2">
        <BarChart3 className="w-6 h-6" />
        Statistiques
      </h2>

      {/* Scroll hint */}
      <p className="text-xs text-gray-400 px-6 mb-2">Glisser pour voir toutes les stats →</p>

      {/* Scrollable wrapper with right fade */}
      <div className="relative">
        <div className="overflow-x-auto pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="w-max min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-semibold text-gray-600 min-w-[130px]">
                  Joueur
                </th>
                {COLUMNS.map(col => (
                  <th key={col.key} className="px-4 py-3 text-center font-semibold text-gray-600 min-w-[110px] whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map((player, idx) => (
                <tr
                  key={player.userId}
                  className="border-b border-gray-100 group"
                >
                  <td className={`sticky left-0 z-10 px-4 py-3 font-semibold text-gray-800 min-w-[130px] ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} group-hover:bg-indigo-50`}>
                    <div className="flex items-center gap-1">
                      {player.name}
                      {player.crowns > 0 && <span className="text-yellow-500 ml-1">{'👑'.repeat(Math.min(player.crowns, 3))}{player.crowns > 3 ? `+${player.crowns - 3}` : ''}</span>}
                    </div>
                  </td>
                  {COLUMNS.map(col => {
                    const val = player[col.key];
                    const isBest = val != null && val > 0 && val === bests[col.key];
                    return (
                      <td key={col.key} className={`px-4 py-3 text-center whitespace-nowrap ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} group-hover:bg-indigo-50 ${isBest ? 'text-indigo-700 font-bold' : 'text-gray-700'}`}>
                        {col.format(val)}
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

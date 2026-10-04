import React, { useState, useEffect } from 'react';
import { Trophy } from 'lucide-react';

import { apiFetch } from '../api';
import { Avatar, EmptyState, GallopLoader, Segmented } from './ui.jsx';

const PODIUM = [
  { place: 1, height: 'h-28', colour: 'bg-sunny-300 shadow-[0_5px_0_0_theme(colors.sunny.600)]', medal: '🥇' },
  { place: 2, height: 'h-20', colour: 'bg-grape-200 shadow-[0_5px_0_0_theme(colors.grape.400)]', medal: '🥈' },
  { place: 3, height: 'h-14', colour: 'bg-coral-200 shadow-[0_5px_0_0_theme(colors.coral.400)]', medal: '🥉' },
];

const LeaderboardTab = ({ users, selectedUserId, showMessage, onOpenProfile }) => {
  const [seasons, setSeasons] = useState(null);
  const [period, setPeriod] = useState(null);
  const [standings, setStandings] = useState([]);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('score');

  useEffect(() => {
    apiFetch(`/race-days/seasons`)
      .then(res => res.json())
      .then(data => {
        if (!data.success) return;
        setSeasons(data);
        const current = data.months.find(m => m.isCurrent);
        setPeriod(current?.raceDays ? current.id : 'all');
      })
      .catch(() => setPeriod('all'));
  }, []);

  useEffect(() => {
    if (!period) return;
    let cancelled = false;
    setLoading(true);
    apiFetch(`/race-days/leaderboard?period=${period}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.success) {
          setStandings(data.leaderboard || []);
          setLabel(data.label);
        } else {
          setStandings([]);
          if (data.error) showMessage(data.error, 'error');
        }
      })
      .catch(err => !cancelled && showMessage(`Erreur : ${err.message}`, 'error'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [period, showMessage]);

  const userFor = (entry) => users.find(u => u.id === entry.userId) || { id: entry.userId, name: entry.name };
  const isMonth = period && period.length === 7;
  const season = seasons?.months.find(m => m.id === period);

  const ranked = [...standings]
    .filter(e => e.daysPlayed > 0 || period === 'all')
    .sort((a, b) => (sortBy === 'wins' ? b.wins - a.wins || b.score - a.score : 0));
  const showPodium = sortBy === 'score' && ranked.length >= 3 && ranked[0].score > 0;
  const rest = showPodium ? ranked.slice(3) : ranked;
  const value = (e) => (sortBy === 'wins' ? e.wins : e.score);
  const unit = (e) => (sortBy === 'wins' ? `victoire${e.wins !== 1 ? 's' : ''}` : `pt${Math.abs(e.score) > 1 ? 's' : ''}`);

  const periodChips = seasons ? [
    ...seasons.months.filter(m => m.raceDays > 0 || m.isCurrent).map(m => ({ id: m.id, label: m.isCurrent ? 'Ce mois-ci' : m.label })),
    ...seasons.years.map(y => ({ id: y, label: `Année ${y}` })),
    { id: 'all', label: 'Depuis toujours' },
  ] : [];
  const champions = seasons?.months.filter(m => m.champions.length) || [];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h2 className="section-title"><Trophy className="w-7 h-7 text-sunny-500" /> Classement</h2>
        <Segmented options={[{ value: 'score', label: 'Points' }, { value: 'wins', label: 'Victoires' }]} value={sortBy} onChange={setSortBy} />
      </div>

      {/* Period chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        {periodChips.map(chip => (
          <button
            key={chip.id}
            onClick={() => setPeriod(chip.id)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 font-display font-bold border-2 transition-all ${
              period === chip.id ? 'bg-grape-500 border-grape-500 text-white' : 'bg-white border-grape-100 text-grape-500 hover:border-grape-300'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Season banner */}
      {isMonth && season && (
        <div className={`card p-4 flex items-center gap-3 ${season.isOver ? 'bg-gradient-to-r from-sunny-100 to-white' : 'bg-gradient-to-r from-grape-50 to-white'}`}>
          <span className="text-4xl">{season.isOver ? '🏆' : '🏁'}</span>
          <div className="text-sm">
            <p className="font-display text-lg font-extrabold text-grape-800">Saison {label}</p>
            {season.isOver ? (
              season.champions.length
                ? <p className="text-grape-600 font-bold">Champion{season.champions.length > 1 ? 's' : ''} : {season.champions.map(c => c.name).join(' & ')} 🎉</p>
                : <p className="text-grape-500">Saison terminée</p>
            ) : (
              <p className="text-grape-500">{season.raceDays} journée{season.raceDays > 1 ? 's' : ''} jouée{season.raceDays > 1 ? 's' : ''} · le premier à la fin du mois gagne le trophée 🏆</p>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="card"><GallopLoader label="Calcul des points…" /></div>
      ) : ranked.length === 0 ? (
        <div className="card"><EmptyState emoji="🏁" title="Pas encore de points">Les scores apparaîtront après les premières arrivées.</EmptyState></div>
      ) : (
        <>
          {showPodium && (
            <div className="card px-4 pt-6 pb-0 overflow-hidden bg-gradient-to-b from-grape-50 to-white">
              <div className="flex items-end justify-center gap-3">
                {[1, 0, 2].map(i => {
                  const entry = ranked[i];
                  const step = PODIUM[i];
                  return (
                    <button key={entry.userId} onClick={() => onOpenProfile(entry.userId)} className="flex flex-col items-center w-1/3 max-w-[9rem] group">
                      <div className="relative">
                        {i === 0 && <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl animate-float">👑</span>}
                        <Avatar user={userFor(entry)} users={users} size={i === 0 ? 'xl' : 'lg'} className="group-hover:scale-105 transition-transform" />
                      </div>
                      <span className="mt-1 font-display font-extrabold text-grape-800 truncate max-w-full">{entry.name}</span>
                      <span className="font-display text-xl font-extrabold text-grape-600 leading-none mb-2">{entry.score} <span className="text-xs">pts</span></span>
                      <div className={`w-full ${step.height} ${step.colour} rounded-t-2xl flex items-start justify-center pt-2 text-3xl`}>{step.medal}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <ul className="space-y-2">
            {rest.map((entry) => {
              const isMe = entry.userId === selectedUserId;
              return (
                <li key={entry.userId}>
                  <button onClick={() => onOpenProfile(entry.userId)}
                    className={`w-full card p-3 flex items-center gap-3 text-left hover:-translate-y-0.5 transition-transform ${isMe ? 'border-grape-300 bg-grape-50' : ''}`}>
                    <span className="w-8 text-center font-display text-xl font-extrabold text-grape-300">{sortBy === 'score' ? entry.rank : ranked.indexOf(entry) + 1}</span>
                    <Avatar user={userFor(entry)} users={users} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-extrabold text-grape-900 truncate">{entry.name}{isMe && <span className="text-grape-400 font-bold text-sm"> (toi)</span>}</p>
                      <p className="text-xs text-grape-400 truncate">
                        {entry.daysPlayed} journée{entry.daysPlayed !== 1 ? 's' : ''} · {entry.crowns} 👑
                        {entry.badges?.length > 0 && <span className="ml-1 tracking-tighter">{entry.badges.join('')}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-display text-2xl font-extrabold text-grape-600">{value(entry)}</span>
                      <span className="text-xs font-bold text-grape-400 ml-1">{unit(entry)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Hall of fame */}
      {champions.length > 0 && (
        <div className="card p-5">
          <h3 className="font-display text-xl font-extrabold text-grape-800 mb-3">🏛️ Le mur des champions</h3>
          <ul className="space-y-2">
            {champions.map(m => (
              <li key={m.id} className="flex items-center gap-3">
                <span className="text-2xl">🏆</span>
                <span className="font-bold text-grape-500 w-32 flex-shrink-0">{m.label}</span>
                <span className="flex items-center gap-2 flex-wrap">
                  {m.champions.map(c => (
                    <button key={c.userId} onClick={() => onOpenProfile(c.userId)} className="flex items-center gap-1.5 font-display font-extrabold text-grape-800 hover:text-grape-600">
                      <Avatar user={userFor(c)} users={users} size="xs" /> {c.name}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default LeaderboardTab;

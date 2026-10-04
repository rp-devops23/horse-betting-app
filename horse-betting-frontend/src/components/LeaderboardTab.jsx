import React, { useState, useEffect } from 'react';
import { Trophy } from 'lucide-react';

import { apiFetch } from '../api';
import { Avatar, EmptyState, GallopLoader, Segmented } from './ui.jsx';

// Podium steps by actual rank (ties share a rank: 1, 1, 3 → two golds and a bronze)
const STEPS = {
  1: { height: 'h-28', colour: 'bg-sunny-300 shadow-[0_5px_0_0_theme(colors.sunny.600)]', medal: '🥇' },
  2: { height: 'h-20', colour: 'bg-grape-200 shadow-[0_5px_0_0_theme(colors.grape.400)]', medal: '🥈' },
  3: { height: 'h-14', colour: 'bg-coral-200 shadow-[0_5px_0_0_theme(colors.coral.400)]', medal: '🥉' },
};

// Group the top of the table by rank, keeping only podium ranks (1–3)
const podiumGroups = (ranked) => {
  const groups = [];
  for (const entry of ranked) {
    if (entry.rank > 3 || entry.score <= 0) break;
    const last = groups[groups.length - 1];
    if (last && last.rank === entry.rank) last.entries.push(entry);
    else groups.push({ rank: entry.rank, entries: [entry] });
  }
  return groups;
};

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
        if (!data.success) { setPeriod('all'); return; }
        setSeasons(data.seasons);
        const current = data.seasons.find(s => s.isCurrent);
        setPeriod(current?.raceDays ? current.id : 'all');
      })
      .catch(() => setPeriod('all'));
  }, []);

  useEffect(() => {
    if (!period) return undefined;
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
  const season = seasons?.find(s => s.id === period);

  const played = standings.filter(e => e.daysPlayed > 0);
  const ranked = sortBy === 'wins'
    ? [...played].sort((a, b) => b.wins - a.wins || b.score - a.score)
    : played;
  const groups = sortBy === 'score' ? podiumGroups(ranked) : [];
  const onPodium = new Set(groups.flatMap(g => g.entries.map(e => e.userId)));
  const rest = ranked.filter(e => !onPodium.has(e.userId));
  // Fixed slots by rank: silver left, gold centre, bronze right (a slot stays empty after a tie)
  const podiumOrder = groups.length ? [2, 1, 3].map(rank => groups.find(g => g.rank === rank) || { rank, empty: true }) : [];

  const value = (e) => (sortBy === 'wins' ? e.wins : e.score);
  const unit = (e) => (sortBy === 'wins' ? `victoire${e.wins !== 1 ? 's' : ''}` : `pt${Math.abs(e.score) > 1 ? 's' : ''}`);

  const chips = [
    ...(seasons || []).filter(s => s.raceDays > 0 || s.isCurrent).map(s => ({ id: s.id, label: s.isCurrent ? `Saison ${s.id} 🏁` : s.label })),
    { id: 'all', label: 'Depuis toujours' },
  ];
  const champions = (seasons || []).filter(s => s.champions.length);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h2 className="section-title"><Trophy className="w-7 h-7 text-sunny-500" /> Classement</h2>
        <Segmented options={[{ value: 'score', label: 'Points' }, { value: 'wins', label: 'Victoires' }]} value={sortBy} onChange={setSortBy} />
      </div>

      {/* Season chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        {chips.map(chip => (
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
      {season && (
        <div className={`card p-4 flex items-center gap-3 ${season.isOver ? 'bg-gradient-to-r from-sunny-100 to-white' : 'bg-gradient-to-r from-grape-50 to-white'}`}>
          <span className="text-4xl">{season.isOver ? '🏆' : '🏁'}</span>
          <div className="text-sm">
            <p className="font-display text-lg font-extrabold text-grape-800">{label}{season.isOver ? '' : ' — en cours'}</p>
            {season.isOver ? (
              season.champions.length
                ? <p className="text-grape-600 font-bold">Champion{season.champions.length > 1 ? 's' : ''} : {season.champions.map(c => c.name).join(' & ')} 🎉</p>
                : <p className="text-grape-500">Saison terminée</p>
            ) : (
              <p className="text-grape-500">{season.raceDays} journée{season.raceDays > 1 ? 's' : ''} courue{season.raceDays > 1 ? 's' : ''} · le premier en fin de saison remporte le trophée 🏆</p>
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
          {podiumOrder.length > 0 && (
            <div className="card px-3 pt-6 pb-0 overflow-hidden bg-gradient-to-b from-grape-50 to-white">
              <div className="flex items-end justify-center gap-2">
                {podiumOrder.map(group => {
                  if (group.empty) return <div key={group.rank} className="flex-1 max-w-[12rem]" />;
                  const step = STEPS[group.rank];
                  const tied = group.entries.length > 1;
                  return (
                    <div key={group.rank} className="flex flex-col items-center flex-1 min-w-0 max-w-[12rem]">
                      <div className="relative flex justify-center -space-x-3">
                        {group.rank === 1 && <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl animate-float z-10">👑</span>}
                        {group.entries.map(entry => (
                          <button key={entry.userId} onClick={() => onOpenProfile(entry.userId)} className="hover:z-10 hover:scale-105 transition-transform">
                            <Avatar user={userFor(entry)} users={users} size={tied ? 'lg' : group.rank === 1 ? 'xl' : 'lg'} />
                          </button>
                        ))}
                      </div>
                      <span className="mt-1 font-display font-extrabold text-grape-800 text-center leading-tight max-w-full break-words">
                        {group.entries.map(e => e.name).join(' & ')}
                      </span>
                      <span className="font-display text-xl font-extrabold text-grape-600 leading-none">
                        {group.entries[0].score} <span className="text-xs">pts</span>
                      </span>
                      <span className="text-xs font-bold text-grape-400">🐎 {group.entries[0].wins} gagnant{group.entries[0].wins !== 1 ? 's' : ''}</span>
                      {tied && <span className="chip bg-white text-grape-500 border border-grape-100 mt-1">ex æquo</span>}
                      <div className={`w-full mt-2 ${step.height} ${step.colour} rounded-t-2xl flex items-start justify-center pt-2 text-3xl`}>
                        {group.entries.map((e) => <span key={e.userId}>{step.medal}</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <ul className="space-y-2">
            {rest.map((entry, i) => {
              const isMe = entry.userId === selectedUserId;
              const shownRank = sortBy === 'score' ? entry.rank : i + 1;
              const tied = sortBy === 'score' && ranked.filter(e => e.rank === entry.rank).length > 1;
              return (
                <li key={entry.userId}>
                  <button onClick={() => onOpenProfile(entry.userId)}
                    className={`w-full card p-3 flex items-center gap-3 text-left hover:-translate-y-0.5 transition-transform ${isMe ? 'border-grape-300 bg-grape-50' : ''}`}>
                    <span className="w-8 text-center font-display text-xl font-extrabold text-grape-300 leading-none">
                      {shownRank}{tied && <span className="block text-[9px] font-bold">ex æquo</span>}
                    </span>
                    <Avatar user={userFor(entry)} users={users} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-extrabold text-grape-900 truncate">{entry.name}{isMe && <span className="text-grape-400 font-bold text-sm"> (toi)</span>}</p>
                      <p className="text-xs text-grape-400 truncate">
                        {entry.daysPlayed} journée{entry.daysPlayed !== 1 ? 's' : ''} · {entry.wins} 🐎 · {entry.crowns} 👑
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
            {champions.map(s => (
              <li key={s.id} className="flex items-center gap-3">
                <span className="text-2xl">🏆</span>
                <span className="font-bold text-grape-500 w-28 flex-shrink-0">{s.label}</span>
                <span className="flex items-center gap-2 flex-wrap">
                  {s.champions.map(c => (
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

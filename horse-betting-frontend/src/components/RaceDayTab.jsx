import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Trophy, Edit3, X, Star, Check, Flag, Lock, Pencil, ChevronDown, Clock, Eye, EyeOff } from 'lucide-react';
import { apiFetch } from '../api';
import { Avatar, EmptyState, GallopLoader, ProgressBar, MEDALS } from './ui.jsx';
import { useNow, isRaceLocked, raceStart, formatCountdown, relativeDay, formatDay } from '../utils/time';
import { pointsForOdds } from '../utils/scoring';
import { celebrate, markCelebrated } from '../utils/celebrate';

// Traditional saddle-cloth colours by horse number
const SADDLE_CLOTHS = {
  1: 'bg-red-600 text-white', 2: 'bg-white text-gray-900 border-2 border-gray-300', 3: 'bg-blue-600 text-white',
  4: 'bg-yellow-300 text-gray-900', 5: 'bg-green-600 text-white', 6: 'bg-gray-900 text-yellow-300',
  7: 'bg-orange-500 text-gray-900', 8: 'bg-pink-400 text-gray-900', 9: 'bg-teal-300 text-gray-900',
  10: 'bg-purple-700 text-white', 11: 'bg-gray-400 text-red-700', 12: 'bg-lime-400 text-gray-900',
  13: 'bg-amber-800 text-white', 14: 'bg-rose-900 text-yellow-300', 15: 'bg-yellow-700 text-gray-900',
  16: 'bg-sky-300 text-red-700',
};
const saddleCloth = (n) => SADDLE_CLOTHS[n] || 'bg-grape-200 text-grape-800';

const RaceDayTab = ({
  races, availableRaceDays, selectedRaceDay,
  fetchRaceDayData, refreshRaceDay, loading, isAdmin,
  bets: playerBets, bankers: playerBankers, users, selectedUserId, scoringConfig,
  handleSetBet, handleSetBanker, onLogin, onOpenProfile, showMessage,
}) => {
  const [editingRaceWinner, setEditingRaceWinner] = useState(null);
  const [editingLastHorse, setEditingLastHorse] = useState(null);
  const [editingOdds, setEditingOdds] = useState(null); // { raceId, horseNumber, value }
  const [editingHorse, setEditingHorse] = useState(null); // { raceId, horseNumber, ...fields }
  const [expandedRaces, setExpandedRaces] = useState({});
  const [raceDayScores, setRaceDayScores] = useState([]);
  const [pendingBet, setPendingBet] = useState(null);
  const now = useNow(15000);
  const dayStripRef = useRef(null);

  // Admin switch shared by everyone: when on, all bets are visible to all players
  // (the server then stops hiding them, so `bets`/`bankers` already contain everything)
  const bets = playerBets;
  const bankers = playerBankers;
  const [betsRevealed, setBetsRevealed] = useState(false);
  const [savingReveal, setSavingReveal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/bets/revealed`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => !cancelled && data && setBetsRevealed(!!data.revealed))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [races]);

  const toggleBetsRevealed = async () => {
    const next = !betsRevealed;
    setSavingReveal(true);
    try {
      const res = await apiFetch(`/admin/bets-revealed`, { method: 'PUT', body: JSON.stringify({ revealed: next }) });
      const data = await res.json();
      if (!res.ok) { showMessage(data.error || 'Réglage impossible', 'error'); return; }
      setBetsRevealed(next);
      await refreshRaceDay();
      showMessage(next ? 'Les paris sont maintenant visibles par tous 👁' : 'Les paris redeviennent secrets 🤫', 'success');
    } catch (e) {
      showMessage(`Erreur : ${e.message}`, 'error');
    } finally {
      setSavingReveal(false);
    }
  };

  const sortedRaces = useMemo(() => [...races].sort((a, b) => a.raceNumber - b.raceNumber), [races]);
  const firstRace = sortedRaces[0];
  const bankerLocked = !isAdmin && isRaceLocked(firstRace, now);
  const days = useMemo(() => [...availableRaceDays].sort(), [availableRaceDays]);

  const betFor = (userId, raceId) => bets?.find(b => String(b.userId) === String(userId) && b.raceId === raceId);
  const myBankerRaceId = selectedUserId ? bankers?.[String(selectedUserId)] : null;

  const adminRequest = async (path, options, onDone) => {
    try {
      const res = await apiFetch(path, options);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showMessage(err.error || 'Erreur lors de la sauvegarde', 'error');
        return;
      }
      onDone?.();
      refreshRaceDay();
    } catch (e) {
      showMessage(`Erreur réseau : ${e.message}`, 'error');
    }
  };

  const handleSetWinner = (raceId, winnerHorseNumber) =>
    adminRequest(`/races/${raceId}/winner`, { method: 'POST', body: JSON.stringify({ winnerHorseNumber }) },
      () => setEditingRaceWinner(null));

  const handleSetLastHorse = (raceId, horseNumber) =>
    adminRequest(`/races/${raceId}/last`, { method: 'POST', body: JSON.stringify({ lastHorseNumber: horseNumber }) },
      () => setEditingLastHorse(null));

  const handleToggleScratch = (raceId, horseNumber) =>
    adminRequest(`/races/${raceId}/horses/${horseNumber}/scratch`, { method: 'POST' });

  const handleSaveOdds = () => {
    if (!editingOdds) return;
    const { raceId, horseNumber, value } = editingOdds;
    const parsed = parseFloat(value);
    if (!parsed || parsed <= 0) { setEditingOdds(null); return; }
    adminRequest(`/races/${raceId}/horses/${horseNumber}/odds`, { method: 'PUT', body: JSON.stringify({ odds: parsed }) },
      () => setEditingOdds(null));
  };

  const handleStartEditHorse = (raceId, horse) => {
    setEditingHorse({
      raceId, horseNumber: horse.number,
      name: horse.name || '', odds: horse.odds || '',
      jockey: horse.jockey || '', trainer: horse.trainer || '',
      weight_kg: horse.weight_kg || '', age: horse.age || '',
      form: horse.form || '', stall_number: horse.stall ?? '',
    });
    setEditingOdds(null);
  };

  const handleSaveHorse = () => {
    if (!editingHorse) return;
    const { raceId, horseNumber, ...fields } = editingHorse;
    const payload = { ...fields };
    if (payload.odds !== '') payload.odds = parseFloat(payload.odds) || 0;
    else delete payload.odds;
    payload.weight_kg = payload.weight_kg !== '' ? parseFloat(payload.weight_kg) || null : null;
    payload.age = payload.age !== '' ? parseInt(payload.age, 10) || null : null;
    payload.stall_number = payload.stall_number !== '' ? parseInt(payload.stall_number, 10) || null : null;
    adminRequest(`/races/${raceId}/horses/${horseNumber}`, { method: 'PUT', body: JSON.stringify(payload) },
      () => setEditingHorse(null));
  };

  const onPickHorse = async (raceId, horseNumber) => {
    setPendingBet(`${raceId}:${horseNumber}`);
    await handleSetBet(raceId, horseNumber);
    setPendingBet(null);
  };

  // Day scores
  useEffect(() => {
    if (!selectedRaceDay) { setRaceDayScores([]); return undefined; }
    let cancelled = false;
    apiFetch(`/race-days/${selectedRaceDay}/scores`)
      .then(res => (res.ok ? res.json() : { scores: [] }))
      .then(data => !cancelled && setRaceDayScores(data.scores || []))
      .catch(() => !cancelled && setRaceDayScores([]));
    return () => { cancelled = true; };
  }, [selectedRaceDay, races]);

  // When a race starts, fetch again so everyone's bets are revealed
  const revealedRef = useRef(new Set());
  useEffect(() => {
    const justLocked = races.filter(r => !r.locked && isRaceLocked(r, now) && !revealedRef.current.has(r.id));
    if (justLocked.length) {
      justLocked.forEach(r => revealedRef.current.add(r.id));
      refreshRaceDay();
    }
  }, [now, races, refreshRaceDay]);

  // Confetti for wins we haven't celebrated yet
  useEffect(() => {
    if (!selectedUserId) return;
    for (const race of races) {
      const mine = betFor(selectedUserId, race.id);
      if (race.winner != null && mine?.horse === race.winner && markCelebrated(`${race.id}:${selectedUserId}`)) {
        celebrate(myBankerRaceId === race.id);
        break;
      }
    }
  }, [races, bets, selectedUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selected day chip in view
  useEffect(() => {
    dayStripRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [selectedRaceDay, days.length]);

  const openRaces = sortedRaces.filter(r => !isRaceLocked(r, now));
  const myBetCount = selectedUserId ? sortedRaces.filter(r => betFor(selectedUserId, r.id)).length : 0;
  const nextRace = openRaces[0];
  // Everyone who bet that day, ranked like the leaderboard (points, then winning horses)
  const dayPlayers = raceDayScores.filter(s => (s.bets ?? (s.score !== 0 ? 1 : 0)) > 0);
  const dayAbsent = raceDayScores.filter(s => !dayPlayers.includes(s));
  const anyResult = races.some(r => r.winner != null);

  return (
    <div className="space-y-5">

      {/* Admin switch: show everyone's bets to everyone */}
      {isAdmin ? (
        <div className={`card px-4 py-3 flex items-center gap-3 ${betsRevealed ? 'bg-sunny-100 border-sunny-300' : ''}`}>
          {betsRevealed ? <Eye className="w-5 h-5 text-grape-700 flex-shrink-0" /> : <EyeOff className="w-5 h-5 text-grape-400 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="font-display font-extrabold text-grape-800 leading-tight">Paris visibles par tous</p>
            <p className="text-xs text-grape-500">
              {betsRevealed ? 'Activé : tous les joueurs voient les paris de tout le monde.' : 'Désactivé : les paris restent secrets jusqu’au départ de chaque course.'}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={betsRevealed}
            aria-label="Paris visibles par tous"
            onClick={toggleBetsRevealed}
            disabled={savingReveal}
            className={`relative flex-shrink-0 w-14 h-8 rounded-full transition-colors disabled:opacity-60 ${betsRevealed ? 'bg-grape-500' : 'bg-grape-200'}`}
          >
            <span className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${betsRevealed ? 'translate-x-6' : ''}`} />
          </button>
        </div>
      ) : betsRevealed && (
        <div className="card px-4 py-3 flex items-center gap-3 bg-sunny-100 border-sunny-300">
          <Eye className="w-5 h-5 text-grape-700 flex-shrink-0" />
          <p className="text-sm font-bold text-grape-800">Les paris de tout le monde sont visibles — l’admin a levé le secret.</p>
        </div>
      )}

      {/* Day picker */}
      <div ref={dayStripRef} className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        {days.map(day => {
          const selected = day === selectedRaceDay;
          return (
            <button
              key={day}
              data-selected={selected}
              onClick={() => fetchRaceDayData(day)}
              className={`flex-shrink-0 rounded-2xl px-4 py-2 text-center border-2 transition-all ${
                selected ? 'bg-grape-500 border-grape-500 text-white shadow-[0_4px_0_0_theme(colors.grape.700)]' : 'bg-white border-grape-100 text-grape-600 hover:border-grape-300'
              }`}
            >
              <div className="font-display font-extrabold leading-tight">{relativeDay(day)}</div>
              <div className={`text-[11px] font-bold ${selected ? 'text-grape-100' : 'text-grape-300'}`}>{formatDay(day, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="card"><GallopLoader label="Les chevaux arrivent…" /></div>
      ) : races.length === 0 ? (
        <div className="card">
          <EmptyState emoji="🐴" title="Pas de courses ce jour-là">
            Choisis une autre journée{isAdmin ? ' ou importe les courses depuis l’admin' : ''}.
          </EmptyState>
        </div>
      ) : (
        <>
          {/* My day */}
          {!selectedUserId ? (
            <div className="card p-5 flex items-center gap-4 bg-gradient-to-br from-sunny-100 to-white">
              <span className="text-5xl animate-wiggle inline-block">🎟️</span>
              <div className="flex-1">
                <p className="font-display text-xl font-extrabold text-grape-800">Envie de jouer ?</p>
                <p className="text-grape-500 text-sm">Connecte-toi pour placer tes paris.</p>
              </div>
              <button onClick={onLogin} className="btn-primary">Je joue !</button>
            </div>
          ) : openRaces.length > 0 && (
            <div className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-2">
                <p className="font-display text-lg font-extrabold text-grape-800 whitespace-nowrap">
                  Tes paris : {myBetCount}/{sortedRaces.length} {myBetCount === sortedRaces.length ? '🎉' : '🐎'}
                </p>
                {nextRace && raceStart(nextRace) && (
                  <span className="chip bg-sky2-100 text-sky2-500 whitespace-nowrap"><Clock className="w-3 h-3" /> C{nextRace.raceNumber} dans {formatCountdown(raceStart(nextRace) - now)}</span>
                )}
              </div>
              <ProgressBar value={myBetCount} max={sortedRaces.length} className="bg-gradient-to-r from-grape-400 to-coral-400" />
              <p className="mt-3 text-sm font-bold">
                {myBankerRaceId ? (
                  <span className="text-sunny-600">⭐ Banker sur la course {races.find(r => r.id === myBankerRaceId)?.raceNumber} — ×2 si elle passe !</span>
                ) : bankerLocked ? (
                  <span className="text-grape-400">Pas de banker aujourd'hui 😅</span>
                ) : (
                  <span className="text-coral-500">N'oublie pas ton banker ⭐ (touche l'étoile d'une course)</span>
                )}
              </p>
            </div>
          )}

          {/* Day scores */}
          {anyResult && dayPlayers.length > 0 && (
            <div className="card p-4">
              <p className="font-display font-extrabold text-grape-800 mb-3 flex items-center gap-2"><Trophy className="w-5 h-5 text-sunny-500" /> Le score du jour</p>
              <ul className="space-y-1.5">
                {dayPlayers.map(score => {
                  const user = users.find(u => u.id === score.userId) || { id: score.userId, name: score.name };
                  const medal = score.score > 0 ? MEDALS[score.rank - 1] : null;
                  const isMe = score.userId === selectedUserId;
                  return (
                    <li key={score.userId}>
                      <button onClick={() => onOpenProfile(score.userId)}
                        className={`w-full flex items-center gap-2 rounded-2xl px-2 py-1.5 border-2 text-left ${score.rank === 1 && score.score > 0 ? 'bg-sunny-100 border-sunny-300' : isMe ? 'bg-grape-50 border-grape-200' : 'bg-white border-grape-50'}`}>
                        <span className="w-6 text-center font-display font-extrabold text-grape-300">{medal || score.rank}</span>
                        <Avatar user={user} users={users} size="sm" />
                        <span className="flex-1 min-w-0 font-bold text-grape-800 truncate">{score.name}{isMe && <span className="text-grape-400 font-semibold"> (toi)</span>}</span>
                        <span className="text-xs font-bold text-grape-400 whitespace-nowrap">🐎 {score.races_won ?? 0}</span>
                        <span className="w-14 text-right font-display font-extrabold text-grape-600 whitespace-nowrap">{score.score} pt{Math.abs(score.score) > 1 ? 's' : ''}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {dayAbsent.length > 0 && (
                <p className="mt-2 text-xs text-grape-400">Pas joué ce jour-là : {dayAbsent.map(s => s.name).join(', ')}</p>
              )}
            </div>
          )}

          {/* Races */}
          {sortedRaces.map(race => {
            const myBet = betFor(selectedUserId, race.id);
            const isBanker = myBankerRaceId === race.id;
            const locked = isRaceLocked(race, now);
            const finished = race.winner != null;
            const canBet = !!selectedUserId && (!locked || isAdmin);
            const hiddenBets = !locked && !betsRevealed ? Math.max(0, (race.betCount || 0) - (myBet ? 1 : 0)) : 0;
            const start = raceStart(race);
            const wonMine = finished && myBet?.horse === race.winner;
            const winnerHorse = race.horses.find(h => h.number === race.winner);
            const winnerPoints = pointsForOdds(winnerHorse?.odds, scoringConfig);
            const raceBankers = (users || []).filter(u => bankers?.[String(u.id)] === race.id);
            const collapsed = finished && !expandedRaces[race.id];
            const visibleHorses = collapsed
              ? race.horses.filter(h => h.number === race.winner || h.number === myBet?.horse)
              : race.horses;

            return (
              <div key={race.id} className={`card overflow-hidden ${wonMine ? 'border-mint-300 ring-4 ring-mint-100' : ''}`}>

                {/* Race header */}
                <div className={`px-4 pt-4 pb-3 ${finished ? 'bg-grape-50' : locked ? 'bg-sky2-100' : 'bg-gradient-to-r from-grape-50 to-white'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-display text-white leading-none ${finished ? 'bg-grape-300' : 'bg-grape-500 shadow-[0_3px_0_0_theme(colors.grape.700)]'}`}>
                      <span className="text-[9px] font-bold opacity-80">COURSE</span>
                      <span className="text-xl font-extrabold">{race.raceNumber}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg font-extrabold text-grape-900 leading-tight truncate">{race.name || `Course ${race.raceNumber}`}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {race.time && (
                          <span className="chip bg-white text-grape-600 border border-grape-100">
                            {locked ? <Lock className="w-3 h-3" /> : <Clock className="w-3 h-3" />}{race.time}
                          </span>
                        )}
                        {race.distance && <span className="chip bg-white text-grape-600 border border-grape-100">{race.distance}</span>}
                        {!locked && start && start - now < 3 * 3600 * 1000 && (
                          <span className="chip bg-coral-100 text-coral-600">⏱ dans {formatCountdown(start - now)}</span>
                        )}
                        {locked && !finished && <span className="chip bg-sky2-200 text-sky2-500">🏁 Partis !</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {selectedUserId && (
                        <button
                          onClick={() => handleSetBanker(race.id)}
                          disabled={(bankerLocked && !isBanker) || (!myBet && !isAdmin)}
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all disabled:opacity-30 ${
                            isBanker ? 'bg-sunny-300 text-grape-900 shadow-[0_3px_0_0_theme(colors.sunny.600)] animate-pop' : 'bg-white border-2 border-grape-100 text-grape-300 hover:text-sunny-500 hover:border-sunny-300'
                          }`}
                          title={bankerLocked ? 'Banker verrouillé' : isBanker ? 'Ton banker (×2)' : myBet ? 'Choisir comme banker (×2)' : "Parie d'abord sur cette course"}
                          aria-label="Banker"
                        >
                          <Star className={`w-5 h-5 ${isBanker ? 'fill-grape-900' : ''}`} />
                        </button>
                      )}
                      {isAdmin && (
                        <>
                          <button onClick={() => { setEditingRaceWinner(editingRaceWinner === race.id ? null : race.id); setEditingLastHorse(null); }}
                            className={`p-2 rounded-xl transition-colors ${editingRaceWinner === race.id ? 'bg-grape-200 text-grape-800' : 'text-grape-300 hover:bg-grape-100 hover:text-grape-600'}`}
                            title="Définir le gagnant">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button onClick={() => { setEditingLastHorse(editingLastHorse === race.id ? null : race.id); setEditingRaceWinner(null); }}
                            className={`p-2 rounded-xl transition-colors ${editingLastHorse === race.id ? 'bg-coral-200 text-coral-600' : 'text-grape-300 hover:bg-coral-100 hover:text-coral-500'}`}
                            title="Définir le dernier">
                            <Flag className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status line */}
                  <div className="mt-3 text-sm font-bold">
                    {wonMine ? (
                      <p className="text-mint-600">🎉 Gagné ! {winnerHorse?.name} te rapporte {winnerPoints ?? '?'} pt{winnerPoints > 1 ? 's' : ''}{isBanker ? ' — et ton banker double la journée ! ⭐' : ''}</p>
                    ) : finished ? (
                      <p className="text-grape-600">🏆 Gagnant : n°{race.winner} {winnerHorse?.name}{myBet ? ' — pas cette fois 😬' : ''}</p>
                    ) : betsRevealed && !locked ? (
                      <p className="text-grape-600">👁 {race.betCount || 0} pari{(race.betCount || 0) > 1 ? 's' : ''} — visible{(race.betCount || 0) > 1 ? 's' : ''} par tous</p>
                    ) : hiddenBets > 0 ? (
                      <p className="text-grape-500">🤫 {hiddenBets} pari{hiddenBets > 1 ? 's' : ''} secret{hiddenBets > 1 ? 's' : ''} — révélé{hiddenBets > 1 ? 's' : ''} au départ</p>
                    ) : !locked ? (
                      <p className="text-grape-400">{myBet ? 'Les paris des autres seront révélés au départ 🤫' : 'Personne n’a encore parié — à toi de lancer la course !'}</p>
                    ) : (
                      <p className="text-sky2-500">Paris révélés — que le meilleur gagne !</p>
                    )}
                    {raceBankers.length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5 text-sunny-600">
                        <Star className="w-3.5 h-3.5 fill-sunny-400 text-sunny-500" />
                        <span className="text-xs mr-1">Banker de</span>
                        {raceBankers.map(u => <Avatar key={u.id} user={u} users={users} size="xs" />)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin winner / last pickers */}
                {(editingRaceWinner === race.id || editingLastHorse === race.id) && (
                  <div className={`p-3 border-y-2 ${editingRaceWinner === race.id ? 'bg-sunny-100 border-sunny-200' : 'bg-coral-100 border-coral-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-grape-800">{editingRaceWinner === race.id ? '🏆 Quel cheval a gagné ?' : '🐢 Quel cheval est arrivé dernier ?'}</span>
                      <button onClick={() => { setEditingRaceWinner(null); setEditingLastHorse(null); }} className="text-grape-400 hover:text-grape-700"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {race.horses.filter(h => editingRaceWinner === race.id || !h.scratched).map(horse => (
                        <button
                          key={horse.number}
                          onClick={() => (editingRaceWinner === race.id ? handleSetWinner(race.id, horse.number) : handleSetLastHorse(race.id, horse.number))}
                          className={`flex items-center gap-2 px-2 py-1.5 bg-white border-2 rounded-xl hover:border-grape-400 text-left ${
                            (editingRaceWinner === race.id ? race.winner : race.lastHorse) === horse.number ? 'border-grape-500' : 'border-grape-100'
                          }`}
                        >
                          <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${saddleCloth(horse.number)}`}>{horse.number}</span>
                          <span className="text-sm font-bold truncate">{horse.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Horses */}
                <div className="divide-y-2 divide-grape-50">
                  {visibleHorses.map(horse => {
                    const isMyBet = myBet?.horse === horse.number;
                    const isWinner = race.winner === horse.number;
                    const isLastHorse = race.lastHorse === horse.number;
                    const isScratched = !!horse.scratched;
                    const canBetThisHorse = canBet && !isScratched && !isMyBet;
                    const points = pointsForOdds(horse.odds, scoringConfig);
                    const pickers = (users || []).filter(u => u.id !== selectedUserId && betFor(u.id, race.id)?.horse === horse.number);
                    const isPending = pendingBet === `${race.id}:${horse.number}`;
                    const editingThis = editingHorse?.raceId === race.id && editingHorse?.horseNumber === horse.number;

                    const rowStyle = isScratched ? 'opacity-50 bg-gray-50' :
                      isWinner ? 'bg-sunny-100' :
                      isMyBet ? 'bg-grape-50' :
                      isLastHorse ? 'bg-coral-100/50' : 'bg-white';

                    return (
                      <div key={horse.number} className={`relative ${rowStyle} transition-colors`}>
                        <button
                          onClick={() => canBetThisHorse && onPickHorse(race.id, horse.number)}
                          disabled={!canBetThisHorse}
                          className={`w-full px-4 py-3 flex items-center gap-3 text-left ${canBetThisHorse ? 'hover:bg-grape-50 active:scale-[0.99]' : 'cursor-default'} transition-transform`}
                        >
                          {/* Saddle cloth */}
                          <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-display text-lg font-extrabold shadow-sm ${saddleCloth(horse.number)} ${isMyBet ? 'ring-4 ring-grape-300' : ''}`}>
                              {horse.number}
                            </span>
                            {horse.stall != null && <span className="text-[10px] font-bold text-grape-300">stalle {horse.stall}</span>}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-display text-base font-extrabold truncate ${isScratched ? 'line-through text-gray-400' : 'text-grape-900'}`}>{horse.name}</span>
                              {isWinner && <span title="Gagnant">🏆</span>}
                              {isLastHorse && !isScratched && <span title="Dernier">🐢</span>}
                              {isScratched && <span className="chip bg-gray-200 text-gray-500">non-partant</span>}
                            </div>
                            {(horse.jockey || horse.weight_kg || horse.form) && (
                              <div className="flex flex-wrap gap-x-2 text-xs text-grape-400 mt-0.5">
                                {horse.jockey && <span>🧢 {horse.jockey}</span>}
                                {horse.weight_kg && <span>{horse.weight_kg} kg</span>}
                                {horse.age && <span>{horse.age} ans</span>}
                                {horse.form && <span className="font-mono tracking-tight">{horse.form}</span>}
                              </div>
                            )}
                            {(isMyBet || pickers.length > 0) && (
                              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                {isMyBet && <span className="chip bg-grape-500 text-white"><Check className="w-3 h-3" /> Ton choix{isBanker ? ' ⭐' : ''}</span>}
                                {pickers.map(u => <Avatar key={u.id} user={u} users={users} size="xs" />)}
                              </div>
                            )}
                          </div>

                          {/* Odds + points */}
                          <div className="flex-shrink-0 flex flex-col items-end gap-1">
                            {isPending ? (
                              <span className="text-grape-400 text-sm font-bold">…</span>
                            ) : isAdmin && editingOdds?.raceId === race.id && editingOdds?.horseNumber === horse.number ? (
                              <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <input type="number" step="0.1" min="0.1" value={editingOdds.value}
                                  onChange={e => setEditingOdds(prev => ({ ...prev, value: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') handleSaveOdds(); if (e.key === 'Escape') setEditingOdds(null); }}
                                  className="w-16 text-sm px-1 py-0.5 border-2 border-grape-200 rounded-lg" autoFocus />
                                <span role="button" tabIndex={0} onClick={handleSaveOdds} className="p-0.5 text-mint-500"><Check className="w-4 h-4" /></span>
                              </span>
                            ) : horse.odds > 0 ? (
                              <span
                                className={`font-display text-lg font-extrabold leading-none ${isAdmin ? 'cursor-pointer hover:underline' : ''} ${isMyBet ? 'text-grape-700' : 'text-grape-800'}`}
                                onClick={isAdmin ? (e => { e.stopPropagation(); setEditingOdds({ raceId: race.id, horseNumber: horse.number, value: String(horse.odds) }); }) : undefined}
                                title={isAdmin ? 'Modifier la cote' : 'Cote'}
                              >
                                {horse.odds}
                              </span>
                            ) : isAdmin ? (
                              <span className="text-xs text-grape-300 px-2 py-0.5 rounded-lg border-2 border-dashed border-grape-200 cursor-pointer"
                                onClick={e => { e.stopPropagation(); setEditingOdds({ raceId: race.id, horseNumber: horse.number, value: '' }); }}>cote</span>
                            ) : null}
                            {points != null && horse.odds > 0 && !isScratched && (
                              <span className={`chip ${points >= 3 ? 'bg-coral-100 text-coral-600' : points === 2 ? 'bg-sunny-100 text-sunny-600' : 'bg-mint-100 text-mint-600'}`}>
                                +{points} pt{points > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </button>

                        {/* Admin controls: edit + scratch */}
                        {isAdmin && (
                          <div className="absolute top-1 right-24 flex items-center gap-1">
                            <button onClick={() => (editingThis ? setEditingHorse(null) : handleStartEditHorse(race.id, horse))}
                              className={`p-1 rounded-lg ${editingThis ? 'bg-grape-200 text-grape-700' : 'text-grape-200 hover:text-grape-600 hover:bg-grape-100'}`}
                              title="Modifier le cheval">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => handleToggleScratch(race.id, horse.number)}
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${isScratched ? 'bg-coral-100 text-coral-600' : 'text-grape-200 hover:text-orange-600 hover:bg-orange-100'}`}>
                              {isScratched ? 'Rétablir' : 'NP'}
                            </button>
                          </div>
                        )}

                        {/* Admin inline edit form */}
                        {isAdmin && editingThis && (
                          <div className="px-4 py-3 bg-grape-50 border-t-2 border-grape-100">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {[
                                ['name', 'Nom', 'text', 'col-span-2'], ['odds', 'Cote', 'number'], ['stall_number', 'Stalle', 'number'],
                                ['jockey', 'Jockey', 'text'], ['trainer', 'Entraîneur', 'text'], ['weight_kg', 'Poids (kg)', 'number'],
                                ['age', 'Âge', 'number'], ['form', 'Forme', 'text', 'col-span-2'],
                              ].map(([field, label, type, span = '']) => (
                                <label key={field} className={`flex flex-col ${span}`}>
                                  <span className="text-xs font-bold text-grape-400 mb-0.5">{label}</span>
                                  <input type={type} step={type === 'number' ? 'any' : undefined} value={editingHorse[field]}
                                    onChange={e => setEditingHorse(p => ({ ...p, [field]: e.target.value }))}
                                    className="px-2 py-1 border-2 border-grape-100 rounded-lg" />
                                </label>
                              ))}
                            </div>
                            <div className="flex justify-end gap-2 mt-3">
                              <button type="button" onClick={() => setEditingHorse(null)} className="btn-ghost py-1 text-sm">Annuler</button>
                              <button type="button" onClick={handleSaveHorse} className="btn-primary py-1 text-sm"><Check className="w-4 h-4" /> Sauvegarder</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {finished && (
                  <button onClick={() => setExpandedRaces(p => ({ ...p, [race.id]: !p[race.id] }))}
                    className="w-full py-2 text-sm font-bold text-grape-400 hover:text-grape-600 hover:bg-grape-50 flex items-center justify-center gap-1 border-t-2 border-grape-50">
                    {collapsed ? `Voir les ${race.horses.length} chevaux` : 'Réduire'}
                    <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};

export default RaceDayTab;

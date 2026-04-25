import React, { useState, useEffect } from 'react';
import { Calendar, ChevronDown, Trophy, Edit3, X, Star, Check, AlertCircle, Flag, Lock } from 'lucide-react';
import API_BASE from '../config';
import { initials, getUserColour } from '../utils/userColors';

// Returns true if it's past the race start time in Mauritius (GMT+4)
const isRaceTimeLocked = (raceTime, raceDate) => {
  if (!raceTime || raceTime === 'TBD' || !raceDate) return false;
  const now = new Date();
  // Shift to Mauritius time (UTC+4)
  const muNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const muDateStr = muNow.toISOString().slice(0, 10);
  // Only lock today's races
  if (raceDate !== muDateStr) return false;
  const [raceH, raceM] = raceTime.split(':').map(Number);
  const muH = muNow.getUTCHours();
  const muMin = muNow.getUTCMinutes();
  return muH * 60 + muMin >= raceH * 60 + raceM;
};

const SkeletonCard = () => (
  <div className="bg-white p-4 rounded-lg shadow animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
  </div>
);

const RaceDayTab = ({
  races, currentRaceDay, availableRaceDays, selectedRaceDay,
  fetchAllData, fetchRaceDayData, loading, isAdmin,
  bets, bankers, users, selectedUserId,
  handleSetBet, handleSetBanker,
}) => {
  const [editingRaceWinner, setEditingRaceWinner] = useState(null);
  const [editingLastHorse, setEditingLastHorse] = useState(null);
  const [editingOdds, setEditingOdds] = useState(null); // { raceId, horseNumber, value }
  const [raceDayScores, setRaceDayScores] = useState([]);
  const [loadingScores, setLoadingScores] = useState(false);

  const handleSetWinner = async (raceId, winnerHorseNumber) => {
    try {
      const res = await fetch(`${API_BASE}/races/${raceId}/winner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerHorseNumber }),
      });
      if (res.ok) {
        setEditingRaceWinner(null);
        selectedRaceDay ? fetchRaceDayData(selectedRaceDay) : fetchAllData();
      }
    } catch (e) {
      console.error('Error setting winner:', e);
    }
  };

  const handleSaveOdds = async () => {
    if (!editingOdds) return;
    const { raceId, horseNumber, value } = editingOdds;
    const parsed = parseFloat(value);
    if (!parsed || parsed <= 0) { setEditingOdds(null); return; }
    try {
      await fetch(`${API_BASE}/races/${raceId}/horses/${horseNumber}/odds`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ odds: parsed }),
      });
      setEditingOdds(null);
      selectedRaceDay ? fetchRaceDayData(selectedRaceDay) : fetchAllData();
    } catch (e) {
      console.error('Error updating odds:', e);
    }
  };

  const handleSetLastHorse = async (raceId, horseNumber) => {
    try {
      const res = await fetch(`${API_BASE}/races/${raceId}/last`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastHorseNumber: horseNumber }),
      });
      if (res.ok) {
        setEditingLastHorse(null);
        selectedRaceDay ? fetchRaceDayData(selectedRaceDay) : fetchAllData();
      }
    } catch (e) {
      console.error('Error setting last horse:', e);
    }
  };

  const handleToggleScratch = async (raceId, horseNumber) => {
    try {
      const res = await fetch(`${API_BASE}/races/${raceId}/horses/${horseNumber}/scratch`, {
        method: 'POST',
      });
      if (res.ok) {
        selectedRaceDay ? fetchRaceDayData(selectedRaceDay) : fetchAllData();
      }
    } catch (e) {
      console.error('Error toggling scratch:', e);
    }
  };

  const fetchRaceDayScores = async (raceDate) => {
    if (!raceDate) return;
    setLoadingScores(true);
    try {
      const res = await fetch(`${API_BASE}/race-days/${raceDate}/scores`);
      if (res.ok) {
        const data = await res.json();
        setRaceDayScores(data.scores || []);
      } else {
        setRaceDayScores([]);
      }
    } catch {
      setRaceDayScores([]);
    } finally {
      setLoadingScores(false);
    }
  };

  useEffect(() => {
    if (selectedRaceDay) fetchRaceDayScores(selectedRaceDay);
    else setRaceDayScores([]);
  }, [selectedRaceDay]);

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-b-lg shadow-lg">
        <p className="text-center text-gray-500 py-10">Loading races...</p>
        <div className="space-y-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-b-lg shadow-lg">

      {/* Race day selector */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-indigo-700 mb-4">
          <Calendar className="w-6 h-6" />
          Races
        </h2>
        <div className="relative">
          <select
            value={selectedRaceDay || ''}
            onChange={(e) => fetchRaceDayData(e.target.value)}
            className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-4 py-3 pr-10 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[48px]"
          >
            <option value="">Choose a race day...</option>
            {availableRaceDays.map(day => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Compact scores strip */}
      {selectedRaceDay && raceDayScores.length > 0 && (
        <div className="mb-6 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-semibold text-indigo-700">Scores</span>
            {loadingScores && <span className="text-xs text-gray-400">updating…</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {raceDayScores.map((score, index) => {
              const colour = getUserColour(users, score.userId);
              const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;
              return (
                <div key={score.userId} className="flex items-center gap-1.5 bg-white rounded-full px-3 py-1 shadow-sm border border-indigo-100">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${colour}`}>
                    {initials(score.name)}
                  </span>
                  <span className="text-sm font-semibold text-gray-800">{score.name}</span>
                  {medal && <span className="text-sm">{medal}</span>}
                  <span className="text-sm font-bold text-indigo-600">{score.score}pt</span>
                  <span className="text-xs text-gray-400">{score.races_won ?? 0}✓</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Race list */}
      {races.length > 0 ? (
        <div className="space-y-4">
          {races.map(race => {
            const myBet = bets?.find(b => String(b.userId) === String(selectedUserId) && b.raceId === race.id);
            const isBanker = bankers && selectedUserId && bankers[String(selectedUserId)] === race.id;
            const timeLocked = isRaceTimeLocked(race.time, selectedRaceDay);
            const canBet = !!selectedUserId && race.status !== 'completed' && !timeLocked;

            return (
              <div key={race.id} className="bg-gray-50 p-4 rounded-lg shadow-sm">

                {/* Race header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-lg text-indigo-600">Course {race.raceNumber || race.id}</span>
                      {race.time && (
                        <span className="flex items-center gap-1 text-gray-600 text-sm font-medium">
                          {timeLocked
                            ? <Lock className="w-3.5 h-3.5 text-red-400" />
                            : null}
                          {race.time}
                        </span>
                      )}
                      {race.distance && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{race.distance}</span>
                      )}
                      {race.winner && (
                        <span className="flex items-center gap-1 text-yellow-600 text-xs font-medium">
                          <Trophy className="w-3.5 h-3.5" />#{race.winner}
                        </span>
                      )}
                    </div>
                    {race.name && <p className="text-xs text-gray-400 mt-0.5 truncate">{race.name}</p>}
                    {timeLocked && race.status !== 'completed' && (
                      <p className="text-xs text-red-400 mt-0.5 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Paris verrouillés — course démarrée
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Banker star */}
                    {selectedUserId && (
                      <button
                        onClick={() => handleSetBanker(race.id)}
                        disabled={race.status === 'completed' || timeLocked}
                        className={`p-2 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          isBanker ? 'text-yellow-500 bg-yellow-100' : 'text-gray-300 hover:text-yellow-400'
                        }`}
                        title={isBanker ? 'Retirer banker (×2)' : 'Définir comme banker (×2)'}
                      >
                        <Star className={`w-5 h-5 ${isBanker ? 'fill-yellow-500' : ''}`} />
                      </button>
                    )}
                    {/* Admin: set winner */}
                    {isAdmin && (
                      <button
                        onClick={() => { setEditingRaceWinner(editingRaceWinner === race.id ? null : race.id); setEditingLastHorse(null); }}
                        className={`p-1 transition-colors ${editingRaceWinner === race.id ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-600'}`}
                        title="Définir le gagnant"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    {/* Admin: set last horse */}
                    {isAdmin && (
                      <button
                        onClick={() => { setEditingLastHorse(editingLastHorse === race.id ? null : race.id); setEditingRaceWinner(null); }}
                        className={`p-1 transition-colors ${editingLastHorse === race.id ? 'text-red-600' : 'text-gray-400 hover:text-red-500'}`}
                        title="Définir le dernier"
                      >
                        <Flag className="w-4 h-4" />
                      </button>
                    )}
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      race.status === 'completed' ? 'bg-green-200 text-green-800' :
                      race.status === 'in_progress' ? 'bg-blue-200 text-blue-800' :
                      'bg-yellow-200 text-yellow-800'
                    }`}>
                      {race.status}
                    </span>
                  </div>
                </div>

                {/* Admin winner picker */}
                {editingRaceWinner === race.id && (
                  <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-800">Select the winning horse:</span>
                      <button onClick={() => setEditingRaceWinner(null)} className="text-blue-500 hover:text-blue-800">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {race.horses.map(horse => (
                        <button
                          key={horse.number}
                          onClick={() => handleSetWinner(race.id, horse.number)}
                          className="flex items-center gap-2 px-3 py-2 bg-white border border-blue-300 rounded-lg hover:bg-blue-100 transition-colors text-left"
                        >
                          <span className="font-bold text-blue-600">#{horse.number}</span>
                          <span className="text-sm truncate">{horse.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Admin last horse picker */}
                {editingLastHorse === race.id && (
                  <div className="mb-3 p-3 bg-red-50 rounded-lg border border-red-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-red-800">Choisir le dernier cheval :</span>
                      <button onClick={() => setEditingLastHorse(null)} className="text-red-400 hover:text-red-700">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {race.horses.filter(h => !h.scratched).map(horse => (
                        <button
                          key={horse.number}
                          onClick={() => handleSetLastHorse(race.id, horse.number)}
                          className={`flex items-center gap-2 px-3 py-2 bg-white border rounded-lg hover:bg-red-50 transition-colors text-left ${race.lastHorse === horse.number ? 'border-red-500 bg-red-50' : 'border-red-200'}`}
                        >
                          <span className="font-bold text-red-600">#{horse.number}</span>
                          <span className="text-sm truncate">{horse.name}</span>
                          {race.lastHorse === horse.number && <Flag className="w-3 h-3 text-red-500 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Horse rows */}
                <div className="space-y-2">
                  {race.horses.map(horse => {
                    const isMyBet = myBet?.horse === horse.number;
                    const isWinner = race.winner === horse.number;
                    const isLastHorse = race.lastHorse === horse.number;
                    const wonBet = isMyBet && isWinner;
                    const isScratched = !!horse.scratched;
                    const canBetThisHorse = canBet && !isScratched;

                    // Who picked this horse?
                    const pickers = (users || []).filter(u => {
                      const b = bets?.find(bet => String(bet.userId) === String(u.id) && bet.raceId === race.id);
                      return b?.horse === horse.number;
                    });

                    return (
                      <div key={horse.number} className="relative">
                        <button
                          onClick={() => canBetThisHorse && handleSetBet(race.id, horse.number)}
                          disabled={!canBetThisHorse}
                          className={`w-full p-3 rounded-lg flex items-center justify-between min-h-[52px] transition-all ${
                            isScratched ? 'opacity-50 cursor-not-allowed bg-gray-100 border border-dashed border-gray-300' :
                            canBet ? 'cursor-pointer' : 'cursor-default'
                          } ${isScratched ? '' :
                            wonBet
                              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md border-2 border-green-400'
                              : isWinner
                              ? 'bg-gradient-to-r from-yellow-100 to-yellow-50 border-2 border-yellow-300'
                              : isLastHorse
                              ? 'bg-red-50 border border-red-200'
                              : isMyBet
                              ? 'bg-indigo-600 text-white shadow-md'
                              : canBet
                              ? 'bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300'
                              : 'bg-white border border-gray-100'
                          }`}
                        >
                          {/* Left: number circle + name/badges column */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className={`flex-shrink-0 font-bold w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                              isScratched ? 'bg-gray-200 text-gray-400' :
                              wonBet ? 'bg-white text-green-600' :
                              isWinner ? 'bg-yellow-400 text-yellow-900' :
                              isLastHorse ? 'bg-red-200 text-red-700' :
                              isMyBet ? 'bg-white text-indigo-600' :
                              'bg-indigo-100 text-indigo-600'
                            }`}>
                              {horse.number}
                            </span>
                            <div className="min-w-0">
                              {/* Name row */}
                              <div className="flex items-center gap-1.5">
                                <span className={`font-medium truncate ${
                                  isScratched ? 'line-through text-gray-400' :
                                  wonBet || isMyBet ? 'text-white' :
                                  isWinner ? 'text-yellow-900' :
                                  isLastHorse ? 'text-red-700' : 'text-gray-800'
                                }`}>
                                  {horse.name}
                                </span>
                                {isScratched && <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" title="Non-partant" />}
                                {wonBet && <Trophy className="w-3.5 h-3.5 flex-shrink-0" />}
                                {isWinner && !isMyBet && <Trophy className="w-3.5 h-3.5 flex-shrink-0 text-yellow-600" />}
                                {isLastHorse && !isScratched && <Flag className="w-3 h-3 flex-shrink-0 text-red-500" title="Dernier" />}
                              </div>
                              {/* Pickers row — below the name */}
                              {pickers.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {pickers.map(u => {
                                    const colour = getUserColour(users, u.id);
                                    const isMe = String(u.id) === String(selectedUserId);
                                    return (
                                      <span
                                        key={u.id}
                                        title={u.name}
                                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${colour} ${isMe ? 'ring-2 ring-white ring-offset-1' : ''}`}
                                      >
                                        {initials(u.name)}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                        {/* Right: odds only */}
                        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                          {isAdmin && editingOdds?.raceId === race.id && editingOdds?.horseNumber === horse.number ? (
                            <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={editingOdds.value}
                                onChange={e => setEditingOdds(prev => ({ ...prev, value: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveOdds(); if (e.key === 'Escape') setEditingOdds(null); }}
                                className="w-16 text-sm px-1 py-0.5 border border-indigo-300 rounded text-gray-800 bg-white"
                                autoFocus
                              />
                              <button onClick={handleSaveOdds} className="p-0.5 text-green-600 hover:bg-green-100 rounded"><Check className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setEditingOdds(null)} className="p-0.5 text-gray-400 hover:bg-gray-100 rounded"><X className="w-3.5 h-3.5" /></button>
                            </span>
                          ) : (
                            horse.odds && (
                              <span
                                className={`text-sm px-2 py-0.5 rounded ${
                                  wonBet ? 'bg-white text-green-600' :
                                  isWinner ? 'bg-yellow-200 text-yellow-800' :
                                  isMyBet ? 'bg-indigo-500 text-white' :
                                  'bg-gray-100 text-gray-600'
                                } ${isAdmin ? 'cursor-pointer hover:ring-1 hover:ring-indigo-400' : ''}`}
                                onClick={isAdmin ? (e => { e.stopPropagation(); setEditingOdds({ raceId: race.id, horseNumber: horse.number, value: String(horse.odds) }); }) : undefined}
                                title={isAdmin ? 'Modifier la cote' : undefined}
                              >
                                {horse.odds}
                              </span>
                            )
                          )}
                        </div>
                        </button>
                        {/* Admin scratch toggle */}
                        {isAdmin && race.status !== 'completed' && (
                          <button
                            onClick={() => handleToggleScratch(race.id, horse.number)}
                            className={`absolute top-1 right-1 text-xs px-1.5 py-0.5 rounded transition-colors ${
                              isScratched
                                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                : 'bg-gray-100 text-gray-400 hover:bg-orange-100 hover:text-orange-600'
                            }`}
                            title={isScratched ? 'Rétablir le cheval' : 'Marquer non-partant'}
                          >
                            {isScratched ? 'Rétablir' : 'NP'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-10">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">No races available for this date</p>
          <p className="text-sm text-gray-400">Select a different date or use the Admin panel to scrape new races</p>
        </div>
      )}
    </div>
  );
};

export default RaceDayTab;

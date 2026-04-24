import React, { useState, useEffect } from 'react';
import { Calendar, ChevronDown, Trophy, Edit3, X, Star } from 'lucide-react';
import API_BASE from '../config';

// Consistent colour per user (by index in users array)
const BADGE_COLOURS = [
  'bg-pink-500', 'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-rose-500', 'bg-teal-500', 'bg-amber-500',
];

const initials = (name) => name.trim().slice(0, 2).toUpperCase();

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
              const userIndex = users.findIndex(u => String(u.id) === String(score.userId));
              const colour = BADGE_COLOURS[userIndex % BADGE_COLOURS.length] || 'bg-gray-500';
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
            const canBet = !!selectedUserId && race.status !== 'completed';

            return (
              <div key={race.id} className="bg-gray-50 p-4 rounded-lg shadow-sm">

                {/* Race header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg text-indigo-600">Race {race.raceNumber || race.id}</span>
                      {race.winner && (
                        <span className="flex items-center gap-1 text-yellow-600 text-xs font-medium">
                          <Trophy className="w-3.5 h-3.5" />#{race.winner}
                        </span>
                      )}
                    </div>
                    {race.name && <p className="text-sm text-gray-500 mt-0.5">{race.name}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {race.time && (
                      <span className="text-sm text-gray-600 bg-white px-2 py-1 rounded">{race.time}</span>
                    )}
                    {/* Banker star */}
                    {selectedUserId && (
                      <button
                        onClick={() => handleSetBanker(race.id)}
                        disabled={race.status === 'completed'}
                        className={`p-2 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          isBanker ? 'text-yellow-500 bg-yellow-100' : 'text-gray-300 hover:text-yellow-400'
                        }`}
                        title={isBanker ? 'Remove banker (2× score)' : 'Set as banker (2× score)'}
                      >
                        <Star className={`w-5 h-5 ${isBanker ? 'fill-yellow-500' : ''}`} />
                      </button>
                    )}
                    {/* Admin: set winner */}
                    {isAdmin && (
                      <button
                        onClick={() => setEditingRaceWinner(editingRaceWinner === race.id ? null : race.id)}
                        className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Set race winner"
                      >
                        <Edit3 className="w-4 h-4" />
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

                {/* Horse rows */}
                <div className="space-y-2">
                  {race.horses.map(horse => {
                    const isMyBet = myBet?.horse === horse.number;
                    const isWinner = race.winner === horse.number;
                    const wonBet = isMyBet && isWinner;

                    // Who picked this horse?
                    const pickers = (users || []).filter((u, ui) => {
                      const b = bets?.find(bet => String(bet.userId) === String(u.id) && bet.raceId === race.id);
                      return b?.horse === horse.number;
                    });

                    return (
                      <button
                        key={horse.number}
                        onClick={() => canBet && handleSetBet(race.id, horse.number)}
                        disabled={!canBet}
                        className={`w-full p-3 rounded-lg flex items-center justify-between min-h-[52px] transition-all ${
                          canBet ? 'cursor-pointer' : 'cursor-default'
                        } ${
                          wonBet
                            ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md border-2 border-green-400'
                            : isWinner
                            ? 'bg-gradient-to-r from-yellow-100 to-yellow-50 border-2 border-yellow-300'
                            : isMyBet
                            ? 'bg-indigo-600 text-white shadow-md'
                            : canBet
                            ? 'bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300'
                            : 'bg-white border border-gray-100'
                        }`}
                      >
                        {/* Left: number + name + winner badge */}
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`flex-shrink-0 font-bold w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                            wonBet ? 'bg-white text-green-600' :
                            isWinner ? 'bg-yellow-400 text-yellow-900' :
                            isMyBet ? 'bg-white text-indigo-600' :
                            'bg-indigo-100 text-indigo-600'
                          }`}>
                            {horse.number}
                          </span>
                          <span className={`font-medium truncate ${
                            wonBet || isMyBet ? 'text-white' :
                            isWinner ? 'text-yellow-900' : 'text-gray-800'
                          }`}>
                            {horse.name}
                          </span>
                          {wonBet && <Trophy className="w-4 h-4 flex-shrink-0" />}
                          {isWinner && !isMyBet && <Trophy className="w-4 h-4 flex-shrink-0 text-yellow-600" />}
                        </div>

                        {/* Right: picker badges + odds */}
                        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                          {/* User pick initials */}
                          {pickers.length > 0 && (
                            <div className="flex gap-1">
                              {pickers.map(u => {
                                const ui = users.findIndex(x => x.id === u.id);
                                const colour = BADGE_COLOURS[ui % BADGE_COLOURS.length] || 'bg-gray-500';
                                const isMe = String(u.id) === String(selectedUserId);
                                return (
                                  <span
                                    key={u.id}
                                    title={u.name}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${colour} ${isMe ? 'ring-2 ring-white ring-offset-1' : ''}`}
                                  >
                                    {initials(u.name)}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {horse.odds && (
                            <span className={`text-sm px-2 py-0.5 rounded ${
                              wonBet ? 'bg-white text-green-600' :
                              isWinner ? 'bg-yellow-200 text-yellow-800' :
                              isMyBet ? 'bg-indigo-500 text-white' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {horse.odds}
                            </span>
                          )}
                        </div>
                      </button>
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

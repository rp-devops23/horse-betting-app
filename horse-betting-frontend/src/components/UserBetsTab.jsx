import React, { useState } from 'react';
import { Star, Calendar, ChevronDown, Trophy, User, Users } from 'lucide-react';

const UserBetsTab = ({ races, bets, bankers, users, selectedUserId, handleUserSelect, availableRaceDays, selectedRaceDay, fetchRaceDayData, handleSetBet, handleSetBanker }) => {
  const [view, setView] = useState('my'); // 'my' | 'all'

  return (
    <div className="bg-white p-6 rounded-b-lg shadow-lg">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-indigo-700">
            <Star className="w-6 h-6" />
            Betting
          </h2>
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('my')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'my' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-indigo-600'}`}
            >
              <User className="w-4 h-4" />
              My Bets
            </button>
            <button
              onClick={() => setView('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'all' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-indigo-600'}`}
            >
              <Users className="w-4 h-4" />
              All Bets
            </button>
          </div>
        </div>

        {/* Selectors */}
        <div className="space-y-4">
          {view === 'my' && (
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">Select User</label>
              <select
                value={selectedUserId || ''}
                onChange={(e) => e.target.value && handleUserSelect(e.target.value)}
                className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-4 py-3 pr-10 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[48px]"
              >
                <option value="">Choose a user...</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" style={{top: 'calc(50% + 12px)'}} />
            </div>
          )}

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Race Day</label>
            <select
              value={selectedRaceDay || ''}
              onChange={(e) => fetchRaceDayData(e.target.value)}
              className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-4 py-3 pr-10 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[48px]"
            >
              <option value="">Choose a race day...</option>
              {availableRaceDays.map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── ALL BETS VIEW ── */}
      {view === 'all' && (
        <>
          {races.length === 0 ? (
            <div className="text-center py-10">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Select a race day to see all bets</p>
            </div>
          ) : (
            <div className="space-y-4">
              {races.map(race => {
                const raceWinner = race.winner;
                return (
                  <div key={race.id} className="bg-gray-50 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-bold text-indigo-600">Race {race.raceNumber || race.id}</span>
                      {race.name && <span className="text-sm text-gray-500">{race.name}</span>}
                      {race.time && <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded">{race.time}</span>}
                      {raceWinner && (
                        <span className="text-xs text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded flex items-center gap-1">
                          <Trophy className="w-3 h-3" />#{raceWinner}
                        </span>
                      )}
                    </div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(users.length, 4)}, minmax(0, 1fr))` }}>
                      {users.map(user => {
                        const bet = bets.find(b => String(b.userId) === String(user.id) && b.raceId === race.id);
                        const isBanker = bankers && bankers[String(user.id)] === race.id;
                        const won = bet && raceWinner && bet.horse === raceWinner;
                        const horse = bet ? race.horses?.find(h => h.number === bet.horse) : null;
                        return (
                          <div key={user.id} className={`rounded-lg p-2.5 text-center border ${
                            won ? 'bg-green-50 border-green-300' :
                            bet ? 'bg-white border-indigo-200' :
                            'bg-gray-100 border-transparent'
                          }`}>
                            <div className="text-xs font-semibold text-gray-600 mb-1 truncate">{user.name}</div>
                            {bet ? (
                              <>
                                <div className={`text-sm font-bold ${won ? 'text-green-600' : 'text-indigo-600'}`}>
                                  #{bet.horse}
                                </div>
                                {horse && <div className="text-xs text-gray-500 truncate">{horse.name}</div>}
                                <div className="flex items-center justify-center gap-1 mt-1">
                                  {isBanker && <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />}
                                  {won && <Trophy className="w-3 h-3 text-green-500" />}
                                </div>
                              </>
                            ) : (
                              <div className="text-xs text-gray-400 italic">no bet</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── MY BETS VIEW ── */}
      {view === 'my' && (
        <>
          {!selectedUserId ? (
            <div className="text-center py-10">
              <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">Select a user to place or view bets</p>
            </div>
          ) : races.length === 0 ? (
            <div className="text-center py-10">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No races available — select a race day above</p>
            </div>
          ) : (
            <div className="space-y-6">
              {races.map(race => {
                const userBet = bets.find(bet =>
                  String(bet.userId) === String(selectedUserId) && bet.raceId === race.id
                );
                const isBanker = bankers && selectedUserId && bankers[String(selectedUserId)] === race.id;

                return (
                  <div key={race.id} className="bg-gray-50 p-4 rounded-lg shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg text-indigo-600">Race {race.raceNumber || race.id}</h3>
                          {race.winner && (
                            <div className="flex items-center gap-1 text-yellow-600">
                              <Trophy className="w-4 h-4" />
                              <span className="text-xs font-medium">Winner: #{race.winner}</span>
                            </div>
                          )}
                        </div>
                        {race.name && <p className="text-sm text-gray-600 mt-1">{race.name}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {race.time && (
                          <span className="text-sm text-gray-600 bg-white px-2 py-1 rounded">{race.time}</span>
                        )}
                        <button
                          onClick={() => handleSetBanker(race.id)}
                          disabled={!selectedUserId || race.status === 'completed'}
                          className={`p-3 rounded-full transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] min-w-[48px] ${
                            isBanker ? 'text-yellow-500 bg-yellow-100' : 'text-gray-400 hover:text-yellow-500'
                          }`}
                          title={isBanker ? 'Remove banker' : 'Set as banker (2× daily score)'}
                        >
                          <Star className={`w-6 h-6 ${isBanker ? 'fill-yellow-500' : ''} transition-colors duration-200`} />
                        </button>
                        <span className={`text-sm font-semibold px-2 py-1 rounded-full ${
                          race.status === 'completed' ? 'bg-green-200 text-green-800' :
                          race.status === 'in_progress' ? 'bg-blue-200 text-blue-800' :
                          'bg-yellow-200 text-yellow-800'
                        }`}>
                          {race.status}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {race.horses.map(horse => {
                        const isSelected = userBet && userBet.horse === horse.number;
                        const isWinner = race.winner === horse.number;
                        const wonBet = isSelected && isWinner;

                        return (
                          <button
                            key={horse.number}
                            onClick={() => handleSetBet(race.id, horse.number)}
                            disabled={!selectedUserId || race.status === 'completed'}
                            className={`w-full p-4 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transform hover:scale-[1.02] min-h-[60px] ${
                              wonBet
                                ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg border-2 border-green-400'
                                : isWinner
                                ? 'bg-gradient-to-r from-yellow-100 to-yellow-50 border-2 border-yellow-300 text-yellow-900'
                                : isSelected
                                ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700'
                                : 'bg-white hover:bg-indigo-100 border border-gray-200 hover:border-indigo-300 hover:shadow-md'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className={`font-bold w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                                  wonBet ? 'bg-white text-green-600' :
                                  isWinner ? 'bg-yellow-400 text-yellow-900' :
                                  isSelected ? 'bg-white text-indigo-600' :
                                  'bg-indigo-100 text-indigo-600'
                                }`}>
                                  {horse.number}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-left">{horse.name}</span>
                                  {wonBet && (
                                    <div className="flex items-center gap-1">
                                      <Trophy className="w-4 h-4" />
                                      <span className="text-xs font-bold">WON!</span>
                                    </div>
                                  )}
                                  {isWinner && !isSelected && (
                                    <div className="flex items-center gap-1">
                                      <Trophy className="w-4 h-4 text-yellow-600" />
                                      <span className="text-xs font-bold">WINNER</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {horse.odds && (
                                <span className={`text-sm px-2 py-1 rounded ${
                                  wonBet ? 'bg-white text-green-600' :
                                  isWinner ? 'bg-yellow-200 text-yellow-800' :
                                  isSelected ? 'bg-white text-indigo-600' :
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
          )}
        </>
      )}
    </div>
  );
};

export default UserBetsTab;

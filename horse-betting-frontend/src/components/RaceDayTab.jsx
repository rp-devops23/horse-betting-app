import React, { useState, useEffect } from 'react';
import { Calendar, ChevronDown, Trophy, Edit3, X, Users } from 'lucide-react';
import API_BASE from '../config';

const SkeletonCard = () => (
  <div className="bg-white p-4 rounded-lg shadow animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
  </div>
);

const RaceDayTab = ({ races, currentRaceDay, availableRaceDays, selectedRaceDay, fetchAllData, fetchRaceDayData, loading, isAdmin }) => {
  const [editingRaceWinner, setEditingRaceWinner] = useState(null);
  const [raceDayScores, setRaceDayScores] = useState([]);
  const [loadingScores, setLoadingScores] = useState(false);

  const handleSetWinner = async (raceId, winnerHorseNumber) => {
    try {
      const response = await fetch(`${API_BASE}/races/${raceId}/winner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerHorseNumber })
      });
      
      if (response.ok) {
        setEditingRaceWinner(null);
        // Refresh the current race day data
        if (selectedRaceDay) {
          fetchRaceDayData(selectedRaceDay);
        } else {
          fetchAllData();
        }
      } else {
        console.error('Failed to set winner');
      }
    } catch (error) {
      console.error('Error setting winner:', error);
    }
  };

  const fetchRaceDayScores = async (raceDate) => {
    if (!raceDate) return;
    
    console.log('fetchRaceDayScores called with:', raceDate);
    setLoadingScores(true);
    try {
      const response = await fetch(`${API_BASE}/race-days/${raceDate}/scores`);
      console.log('Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('Scores data received:', data);
        setRaceDayScores(data.scores || []);
      } else {
        console.log('Response not ok:', response.status);
        setRaceDayScores([]);
      }
    } catch (error) {
      console.error('Error fetching race day scores:', error);
      setRaceDayScores([]);
    } finally {
      setLoadingScores(false);
    }
  };


  // Fetch scores when selected race day changes
  useEffect(() => {
    if (selectedRaceDay) {
      console.log('Fetching scores for race day:', selectedRaceDay);
      fetchRaceDayScores(selectedRaceDay);
    } else {
      setRaceDayScores([]);
    }
  }, [selectedRaceDay]);

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-b-lg shadow-lg">
        <p className="text-center text-gray-500 py-10">Loading races...</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-b-lg shadow-lg">
      {/* Header with race day selector */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-indigo-700 mb-4">
          <Calendar className="w-6 h-6" />
          Races
        </h2>
        
        {/* Race Day Selector */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Race Day
          </label>
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

      {/* Race Day Scores Section */}
      {selectedRaceDay && (
        <div className="mb-8 bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold flex items-center gap-2 text-indigo-700">
              <Trophy className="w-5 h-5" />
              Race Day Scores
            </h3>
            {loadingScores && (
              <div className="text-sm text-gray-500">Loading scores...</div>
            )}
          </div>
          
          {raceDayScores.length > 0 ? (
            <div className="space-y-3">
              {raceDayScores.map((score, index) => (
                <div key={score.userId} className={`flex items-center justify-between p-3 rounded-lg ${
                  index === 0 ? 'bg-yellow-50 border-2 border-yellow-200' : 
                  index === 1 ? 'bg-gray-50 border border-gray-200' : 
                  index === 2 ? 'bg-amber-50 border border-amber-200' : 
                  'bg-gray-50 border border-gray-100'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold text-lg ${
                      index === 0 ? 'text-yellow-600' : 
                      index === 1 ? 'text-gray-600' : 
                      index === 2 ? 'text-amber-600' : 
                      'text-gray-500'
                    }`}>
                      {index + 1}.
                    </span>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-500" />
                      <span className="font-semibold text-gray-800">{score.name}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-lg text-indigo-600">{score.score}</span>
                    <span className="text-sm text-gray-500 ml-1">pts</span>
                    <div className="text-xs text-gray-400">{score.races_won ?? 0} won</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No scores available for this race day</p>
              <p className="text-sm text-gray-400">Scores will appear after races are completed</p>
            </div>
          )}
        </div>
      )}

      {races.length > 0 ? (
        <div className="space-y-4">
          {races.map(race => (
            <div key={race.id} className="bg-gray-50 p-4 rounded-lg shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-indigo-600">Race {race.raceNumber || race.id}</span>
                  {race.winner && (
                    <div className="flex items-center gap-1 text-yellow-600">
                      <Trophy className="w-4 h-4" />
                      <span className="text-xs font-medium">Winner: #{race.winner}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {race.time && (
                    <span className="text-sm text-gray-600 bg-white px-2 py-1 rounded">{race.time}</span>
                  )}
                  {/* Edit winner button — admin only */}
                  {isAdmin && (
                    <button
                      onClick={() => setEditingRaceWinner(editingRaceWinner === race.id ? null : race.id)}
                      className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                      title="Set race winner"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                  <span className={`text-sm font-semibold px-2 py-1 rounded-full ${
                    race.status === 'completed' ? 'bg-green-200 text-green-800' : 
                    race.status === 'in_progress' ? 'bg-blue-200 text-blue-800' :
                    'bg-yellow-200 text-yellow-800'
                  }`}>
                    {race.status}
                  </span>
                </div>
              </div>
              
              {race.name && (
                <div className="text-sm text-gray-700 mb-3 font-medium">{race.name}</div>
              )}
              
              {/* Winner selection mode */}
              {editingRaceWinner === race.id && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-800">Select the winning horse:</span>
                    <button
                      onClick={() => setEditingRaceWinner(null)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {race.horses.map(horse => (
                      <button
                        key={horse.number}
                        onClick={() => handleSetWinner(race.id, horse.number)}
                        className="flex items-center gap-3 px-4 py-3 bg-white border border-blue-300 rounded-lg hover:bg-blue-100 transition-colors min-h-[48px] text-left"
                      >
                        <span className="font-bold text-blue-600 text-lg">#{horse.number}</span>
                        <span className="text-sm flex-1 truncate">{horse.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Horses displayed vertically */}
              <div className="space-y-2">
                {race.horses.map(horse => {
                  const isWinner = race.winner === horse.number;
                  return (
                    <div 
                      key={horse.number} 
                      className={`flex items-center justify-between p-3 rounded-lg transition-colors min-h-[56px] ${
                        isWinner 
                          ? 'bg-gradient-to-r from-yellow-100 to-yellow-50 border-2 border-yellow-300 shadow-md' 
                          : 'bg-white hover:bg-indigo-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`font-bold w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                          isWinner 
                            ? 'bg-yellow-400 text-yellow-900 shadow-sm' 
                            : 'text-indigo-600 bg-indigo-100'
                        }`}>
                          {horse.number}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${isWinner ? 'text-yellow-900' : 'text-gray-800'}`}>
                            {horse.name}
                          </span>
                          {isWinner && (
                            <div className="flex items-center gap-1 text-yellow-600">
                              <Trophy className="w-4 h-4" />
                              <span className="text-xs font-bold">WINNER</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {horse.odds && (
                        <span className={`text-sm px-2 py-1 rounded ${
                          isWinner 
                            ? 'bg-yellow-200 text-yellow-800' 
                            : 'text-gray-600 bg-gray-100'
                        }`}>
                          {horse.odds}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-10">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">No races available for this date</p>
          <p className="text-sm text-gray-400">Select a different date or go to the Admin tab to scrape new races</p>
        </div>
      )}
    </div>
  );
};

export default RaceDayTab;

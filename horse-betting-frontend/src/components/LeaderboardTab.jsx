import React, { useState, useEffect } from 'react';
import { Trophy, Users } from 'lucide-react';

import API_BASE from '../config';

const LeaderboardTab = ({ users, showMessage }) => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('score'); // 'score' | 'wins'

  // Helper to get user name from user ID
  const getUserName = (userId) => {
    const user = users.find(u => String(u.id) === String(userId));
    return user ? user.name : `User ${userId}`;
  };

  useEffect(() => {
    const fetchLeaderboardData = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/race-days/leaderboard`);
        const data = await response.json();
        if (data && data.success) {
          const list = Array.isArray(data.leaderboard) ? data.leaderboard : [];
          const normalizedList = list.map(entry => ({
            ...entry,
            totalScore: entry.score || 0,
            userName: entry.name || users.find(u => u.id === entry.userId)?.name || `User ${entry.userId}`
          }));
          setLeaderboardData(normalizedList);
        } else {
          setLeaderboardData([]);
          if (data && data.error) showMessage(data.error, 'error');
        }
      } catch (error) {
        showMessage(`Error fetching leaderboard data: ${error.message}`, 'error');
        console.error('Error fetching leaderboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboardData();
  }, [users, showMessage]);

  // Skeleton component for loading state
  const SkeletonLeaderboard = () => (
    <div className="space-y-4">
      <div className="bg-white p-6 rounded-lg shadow-md animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="flex items-center space-x-4">
          <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-md animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="flex items-center space-x-4">
          <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-indigo-700">
            <Trophy className="w-6 h-6" />
            Overall Leaderboard
          </h2>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
            <button
              onClick={() => setSortBy('score')}
              className={`px-3 py-1.5 transition-colors ${sortBy === 'score' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Points
            </button>
            <button
              onClick={() => setSortBy('wins')}
              className={`px-3 py-1.5 transition-colors ${sortBy === 'wins' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Victoires
            </button>
          </div>
        </div>
        {loading ? (
          <SkeletonLeaderboard />
        ) : (
          <ul className="space-y-4">
            {Array.isArray(leaderboardData) && leaderboardData.length > 0 ? (
              [...leaderboardData]
                .sort((a, b) => sortBy === 'wins' ? (b.wins ?? 0) - (a.wins ?? 0) : (b.totalScore || b.score || 0) - (a.totalScore || a.score || 0))
                .map((entry, index) => (
                <li key={index} className={`flex items-center p-4 rounded-xl shadow transition-all duration-300 transform hover:scale-105 ${
                  index === 0 ? 'bg-yellow-100' : index === 1 ? 'bg-gray-100' : index === 2 ? 'bg-amber-100' : 'bg-white'
                }`}>
                  <span className={`font-bold text-xl mr-4 ${
                    index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-500' : index === 2 ? 'text-amber-500' : 'text-gray-400'
                  }`}>
                    {index + 1}.
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-gray-500" />
                      <span className="font-semibold text-gray-800">{entry.userName || getUserName(entry.userId)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div>
                      <span className="font-bold text-xl text-indigo-600">{Math.round(entry.totalScore || entry.score || 0)}</span>
                      <span className="text-sm text-gray-500 ml-1">pts</span>
                    </div>
                    <div className="text-sm text-gray-400">
                      {entry.wins ?? 0} victoire{(entry.wins ?? 0) !== 1 ? 's' : ''}
                    </div>
                  </div>
                </li>
              ))
            ) : (
              <p className="text-center text-gray-500 italic">No scores available yet.</p>
            )}
          </ul>
        )}
      </div>

    </div>
  );
};

export default LeaderboardTab;

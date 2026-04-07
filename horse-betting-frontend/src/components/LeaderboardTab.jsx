import React, { useState, useEffect } from 'react';
import { Trophy, Users } from 'lucide-react';

const API_BASE = process.env.NODE_ENV === 'development'
  ? 'http://localhost:5000/api'
  : "https://horse-betting-backend.onrender.com/api";

const LeaderboardTab = ({ users, showMessage }) => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Helper to get user name from user ID
  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId);
    return user ? user.name : `User ${userId}`;
  };

  // Fetch leaderboard data
  const fetchLeaderboardData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/race-days/leaderboard`);
      const data = await response.json();
      if (data && data.success) {
        const list = Array.isArray(data.leaderboard) ? data.leaderboard : [];
        // Ensure each entry has totalScore field
        const normalizedList = list.map(entry => ({
          ...entry,
          totalScore: entry.score || 0,
          userName: entry.name || getUserName(entry.userId)
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

  useEffect(() => {
    fetchLeaderboardData();
  }, [users, fetchLeaderboardData]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-indigo-700">
          <Trophy className="w-6 h-6" />
          Overall Leaderboard
        </h2>
        {loading ? (
          <SkeletonLeaderboard />
        ) : (
          <ul className="space-y-4">
            {Array.isArray(leaderboardData) && leaderboardData.length > 0 ? (
              leaderboardData.map((entry, index) => (
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
                    <span className="font-bold text-xl text-indigo-600">{Math.round(entry.totalScore || entry.score || 0)}</span>
                    <span className="text-sm text-gray-500 ml-1">pts</span>
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

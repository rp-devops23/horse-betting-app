import React from 'react';
import { Trophy, Shield, Users, Info, Award, Target, Heart } from 'lucide-react';
import LeaderboardTab from './LeaderboardTab.jsx';

const HomePage = ({ users, showMessage }) => {
  return (
    <div className="bg-white p-6 rounded-b-lg shadow-lg">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Pane - Welcome and Rules */}
        <div className="space-y-6">
          {/* Welcome Header */}
          <div className="text-center lg:text-left">
            <h1 className="text-4xl font-bold text-indigo-700 mb-4 flex items-center justify-center lg:justify-start gap-3">
              <Trophy className="w-10 h-10" />
              Welcome to Lekours
            </h1>
            <p className="text-xl text-gray-600 mb-2">
              Payen family's Horse Racing Betting Game
            </p>
            <p className="text-gray-500">
              Get your tuyo ready, test your gut intuition, compete with best zougader, and climb to the top of the leaderboard!
            </p>
          </div>

          {/* Game Rules Section */}
          <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
            <h2 className="text-2xl font-bold text-indigo-700 mb-4 flex items-center gap-2">
              <Target className="w-6 h-6" />
              How to Play
            </h2>
            <div className="space-y-4 text-gray-700">
              <div className="flex items-start gap-3">
                <div className="bg-indigo-100 rounded-full p-2 mt-1">
                  <span className="text-indigo-600 font-bold text-sm">1</span>
                </div>
                <div>
                  <h3 className="font-semibold">Select a User & Race Day</h3>
                  <p className="text-sm">Choose your player profile and pick a race day to start betting.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="bg-indigo-100 rounded-full p-2 mt-1">
                  <span className="text-indigo-600 font-bold text-sm">2</span>
                </div>
                <div>
                  <h3 className="font-semibold">Place Your Bets</h3>
                  <p className="text-sm">Click on any horse to place your bet. You can change your bet anytime before the race starts.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="bg-indigo-100 rounded-full p-2 mt-1">
                  <span className="text-indigo-600 font-bold text-sm">3</span>
                </div>
              <div>
                <h3 className="font-semibold">Set Your Banker</h3>
                <p className="text-sm">Choose one race as your "banker". If it wins, your daily total is multiplied by 2! You can only have one banker per race day.</p>
              </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="bg-indigo-100 rounded-full p-2 mt-1">
                  <span className="text-indigo-600 font-bold text-sm">4</span>
                </div>
                <div>
                  <h3 className="font-semibold">Watch & Score</h3>
                  <p className="text-sm">See how your predictions perform and climb the leaderboard!</p>
                </div>
              </div>
            </div>
          </div>

          {/* Scoring System */}
          <div className="bg-green-50 p-6 rounded-lg border border-green-200">
            <h2 className="text-2xl font-bold text-green-700 mb-4 flex items-center gap-2">
              <Award className="w-6 h-6" />
              Scoring System
            </h2>
            <div className="space-y-3 text-gray-700">
              <div className="flex items-center justify-between">
                <span className="font-medium">Correct Bet (Odds 10+)</span>
                <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-semibold">+3 Points</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Correct Bet (Odds 5-9.99)</span>
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">+2 Points</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Correct Bet (Odds &lt;5)</span>
                <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold">+1 Point</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Incorrect Bet</span>
                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-semibold">0 Points</span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-gray-700">
                <strong>Daily Total:</strong> Sum of all your points for that race day
              </p>
              <p className="text-sm text-gray-700 mt-1">
                <strong>Banker Bonus:</strong> If your banker wins, your daily total is multiplied by 2!
              </p>
            </div>
          </div>

          {/* Fair Play Policy */}
          <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
            <h2 className="text-2xl font-bold text-purple-700 mb-4 flex items-center gap-2">
              <Shield className="w-6 h-6" />
              Fair Play Policy
            </h2>
            <div className="space-y-3 text-gray-700">
              <div className="flex items-start gap-3">
                <Heart className="w-5 h-5 text-purple-600 mt-1" />
                <p className="text-sm">
                  <strong>No Money Involved:</strong> This is a purely recreational game with no financial stakes or gambling.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-purple-600 mt-1" />
                <p className="text-sm">
                  <strong>Friendly Competition:</strong> Play fairly and respect other players. No cheating or manipulation.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Trophy className="w-5 h-5 text-purple-600 mt-1" />
                <p className="text-sm">
                  <strong>Sportsmanship:</strong> Celebrate others' wins and learn from your predictions.
                </p>
              </div>
            </div>
          </div>

          {/* GDPR Disclaimer */}
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-700 mb-4 flex items-center gap-2">
              <Info className="w-6 h-6" />
              Privacy & Data Protection
            </h2>
            <div className="space-y-3 text-gray-600 text-sm">
              <p>
                <strong>Data We Store:</strong> We only collect your first name and your betting choices. 
                No personal identification, contact information, or sensitive data is stored.
              </p>
              <p>
                <strong>Purpose:</strong> Your data is used solely to maintain your game profile and calculate scores.
              </p>
              <p>
                <strong>Retention:</strong> Data is kept only as long as you participate in the game.
              </p>
              <p>
                <strong>Your Rights:</strong> You can request to view, modify, or delete your data at any time.
              </p>
              <p className="text-xs text-gray-500 mt-4">
                This game complies with GDPR principles and is designed with privacy in mind.
              </p>
            </div>
          </div>
        </div>

        {/* Right Pane - Current Leaderboard */}
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-indigo-700 mb-2 flex items-center justify-center gap-2">
              <Trophy className="w-8 h-8" />
              Current Leaderboard
            </h2>
            <p className="text-gray-600">See how you rank against other players</p>
          </div>
          
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <LeaderboardTab users={users} showMessage={showMessage} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;

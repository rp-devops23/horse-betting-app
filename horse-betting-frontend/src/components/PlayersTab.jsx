import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { apiFetch } from '../api';
import { Avatar, GallopLoader } from './ui.jsx';
import PlayerProfile from './PlayerProfile.jsx';
import StatsTab from './StatsTab.jsx';

const PlayersTab = ({ users, selectedUserId, profileUserId, setProfileUserId, onEditAvatar, showMessage }) => {
  const [standings, setStandings] = useState(null);

  useEffect(() => {
    if (profileUserId) return;
    apiFetch(`/race-days/leaderboard?period=all`)
      .then(res => res.json())
      .then(data => setStandings(data.success ? data.leaderboard : []))
      .catch(() => setStandings([]));
  }, [profileUserId]);

  if (profileUserId) {
    return (
      <PlayerProfile
        userId={profileUserId}
        users={users}
        isMe={profileUserId === selectedUserId}
        onBack={() => setProfileUserId(null)}
        onEditAvatar={onEditAvatar}
        onOpenProfile={setProfileUserId}
        showMessage={showMessage}
      />
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="section-title"><Users className="w-7 h-7 text-grape-500" /> Les joueurs</h2>

      {!standings ? (
        <div className="card"><GallopLoader label="On rassemble la famille…" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {standings.map(entry => {
            const user = users.find(u => u.id === entry.userId) || { id: entry.userId, name: entry.name };
            const isMe = entry.userId === selectedUserId;
            return (
              <button
                key={entry.userId}
                onClick={() => setProfileUserId(entry.userId)}
                className={`card p-4 flex flex-col items-center text-center hover:-translate-y-1 transition-transform ${isMe ? 'border-grape-300 bg-grape-50' : ''}`}
              >
                <Avatar user={user} users={users} size="lg" />
                <p className="mt-2 font-display text-lg font-extrabold text-grape-900 truncate max-w-full">{entry.name}</p>
                <p className="text-sm font-bold text-grape-400">
                  {entry.daysPlayed ? `${entry.rank}${entry.rank === 1 ? 'er' : 'e'} · ${entry.score} pts` : 'Nouveau venu'}
                </p>
                <p className="mt-1 text-lg min-h-[1.75rem] tracking-tight">{entry.badges?.slice(0, 6).join('')}</p>
                {entry.titles > 0 && <span className="chip bg-sunny-200 text-grape-900 mt-1">🏆 ×{entry.titles}</span>}
              </button>
            );
          })}
        </div>
      )}

      <StatsTab showMessage={showMessage} onOpenProfile={setProfileUserId} />
    </div>
  );
};

export default PlayersTab;

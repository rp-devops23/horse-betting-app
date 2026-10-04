import React, { useEffect, useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import { apiFetch } from '../api';
import { Avatar, GallopLoader, EmptyState, StatTile, ProgressBar } from './ui.jsx';
import { formatDay } from '../utils/time';

// Bar chart of the last race days: bar height = points, colour = finishing rank that day
const FormChart = ({ form }) => {
  const days = form.slice(-16);
  if (!days.length) return <p className="text-sm text-grape-400">Pas encore de journée terminée.</p>;
  const max = Math.max(1, ...days.map(d => d.score));
  const min = Math.min(0, ...days.map(d => d.score));
  const range = max - min;
  const H = 120;
  const zeroY = (max / range) * H;
  return (
    <div>
      <div className="flex items-stretch gap-1.5" style={{ height: H }}>
        {days.map(d => {
          const h = Math.max(4, (Math.abs(d.score) / range) * H);
          const colour = d.rank === 1 ? 'bg-sunny-400' : d.rank <= 3 ? 'bg-grape-400' : 'bg-grape-200';
          return (
            <div key={d.date} className="relative flex-1 min-w-0 group" title={`${formatDay(d.date)} : ${d.score} pts — ${d.rank}e sur ${d.players}`}>
              <div
                className={`absolute inset-x-0 rounded-md ${d.score < 0 ? 'bg-coral-300' : colour} transition-all group-hover:opacity-80`}
                style={d.score >= 0 ? { bottom: H - zeroY, height: h } : { top: zeroY, height: h }}
              />
              {d.rank === 1 && d.score > 0 && (
                <span className="absolute inset-x-0 text-center text-xs" style={{ bottom: H - zeroY + h + 2 }}>👑</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1 border-t-2 border-grape-100 pt-1">
        {days.map(d => (
          <span key={d.date} className="flex-1 min-w-0 text-center text-[10px] font-bold text-grape-300" title={formatDay(d.date)}>{Number(d.date.slice(8))}</span>
        ))}
      </div>
      <div className="flex gap-3 mt-2 text-[11px] font-bold text-grape-400">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-sunny-400" /> 1er</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-grape-400" /> podium</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-grape-200" /> autre</span>
      </div>
    </div>
  );
};

const RARITY_STYLES = {
  common: { card: 'bg-gradient-to-br from-mint-100 to-white border-mint-200', chip: 'bg-mint-100 text-mint-600' },
  rare: { card: 'bg-gradient-to-br from-sky2-100 to-white border-sky2-200', chip: 'bg-sky2-100 text-sky2-500' },
  epic: { card: 'bg-gradient-to-br from-grape-100 to-white border-grape-300', chip: 'bg-grape-100 text-grape-600' },
  legendary: { card: 'bg-gradient-to-br from-sunny-200 to-white border-sunny-400 ring-2 ring-sunny-200', chip: 'bg-sunny-300 text-grape-900' },
};

const TopList = ({ title, items, emptyText }) => (
  <div className="card p-5">
    <h3 className="font-display text-lg font-extrabold text-grape-800 mb-3">{title}</h3>
    {items.length === 0 ? <p className="text-sm text-grape-400">{emptyText}</p> : (
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={item.name} className="flex items-center gap-2">
            <span className="w-5 text-center font-display font-extrabold text-grape-300">{i + 1}</span>
            <span className="flex-1 min-w-0 font-bold text-grape-800 truncate">{item.name}</span>
            <span className="chip bg-grape-50 text-grape-500">{item.bets} pari{item.bets > 1 ? 's' : ''}</span>
            {item.wins > 0 && <span className="chip bg-mint-100 text-mint-600">{item.wins} 🏆</span>}
          </li>
        ))}
      </ul>
    )}
  </div>
);

const PlayerProfile = ({ userId, users, isMe, onBack, onEditAvatar, onOpenProfile, showMessage }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/race-days/players/${userId}/profile`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.success) setProfile(data);
        else showMessage(data.error || 'Profil introuvable', 'error');
      })
      .catch(err => !cancelled && showMessage(`Erreur : ${err.message}`, 'error'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [userId, showMessage]);

  const user = users.find(u => u.id === userId) || profile?.user;

  if (loading) return <div className="card"><GallopLoader label="On ouvre le dossier…" /></div>;
  if (!profile) return <div className="card"><EmptyState emoji="🤔" title="Profil introuvable" /></div>;

  const s = profile.summary;
  const rarityOrder = ['legendary', 'epic', 'rare', 'common'];
  const byRarity = (a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);
  const earned = profile.achievements.filter(a => a.earned).sort(byRarity);
  const locked = profile.achievements.filter(a => !a.earned).sort(byRarity);
  const totalTrophies = earned.reduce((n, a) => n + a.count, 0);

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 font-display font-bold text-grape-500 hover:text-grape-700">
        <ArrowLeft className="w-5 h-5" /> Tous les joueurs
      </button>

      {/* Hero */}
      <div className="card p-6 text-center bg-gradient-to-b from-grape-100 via-white to-white relative overflow-hidden">
        <div className="relative inline-block">
          <Avatar user={user} users={users} size="xl" className="shadow-pop" />
          {isMe && (
            <button onClick={onEditAvatar} className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-white border-2 border-grape-200 flex items-center justify-center text-grape-500 hover:text-grape-700" aria-label="Changer d'avatar">
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
        <h2 className="mt-3 font-display text-3xl font-extrabold text-grape-900">{profile.user.name}</h2>
        <p className="text-grape-500 font-bold">
          {s.daysPlayed ? <>{s.rank}{s.rank === 1 ? 'er' : 'e'} au général</> : 'Pas encore classé'}
          {s.seasonRank && <> · {s.seasonRank}{s.seasonRank === 1 ? 'er' : 'e'} de la {s.seasonLabel.toLowerCase()} ({s.seasonScore} pts)</>}
        </p>
        {profile.titles.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {profile.titles.map(t => <span key={t.id} className="chip bg-sunny-200 text-grape-900 text-sm">🏆 Champion · {t.label}</span>)}
          </div>
        )}
        {earned.length > 0 && <p className="mt-3 text-2xl tracking-wide" title={earned.map(a => a.name).join(', ')}>{earned.map(a => a.emoji).join(' ')}</p>}
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile emoji="🎯" label="Points" value={s.totalScore} sub={`${s.avgPerDay} / journée`} tone="grape" />
        <StatTile emoji="✅" label="Réussite" value={`${s.winRate}%`} sub={`${s.wins} gagnés sur ${s.totalBets}`} tone="mint" />
        <StatTile emoji="⭐" label="Banker" value={s.bankerRate != null ? `${s.bankerRate}%` : '—'} sub={`${s.bankerWins}/${s.bankerTotal} réussis`} tone="sunny" />
        <StatTile emoji="👑" label="Jours gagnés" value={s.crowns} sub={`sur ${s.daysPlayed} joués`} tone="coral" />
        <StatTile emoji="🚀" label="Meilleur jour" value={s.bestDay ? `${s.bestDay.score} pts` : '—'} sub={s.bestDay ? formatDay(s.bestDay.date, { day: 'numeric', month: 'long', year: 'numeric' }) : ''} tone="sky" />
        <StatTile emoji="🦄" label="Gros coup" value={s.biggestUpset ? `cote ${s.biggestUpset.odds}` : '—'} sub={s.biggestUpset?.horse} tone="grape" />
        <StatTile emoji="🔥" label="Série" value={s.currentStreak} sub={`record : ${s.bestStreak} journées`} tone="coral" />
        <StatTile emoji="🐎" label="Gagnants" value={s.wins} sub={`en ${s.daysPlayed} journée${s.daysPlayed > 1 ? 's' : ''}`} tone="mint" />
      </div>

      {/* Form */}
      <div className="card p-5">
        <h3 className="font-display text-lg font-extrabold text-grape-800 mb-3">📈 La forme du moment</h3>
        <FormChart form={profile.form} />
      </div>

      {/* Trophy cabinet */}
      <div className="card p-5">
        <h3 className="font-display text-lg font-extrabold text-grape-800 mb-1">🏅 Armoire à trophées</h3>
        <p className="text-sm text-grape-400 mb-4">
          {earned.length} sur {profile.achievements.length} débloqués{totalTrophies > earned.length && <> · {totalTrophies} trophées au total</>}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...earned, ...locked].map(a => {
            const r = RARITY_STYLES[a.rarity] || RARITY_STYLES.common;
            const showBar = a.repeatProgress ? a.progress > 0 || !a.earned : !a.earned && a.target > 1;
            return (
              <div key={a.id} className={`relative rounded-2xl border-2 p-3 ${a.earned ? r.card : 'bg-gray-50 border-gray-100'}`}>
                {a.count > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-[2rem] h-8 px-1.5 rounded-full bg-grape-500 text-white font-display font-extrabold flex items-center justify-center border-2 border-white shadow-chunky">
                    ×{a.count}
                  </span>
                )}
                <span className={`chip mb-1.5 ${a.earned ? r.chip : 'bg-gray-200 text-gray-400'}`}>{a.rarityLabel}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-3xl ${a.earned ? '' : 'grayscale opacity-40'}`}>{a.emoji}</span>
                  <div className="min-w-0">
                    <p className={`font-display font-extrabold leading-tight break-words hyphens-auto ${a.earned ? 'text-grape-900' : 'text-gray-400'}`} lang="fr">{a.name}</p>
                    <p className="text-[11px] leading-tight text-grape-400">{a.description}</p>
                  </div>
                </div>
                {showBar && (
                  <div className="mt-2">
                    <ProgressBar value={a.progress} max={a.target} className={a.earned ? 'bg-grape-400' : 'bg-grape-300'} />
                    <p className="text-[10px] font-bold text-gray-400 mt-0.5 text-right">
                      {a.repeatProgress ? (a.earned ? 'prochain : ' : '') : 'record : '}{a.progress} / {a.target}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <TopList title="🐎 Chevaux chouchous" items={profile.favouriteHorses} emptyText="Pas encore de chouchou." />
        <TopList title="🧢 Jockeys préférés" items={profile.favouriteJockeys} emptyText="Pas encore de jockey favori." />
      </div>

      {/* Head to head */}
      {profile.headToHead.length > 0 && (
        <div className="card p-5">
          <h3 className="font-display text-lg font-extrabold text-grape-800 mb-1">⚔️ Face-à-face</h3>
          <p className="text-sm text-grape-400 mb-4">Journées jouées ensemble : qui a fait le plus de points ?</p>
          <ul className="space-y-3">
            {profile.headToHead.map(h => {
              const total = h.won + h.drawn + h.lost;
              const other = users.find(u => u.id === h.userId) || { id: h.userId, name: h.name };
              return (
                <li key={h.userId}>
                  <button onClick={() => onOpenProfile(h.userId)} className="w-full text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <Avatar user={other} users={users} size="sm" />
                      <span className="flex-1 font-bold text-grape-800">vs {h.name}</span>
                      <span className="text-sm font-display font-extrabold">
                        <span className="text-mint-500">{h.won}V</span> · <span className="text-grape-300">{h.drawn}N</span> · <span className="text-coral-500">{h.lost}D</span>
                      </span>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden bg-grape-50">
                      <div className="bg-mint-400" style={{ width: `${(h.won / total) * 100}%` }} />
                      <div className="bg-grape-200" style={{ width: `${(h.drawn / total) * 100}%` }} />
                      <div className="bg-coral-400" style={{ width: `${(h.lost / total) * 100}%` }} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PlayerProfile;

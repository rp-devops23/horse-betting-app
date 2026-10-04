import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { Avatar, GallopLoader } from './ui.jsx';
import { getUserHex } from '../utils/userColors';
import { formatDay } from '../utils/time';

// Chart ink (text never wears a series colour)
const INK = { primary: '#3A1A75', secondary: '#6D2EE0', muted: '#9F75FF', grid: '#EDE4FF', surface: '#FFFFFF' };
const BAR = '#8247F5'; // single-series magnitude bars: one hue

// One small chart per metric: players ranked by value
const METRICS = [
  // Points follow the official ranking (ties broken by winning horses)
  { key: 'score', emoji: '🎯', title: 'Points', value: p => p.score, label: p => `${p.score} pts`, sub: p => `${p.wins} gagnants`, crown: p => p.rank === 1 },
  { key: 'avg', emoji: '📊', title: 'Moyenne par journée', value: p => p.avgPerDay, label: p => `${p.avgPerDay} pts` },
  { key: 'winRate', emoji: '✅', title: 'Taux de réussite', value: p => p.winRate, label: p => `${p.winRate} %`, sub: p => `${p.wins}/${p.totalBets} paris`, max: 100 },
  { key: 'banker', emoji: '⭐', title: 'Bankers réussis', value: p => p.bankerRate ?? 0, label: p => (p.bankerRate == null ? '—' : `${p.bankerRate} %`), sub: p => `${p.bankerWins}/${p.bankerTotal}`, max: 100 },
  { key: 'crowns', emoji: '👑', title: 'Journées gagnées', value: p => p.crowns, label: p => `${p.crowns}`, sub: p => `sur ${p.daysPlayed}` },
  { key: 'bestDay', emoji: '🚀', title: 'Meilleure journée', value: p => p.bestDay?.score ?? 0, label: p => (p.bestDay ? `${p.bestDay.score} pts` : '—'), sub: p => (p.bestDay ? formatDay(p.bestDay.date) : '') },
  { key: 'upset', emoji: '🦄', title: 'Plus gros outsider gagné', value: p => p.biggestUpset?.odds ?? 0, label: p => (p.biggestUpset ? `cote ${p.biggestUpset.odds}` : '—'), sub: p => p.biggestUpset?.horse || '' },
  { key: 'streak', emoji: '🔥', title: 'Plus longue série gagnante', value: p => p.bestStreak, label: p => `${p.bestStreak} j.`, sub: () => 'journées avec un gagnant' },
];

const RankedBars = ({ metric, players, users, selectedUserId, onOpenProfile }) => {
  const rows = metric.crown ? [...players].sort((a, b) => a.rank - b.rank) : [...players].sort((a, b) => metric.value(b) - metric.value(a));
  const max = metric.max || Math.max(1, ...rows.map(metric.value));
  const top = metric.value(rows[0] || {});
  return (
    <div className="card p-4">
      <h4 className="font-display font-extrabold text-grape-800 mb-3">{metric.emoji} {metric.title}</h4>
      <ul className="space-y-2.5">
        {rows.map(p => {
          const v = metric.value(p);
          const user = users.find(u => u.id === p.userId) || { id: p.userId, name: p.name };
          return (
            <li key={p.userId}>
              <button onClick={() => onOpenProfile(p.userId)} className="w-full flex items-center gap-2 text-left group"
                title={`${p.name} — ${metric.label(p)}${metric.sub ? ` (${metric.sub(p)})` : ''}`}>
                <Avatar user={user} users={users} size="xs" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm truncate ${p.userId === selectedUserId ? 'font-extrabold' : 'font-bold'}`} style={{ color: INK.primary }}>
                      {p.name}{(metric.crown ? metric.crown(p) : v > 0 && v === top) && ' 👑'}
                    </span>
                    <span className="text-sm font-display font-extrabold whitespace-nowrap" style={{ color: INK.primary }}>{metric.label(p)}</span>
                  </div>
                  <div className="h-2.5 mt-0.5 rounded-full overflow-hidden" style={{ background: INK.grid }}>
                    <div className="h-full rounded-full transition-all duration-500 group-hover:opacity-80"
                      style={{ width: `${Math.max(0, (v / max) * 100)}%`, background: BAR }} />
                  </div>
                  {metric.sub && metric.sub(p) && <span className="text-[11px]" style={{ color: INK.muted }}>{metric.sub(p)}</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// Cumulative points after each race day, one line per player
const PointsRace = ({ timeline, users, selectedUserId }) => {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const svgRef = useRef(null);
  const boxRef = useRef(null);
  const [W, setW] = useState(340);
  const { dates, series } = timeline;

  // Draw at the real width so text stays legible on phones
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(260, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 240, PAD = { l: 34, r: 14, t: 12, b: 26 };
  const maxY = Math.max(5, ...series.flatMap(s => s.points));
  const minY = Math.min(0, ...series.flatMap(s => s.points));
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(s => (maxY - minY) / s <= 5) || 1000;
  const niceMax = Math.ceil(maxY / step) * step;
  const niceMin = Math.floor(minY / step) * step;
  const x = i => PAD.l + (dates.length > 1 ? (i / (dates.length - 1)) * (W - PAD.l - PAD.r) : (W - PAD.l - PAD.r) / 2);
  const y = v => PAD.t + (1 - (v - niceMin) / (niceMax - niceMin || 1)) * (H - PAD.t - PAD.b);
  const ticks = [];
  for (let t = niceMin; t <= niceMax; t += step) ticks.push(t);
  const labelEvery = Math.max(1, Math.ceil(dates.length / Math.max(2, Math.floor(W / 70))));
  const ordered = useMemo(() => [...series].sort((a, b) => b.points[b.points.length - 1] - a.points[a.points.length - 1]), [series]);
  const directLabels = series.length <= 4;

  const onMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (dates.length - 1));
    setHoverIndex(Math.min(dates.length - 1, Math.max(0, i)));
  };

  if (dates.length === 0) return <p className="text-sm text-grape-400">Pas encore de journée terminée cette saison.</p>;

  const tooltipRows = hoverIndex != null
    ? [...series].sort((a, b) => b.points[hoverIndex] - a.points[hoverIndex])
    : [];
  const tipLeft = hoverIndex != null ? (x(hoverIndex) / W) * 100 : 0;

  return (
    <div>
      {/* Legend (tap a player to highlight their line) */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {ordered.map(s => {
          const user = users.find(u => u.id === s.userId) || { id: s.userId, name: s.name };
          const active = focusId === s.userId;
          return (
            <button key={s.userId} onClick={() => setFocusId(active ? null : s.userId)}
              className={`flex items-center gap-1.5 rounded-full pl-0.5 pr-2.5 py-0.5 border-2 text-xs font-bold transition-all ${active ? 'border-grape-400 bg-grape-50' : 'border-grape-100 bg-white'} ${focusId && !active ? 'opacity-50' : ''}`}
              style={{ color: INK.primary }}>
              <Avatar user={user} users={users} size="xs" />
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: getUserHex(users, s.userId) }} />
              {s.name}
            </button>
          );
        })}
      </div>

      <div className="relative" ref={boxRef}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full touch-none select-none"
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHoverIndex(null)}
          role="img" aria-label="Points cumulés par journée pour chaque joueur">
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={INK.grid} strokeWidth="1" />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={INK.muted}>{t}</text>
            </g>
          ))}
          {dates.map((d, i) => {
            const last = dates.length - 1;
            // Regular labels, plus the last one; skip a regular label that would collide with it
            const show = i === last || (i % labelEvery === 0 && last - i >= labelEvery / 2 + 0.5);
            return show && (
            <text key={d} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} fontSize="11" fill={INK.muted}>
              {formatDay(d, { day: 'numeric', month: 'short' })}
            </text>
            );
          })}
          {hoverIndex != null && (
            <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={PAD.t} y2={H - PAD.b} stroke={INK.muted} strokeWidth="1" strokeDasharray="3 3" />
          )}
          {series.map(s => {
            const colour = getUserHex(users, s.userId);
            const dim = focusId && focusId !== s.userId;
            const strong = focusId === s.userId || (!focusId && s.userId === selectedUserId);
            const d = s.points.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
            const last = s.points.length - 1;
            return (
              <g key={s.userId} opacity={dim ? 0.15 : 1}>
                <path d={d} fill="none" stroke={colour} strokeWidth={strong ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={x(last)} cy={y(s.points[last])} r="4.5" fill={colour} stroke={INK.surface} strokeWidth="2" />
                {hoverIndex != null && (
                  <circle cx={x(hoverIndex)} cy={y(s.points[hoverIndex])} r="4.5" fill={colour} stroke={INK.surface} strokeWidth="2" />
                )}
                {directLabels && (
                  <text x={x(last) - 8} y={y(s.points[last]) - 8} textAnchor="end" fontSize="12" fontWeight="700" fill={INK.primary}>{s.name}</text>
                )}
              </g>
            );
          })}
        </svg>

        {hoverIndex != null && (
          <div className="absolute top-0 pointer-events-none z-10 card px-3 py-2 text-xs min-w-[9rem]"
            style={{ left: `${tipLeft}%`, transform: `translateX(${tipLeft > 55 ? '-105%' : '5%'})` }}>
            <p className="font-display font-extrabold mb-1" style={{ color: INK.primary }}>{formatDay(dates[hoverIndex], { weekday: 'short', day: 'numeric', month: 'short' })}</p>
            {tooltipRows.map(s => (
              <p key={s.userId} className="flex items-center gap-1.5 justify-between" style={{ color: INK.primary }}>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: getUserHex(users, s.userId) }} />{s.name}</span>
                <span className="font-bold">{s.points[hoverIndex]}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-xs" style={{ color: INK.muted }}>Touche ou survole le graphique pour voir les points après chaque journée.</p>
    </div>
  );
};

const StatsTab = ({ users, selectedUserId, showMessage, onOpenProfile }) => {
  const [seasons, setSeasons] = useState([]);
  const [period, setPeriod] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch(`/race-days/seasons`)
      .then(res => res.json())
      .then(d => {
        if (!d.success) { setPeriod('all'); return; }
        setSeasons(d.seasons.filter(s => s.raceDays > 0));
        const current = d.seasons.find(s => s.isCurrent);
        setPeriod(current?.raceDays ? current.id : 'all');
      })
      .catch(() => setPeriod('all'));
  }, []);

  useEffect(() => {
    if (!period) return undefined;
    let cancelled = false;
    setData(null);
    apiFetch(`/race-days/compare?period=${period}`)
      .then(res => res.json())
      .then(d => {
        if (cancelled) return;
        if (d.success) setData(d);
        else { setData({ players: [], timeline: { dates: [], series: [] } }); showMessage(d.error, 'error'); }
      })
      .catch(err => !cancelled && showMessage(`Erreur : ${err.message}`, 'error'));
    return () => { cancelled = true; };
  }, [period, showMessage]);

  const chips = [...seasons.map(s => ({ id: s.id, label: s.label })), { id: 'all', label: 'Depuis toujours' }];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="section-title text-xl">📊 Les stats</h3>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {chips.map(c => (
            <button key={c.id} onClick={() => setPeriod(c.id)}
              className={`flex-shrink-0 rounded-full px-3 py-1 text-sm font-display font-bold border-2 ${period === c.id ? 'bg-grape-500 border-grape-500 text-white' : 'bg-white border-grape-100 text-grape-500'}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="card"><GallopLoader label="On fait les comptes…" /></div>
      ) : data.players.length === 0 ? (
        <div className="card p-6 text-center text-grape-400 font-bold">Pas encore de statistiques pour cette période.</div>
      ) : (
        <>
          <div className="card p-4 sm:p-5">
            <h4 className="font-display text-lg font-extrabold text-grape-800 mb-1">🏇 La course aux points</h4>
            <p className="text-sm text-grape-400 mb-3">Points cumulés journée après journée — {data.label.toLowerCase()}</p>
            <PointsRace timeline={data.timeline} users={users} selectedUserId={selectedUserId} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {METRICS.map(m => (
              <RankedBars key={m.key} metric={m} players={data.players} users={users} selectedUserId={selectedUserId} onOpenProfile={onOpenProfile} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default StatsTab;

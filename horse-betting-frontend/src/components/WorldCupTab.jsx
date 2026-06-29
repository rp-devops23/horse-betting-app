import React, { useState, useEffect, useCallback, useRef } from 'react';
import API_BASE from '../config';
import { getUserColour, initials } from '../utils/userColors';

/* ------------------------------------------------------------------ */
/*  Round labels                                                      */
/* ------------------------------------------------------------------ */
const ROUND_LABELS = {
  R32: '16es de finale', R16: '8es de finale',
  QF: 'Quarts de finale', SF: 'Demi-finales',
  '3RD': '3ème place', F: 'Finale',
};
const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', '3RD', 'F'];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
function PointsBadge({ pts }) {
  if (pts === null || pts === undefined) return null;
  const s = { 3: 'bg-emerald-500', 2: 'bg-amber-400', 1: 'bg-orange-400', 0: 'bg-red-400' };
  return (
    <span className={`text-[9px] font-black text-white px-1.5 py-px rounded-full ${s[pts] || 'bg-gray-400'}`}>
      {pts}pt{pts !== 1 ? 's' : ''}
    </span>
  );
}

function teamName(name) {
  if (!name) return null;
  if (/^(Round of|Quarterfinal|Semifinal)/i.test(name)) return null;
  return name;
}

/* ================================================================== */
/*  Build bracket data from flat ESPN matches                         */
/* ================================================================== */
function buildBracketData(allMatches) {
  const r32  = allMatches.filter(m => m.round === 'R32' && m.match_number <= 16);
  const r16  = allMatches.filter(m => m.round === 'R32' && m.match_number >= 17);
  const qf   = allMatches.filter(m => m.round === 'R16');
  const sf   = allMatches.filter(m => m.round === 'F' && m.match_number <= 2);
  const third = allMatches.filter(m => m.round === 'F' && m.match_number === 3);
  const final_ = allMatches.filter(m => m.round === 'F' && m.match_number === 4);
  const half = a => [a.slice(0, Math.ceil(a.length / 2)), a.slice(Math.ceil(a.length / 2))];
  const [r32L, r32R] = half(r32);
  const [r16L, r16R] = half(r16);
  const [qfL, qfR]   = half(qf);
  return { r32L, r32R, r16L, r16R, qfL, qfR, sfL: sf.slice(0, 1), sfR: sf.slice(1, 2), final: final_, third };
}

/* ================================================================== */
/*  Bracket constants                                                 */
/* ================================================================== */
const MATCH_W = 130;
const CONN_W = 22;
const LINE_CLR = 'rgba(100, 200, 255, 0.25)';
const LINE = `2px solid ${LINE_CLR}`;

/* ================================================================== */
/*  Bracket match card (compact, dark-themed)                         */
/* ================================================================== */
function BracketCard({ m, predictions, isFinal, isThird }) {
  const tA = teamName(m.team_a);
  const tB = teamName(m.team_b);
  const done = m.status === 'completed';
  const winA = done && m.score_a > m.score_b;
  const winB = done && m.score_b > m.score_a;
  const pred = predictions?.[m.id];

  let border = 'border-white/10';
  let bg = 'bg-white/[0.06]';
  if (isFinal) { border = 'border-yellow-500/50'; bg = 'bg-gradient-to-br from-yellow-500/10 to-pink-600/10'; }
  else if (isThird) { border = 'border-white/20 border-dashed'; bg = 'bg-white/[0.03]'; }
  else if (done) { border = 'border-emerald-400/30'; bg = 'bg-emerald-500/[0.07]'; }

  return (
    <div className={`rounded-md overflow-hidden border ${border} ${bg}`} style={{ width: MATCH_W }}>
      {/* Info bar */}
      <div className="text-[8px] text-slate-500 text-center py-px bg-black/25 border-b border-white/5 truncate px-1">
        {m.kickoff_utc ? new Date(m.kickoff_utc).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }) : ''}
        {m.venue ? ` · ${m.venue.split(',').slice(-2).join(',').trim()}` : ''}
      </div>
      {/* Team A */}
      <div className={`flex items-center h-[22px] border-b border-white/[0.06] ${winA ? 'bg-emerald-500/20' : ''}`}>
        <span className={`flex-1 px-1.5 text-[10px] truncate ${
          tA ? (winA ? 'font-bold text-white' : 'text-slate-300 font-medium') : 'text-slate-600 italic text-[9px]'
        }`}>{tA || 'TBD'}</span>
        <span className={`w-[22px] h-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
          done ? (winA ? 'bg-white text-emerald-700' : 'bg-white/80 text-slate-400') : 'bg-white/5 text-slate-600'
        }`}>{done ? m.score_a : ''}</span>
      </div>
      {/* Team B */}
      <div className={`flex items-center h-[22px] ${winB ? 'bg-emerald-500/20' : ''}`}>
        <span className={`flex-1 px-1.5 text-[10px] truncate ${
          tB ? (winB ? 'font-bold text-white' : 'text-slate-300 font-medium') : 'text-slate-600 italic text-[9px]'
        }`}>{tB || 'TBD'}</span>
        <span className={`w-[22px] h-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
          done ? (winB ? 'bg-white text-emerald-700' : 'bg-white/80 text-slate-400') : 'bg-white/5 text-slate-600'
        }`}>{done ? m.score_b : ''}</span>
      </div>
      {/* Prediction */}
      {pred && (
        <div className="flex items-center justify-center gap-1 py-0.5 bg-black/20 border-t border-white/5 text-[8px]">
          <span className="text-slate-400 font-mono">{pred.predicted_a}-{pred.predicted_b}</span>
          <PointsBadge pts={pred.points_awarded} />
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Bracket pair: two children → connector → parent match             */
/* ================================================================== */
function BracketPair({ topChild, bottomChild, matchCard, side }) {
  const isLeft = side === 'left';

  const connector = (
    <div style={{ width: CONN_W, display: 'flex', flexDirection: 'column', flexShrink: 0, alignSelf: 'stretch' }}>
      <div style={{ flex: 1, [isLeft ? 'borderRight' : 'borderLeft']: LINE, borderBottom: LINE }} />
      <div style={{ flex: 1, [isLeft ? 'borderRight' : 'borderLeft']: LINE, borderTop: LINE }} />
    </div>
  );

  const children = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {topChild}
      {bottomChild}
    </div>
  );

  const match = (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{matchCard}</div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      {isLeft ? <>{children}{connector}{match}</> : <>{match}{connector}{children}</>}
    </div>
  );
}

/* ================================================================== */
/*  Zoomable wrapper for bracket (pinch + buttons)                    */
/* ================================================================== */
function ZoomableBracket({ children }) {
  const [scale, setScale] = useState(0.55);
  const containerRef = useRef(null);
  const lastDistRef = useRef(null);

  const clamp = (v) => Math.min(Math.max(v, 0.25), 1.5);
  const zoom = (delta) => setScale(s => clamp(s + delta));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastDistRef.current = Math.hypot(dx, dy);
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && lastDistRef.current) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const delta = (dist - lastDistRef.current) * 0.003;
        lastDistRef.current = dist;
        setScale(s => clamp(s + delta));
        e.preventDefault();
      }
    };
    const onTouchEnd = () => { lastDistRef.current = null; };
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return (
    <div className="relative">
      <div className="flex items-center justify-end gap-1 mb-2">
        <button onClick={() => zoom(-0.1)}
          className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-bold flex items-center justify-center">−</button>
        <button onClick={() => setScale(0.55)}
          className="px-2 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold flex items-center justify-center">
          {Math.round(scale * 100)}%
        </button>
        <button onClick={() => zoom(0.1)}
          className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-bold flex items-center justify-center">+</button>
      </div>
      <div ref={containerRef} className="overflow-auto rounded-lg" style={{ maxHeight: '70vh', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', minWidth: 'max-content' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main component                                                    */
/* ================================================================== */
const WorldCupTab = ({ users, selectedUserId, isAdmin, showMessage }) => {
  const [subTab, setSubTab] = useState('matches');
  const [matches, setMatches] = useState([]);
  const [predictions, setPredictions] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [resultDrafts, setResultDrafts] = useState({});
  const [syncing, setSyncing] = useState(false);

  /* ---------- data fetching ---------- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [matchesRes, lbRes] = await Promise.all([
        fetch(`${API_BASE}/worldcup/matches`),
        fetch(`${API_BASE}/worldcup/leaderboard`),
      ]);
      const matchesData = await matchesRes.json();
      setMatches(matchesData);
      setLeaderboard(await lbRes.json());
      if (selectedUserId) {
        const predRes = await fetch(`${API_BASE}/worldcup/predictions/${selectedUserId}`);
        setPredictions(await predRes.json());
      }
      if (Array.isArray(matchesData) && matchesData.length === 0) await syncFromESPN(true);
    } catch (e) { console.error('WC fetch error', e); }
    finally { setLoading(false); }
  }, [selectedUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncFromESPN = async (silent = false) => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_BASE}/worldcup/fetch`, { method: 'POST' });
      const data = await res.json();
      if (data.success) { if (!silent) showMessage(`Sync : ${data.total} matchs, ${data.updated} mis à jour.`, 'success'); await fetchData(); }
      else { if (!silent) showMessage(data.error || 'Erreur sync', 'error'); }
    } catch (e) { if (!silent) showMessage(`Erreur sync : ${e.message}`, 'error'); }
    finally { setSyncing(false); }
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  const submitPrediction = async (matchId) => {
    const d = drafts[matchId];
    if (!d || d.a === '' || d.b === '') { showMessage('Entrez un score pour les deux équipes.', 'info'); return; }
    try {
      const res = await fetch(`${API_BASE}/worldcup/predict`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId, matchId, predictedA: Number(d.a), predictedB: Number(d.b) }) });
      const data = await res.json();
      if (data.success) { showMessage('Pronostic enregistré !', 'success'); fetchData(); }
      else showMessage(data.error, 'error');
    } catch (e) { showMessage(`Erreur : ${e.message}`, 'error'); }
  };

  const submitResult = async (matchId) => {
    const d = resultDrafts[matchId];
    if (!d || d.a === '' || d.b === '') { showMessage('Entrez le score final.', 'info'); return; }
    try {
      const res = await fetch(`${API_BASE}/worldcup/matches/${matchId}/result`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score_a: Number(d.a), score_b: Number(d.b) }) });
      const data = await res.json();
      if (data.success) { showMessage('Résultat enregistré !', 'success'); fetchData(); }
      else showMessage(data.error, 'error');
    } catch (e) { showMessage(`Erreur : ${e.message}`, 'error'); }
  };

  const setDraft = (matchId, side, val) => {
    const v = val.replace(/\D/g, '').slice(0, 2);
    setDrafts(prev => ({ ...prev, [matchId]: { ...prev[matchId], [side]: v } }));
  };
  const setResultDraft = (matchId, side, val) => {
    const v = val.replace(/\D/g, '').slice(0, 2);
    setResultDrafts(prev => ({ ...prev, [matchId]: { ...prev[matchId], [side]: v } }));
  };

  const now = new Date();
  const matchStarted = (m) => m.status === 'completed' || (m.kickoff_utc && new Date(m.kickoff_utc) <= now);

  /* ================================================================ */
  /*  RENDER — Match card (Matches tab, full-size)                    */
  /* ================================================================ */
  const renderMatchCard = (m) => {
    const pred = predictions[m.id];
    const started = matchStarted(m);
    const draft = drafts[m.id] || { a: pred ? String(pred.predicted_a) : '', b: pred ? String(pred.predicted_b) : '' };
    const rDraft = resultDrafts[m.id] || { a: '', b: '' };
    const tA = teamName(m.team_a);
    const tB = teamName(m.team_b);
    const canPredict = selectedUserId && !started && tA && tB;
    const completed = m.status === 'completed';

    return (
      <div key={m.id} className={`relative overflow-hidden rounded-xl transition-all ${
        completed ? 'bg-gradient-to-r from-slate-800 to-slate-700 text-white shadow-lg' : 'bg-white border border-gray-200 shadow-sm hover:shadow-md'
      }`}>
        <div className={`flex items-center justify-between px-4 py-2 text-[11px] tracking-wide uppercase ${
          completed ? 'bg-white/10 text-slate-300' : 'bg-gray-50 text-gray-400 border-b border-gray-100'
        }`}>
          <span className="font-semibold">
            {m.kickoff_utc ? new Date(m.kickoff_utc).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Horaire TBD'}
          </span>
          <span className="hidden sm:inline truncate ml-4 max-w-[200px]">{m.venue}</span>
        </div>

        <div className="flex items-center px-4 py-4">
          <div className="flex-1 text-right min-w-0">
            <span className={`font-bold ${completed ? 'text-white' : 'text-gray-800'} ${completed && m.score_a > m.score_b ? 'text-lg' : 'text-sm sm:text-base'}`}>
              {tA || <span className={`italic font-normal text-sm ${completed ? 'text-slate-400' : 'text-gray-300'}`}>TBD</span>}
            </span>
          </div>
          <div className="mx-3 sm:mx-6 flex-shrink-0">
            {completed ? (
              <div className="flex items-center gap-1">
                <span className={`text-2xl sm:text-3xl font-black tabular-nums ${m.score_a > m.score_b ? 'text-white' : 'text-slate-400'}`}>{m.score_a}</span>
                <span className="text-slate-500 text-lg mx-1">:</span>
                <span className={`text-2xl sm:text-3xl font-black tabular-nums ${m.score_b > m.score_a ? 'text-white' : 'text-slate-400'}`}>{m.score_b}</span>
              </div>
            ) : started ? (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs font-semibold text-red-500 uppercase">Live</span>
              </div>
            ) : (
              <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">VS</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <span className={`font-bold ${completed ? 'text-white' : 'text-gray-800'} ${completed && m.score_b > m.score_a ? 'text-lg' : 'text-sm sm:text-base'}`}>
              {tB || <span className={`italic font-normal text-sm ${completed ? 'text-slate-400' : 'text-gray-300'}`}>TBD</span>}
            </span>
          </div>
        </div>

        {pred && started && (
          <div className={`flex items-center justify-center gap-3 px-4 py-2 ${completed ? 'bg-white/5' : 'bg-gray-50 border-t border-gray-100'}`}>
            <span className={`text-xs ${completed ? 'text-slate-400' : 'text-gray-400'}`}>Ton prono</span>
            <span className={`font-black text-sm tabular-nums ${completed ? 'text-slate-200' : 'text-gray-700'}`}>{pred.predicted_a} - {pred.predicted_b}</span>
            <PointsBadge pts={pred.points_awarded} />
          </div>
        )}

        {canPredict && (
          <div className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50/50 border-t border-indigo-100">
            <span className="text-xs text-indigo-400 font-semibold mr-1">Prono</span>
            <input type="text" inputMode="numeric" maxLength={2} value={draft.a} onChange={e => setDraft(m.id, 'a', e.target.value)}
              className="w-10 h-8 text-center border-2 border-indigo-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 focus:outline-none bg-white" placeholder="-" />
            <span className="text-indigo-300 font-bold">:</span>
            <input type="text" inputMode="numeric" maxLength={2} value={draft.b} onChange={e => setDraft(m.id, 'b', e.target.value)}
              className="w-10 h-8 text-center border-2 border-indigo-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 focus:outline-none bg-white" placeholder="-" />
            <button onClick={() => submitPrediction(m.id)}
              className="ml-2 bg-indigo-600 text-white text-xs font-bold px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-all active:scale-95">
              {pred ? 'Modifier' : 'Valider'}
            </button>
          </div>
        )}

        {isAdmin && m.status !== 'completed' && tA && tB && (
          <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-50 border-t border-orange-200">
            <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Admin</span>
            <input type="text" inputMode="numeric" maxLength={2} value={rDraft.a} onChange={e => setResultDraft(m.id, 'a', e.target.value)}
              className="w-10 h-7 text-center border-2 border-orange-300 rounded-lg text-sm font-bold focus:ring-2 focus:ring-orange-400 focus:outline-none bg-white" placeholder="-" />
            <span className="text-orange-300 font-bold">:</span>
            <input type="text" inputMode="numeric" maxLength={2} value={rDraft.b} onChange={e => setResultDraft(m.id, 'b', e.target.value)}
              className="w-10 h-7 text-center border-2 border-orange-300 rounded-lg text-sm font-bold focus:ring-2 focus:ring-orange-400 focus:outline-none bg-white" placeholder="-" />
            <button onClick={() => submitResult(m.id)}
              className="ml-1 bg-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-all active:scale-95">OK</button>
          </div>
        )}
      </div>
    );
  };

  /* ================================================================ */
  /*  RENDER — Matches sub-tab                                        */
  /* ================================================================ */
  const renderMatches = () => {
    const actualRounds = {};
    matches.forEach(m => {
      let round = m.round;
      if (m.round === 'R32' && m.match_number >= 17) round = 'R16';
      else if (m.round === 'R16') round = 'QF';
      else if (m.round === 'F' && m.match_number <= 2) round = 'SF';
      else if (m.round === 'F' && m.match_number === 3) round = '3RD';
      else if (m.round === 'F' && m.match_number === 4) round = 'F';
      actualRounds[round] = actualRounds[round] || [];
      actualRounds[round].push(m);
    });
    const rounds = ROUND_ORDER.filter(r => actualRounds[r]);
    if (rounds.length === 0) return <p className="text-center text-gray-400 py-12 text-sm">Aucun match disponible.</p>;

    return rounds.map(round => (
      <div key={round} className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-gradient-to-r from-[#56042c] to-[#8b1a4a] text-white text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full">
            {ROUND_LABELS[round]}
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-[#56042c]/30 to-transparent" />
        </div>
        <div className="space-y-3">{actualRounds[round].map(m => renderMatchCard(m))}</div>
      </div>
    ));
  };

  /* ================================================================ */
  /*  RENDER — Bracket sub-tab (symmetric tree with connectors)       */
  /* ================================================================ */
  const renderBracket = () => {
    if (matches.length === 0) return <p className="text-center text-gray-400 py-12 text-sm">Le tableau n'est pas encore disponible.</p>;

    const d = buildBracketData(matches);
    const mc = (m, opts) => <BracketCard m={m} predictions={predictions} {...opts} />;

    /* Build left tree (flows left → right) */
    const buildTree = (r32, r16, qf, sf, side) => {
      const leaves = r32.map(m => mc(m));

      const level1 = r16.map((m, i) => (
        <BracketPair key={m.id} side={side}
          topChild={leaves[i * 2]} bottomChild={leaves[i * 2 + 1]} matchCard={mc(m)} />
      ));

      const level2 = qf.map((m, i) => (
        <BracketPair key={m.id} side={side}
          topChild={level1[i * 2]} bottomChild={level1[i * 2 + 1]} matchCard={mc(m)} />
      ));

      if (sf.length > 0 && level2.length >= 2) {
        return (
          <BracketPair key={sf[0].id} side={side}
            topChild={level2[0]} bottomChild={level2[1]} matchCard={mc(sf[0])} />
        );
      }
      if (sf.length > 0 && level2.length === 1) {
        return (
          <BracketPair key={sf[0].id} side={side}
            topChild={level2[0]} bottomChild={<div />} matchCard={mc(sf[0])} />
        );
      }
      return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{level2}</div>;
    };

    const leftTree = buildTree(d.r32L, d.r16L, d.qfL, d.sfL, 'left');
    const rightTree = buildTree(d.r32R.reverse(), d.r16R.reverse(), d.qfR.reverse(), d.sfR, 'right');

    /* Horizontal connector line */
    const hLine = (
      <div style={{ width: CONN_W, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ height: 2, width: '100%', background: LINE_CLR }} />
      </div>
    );

    /* Bracket content (used by zoom wrapper) */
    const bracketContent = (
      <div style={{ display: 'inline-flex', flexDirection: 'column', minWidth: 'max-content' }}>
        {/* Column headers row */}
        {(() => {
          const labels = ['16es de finale', '8es de finale', 'Quarts', 'Demi-finale', 'Finale', 'Demi-finale', 'Quarts', '8es de finale', '16es de finale'];
          const colW = MATCH_W;
          const gapW = CONN_W;
          return (
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              {labels.map((label, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <div style={{ width: gapW, flexShrink: 0 }} />}
                  <div style={{ width: colW, flexShrink: 0, textAlign: 'center' }}>
                    <span className={`text-[8px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded border whitespace-nowrap ${
                      label === 'Finale'
                        ? 'text-yellow-400 bg-yellow-400/10 border-yellow-500/30'
                        : 'text-cyan-400 bg-white/5 border-cyan-400/20'
                    }`}>
                      {label}
                    </span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          );
        })()}

        <div style={{ display: 'flex', alignItems: 'center' }}>
          {leftTree}
          {hLine}
          {/* Center: Final + 3rd */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, flexShrink: 0 }}>
            {d.final.length > 0 && mc(d.final[0], { isFinal: true })}
            {d.third.length > 0 && (
              <div>
                <div className="text-center mb-1">
                  <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-slate-500 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                    3ème place
                  </span>
                </div>
                {mc(d.third[0], { isThird: true })}
              </div>
            )}
          </div>
          {hLine}
          {rightTree}
        </div>
      </div>
    );

    return (
      <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #0b1329 0%, #1d1a39 50%, #2e0834 100%)' }}>
        <div className="relative p-4 sm:p-5">
          {/* Decorative radials */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(circle at 15% 25%, rgba(0,242,254,0.06) 0%, transparent 40%), radial-gradient(circle at 85% 75%, rgba(217,70,239,0.08) 0%, transparent 40%)'
          }} />

          <h3 className="relative z-10 text-center text-xs sm:text-sm font-black uppercase tracking-[0.2em] mb-3"
            style={{ background: 'linear-gradient(to right, #00f2fe, #4bacff, #d946ef)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Tableau de la phase finale
          </h3>

          <ZoomableBracket>{bracketContent}</ZoomableBracket>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  RENDER — Leaderboard                                            */
  /* ================================================================ */
  const renderLeaderboard = () => {
    if (leaderboard.length === 0) return null;
    return (
      <div className="mt-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-gradient-to-r from-[#56042c] to-[#8b1a4a] text-white text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full">Classement</div>
          <div className="flex-1 h-px bg-gradient-to-r from-[#56042c]/30 to-transparent" />
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            <span className="w-6 text-center">#</span><span>Joueur</span>
            <span className="text-center w-10">Exacts</span><span className="text-center w-10">Bons</span><span className="text-center w-14">Points</span>
          </div>
          {leaderboard.map((entry, i) => {
            const medal = i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-gray-300';
            return (
              <div key={entry.userId} className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center px-4 py-3 border-b border-gray-50 last:border-0 ${i < 3 ? 'bg-gradient-to-r from-amber-50/50 to-transparent' : ''}`}>
                <span className={`w-6 text-center font-black text-sm ${medal}`}>{i + 1}</span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${getUserColour(users, entry.userId)}`}>{initials(entry.name)}</span>
                  <span className="font-semibold text-sm text-gray-800 truncate">{entry.name}</span>
                </div>
                <span className="text-center w-10 text-xs font-semibold text-emerald-600">{entry.exact}</span>
                <span className="text-center w-10 text-xs font-semibold text-gray-500">{entry.correct}</span>
                <span className="text-center w-14 font-black text-base text-[#56042c]">{entry.total}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  MAIN RENDER                                                     */
  /* ================================================================ */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-10 h-10 border-4 border-[#56042c] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-400 font-semibold">Chargement des matchs...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="relative text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight bg-gradient-to-r from-[#56042c] via-[#8b1a4a] to-[#56042c] bg-clip-text text-transparent">
          FIFA World Cup 2026
        </h2>
        <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-widest font-semibold">Canada / Mexico / USA</p>
        {isAdmin && (
          <button onClick={() => syncFromESPN(false)} disabled={syncing}
            className="absolute right-0 top-1 text-[10px] bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50 font-semibold">
            {syncing ? 'Sync...' : 'Sync ESPN'}
          </button>
        )}
      </div>

      <div className="flex bg-gray-100 rounded-full p-1 mb-6 max-w-xs mx-auto">
        {[{ id: 'matches', label: 'Matchs' }, { id: 'bracket', label: 'Tableau' }].map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)}
            className={`flex-1 py-2 px-4 rounded-full text-sm font-bold transition-all ${
              subTab === tab.id ? 'bg-gradient-to-r from-[#56042c] to-[#8b1a4a] text-white shadow-md' : 'text-gray-500 hover:text-gray-700'
            }`}>{tab.label}</button>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-6 text-[10px]">
        <span className="bg-emerald-500 text-white font-bold px-2 py-0.5 rounded-full">3 pts = score exact</span>
        <span className="bg-amber-400 text-white font-bold px-2 py-0.5 rounded-full">2 pts = bonne diff + vainqueur</span>
        <span className="bg-orange-400 text-white font-bold px-2 py-0.5 rounded-full">1 pt = bon vainqueur</span>
        <span className="bg-red-400 text-white font-bold px-2 py-0.5 rounded-full">0 pt = raté</span>
      </div>

      {subTab === 'matches' && renderMatches()}
      {subTab === 'bracket' && renderBracket()}
      {renderLeaderboard()}
    </div>
  );
};

export default WorldCupTab;

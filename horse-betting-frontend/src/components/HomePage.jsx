import React, { useState, useEffect } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { apiFetch } from '../api';
import { Avatar, ProgressBar } from './ui.jsx';
import { useNow, isRaceLocked, raceStart, formatCountdown, relativeDay } from '../utils/time';

const STEPS = [
  { emoji: '🙋', title: 'Choisis ton profil', text: 'Touche « Je joue ! » en haut et entre ton code secret.', colour: 'bg-grape-100' },
  { emoji: '🐎', title: 'Un cheval par course', text: 'Touche un cheval pour parier. Tu peux changer d’avis jusqu’au départ.', colour: 'bg-sky2-100' },
  { emoji: '🤫', title: 'Paris secrets', text: 'Les choix des autres restent cachés jusqu’au départ de chaque course. Pas de copiage !', colour: 'bg-mint-100' },
  { emoji: '⭐', title: 'Ton banker', text: 'Une course par journée : si ton cheval gagne, ton total du jour est doublé !', colour: 'bg-sunny-100' },
  { emoji: '🏆', title: 'Deviens champion', text: 'Les points s’additionnent sur toute la saison : le premier à la fin de l’année remporte le trophée. Et décroche des trophées spéciaux en route !', colour: 'bg-coral-100' },
];

const PIN_HELP = [
  { emoji: '🔢', title: '4 chiffres rien qu’à toi', text: 'Ton code te connecte à ton profil. Ne le partage pas : il protège tes paris.' },
  { emoji: '📱', title: 'Une seule fois par appareil', text: 'Une fois connecté, l’app se souvient de toi. Après la nouvelle version, reconnecte-toi une fois avec ton code habituel.' },
  { emoji: '🤔', title: 'Code oublié ?', text: 'Demande à un admin : il peut t’en mettre un nouveau en deux secondes.' },
  { emoji: '⏸️', title: '5 erreurs = petite pause', text: 'Après 5 mauvais codes, il faut attendre 5 minutes avant de réessayer.' },
  { emoji: '🙈', title: 'Même les admins ne le voient pas', text: 'Ton code est chiffré : personne ne peut le lire, seulement le remplacer.' },
  { emoji: '🚪', title: 'Téléphone partagé ?', text: 'Touche ton nom en haut puis « Changer de joueur » pour laisser la place au suivant.' },
];

const TIER_COLOURS = ['bg-coral-100 text-coral-600', 'bg-sunny-100 text-sunny-600', 'bg-grape-100 text-grape-600', 'bg-mint-100 text-mint-600', 'bg-sky2-100 text-sky2-500'];

const HomePage = ({ me, users, races, bets, bankers, selectedRaceDay, scoringConfig, onLogin, onGoToRaces, onOpenProfile, onGoToLeaderboard }) => {
  const [season, setSeason] = useState(null);
  const now = useNow(30000);

  useEffect(() => {
    apiFetch(`/race-days/seasons`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => data?.success && setSeason(data.seasons.find(s => s.isCurrent) || null))
      .catch(() => {});
  }, []);

  const sortedTiers = scoringConfig ? [...scoringConfig.tiers].sort((a, b) => b.min_odds - a.min_odds) : null;
  const sortedRaces = [...races].sort((a, b) => a.raceNumber - b.raceNumber);
  const openRaces = sortedRaces.filter(r => !isRaceLocked(r, now));
  const nextRace = openRaces[0];
  const myBets = me ? sortedRaces.filter(r => bets.some(b => b.userId === me.id && b.raceId === r.id)).length : 0;
  const myBanker = me ? bankers?.[me.id] : null;
  const dayOver = sortedRaces.length > 0 && sortedRaces.every(r => r.winner != null);
  const leader = season?.leader;
  const leaderUser = leader && (users.find(u => u.id === leader.userId) || { id: leader.userId, name: leader.name });

  return (
    <div className="space-y-5">

      {/* Hero */}
      <div className="card relative overflow-hidden p-6 sm:p-8 bg-gradient-to-br from-grape-500 via-grape-500 to-coral-400 border-grape-600 text-white">
        <div className="absolute -right-6 -bottom-8 text-[9rem] opacity-20 rotate-[-8deg] select-none pointer-events-none">🏇</div>
        <p className="font-display text-sm font-bold uppercase tracking-widest text-grape-100">Lekours · famille Payen</p>
        <h1 className="mt-1 font-display text-4xl sm:text-5xl font-extrabold leading-tight">
          {me ? <>Salut {me.name}&nbsp;! 👋</> : <>Prêts pour la course&nbsp;? 🏁</>}
        </h1>
        <p className="mt-2 max-w-md text-grape-50 font-semibold">
          Prépare ton tuyo, fais confiance à ton instinct, affronte les meilleurs zougaders et grimpe en tête du classement&nbsp;!
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {me ? (
            <button onClick={onGoToRaces} className="btn-sunny">Parier maintenant <ArrowRight className="w-5 h-5" /></button>
          ) : (
            <button onClick={onLogin} className="btn-sunny">Je joue ! <ArrowRight className="w-5 h-5" /></button>
          )}
          {me && <button onClick={() => onOpenProfile(me.id)} className="btn bg-white/20 text-white hover:bg-white/30">Mon profil</button>}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        {/* Race day */}
        {selectedRaceDay && sortedRaces.length > 0 && (
          <button onClick={onGoToRaces} className="card p-5 text-left hover:-translate-y-0.5 transition-transform">
            <p className="text-xs font-bold uppercase tracking-wide text-grape-400">Journée de courses</p>
            <p className="font-display text-2xl font-extrabold text-grape-900">{relativeDay(selectedRaceDay)} · {sortedRaces.length} courses</p>
            {dayOver ? (
              <p className="mt-2 font-bold text-grape-500">🏁 Journée terminée — viens voir les résultats !</p>
            ) : nextRace && raceStart(nextRace) ? (
              <p className="mt-2 font-bold text-coral-500">⏱ Prochain départ dans {formatCountdown(raceStart(nextRace) - now)} (course {nextRace.raceNumber})</p>
            ) : (
              <p className="mt-2 font-bold text-sky2-500">🏁 Les courses sont en cours !</p>
            )}
            {me && !dayOver && (
              <div className="mt-3">
                <div className="flex justify-between text-sm font-bold text-grape-600 mb-1">
                  <span>Tes paris</span><span>{myBets}/{sortedRaces.length}</span>
                </div>
                <ProgressBar value={myBets} max={sortedRaces.length} className="bg-gradient-to-r from-grape-400 to-coral-400" />
                <p className={`mt-2 text-sm font-bold ${myBanker ? 'text-sunny-600' : 'text-grape-400'}`}>
                  {myBanker ? '⭐ Banker posé' : '⭐ Pas encore de banker'}
                </p>
              </div>
            )}
          </button>
        )}

        {/* Season */}
        {season && (
          <button onClick={onGoToLeaderboard} className="card p-5 text-left hover:-translate-y-0.5 transition-transform bg-gradient-to-br from-sunny-100 to-white">
            <p className="text-xs font-bold uppercase tracking-wide text-sunny-600">Saison en cours</p>
            <p className="font-display text-2xl font-extrabold text-grape-900">🏆 {season.label}</p>
            {leader ? (
              <div className="mt-3 flex items-center gap-3">
                <Avatar user={leaderUser} users={users} size="lg" />
                <div>
                  <p className="font-display text-lg font-extrabold text-grape-800">{leader.name} mène la danse</p>
                  <p className="text-sm font-bold text-grape-500">{leader.score} pts en {leader.daysPlayed} journée{leader.daysPlayed > 1 ? 's' : ''}</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 font-bold text-grape-500">Personne n'a encore marqué cette saison — le trophée est à prendre !</p>
            )}
          </button>
        )}
      </div>

      {/* How to play */}
      <div className="card p-5 sm:p-6">
        <h2 className="section-title mb-4">🎮 Comment jouer</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className={`rounded-2xl p-4 ${step.colour}`}>
              <div className="flex items-center gap-2">
                <span className="text-3xl">{step.emoji}</span>
                <span className="font-display text-xs font-extrabold text-grape-400">ÉTAPE {i + 1}</span>
              </div>
              <p className="mt-1 font-display text-lg font-extrabold text-grape-900">{step.title}</p>
              <p className="text-sm text-grape-600">{step.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scoring */}
      <div className="card p-5 sm:p-6">
        <h2 className="section-title mb-1">🎯 Les points</h2>
        <p className="text-grape-500 mb-4">Plus le cheval est un outsider, plus il rapporte !</p>
        {sortedTiers ? (
          <div className="space-y-2">
            {sortedTiers.map((tier, i) => {
              const label = i === 0
                ? `Cote ${tier.min_odds} et plus`
                : `Cote ${tier.min_odds > 0 ? tier.min_odds : 1} à ${sortedTiers[i - 1].min_odds}`;
              return (
                <div key={i} className="flex items-center justify-between rounded-2xl bg-grape-50 px-4 py-2.5">
                  <span className="font-bold text-grape-700">{label}</span>
                  <span className={`chip text-sm ${TIER_COLOURS[i % TIER_COLOURS.length]}`}>+{tier.points} pt{tier.points > 1 ? 's' : ''}</span>
                </div>
              );
            })}
            {scoringConfig.last_place_penalty !== 0 && (
              <div className="flex items-center justify-between rounded-2xl bg-coral-100 px-4 py-2.5">
                <span className="font-bold text-grape-700">🐢 Ton cheval arrive dernier</span>
                <span className="chip text-sm bg-white text-coral-600">{scoringConfig.last_place_penalty} pt</span>
              </div>
            )}
            <div className="flex items-center justify-between rounded-2xl bg-sunny-100 px-4 py-2.5">
              <span className="font-bold text-grape-700">⭐ Ton banker gagne</span>
              <span className="chip text-sm bg-white text-sunny-600">journée ×2</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-grape-300">Chargement…</p>
        )}
      </div>

      {/* PIN help */}
      <div className="card p-5 sm:p-6">
        <h2 className="section-title mb-4">🔐 Ton code secret</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {PIN_HELP.map(item => (
            <div key={item.title} className="flex gap-3 rounded-2xl bg-grape-50 p-4">
              <span className="text-2xl">{item.emoji}</span>
              <div>
                <p className="font-display font-extrabold text-grape-900">{item.title}</p>
                <p className="text-sm text-grape-600">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fair play & privacy */}
      <details className="card p-5 group">
        <summary className="flex items-center justify-between cursor-pointer list-none font-display text-lg font-extrabold text-grape-800">
          🤝 Fair-play & données
          <ChevronDown className="w-5 h-5 text-grape-300 group-open:rotate-180 transition-transform" />
        </summary>
        <div className="mt-3 space-y-2 text-sm text-grape-600">
          <p><strong>Pas d'argent :</strong> jeu 100 % récréatif, aucun enjeu financier.</p>
          <p><strong>Compétition amicale :</strong> on félicite les vainqueurs et on chambre gentiment les perdants.</p>
          <p><strong>Données :</strong> uniquement ton prénom, ton avatar et tes paris, pour calculer les scores. Ton code secret est chiffré.</p>
          <p><strong>Tes droits :</strong> tu peux demander à voir, modifier ou supprimer tes données à tout moment.</p>
        </div>
      </details>
    </div>
  );
};

export default HomePage;

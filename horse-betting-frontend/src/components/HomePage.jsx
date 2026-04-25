import React, { useState, useEffect } from 'react';
import { Trophy, Shield, Users, Info, Award, Target, Heart } from 'lucide-react';
import API_BASE from '../config';

const TIER_COLOURS = [
  'bg-purple-100 text-purple-800',
  'bg-blue-100 text-blue-800',
  'bg-green-100 text-green-800',
  'bg-teal-100 text-teal-800',
  'bg-gray-100 text-gray-600',
];

const HomePage = () => {
  const [scoringConfig, setScoringConfig] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/admin/settings`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setScoringConfig(data); })
      .catch(() => {});
  }, []);

  const sortedTiers = scoringConfig
    ? [...scoringConfig.tiers].sort((a, b) => b.min_odds - a.min_odds)
    : null;

  return (
    <div className="bg-white p-6 rounded-b-lg shadow-lg">
      <div className="space-y-6 max-w-2xl mx-auto">

        {/* Welcome Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-indigo-700 mb-4 flex items-center justify-center gap-3">
            <Trophy className="w-10 h-10" />
            Bienvenue sur Lekours
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            Le jeu de paris hippiques de la famille Payen
          </p>
          <p className="text-gray-500">
            Prépare ton tuyo, fais confiance à ton instinct, affronte les meilleurs zougaders et grimpe en tête du classement !
          </p>
        </div>

        {/* How to Play */}
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <h2 className="text-2xl font-bold text-indigo-700 mb-4 flex items-center gap-2">
            <Target className="w-6 h-6" />
            Comment jouer
          </h2>
          <div className="space-y-4 text-gray-700">
            <div className="flex items-start gap-3">
              <div className="bg-indigo-100 rounded-full p-2 mt-1 flex-shrink-0">
                <span className="text-indigo-600 font-bold text-sm">1</span>
              </div>
              <div>
                <h3 className="font-semibold">Choisir un joueur & une journée</h3>
                <p className="text-sm">Sélectionne ton profil en haut de la page, puis choisis une journée de courses.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-indigo-100 rounded-full p-2 mt-1 flex-shrink-0">
                <span className="text-indigo-600 font-bold text-sm">2</span>
              </div>
              <div>
                <h3 className="font-semibold">Parier sur un cheval</h3>
                <p className="text-sm">Clique sur un cheval pour placer ton pari. Tu peux changer jusqu'à la dernière minute.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-indigo-100 rounded-full p-2 mt-1 flex-shrink-0">
                <span className="text-indigo-600 font-bold text-sm">3</span>
              </div>
              <div>
                <h3 className="font-semibold">Désigner un Banker</h3>
                <p className="text-sm">Choisis une course comme "banker" ⭐. Si ce cheval gagne, ton total de la journée est multiplié par 2 !</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-indigo-100 rounded-full p-2 mt-1 flex-shrink-0">
                <span className="text-indigo-600 font-bold text-sm">4</span>
              </div>
              <div>
                <h3 className="font-semibold">Suivre les résultats</h3>
                <p className="text-sm">Les scores se mettent à jour au fur et à mesure des résultats. Vois qui mène la danse !</p>
              </div>
            </div>
          </div>
        </div>

        {/* Scoring System */}
        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
          <h2 className="text-2xl font-bold text-green-700 mb-4 flex items-center gap-2">
            <Award className="w-6 h-6" />
            Système de points
          </h2>
          <div className="space-y-3 text-gray-700">
            {sortedTiers ? (
              <>
                {sortedTiers.map((tier, i) => {
                  const label = i === 0
                    ? `Pari gagnant (cote ${tier.min_odds}+)`
                    : `Pari gagnant (cote ${tier.min_odds > 0 ? tier.min_odds : 1}–${sortedTiers[i - 1].min_odds})`;
                  const colour = TIER_COLOURS[i % TIER_COLOURS.length];
                  return (
                    <div key={i} className="flex items-center justify-between">
                      <span className="font-medium">{label}</span>
                      <span className={`${colour} px-3 py-1 rounded-full text-sm font-semibold`}>+{tier.points} pt{tier.points > 1 ? 's' : ''}</span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between">
                  <span className="font-medium">Pari perdant</span>
                  <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-semibold">0 pt</span>
                </div>
                {scoringConfig.last_place_penalty !== 0 && (
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Cheval arrivé dernier</span>
                    <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-semibold">{scoringConfig.last_place_penalty} pt</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400 italic">Chargement…</p>
            )}
          </div>
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-gray-700">
              <strong>Total journée :</strong> somme de tous tes points sur la journée
            </p>
            <p className="text-sm text-gray-700 mt-1">
              <strong>Bonus Banker :</strong> si ton banker gagne, ton total est multiplié par 2 !
            </p>
          </div>
        </div>

        {/* Fair Play */}
        <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
          <h2 className="text-2xl font-bold text-purple-700 mb-4 flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Fair-play
          </h2>
          <div className="space-y-3 text-gray-700">
            <div className="flex items-start gap-3">
              <Heart className="w-5 h-5 text-purple-600 mt-1 flex-shrink-0" />
              <p className="text-sm"><strong>Pas d'argent :</strong> jeu 100 % récréatif, aucun enjeu financier.</p>
            </div>
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-purple-600 mt-1 flex-shrink-0" />
              <p className="text-sm"><strong>Compétition amicale :</strong> joue fairement et respecte les autres joueurs.</p>
            </div>
            <div className="flex items-start gap-3">
              <Trophy className="w-5 h-5 text-purple-600 mt-1 flex-shrink-0" />
              <p className="text-sm"><strong>Fair-play :</strong> félicite les vainqueurs et tire des leçons de tes pronostics.</p>
            </div>
          </div>
        </div>

        {/* Privacy */}
        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-700 mb-4 flex items-center gap-2">
            <Info className="w-6 h-6" />
            Données & confidentialité
          </h2>
          <div className="space-y-2 text-gray-600 text-sm">
            <p><strong>Données stockées :</strong> uniquement ton prénom et tes paris. Aucune donnée personnelle sensible.</p>
            <p><strong>Usage :</strong> uniquement pour ton profil de jeu et le calcul des scores.</p>
            <p><strong>Tes droits :</strong> tu peux demander à voir, modifier ou supprimer tes données à tout moment.</p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default HomePage;

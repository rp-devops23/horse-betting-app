import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, Users, Plus, Calendar, Edit2, Trash2, Check, X, LogOut, Download, Upload, Sliders, ShieldCheck, ClipboardList, Database } from 'lucide-react';
import { apiFetch } from '../api';
import { BADGE_COLOURS, initials } from '../utils/userColors';

/* ── Action labels ── */
const BET_ACTION_LABELS = {
  placed: 'Pari placé',
  changed: 'Changement',
  banker_set: 'Banquier ajouté',
  banker_moved: 'Banquier retiré',
};

const JOB_TYPE_LABELS = {
  scrape_races: 'Import courses',
  update_odds: 'Mise à jour côtes',
  scrape_results: 'Import résultats',
};

const JOB_STATUS_COLORS = {
  started: 'bg-yellow-100 text-yellow-800',
  success: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800',
};

/* ── Sub-tab definitions ── */
const SUB_TABS = [
  { key: 'courses',      label: 'Courses',      icon: Calendar },
  { key: 'utilisateurs', label: 'Utilisateurs', icon: Users },
  { key: 'points',       label: 'Points',       icon: Sliders },
  { key: 'journaux',     label: 'Journaux',     icon: ClipboardList },
  { key: 'donnees',      label: 'Données',      icon: Database },
];

const AdminTab = ({
  newUserName, setNewUserName, newUserPin, setNewUserPin,
  handleAddUser, handleUpdateUser, handleDeleteUser,
  users, clearAllUserData, handleAdminLogout, showMessage, fetchAllData, setUsers,
}) => {
  const [activeSubTab, setActiveSubTab] = useState('courses');
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingUserName, setEditingUserName] = useState('');
  const [editingUserPin, setEditingUserPin] = useState('');
  const [usersWithPins, setUsersWithPins] = useState([]);
  const [restoring, setRestoring] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null);
  const [refreshDate, setRefreshDate] = useState(() => new Date().toISOString().slice(0, 10));
  const restoreInputRef = useRef(null);

  // Scoring config state
  const [scoringConfig, setScoringConfig] = useState(null);
  const [savingScoring, setSavingScoring] = useState(false);

  // Bet logs state
  const [betLogs, setBetLogs] = useState([]);
  const [betLogsDate, setBetLogsDate] = useState('');
  const [betLogsLoading, setBetLogsLoading] = useState(false);

  // Job logs state
  const [jobLogs, setJobLogs] = useState([]);
  const [jobTypeFilter, setJobTypeFilter] = useState('');
  const [jobLogsLoading, setJobLogsLoading] = useState(false);

  // Fetch users with PINs whenever the users list changes
  useEffect(() => {
    const fetchUsersWithPins = async () => {
      try {
        const res = await apiFetch(`/admin/users`);
        if (res.ok) setUsersWithPins(await res.json());
      } catch { /* silently ignore */ }
    };
    fetchUsersWithPins();
  }, [users]);

  // Fetch scoring config once on mount
  useEffect(() => {
    const fetchScoringConfig = async () => {
      try {
        const res = await apiFetch(`/admin/settings`);
        if (res.ok) setScoringConfig(await res.json());
      } catch { /* silently ignore */ }
    };
    fetchScoringConfig();
  }, []);

  // Fetch bet logs
  const fetchBetLogs = useCallback(async () => {
    setBetLogsLoading(true);
    try {
      const params = betLogsDate ? `?race_date=${betLogsDate}` : '';
      const res = await apiFetch(`/admin/bet-logs${params}`);
      if (res.ok) setBetLogs(await res.json());
    } catch { /* silently ignore */ }
    finally { setBetLogsLoading(false); }
  }, [betLogsDate]);

  // Fetch job logs
  const fetchJobLogs = useCallback(async () => {
    setJobLogsLoading(true);
    try {
      const params = jobTypeFilter ? `?job_type=${jobTypeFilter}` : '';
      const res = await apiFetch(`/admin/job-logs${params}`);
      if (res.ok) setJobLogs(await res.json());
    } catch { /* silently ignore */ }
    finally { setJobLogsLoading(false); }
  }, [jobTypeFilter]);

  // Auto-fetch logs when switching to journaux tab or when filters change
  useEffect(() => {
    if (activeSubTab === 'journaux') {
      fetchBetLogs();
      fetchJobLogs();
    }
  }, [activeSubTab, fetchBetLogs, fetchJobLogs]);

  const handleSaveScoringConfig = async () => {
    if (!scoringConfig) return;
    setSavingScoring(true);
    try {
      const res = await apiFetch(`/admin/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scoringConfig),
      });
      if (res.ok) showMessage('Configuration sauvegardée !', 'success');
      else showMessage('Erreur lors de la sauvegarde.', 'error');
    } catch (e) {
      showMessage(`Erreur : ${e.message}`, 'error');
    } finally {
      setSavingScoring(false);
    }
  };

  const updateTier = (index, field, value) => {
    setScoringConfig(prev => {
      const tiers = [...prev.tiers];
      tiers[index] = { ...tiers[index], [field]: parseFloat(value) || 0 };
      return { ...prev, tiers };
    });
  };

  const addTier = () => {
    setScoringConfig(prev => ({
      ...prev,
      tiers: [...prev.tiers, { min_odds: 0, points: 1 }],
    }));
  };

  const removeTier = (index) => {
    setScoringConfig(prev => ({
      ...prev,
      tiers: prev.tiers.filter((_, i) => i !== index),
    }));
  };

  const hasPin = (userId) =>
    !!usersWithPins.find(u => String(u.id) === String(userId))?.has_pin;

  const handleStartEdit = (user) => {
    setEditingUserId(user.id);
    setEditingUserName(user.name);
    setEditingUserPin('');
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditingUserName('');
    setEditingUserPin('');
  };

  const handleSaveEdit = async () => {
    if (!editingUserName.trim()) {
      showMessage('Veuillez saisir un nom valide.', 'info');
      return;
    }
    await handleUpdateUser(editingUserId, editingUserName, editingUserPin || null);
    setEditingUserId(null);
    setEditingUserName('');
    setEditingUserPin('');
  };

  const handleToggleAdmin = async (userId, currentIsAdmin) => {
    try {
      const res = await apiFetch(`/admin/users/toggle-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isAdmin: !currentIsAdmin }),
      });
      if (res.ok) {
        showMessage(!currentIsAdmin ? 'Accès admin accordé.' : 'Accès admin retiré.', 'success');
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin: !currentIsAdmin } : u));
      }
    } catch (e) {
      showMessage(`Erreur : ${e.message}`, 'error');
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const res = await apiFetch(`/admin/backup`);
      if (!res.ok) { showMessage('Sauvegarde impossible.', 'error'); return; }
      const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = match ? match[1] : 'lekours_backup.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showMessage(`Erreur : ${e.message}`, 'error');
    }
  };

  const handleRestoreBackup = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.confirm('Ceci va ÉCRASER toute la base de données avec la sauvegarde. Continuer ?')) {
      e.target.value = '';
      return;
    }
    setRestoring(true);
    try {
      const backup = JSON.parse(await file.text());
      const res = await apiFetch(`/admin/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup),
      });
      const data = await res.json();
      if (res.ok) { showMessage('Base restaurée avec succès !', 'success'); fetchAllData(); }
      else showMessage(data.error || 'Restauration échouée.', 'error');
    } catch (err) {
      showMessage(`Erreur : ${err.message}`, 'error');
    } finally {
      setRestoring(false);
      e.target.value = '';
    }
  };

  const handleScrapeRaces = async () => {
    setLoadingAction('scrape');
    try {
      const res = await apiFetch(`/races/scrape`, { method: 'POST' });
      const data = await res.json();
      if (data.success) { showMessage(data.message || 'Courses importées !', 'success'); fetchAllData(); }
      else showMessage(data.error, 'error');
    } catch (err) { showMessage(`Erreur : ${err.message}`, 'error'); }
    finally { setLoadingAction(null); }
  };

  const handleUpdateOdds = async () => {
    setLoadingAction('odds');
    try {
      const res = await apiFetch(`/races/update-odds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) { showMessage(data.message, 'success'); fetchAllData(); }
      else showMessage(data.error || 'Erreur inconnue', 'error');
    } catch (err) { showMessage(`Erreur : ${err.message}`, 'error'); }
    finally { setLoadingAction(null); }
  };

  const handleScrapeResults = async () => {
    setLoadingAction('results');
    try {
      const res = await apiFetch(`/races/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) { showMessage(data.message, 'success'); fetchAllData(); }
      else showMessage(data.error, 'error');
    } catch (err) { showMessage(`Erreur : ${err.message}`, 'error'); }
    finally { setLoadingAction(null); }
  };

  const handleRefreshScores = async () => {
    setLoadingAction('refresh');
    try {
      const res = await apiFetch(`/races/refresh-scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ race_date: refreshDate }),
      });
      const data = await res.json();
      if (data.success) { showMessage(data.message, 'success'); fetchAllData(); }
      else showMessage(data.error || 'Erreur inconnue', 'error');
    } catch (err) { showMessage(`Erreur : ${err.message}`, 'error'); }
    finally { setLoadingAction(null); }
  };

  /* ── Spinner SVG helper ── */
  const Spinner = () => (
    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>
  );

  /* ════════════════════════════════════════════════
     Sub-tab content renderers
     ════════════════════════════════════════════════ */

  const renderUtilisateurs = () => (
    <div className="space-y-4">
      {/* Add user */}
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 min-w-0 p-2 border rounded-md text-sm"
          placeholder="Prénom"
          value={newUserName}
          onChange={(e) => setNewUserName(e.target.value)}
        />
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          className="w-16 p-2 border rounded-md text-center tracking-widest text-sm flex-shrink-0"
          placeholder="PIN"
          value={newUserPin}
          onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
        <button onClick={handleAddUser} className="bg-green-500 text-white p-2 rounded-md hover:bg-green-600 transition-colors flex-shrink-0">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* User list */}
      {users.length > 0 && (
        <div className="space-y-2">
          {users.map((user, index) => {
            const colour = BADGE_COLOURS[index % BADGE_COLOURS.length];

            return (
              <div key={user.id} className="bg-white rounded-md border p-2">
                {editingUserId === user.id ? (
                  <div className="flex items-center gap-2">
                    <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${colour}`}>
                      {initials(editingUserName || user.name)}
                    </span>
                    <input
                      type="text"
                      value={editingUserName}
                      onChange={(e) => setEditingUserName(e.target.value)}
                      className="flex-1 p-1 border rounded text-sm"
                      placeholder="Prénom"
                      autoFocus
                    />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={editingUserPin}
                      onChange={(e) => setEditingUserPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-16 p-1 border rounded text-sm text-center tracking-widest"
                      placeholder="PIN"
                    />
                    <button onClick={handleSaveEdit} className="p-1 text-green-600 hover:bg-green-100 rounded" title="Enregistrer">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={handleCancelEdit} className="p-1 text-gray-500 hover:bg-gray-100 rounded" title="Annuler">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${colour}`}>
                      {initials(user.name)}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-medium truncate">{user.name}</span>
                    {user.is_admin && <ShieldCheck className="w-4 h-4 text-indigo-500 flex-shrink-0" title="Admin" />}
                    <span className={`text-xs flex-shrink-0 ${hasPin(user.id) ? 'text-gray-400' : 'text-red-500 font-semibold'}`} title="Les PIN sont chiffrés — modifie l'utilisateur pour en définir un nouveau">
                      {hasPin(user.id) ? 'PIN ••••' : 'Pas de PIN'}
                    </span>
                    <button onClick={() => handleToggleAdmin(user.id, user.is_admin)} className={`p-1 rounded flex-shrink-0 ${user.is_admin ? 'text-indigo-500 hover:bg-indigo-50' : 'text-gray-300 hover:text-indigo-400'}`} title={user.is_admin ? 'Retirer accès admin' : 'Donner accès admin'}>
                      <ShieldCheck className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleStartEdit(user)} className="p-1 text-blue-600 hover:bg-blue-100 rounded flex-shrink-0" title="Modifier">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteUser(user.id)} className="p-1 text-red-600 hover:bg-red-100 rounded flex-shrink-0" title="Supprimer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button onClick={clearAllUserData} className="w-full bg-red-500 text-white p-2 rounded-md hover:bg-red-600 transition-colors text-sm">
        Effacer TOUTES les données utilisateurs
      </button>
    </div>
  );

  const renderCourses = () => (
    <div className="space-y-4">
      {[
        { key: 'scrape',  label: 'Importer les courses',       sub: 'supertote.mu',   color: 'bg-indigo-500 hover:bg-indigo-600', handler: handleScrapeRaces },
        { key: 'odds',    label: 'Mettre à jour les côtes',    sub: 'smspariaz.com',  color: 'bg-orange-500 hover:bg-orange-600', handler: handleUpdateOdds },
        { key: 'results', label: 'Récupérer les résultats',    sub: 'supertote.mu',   color: 'bg-green-600 hover:bg-green-700',   handler: handleScrapeResults },
      ].map(({ key, label, sub, color, handler }) => (
        <button
          key={key}
          onClick={handler}
          disabled={loadingAction !== null}
          className={`w-full ${color} text-white p-2 rounded-md transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {loadingAction === key ? (
            <><Spinner /> En cours…</>
          ) : (
            <>{label} <span className="opacity-70 text-xs">({sub})</span></>
          )}
        </button>
      ))}

      {/* Refresh scores */}
      <div className="flex gap-2 items-center">
        <input
          type="date"
          value={refreshDate}
          onChange={e => setRefreshDate(e.target.value)}
          className="flex-1 p-2 border rounded-md text-sm bg-white"
        />
        <button
          onClick={handleRefreshScores}
          disabled={loadingAction !== null}
          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-md transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loadingAction === 'refresh' ? (
            <><Spinner /> En cours…</>
          ) : (
            'Recalculer les scores'
          )}
        </button>
      </div>
    </div>
  );

  const renderPoints = () => (
    <div className="space-y-4">
      {scoringConfig ? (
        <>
          <p className="text-xs text-gray-500">Points attribués selon la cote du cheval gagnant. Les seuils sont comparés du plus élevé au plus bas.</p>

          {/* Tiers */}
          <div className="space-y-2">
            <div className="flex gap-2 text-xs font-semibold text-gray-500 px-1">
              <span className="flex-1 text-center">Cote ≥</span>
              <span className="flex-1 text-center">Points</span>
              <span className="w-8"></span>
            </div>
            {[...scoringConfig.tiers]
              .sort((a, b) => b.min_odds - a.min_odds)
              .map((tier, i) => {
                const realIndex = scoringConfig.tiers.findIndex(t => t === tier);
                return (
                  <div key={i} className="flex gap-2 items-center bg-white p-2 rounded border">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={tier.min_odds}
                      onChange={e => updateTier(realIndex, 'min_odds', e.target.value)}
                      className="flex-1 min-w-0 p-1 border border-gray-300 rounded text-sm text-center"
                    />
                    <input
                      type="number"
                      step="1"
                      value={tier.points}
                      onChange={e => updateTier(realIndex, 'points', e.target.value)}
                      className="flex-1 min-w-0 p-1 border border-gray-300 rounded text-sm text-center"
                    />
                    <button onClick={() => removeTier(realIndex)} className="flex-shrink-0 p-1 text-red-400 hover:text-red-600 rounded hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            <button onClick={addTier} className="w-full flex items-center justify-center gap-1 py-1.5 border-2 border-dashed border-gray-300 rounded text-gray-400 hover:border-indigo-400 hover:text-indigo-500 text-sm transition-colors">
              <Plus className="w-4 h-4" /> Ajouter un seuil
            </button>
          </div>

          {/* Last place penalty */}
          <div className="flex items-center justify-between bg-white p-3 rounded border">
            <div>
              <p className="text-sm font-medium">Pénalité dernier</p>
              <p className="text-xs text-gray-400">Points retirés si le cheval choisi finit dernier</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="1"
                value={scoringConfig.last_place_penalty}
                onChange={e => setScoringConfig(prev => ({ ...prev, last_place_penalty: parseInt(e.target.value) || 0 }))}
                className="w-16 p-1 border border-gray-300 rounded text-sm text-center"
              />
              <span className="text-sm text-gray-500">pts</span>
            </div>
          </div>
          <p className="text-xs text-gray-400">Valeur 0 = désactivé. Entrer -1 pour retirer 1 point.</p>

          <button
            onClick={handleSaveScoringConfig}
            disabled={savingScoring}
            className="w-full flex items-center justify-center gap-2 bg-indigo-500 text-white p-2 rounded-md hover:bg-indigo-600 transition-colors disabled:opacity-50 text-sm"
          >
            <Check className="w-4 h-4" />
            {savingScoring ? 'Sauvegarde…' : 'Sauvegarder la configuration'}
          </button>
        </>
      ) : (
        <p className="text-sm text-gray-400 text-center py-4">Chargement de la configuration…</p>
      )}
    </div>
  );

  const renderJournaux = () => (
    <div className="space-y-6">
      {/* ── Bet Logs ── */}
      <div className="space-y-3">
        <h4 className="font-semibold text-indigo-600">Historique des paris</h4>

        <div className="flex gap-2 items-center">
          <input
            type="date"
            value={betLogsDate}
            onChange={e => setBetLogsDate(e.target.value)}
            className="flex-1 p-2 border rounded-md text-sm bg-white"
            placeholder="Filtrer par date"
          />
          {betLogsDate && (
            <button
              onClick={() => setBetLogsDate('')}
              className="p-2 text-gray-400 hover:text-gray-600 rounded"
              title="Effacer le filtre"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {betLogsLoading ? (
          <p className="text-sm text-gray-400 text-center py-4">Chargement…</p>
        ) : betLogs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Aucun journal de paris trouvé.</p>
        ) : (
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-xs font-semibold text-gray-600">
                  <th className="p-2">Date/Heure</th>
                  <th className="p-2">Joueur</th>
                  <th className="p-2">Course</th>
                  <th className="p-2">Action</th>
                  <th className="p-2">Ancien cheval</th>
                  <th className="p-2">Nouveau cheval</th>
                  <th className="p-2">Banquier</th>
                  <th className="p-2">Par</th>
                </tr>
              </thead>
              <tbody>
                {betLogs.map((log, i) => (
                  <tr key={log.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="p-2 whitespace-nowrap text-xs text-gray-500">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                    </td>
                    <td className="p-2">{log.userName || log.userId || '-'}</td>
                    <td className="p-2">R{log.raceNumber || '?'}</td>
                    <td className="p-2">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                        {BET_ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="p-2">{log.oldHorseName || (log.oldHorseNumber ? `#${log.oldHorseNumber}` : '-')}</td>
                    <td className="p-2">{log.newHorseName || (log.newHorseNumber ? `#${log.newHorseNumber}` : '-')}</td>
                    <td className="p-2 text-center">{log.newIsBanker ? 'Oui' : '-'}</td>
                    <td className="p-2 whitespace-nowrap">
                      {log.changedBy ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                          {log.changedBy}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">joueur</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Job Logs ── */}
      <div className="space-y-3">
        <h4 className="font-semibold text-indigo-600">Journaux des tâches</h4>

        <select
          value={jobTypeFilter}
          onChange={e => setJobTypeFilter(e.target.value)}
          className="w-full p-2 border rounded-md text-sm bg-white"
        >
          <option value="">Toutes les tâches</option>
          <option value="scrape_races">Import courses</option>
          <option value="update_odds">Mise à jour côtes</option>
          <option value="scrape_results">Import résultats</option>
        </select>

        {jobLogsLoading ? (
          <p className="text-sm text-gray-400 text-center py-4">Chargement…</p>
        ) : jobLogs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Aucun journal de tâches trouvé.</p>
        ) : (
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-xs font-semibold text-gray-600">
                  <th className="p-2">Date/Heure</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Statut</th>
                  <th className="p-2">Date course</th>
                  <th className="p-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {jobLogs.map((log, i) => (
                  <tr key={log.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="p-2 whitespace-nowrap text-xs text-gray-500">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                    </td>
                    <td className="p-2">{JOB_TYPE_LABELS[log.jobType] || log.jobType || '-'}</td>
                    <td className="p-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${JOB_STATUS_COLORS[log.status] || 'bg-gray-100 text-gray-700'}`}>
                        {log.status || '-'}
                      </span>
                    </td>
                    <td className="p-2 whitespace-nowrap">{log.raceDate || '-'}</td>
                    <td className="p-2 text-xs text-gray-600">
                      {log.message || '-'}
                      {log.details && (
                        <details className="mt-1">
                          <summary className="text-xs text-indigo-500 cursor-pointer">Détails</summary>
                          <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                            {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const renderDonnees = () => (
    <div className="space-y-4">
      <button onClick={handleDownloadBackup} className="w-full flex items-center justify-center gap-2 bg-indigo-500 text-white p-2 rounded-md hover:bg-indigo-600 transition-colors text-sm">
        <Download className="w-4 h-4" />
        Télécharger la sauvegarde
      </button>
      <div>
        <input type="file" accept=".json" ref={restoreInputRef} onChange={handleRestoreBackup} className="hidden" />
        <button
          onClick={() => restoreInputRef.current?.click()}
          disabled={restoring}
          className="w-full flex items-center justify-center gap-2 bg-red-500 text-white p-2 rounded-md hover:bg-red-600 transition-colors disabled:opacity-50 text-sm"
        >
          <Upload className="w-4 h-4" />
          {restoring ? 'Restauration…' : 'Restaurer depuis une sauvegarde'}
        </button>
      </div>
    </div>
  );

  const renderActiveTab = () => {
    switch (activeSubTab) {
      case 'utilisateurs': return renderUtilisateurs();
      case 'courses':      return renderCourses();
      case 'points':       return renderPoints();
      case 'journaux':     return renderJournaux();
      case 'donnees':      return renderDonnees();
      default:             return renderCourses();
    }
  };

  return (
    <div className="bg-white p-6 rounded-b-lg shadow-lg space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-indigo-700">
          <Settings className="w-6 h-6" />
          Admin
        </h2>
        <button
          onClick={handleAdminLogout}
          className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveSubTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
              activeSubTab === key
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div className="bg-gray-100 p-4 rounded-lg">
        {renderActiveTab()}
      </div>
    </div>
  );
};

export default AdminTab;

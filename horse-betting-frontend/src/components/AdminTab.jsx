import React, { useState, useRef, useEffect } from 'react';
import { Settings, Users, Plus, Calendar, Edit2, Trash2, Check, X, LogOut, Download, Upload, Eye, EyeOff, Sliders, ShieldCheck } from 'lucide-react';
import API_BASE from '../config';
import { BADGE_COLOURS, initials } from '../utils/userColors';

const AdminTab = ({
  newUserName, setNewUserName, newUserPin, setNewUserPin,
  handleAddUser, handleUpdateUser, handleDeleteUser,
  users, clearAllUserData, handleAdminLogout, showMessage, fetchAllData, setUsers,
}) => {
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingUserName, setEditingUserName] = useState('');
  const [editingUserPin, setEditingUserPin] = useState('');
  const [usersWithPins, setUsersWithPins] = useState([]);
  const [showPins, setShowPins] = useState({}); // { userId: true/false }
  const [restoring, setRestoring] = useState(false);
  const restoreInputRef = useRef(null);

  // Scoring config state
  const [scoringConfig, setScoringConfig] = useState(null);
  const [savingScoring, setSavingScoring] = useState(false);

  // Fetch users with PINs whenever the users list changes
  useEffect(() => {
    const fetchUsersWithPins = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/users`);
        if (res.ok) setUsersWithPins(await res.json());
      } catch { /* silently ignore */ }
    };
    fetchUsersWithPins();
  }, [users]);

  // Fetch scoring config once on mount
  useEffect(() => {
    const fetchScoringConfig = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/settings`);
        if (res.ok) setScoringConfig(await res.json());
      } catch { /* silently ignore */ }
    };
    fetchScoringConfig();
  }, []);

  const handleSaveScoringConfig = async () => {
    if (!scoringConfig) return;
    setSavingScoring(true);
    try {
      const res = await fetch(`${API_BASE}/admin/settings`, {
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

  const getPinForUser = (userId) =>
    usersWithPins.find(u => String(u.id) === String(userId))?.pin ?? '····';

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

  const toggleShowPin = (userId) =>
    setShowPins(prev => ({ ...prev, [userId]: !prev[userId] }));

  const handleToggleAdmin = async (userId, currentIsAdmin) => {
    try {
      const res = await fetch(`${API_BASE}/admin/users/toggle-admin`, {
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

  const handleDownloadBackup = () => window.open(`${API_BASE}/admin/backup`, '_blank');

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
      const res = await fetch(`${API_BASE}/admin/restore`, {
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
    try {
      const res = await fetch(`${API_BASE}/races/scrape`, { method: 'POST' });
      const data = await res.json();
      if (data.success) { showMessage('Courses importées !', 'success'); fetchAllData(); }
      else showMessage(data.error, 'error');
    } catch (err) { showMessage(`Erreur : ${err.message}`, 'error'); }
  };

  const handleScrapeResults = async () => {
    try {
      const res = await fetch(`${API_BASE}/races/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) { showMessage(data.message, 'success'); fetchAllData(); }
      else showMessage(data.error, 'error');
    } catch (err) { showMessage(`Erreur : ${err.message}`, 'error'); }
  };

  return (
    <div className="bg-white p-6 rounded-b-lg shadow-lg space-y-6">

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

      {/* ── User Management ── */}
      <div className="bg-gray-100 p-4 rounded-lg space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2 text-indigo-600">
          <Users className="w-5 h-5" />
          Utilisateurs
        </h3>

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
              const pin = getPinForUser(user.id);
              const pinVisible = showPins[user.id];

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
                      {/* PIN display */}
                      <span className="text-sm font-mono text-gray-500 w-10 text-center flex-shrink-0">
                        {pinVisible ? pin : '••••'}
                      </span>
                      <button onClick={() => toggleShowPin(user.id)} className="p-1 text-gray-400 hover:text-gray-700 rounded flex-shrink-0" title={pinVisible ? 'Masquer PIN' : 'Voir PIN'}>
                        {pinVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
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

      {/* ── Race Day Management ── */}
      <div className="bg-gray-100 p-4 rounded-lg space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2 text-indigo-600">
          <Calendar className="w-5 h-5" />
          Journées de courses
        </h3>
        <button onClick={handleScrapeRaces} className="w-full bg-indigo-500 text-white p-2 rounded-md hover:bg-indigo-600 transition-colors text-sm">
          Importer / Mettre à jour les courses
        </button>
        <button onClick={handleScrapeResults} className="w-full bg-green-600 text-white p-2 rounded-md hover:bg-green-700 transition-colors text-sm">
          Récupérer les résultats depuis supertote.mu
        </button>
      </div>

      {/* ── Scoring Config ── */}
      {scoringConfig && (
        <div className="bg-gray-100 p-4 rounded-lg space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2 text-indigo-600">
            <Sliders className="w-5 h-5" />
            Système de points
          </h3>
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
        </div>
      )}

      {/* ── Backup & Restore ── */}
      <div className="bg-gray-100 p-4 rounded-lg space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2 text-indigo-600">
          <Download className="w-5 h-5" />
          Sauvegarde &amp; Restauration
        </h3>
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

    </div>
  );
};

export default AdminTab;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, Settings, Home, Calendar, Users, LogOut, Smile, UserRound } from 'lucide-react';

import HomePage from './components/HomePage.jsx';
import RaceDayTab from './components/RaceDayTab.jsx';
import LeaderboardTab from './components/LeaderboardTab.jsx';
import AdminTab from './components/AdminTab.jsx';
import PlayersTab from './components/PlayersTab.jsx';
import { Avatar, Modal, PinPad, GallopLoader } from './components/ui.jsx';

import { apiFetch, loadSession, saveSession } from './api';
import { AVATARS } from './utils/userColors';
import { starBurst } from './utils/celebrate';
import { isRaceLocked } from './utils/time';

const TABS = [
  { id: 'home', label: 'Accueil', Icon: Home },
  { id: 'races', label: 'Courses', Icon: Calendar },
  { id: 'leaderboard', label: 'Classement', Icon: Trophy },
  { id: 'players', label: 'Joueurs', Icon: Users },
];

const HorseBettingApp = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [users, setUsers] = useState([]);
  const [bets, setBets] = useState([]);
  const [bankers, setBankers] = useState({});
  const [races, setRaces] = useState([]);
  const [newUserName, setNewUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showMessageBox, setShowMessageBox] = useState(false);
  const [availableRaceDays, setAvailableRaceDays] = useState([]);
  const [selectedRaceDay, setSelectedRaceDay] = useState(null);
  // Restore a saved session synchronously so the first fetches carry the token
  const [selectedUserId, setSelectedUserId] = useState(() => loadSession()?.userId || null);
  const [scoringConfig, setScoringConfig] = useState(null);
  const [profileUserId, setProfileUserId] = useState(null);

  // Login flow: pick a player, then enter their PIN
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinShake, setPinShake] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState('');
  const [newUserPin, setNewUserPin] = useState('');

  // Self-registration state
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerPin, setRegisterPin] = useState('');

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const userMenuRef = useRef(null);

  // Cold-start indicator
  const [slowLoad, setSlowLoad] = useState(false);

  // Admin tab state
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  const me = users.find(u => u.id === selectedUserId);

  const showMessage = useCallback((text, type = 'info') => {
    setMessage({ text, type });
    setShowMessageBox(true);
    setTimeout(() => {
      setShowMessageBox(false);
    }, 4000);
  }, []);

  const fetchBetsAndBankers = useCallback(async (raceDate) => {
    const [betsRes, bankersRes] = await Promise.all([
      apiFetch(`/bets`),
      apiFetch(raceDate ? `/bankers?race_date=${raceDate}` : `/bankers`),
    ]);
    const betsData = await betsRes.json();
    const bankersData = await bankersRes.json();
    if (Array.isArray(betsData)) setBets(betsData);
    if (typeof bankersData === 'object' && bankersData !== null) setBankers(bankersData);
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    const slowTimer = setTimeout(() => setSlowLoad(true), 3000);
    try {
      const usersRes = await apiFetch(`/users`);
      const usersData = await usersRes.json();
      if (Array.isArray(usersData)) setUsers(usersData);

      await fetchBetsAndBankers(selectedRaceDay);

      const raceDaysRes = await apiFetch(`/race-days/index`);
      const raceDaysData = await raceDaysRes.json();
      if (raceDaysData.raceDays && Array.isArray(raceDaysData.raceDays)) {
        setAvailableRaceDays(raceDaysData.raceDays.map(day => day.date));
      }

      // Only set races and selected race day if no specific race day is already selected
      if (!selectedRaceDay) {
        const currentDayRes = await apiFetch(`/race-days/current`);
        const currentDayData = await currentDayRes.json();
        if (currentDayData.data) {
          setSelectedRaceDay(currentDayData.data.date);
          if (Array.isArray(currentDayData.data.races)) setRaces(currentDayData.data.races);
        } else {
          setRaces([]);
        }
      }
    } catch (error) {
      showMessage(`Connexion au serveur impossible : ${error.message}`, 'error');
      console.error('Error in fetchAllData:', error);
    } finally {
      clearTimeout(slowTimer);
      setSlowLoad(false);
      setLoading(false);
    }
  }, [showMessage, selectedRaceDay, fetchBetsAndBankers]);

  const fetchRaceDayData = useCallback(async (raceDate, { quiet = false } = {}) => {
    if (!raceDate) return;
    if (!quiet) setLoading(true);
    try {
      const response = await apiFetch(`/race-days/${raceDate}`);
      const data = await response.json();
      if (data && Array.isArray(data.races)) {
        setRaces(data.races);
        setSelectedRaceDay(raceDate);
        await fetchBetsAndBankers(raceDate);
      } else {
        setRaces([]);
        showMessage('Aucune course pour cette date', 'info');
      }
    } catch (error) {
      showMessage(`Erreur : ${error.message}`, 'error');
      console.error('Error in fetchRaceDayData:', error);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [showMessage, fetchBetsAndBankers]);

  // Refresh bets + race cards without the loading skeleton (after a bet, or when a race locks)
  const refreshRaceDay = useCallback(
    () => fetchRaceDayData(selectedRaceDay, { quiet: true }),
    [fetchRaceDayData, selectedRaceDay],
  );

  const handleAddUser = useCallback(async () => {
    if (!newUserName.trim()) {
      showMessage('Saisis un prénom.', 'info');
      return;
    }
    try {
      const response = await apiFetch(`/users`, {
        method: 'POST',
        body: JSON.stringify({ name: newUserName, pin: newUserPin })
      });
      const data = await response.json();
      if (response.ok) {
        setUsers(prevUsers => [...prevUsers, { id: data.id, name: data.name }]);
        setNewUserName('');
        setNewUserPin('');
        showMessage('Joueur ajouté !', 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage(`Erreur : ${error.message}`, 'error');
    }
  }, [newUserName, newUserPin, showMessage]);

  const handleUpdateUser = useCallback(async (userId, newName, newPin = null) => {
    if (!newName?.trim() && !newPin) {
      showMessage('Veuillez saisir un nom ou un PIN.', 'info');
      return;
    }
    try {
      const body = { userId };
      if (newName?.trim()) body.name = newName.trim();
      if (newPin) body.pin = newPin;
      const response = await apiFetch(`/admin/users`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.success) {
        if (newName?.trim()) {
          setUsers(prevUsers =>
            prevUsers.map(user => user.id === userId ? { ...user, name: newName.trim() } : user)
          );
        }
        showMessage('Utilisateur mis à jour !', 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage(`Erreur : ${error.message}`, 'error');
    }
  }, [showMessage]);

  const handleDeleteUser = useCallback(async (userId) => {
    if (!window.confirm('Supprimer ce joueur ? Tous ses paris et scores seront effacés. Action irréversible.')) {
      return;
    }
    try {
      const response = await apiFetch(`/admin/users`, {
        method: 'DELETE',
        body: JSON.stringify({ userId })
      });
      const data = await response.json();
      if (data.success) {
        setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));
        if (selectedUserId === userId) {
          setSelectedUserId(null);
        }
        showMessage('Joueur supprimé.', 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage(`Erreur : ${error.message}`, 'error');
    }
  }, [showMessage, selectedUserId]);

  const handleAdminLogin = useCallback(async () => {
    if (!adminPassword.trim()) {
      showMessage('Saisis le mot de passe admin.', 'info');
      return;
    }
    try {
      const response = await apiFetch(`/admin/login`, {
        method: 'POST',
        body: JSON.stringify({ password: adminPassword })
      });
      const data = await response.json();
      if (data.success) {
        saveSession({ token: data.token, userId: selectedUserId });
        setIsAdminAuthenticated(true);
        setShowAdminLogin(false);
        setAdminPassword('');
        showMessage('Accès admin accordé !', 'success');
      } else {
        showMessage(response.status === 429 ? data.error : 'Mot de passe incorrect.', 'error');
      }
    } catch (error) {
      showMessage('Erreur de connexion au serveur.', 'error');
    }
  }, [adminPassword, showMessage, selectedUserId]);

  const handleUserLogout = useCallback(() => {
    saveSession(null);
    setSelectedUserId(null);
    setIsAdminAuthenticated(false);
    setShowUserMenu(false);
    if (activeTab === 'admin') setActiveTab('home');
  }, [activeTab]);

  const handleAdminLogout = useCallback(() => {
    handleUserLogout();
    setActiveTab('home');
    showMessage('Déconnecté.', 'info');
  }, [handleUserLogout, showMessage]);

  const handleAdminTabClick = useCallback(() => {
    if (isAdminAuthenticated) {
      setActiveTab('admin');
    } else {
      setShowAdminLogin(true);
    }
  }, [isAdminAuthenticated]);

  const clearAllUserData = useCallback(async () => {
    if (window.confirm('Supprimer TOUTES les données joueurs (paris, bankers, joueurs) ? Action irréversible !')) {
      try {
        const res = await apiFetch(`/admin/reset-data`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showMessage('Toutes les données joueurs ont été effacées.', 'success');
          fetchAllData();
        } else {
          showMessage(data.error, 'error');
        }
      } catch (error) {
        showMessage(`Erreur : ${error.message}`, 'error');
      }
    }
  }, [showMessage, fetchAllData]);

  const handleSetBet = useCallback(async (raceId, horseNumber) => {
    try {
      const race = races.find(r => r.id === raceId);
      const useAdminEndpoint = isAdminAuthenticated && isRaceLocked(race);
      const response = await apiFetch(useAdminEndpoint ? `/admin/bet` : `/bet`, {
        method: 'POST',
        body: JSON.stringify({ userId: String(selectedUserId), raceId, horseNumber })
      });
      const data = await response.json();
      if (data.success) {
        await refreshRaceDay();
        showMessage(`Pari enregistré sur le n°${horseNumber} 🐎`, 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage(`Erreur : ${error.message}`, 'error');
    }
  }, [selectedUserId, showMessage, refreshRaceDay, races, isAdminAuthenticated]);

  const handleSetBanker = useCallback(async (raceId) => {
    try {
      const currentBet = bets.find(bet => String(bet.userId) === String(selectedUserId) && bet.raceId === raceId);
      if (!currentBet) {
        showMessage("Choisis d'abord un cheval dans cette course", 'info');
        return;
      }
      const race = races.find(r => r.id === raceId);
      const firstRace = [...races].sort((a, b) => a.raceNumber - b.raceNumber)[0];
      // Bankers lock for the day when the first race starts; admins can still override
      const useAdminEndpoint = isAdminAuthenticated && (isRaceLocked(race) || isRaceLocked(firstRace));
      const response = await apiFetch(useAdminEndpoint ? `/admin/banker` : `/banker`, {
        method: 'POST',
        body: JSON.stringify({ userId: String(selectedUserId), raceId, horseNumber: currentBet.horse })
      });
      const data = await response.json();
      if (data.success) {
        await refreshRaceDay();
        starBurst();
        showMessage('Banker posé ! ⭐ ×2 si ça passe', 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage(`Erreur : ${error.message}`, 'error');
    }
  }, [selectedUserId, bets, showMessage, refreshRaceDay, races, isAdminAuthenticated]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    apiFetch(`/admin/settings`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => data && setScoringConfig(data))
      .catch(() => {});
  }, []);

  // Validate a restored session (token may have expired or user been deleted)
  useEffect(() => {
    if (!loadSession()) return;
    apiFetch(`/users/me`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(me => setIsAdminAuthenticated(!!me.is_admin))
      .catch(() => { saveSession(null); setSelectedUserId(null); setIsAdminAuthenticated(false); });
  }, []);

  // Which bets are visible depends on who is logged in
  const lastUserRef = useRef(selectedUserId);
  useEffect(() => {
    if (lastUserRef.current === selectedUserId) return;
    lastUserRef.current = selectedUserId;
    if (selectedRaceDay) refreshRaceDay();
  }, [selectedUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUserSelect = useCallback((userId) => {
    setPendingUserId(userId);
    setPinError('');
    setPinInput('');
  }, []);

  const handlePinSubmit = useCallback(async () => {
    if (pinInput.length !== 4 || pinBusy) return;
    setPinBusy(true);
    try {
      const response = await apiFetch(`/users/login`, {
        method: 'POST',
        body: JSON.stringify({ userId: pendingUserId, pin: pinInput })
      });
      const data = await response.json();
      if (data.success) {
        setPinError('');
        saveSession({ token: data.token, userId: pendingUserId });
        setSelectedUserId(pendingUserId);
        if (data.is_admin) setIsAdminAuthenticated(true);
        setShowPlayerPicker(false);
        setPinInput('');
        setPendingUserId(null);
        showMessage(`Salut ${data.name || ''} ! 👋`, 'success');
      } else {
        if (response.status === 429) {
          setPinError("Trop d'essais 😅 Fais une pause de 5 minutes, puis réessaie.");
        } else if (data.attemptsLeft != null && data.attemptsLeft <= 3) {
          setPinError(data.attemptsLeft > 0
            ? `Mauvais code. Encore ${data.attemptsLeft} essai${data.attemptsLeft > 1 ? 's' : ''} avant une pause de 5 minutes.`
            : "Mauvais code. Pause de 5 minutes avant de réessayer.");
        } else {
          setPinError('Mauvais code, réessaie !');
        }
        setPinInput('');
        setPinShake(true);
        setTimeout(() => setPinShake(false), 600);
      }
    } catch (error) {
      showMessage(`Erreur : ${error.message}`, 'error');
      setPinInput('');
    } finally {
      setPinBusy(false);
    }
  }, [pendingUserId, pinInput, pinBusy, showMessage]);

  const handleRegister = useCallback(async () => {
    if (!registerName.trim()) { showMessage('Saisis ton prénom.', 'info'); return; }
    if (registerPin.length !== 4) { showMessage('Le PIN doit faire 4 chiffres.', 'info'); return; }
    try {
      const res = await apiFetch(`/users`, {
        method: 'POST',
        body: JSON.stringify({ name: registerName.trim(), pin: registerPin }),
      });
      const data = await res.json();
      if (!res.ok) { showMessage(data.error || 'Inscription impossible.', 'error'); return; }
      saveSession({ token: data.token, userId: data.id });
      setSelectedUserId(data.id);
      setUsers(prev => [...prev, { id: data.id, name: data.name }]);
      setShowRegisterForm(false);
      setShowPlayerPicker(false);
      setRegisterName('');
      setRegisterPin('');
      setShowAvatarPicker(true);
      showMessage(`Bienvenue, ${data.name} ! 🎉`, 'success');
    } catch (e) {
      showMessage(`Erreur : ${e.message}`, 'error');
    }
  }, [registerName, registerPin, showMessage]);

  const handlePickAvatar = useCallback(async (avatar) => {
    try {
      const res = await apiFetch(`/users/me`, { method: 'PUT', body: JSON.stringify({ avatar }) });
      const data = await res.json();
      if (!res.ok) { showMessage(data.error, 'error'); return; }
      setUsers(prev => prev.map(u => u.id === selectedUserId ? { ...u, avatar } : u));
      setShowAvatarPicker(false);
    } catch (e) {
      showMessage(`Erreur : ${e.message}`, 'error');
    }
  }, [selectedUserId, showMessage]);

  const openProfile = useCallback((userId) => {
    setProfileUserId(userId);
    setActiveTab('players');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const closePlayerPicker = () => {
    setShowPlayerPicker(false);
    setPendingUserId(null);
    setPinInput('');
    setShowRegisterForm(false);
  };

  // Close user menu when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const tabs = [...TABS, ...(isAdminAuthenticated ? [{ id: 'admin', label: 'Admin', Icon: Settings }] : [])];
  const pendingUser = users.find(u => u.id === pendingUserId);

  const toastStyle = {
    error: 'bg-coral-500 text-white',
    success: 'bg-mint-500 text-white',
    info: 'bg-grape-700 text-white',
  }[message.type] || 'bg-grape-700 text-white';

  return (
    <div className="min-h-screen font-sans [overflow-x:clip]">

      {/* Cold-start overlay */}
      {slowLoad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-grape-900/40 backdrop-blur-sm p-4">
          <div className="card px-8 py-4 max-w-xs text-center">
            <GallopLoader label="Le serveur se réveille…" />
            <p className="text-sm text-grape-500 -mt-6 pb-4">Il faisait la sieste — encore quelques secondes !</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-cream/85 backdrop-blur border-b-2 border-grape-100">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 min-h-[4rem] py-2 flex items-center justify-between gap-2">
          <button
            className="flex items-center gap-1.5 sm:gap-2 select-none min-w-0"
            onClick={() => setActiveTab('home')}
            onDoubleClick={handleAdminTabClick}
          >
            <span className="text-2xl sm:text-3xl animate-float inline-block flex-shrink-0">🏇</span>
            <span className="text-left leading-none min-w-0">
              <span className="block font-display text-xl sm:text-2xl font-extrabold text-grape-700 tracking-tight whitespace-nowrap">
                Lekours<span className="ml-1 align-top text-[10px] font-bold text-sunny-600 bg-sunny-100 rounded-full px-1.5 py-0.5">β</span>
              </span>
              <span className="block text-[11px] font-bold text-grape-400 -mt-0.5 truncate">la famille Payen</span>
            </span>
          </button>

          {/* Desktop navigation */}
          <nav className="hidden lg:flex items-center gap-1 bg-white rounded-2xl p-1 border-2 border-grape-100">
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-display font-bold transition-all ${
                  activeTab === id ? 'bg-grape-500 text-white shadow-[0_3px_0_0_theme(colors.grape.700)]' : 'text-grape-400 hover:text-grape-700 hover:bg-grape-50'
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </nav>

          {/* User chip */}
          {me ? (
            <div ref={userMenuRef} className="relative min-w-0 flex-shrink">
              <button onClick={() => setShowUserMenu(o => !o)} className="flex items-center gap-1.5 rounded-full bg-white border-2 border-grape-100 pl-1 pr-2.5 py-1 hover:border-grape-300 transition-colors max-w-full">
                <Avatar user={me} users={users} size="sm" />
                <span className="font-display font-bold text-grape-800 max-w-[5.5rem] sm:max-w-[7rem] truncate">{me.name}</span>
              </button>
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-52 card p-2 animate-slide-up z-40">
                  <button onClick={() => { openProfile(me.id); setShowUserMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-grape-50 font-bold text-grape-700">
                    <UserRound className="w-4 h-4" /> Mon profil
                  </button>
                  <button onClick={() => { setShowAvatarPicker(true); setShowUserMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-grape-50 font-bold text-grape-700">
                    <Smile className="w-4 h-4" /> Changer d'avatar
                  </button>
                  <button onClick={handleUserLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-coral-100 font-bold text-coral-500">
                    <LogOut className="w-4 h-4" /> Changer de joueur
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => setShowPlayerPicker(true)} className="btn-primary py-2 text-sm whitespace-nowrap flex-shrink-0">
              Je joue !
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-5 pb-28 lg:pb-12">
        {activeTab === 'home' && (
          <HomePage
            me={me}
            users={users}
            races={races}
            bets={bets}
            bankers={bankers}
            selectedRaceDay={selectedRaceDay}
            scoringConfig={scoringConfig}
            onLogin={() => setShowPlayerPicker(true)}
            onGoToRaces={() => setActiveTab('races')}
            onOpenProfile={openProfile}
            onGoToLeaderboard={() => setActiveTab('leaderboard')}
          />
        )}

        {activeTab === 'races' && (
          <RaceDayTab
            races={races}
            availableRaceDays={availableRaceDays}
            selectedRaceDay={selectedRaceDay}
            fetchRaceDayData={fetchRaceDayData}
            refreshRaceDay={refreshRaceDay}
            loading={loading}
            isAdmin={isAdminAuthenticated}
            bets={bets}
            bankers={bankers}
            users={users}
            selectedUserId={selectedUserId}
            scoringConfig={scoringConfig}
            handleSetBet={handleSetBet}
            handleSetBanker={handleSetBanker}
            onLogin={() => setShowPlayerPicker(true)}
            onOpenProfile={openProfile}
            showMessage={showMessage}
          />
        )}

        {activeTab === 'leaderboard' && (
          <LeaderboardTab users={users} selectedUserId={selectedUserId} showMessage={showMessage} onOpenProfile={openProfile} />
        )}

        {activeTab === 'players' && (
          <PlayersTab
            users={users}
            selectedUserId={selectedUserId}
            profileUserId={profileUserId}
            setProfileUserId={setProfileUserId}
            onEditAvatar={() => setShowAvatarPicker(true)}
            showMessage={showMessage}
          />
        )}

        {activeTab === 'admin' && isAdminAuthenticated && (
          <AdminTab
            newUserName={newUserName}
            setNewUserName={setNewUserName}
            newUserPin={newUserPin}
            setNewUserPin={setNewUserPin}
            handleAddUser={handleAddUser}
            handleUpdateUser={handleUpdateUser}
            handleDeleteUser={handleDeleteUser}
            users={users}
            setUsers={setUsers}
            clearAllUserData={clearAllUserData}
            handleAdminLogout={handleAdminLogout}
            showMessage={showMessage}
            fetchAllData={fetchAllData}
          />
        )}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t-2 border-grape-100 pb-safe">
        <div className="flex max-w-lg mx-auto">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex-1 min-w-0 flex flex-col items-center justify-center pt-2 pb-2.5 gap-0.5"
            >
              <span className={`flex items-center justify-center w-full max-w-[3rem] h-8 rounded-full transition-all ${activeTab === id ? 'bg-grape-500 text-white animate-pop' : 'text-grape-300'}`}>
                <Icon className="w-5 h-5" strokeWidth={activeTab === id ? 2.5 : 2} />
              </span>
              <span className={`text-[11px] font-bold max-w-full truncate px-0.5 ${activeTab === id ? 'text-grape-700' : 'text-grape-300'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Player picker + PIN pad */}
      <Modal open={showPlayerPicker} onClose={closePlayerPicker}>
        {pendingUser ? (
          <div className="text-center">
            <Avatar user={pendingUser} users={users} size="lg" className="mx-auto mb-2 short:hidden" />
            <h3 className="font-display text-2xl font-extrabold text-grape-800">{pendingUser.name}</h3>
            <p className="text-grape-500 mb-5 short:mb-3">Ton code secret à 4 chiffres</p>
            <PinPad value={pinInput} onChange={setPinInput} onSubmit={handlePinSubmit} shake={pinShake} busy={pinBusy} />
            {pinError && <p className="mt-4 text-sm font-bold text-coral-500" role="alert">{pinError}</p>}
            <p className="mt-4 text-xs text-grape-400">
              Code oublié ? Demande à un admin de t'en mettre un nouveau — personne ne peut voir l'ancien, il est chiffré 🔐
            </p>
            <button onClick={() => setPendingUserId(null)} className="mt-3 text-sm font-bold text-grape-400 hover:text-grape-600">← Ce n'est pas moi</button>
          </div>
        ) : showRegisterForm ? (
          <div>
            <h3 className="font-display text-2xl font-extrabold text-grape-800 mb-1">Nouveau joueur 🎉</h3>
            <p className="text-grape-500 mb-4">Rejoins la course !</p>
            <div className="space-y-3">
              <input type="text" placeholder="Ton prénom" value={registerName} onChange={e => setRegisterName(e.target.value)} className="input" autoFocus />
              <input
                type="password" inputMode="numeric" maxLength={4} placeholder="Code secret (4 chiffres)"
                value={registerPin}
                onChange={e => setRegisterPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={e => e.key === 'Enter' && handleRegister()}
                className="input text-center tracking-[0.5em]"
              />
              <p className="text-xs text-grape-400">
                🔐 Choisis 4 chiffres faciles à retenir pour toi (évite 1234 ou ton année de naissance !). Garde-le secret : il protège tes paris.
              </p>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowRegisterForm(false)} className="btn-ghost flex-1">Retour</button>
                <button onClick={handleRegister} className="btn-primary flex-1">C'est parti !</button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="font-display text-2xl font-extrabold text-grape-800 mb-1">Qui joue ? 🐎</h3>
            <p className="text-grape-500 mb-4">Choisis ton profil</p>
            <div className="grid grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto p-1">
              {users.map(user => (
                <button key={user.id} onClick={() => handleUserSelect(user.id)} className="flex flex-col items-center gap-1 rounded-2xl p-2 hover:bg-grape-50 transition-colors active:scale-95">
                  <Avatar user={user} users={users} size="lg" />
                  <span className="text-sm font-bold text-grape-800 truncate max-w-full">{user.name}</span>
                </button>
              ))}
              <button onClick={() => setShowRegisterForm(true)} className="flex flex-col items-center gap-1 rounded-2xl p-2 hover:bg-grape-50 transition-colors">
                <span className="w-14 h-14 rounded-full border-2 border-dashed border-grape-300 flex items-center justify-center text-2xl text-grape-400">+</span>
                <span className="text-sm font-bold text-grape-400">Nouveau</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Avatar picker */}
      <Modal open={showAvatarPicker} onClose={() => setShowAvatarPicker(false)}>
        <h3 className="font-display text-2xl font-extrabold text-grape-800 mb-1">Choisis ton avatar</h3>
        <p className="text-grape-500 mb-4">Il apparaîtra partout dans le jeu</p>
        <div className="grid grid-cols-6 gap-2">
          {AVATARS.map(a => (
            <button
              key={a}
              onClick={() => handlePickAvatar(a)}
              className={`aspect-square rounded-2xl text-3xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${me?.avatar === a ? 'bg-grape-100 ring-4 ring-grape-300' : 'bg-grape-50'}`}
            >
              {a}
            </button>
          ))}
        </div>
        {me?.avatar && (
          <button onClick={() => handlePickAvatar(null)} className="mt-4 w-full text-sm font-bold text-grape-400 hover:text-grape-600">Revenir à mes initiales</button>
        )}
      </Modal>

      {/* Admin login */}
      <Modal open={showAdminLogin} onClose={() => { setShowAdminLogin(false); setAdminPassword(''); }}>
        <h3 className="font-display text-2xl font-extrabold text-grape-800 mb-4">🔐 Accès admin</h3>
        <input
          type="password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
          className="input mb-4"
          placeholder="Mot de passe admin"
          autoFocus
        />
        <button onClick={handleAdminLogin} className="btn-primary w-full">Entrer</button>
      </Modal>

      {/* Toast */}
      <div
        className={`fixed top-20 left-1/2 -translate-x-1/2 z-[60] max-w-[90vw] rounded-2xl px-5 py-3 font-display font-bold shadow-pop transition-all duration-300 ${toastStyle} ${
          showMessageBox ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
        role="status"
      >
        {message.text}
      </div>
    </div>
  );
};

export default HorseBettingApp;

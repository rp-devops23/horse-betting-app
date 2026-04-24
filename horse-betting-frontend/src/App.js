import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, Settings, Home, Calendar } from 'lucide-react';

import HomePage from './components/HomePage.jsx';
import RaceDayTab from './components/RaceDayTab.jsx';
import LeaderboardTab from './components/LeaderboardTab.jsx';
import AdminTab from './components/AdminTab.jsx';

import API_BASE from './config';
import { BADGE_COLOURS, initials, getUserColour } from './utils/userColors';

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
  const [currentRaceDay, setCurrentRaceDay] = useState(null);
  const [availableRaceDays, setAvailableRaceDays] = useState([]);
  const [selectedRaceDay, setSelectedRaceDay] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null); // Start with no user selected

  // User PIN login state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [newUserPin, setNewUserPin] = useState('');

  // Self-registration state
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerPin, setRegisterPin] = useState('');

  // User picker dropdown
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const userPickerRef = useRef(null);

  // Admin tab state
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  const showMessage = useCallback((text, type = 'info') => {
    setMessage({ text, type });
    setShowMessageBox(true);
    setTimeout(() => {
      setShowMessageBox(false);
    }, 5000);
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const usersRes = await fetch(`${API_BASE}/users`);
      const usersData = await usersRes.json();
      if (Array.isArray(usersData)) setUsers(usersData);

      const betsRes = await fetch(`${API_BASE}/bets`);
      const betsData = await betsRes.json();
      if (Array.isArray(betsData)) setBets(betsData);

      // Fetch bankers for current race day if available
      const bankersUrl = selectedRaceDay 
        ? `${API_BASE}/bankers?race_date=${selectedRaceDay}`
        : `${API_BASE}/bankers`;
      const bankersRes = await fetch(bankersUrl);
      const bankersData = await bankersRes.json();
      if (typeof bankersData === 'object' && bankersData !== null) setBankers(bankersData);

      // Fetch available race days
      const raceDaysRes = await fetch(`${API_BASE}/race-days/index`);
      const raceDaysData = await raceDaysRes.json();
      if (raceDaysData.raceDays && Array.isArray(raceDaysData.raceDays)) {
        setAvailableRaceDays(raceDaysData.raceDays.map(day => day.date));
      }

      const currentDayRes = await fetch(`${API_BASE}/race-days/current`);
      const currentDayData = await currentDayRes.json();
      setCurrentRaceDay(currentDayData.data);
      
      // Only set races and selected race day if no specific race day is already selected
      if (!selectedRaceDay) {
        if (currentDayData.data) {
          setSelectedRaceDay(currentDayData.data.date);
          if (Array.isArray(currentDayData.data.races)) {
            setRaces(currentDayData.data.races);
          }
        } else {
          setRaces([]);
        }
      }
    } catch (error) {
      showMessage(`Connection to server failed: ${error.message}`, 'error');
      console.error('Error in fetchAllData:', error);
    } finally {
      setLoading(false);
    }
  }, [showMessage, selectedRaceDay]);

  const fetchRaceDayData = useCallback(async (raceDate) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/race-days/${raceDate}`);
      const data = await response.json();
      
      if (data && data.races && Array.isArray(data.races)) {
        setRaces(data.races);
        setSelectedRaceDay(raceDate);
        
        // Fetch bankers for this specific race date
        const bankersRes = await fetch(`${API_BASE}/bankers?race_date=${raceDate}`);
        const bankersData = await bankersRes.json();
        if (typeof bankersData === 'object' && bankersData !== null) setBankers(bankersData);
      } else {
        setRaces([]);
        showMessage('No races found for this date', 'info');
      }
    } catch (error) {
      showMessage(`Error fetching race day: ${error.message}`, 'error');
      console.error('Error in fetchRaceDayData:', error);
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  const handleAddUser = useCallback(async () => {
    if (!newUserName.trim()) {
      showMessage('Please enter a user name.', 'info');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newUserName, pin: newUserPin })
      });
      const data = await response.json();
      if (response.ok) {
        setUsers(prevUsers => [...prevUsers, data]);
        setNewUserName('');
        setNewUserPin('');
        showMessage('User added successfully!', 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage(`Error adding user: ${error.message}`, 'error');
    }
  }, [newUserName, newUserPin, setUsers, setNewUserName, showMessage]);

  const handleUpdateUser = useCallback(async (userId, newName, newPin = null) => {
    if (!newName?.trim() && !newPin) {
      showMessage('Veuillez saisir un nom ou un PIN.', 'info');
      return;
    }
    try {
      const body = { userId };
      if (newName?.trim()) body.name = newName.trim();
      if (newPin) body.pin = newPin;
      const response = await fetch(`${API_BASE}/admin/users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
    if (!window.confirm('Are you sure you want to delete this user? This will also delete all their bets and scores. This action cannot be undone.')) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/admin/users`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await response.json();
      if (data.success) {
        setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));
        // Clear selected user if it was deleted
        if (selectedUserId === userId) {
          setSelectedUserId(null);
        }
        showMessage('User deleted successfully!', 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage(`Error deleting user: ${error.message}`, 'error');
    }
  }, [showMessage, selectedUserId]);

  const handleAdminLogin = useCallback(async () => {
    if (!adminPassword.trim()) {
      showMessage('Please enter admin password.', 'info');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword })
      });
      const data = await response.json();
      if (data.success) {
        setIsAdminAuthenticated(true);
        setShowAdminLogin(false);
        setAdminPassword('');
        showMessage('Admin access granted!', 'success');
      } else {
        showMessage('Invalid admin password.', 'error');
      }
    } catch (error) {
      showMessage('Error contacting server.', 'error');
    }
  }, [adminPassword, showMessage]);

  const handleAdminLogout = useCallback(() => {
    setIsAdminAuthenticated(false);
    setAdminPassword('');
    showMessage('Admin access revoked.', 'info');
  }, [showMessage]);

  const handleAdminTabClick = useCallback(() => {
    if (isAdminAuthenticated) {
      setActiveTab('admin');
    } else {
      setShowAdminLogin(true);
    }
  }, [isAdminAuthenticated]);

  const handleTabChange = useCallback((tabName) => {
    setActiveTab(tabName);
  }, []);

  const clearAllUserData = useCallback(async () => {
    if (window.confirm("Are you sure you want to delete ALL user data (bets, bankers, users)? This cannot be undone!")) {
      try {
        const res = await fetch(`${API_BASE}/admin/reset-data`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showMessage("All user data has been cleared.", "success");
          fetchAllData();
        } else {
          showMessage(data.error, "error");
        }
      } catch (error) {
        showMessage(`Failed to clear data: ${error.message}`, "error");
      }
    }
  }, [showMessage, fetchAllData]);

  const handleSetBet = useCallback(async (raceId, horseNumber) => {
    try {
      const response = await fetch(`${API_BASE}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: String(selectedUserId), raceId, horseNumber })
      });
      const data = await response.json();
      if (data.success) {
        // Refresh bets data to get updated state
        const betsRes = await fetch(`${API_BASE}/bets`);
        const betsData = await betsRes.json();
        if (Array.isArray(betsData)) setBets(betsData);
        
        showMessage('Bet updated!', 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage(`Error placing bet: ${error.message}`, 'error');
    }
  }, [selectedUserId, showMessage, setBets]);

  const handleSetBanker = useCallback(async (raceId) => {
    try {
      // Check if user already has a banker bet for this race
      const currentBet = bets.find(bet => String(bet.userId) === String(selectedUserId) && bet.raceId === raceId);
      
      if (currentBet) {
        // If there's already a bet, make it a banker bet
        const response = await fetch(`${API_BASE}/banker`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: String(selectedUserId), raceId, horseNumber: currentBet.horse })
        });
        const data = await response.json();
        if (data.success) {
          // Refresh bets and bankers data
          const betsRes = await fetch(`${API_BASE}/bets`);
          const betsData = await betsRes.json();
          if (Array.isArray(betsData)) setBets(betsData);
          
          const bankersUrl = selectedRaceDay 
            ? `${API_BASE}/bankers?race_date=${selectedRaceDay}`
            : `${API_BASE}/bankers`;
          const bankersRes = await fetch(bankersUrl);
          const bankersData = await bankersRes.json();
          if (typeof bankersData === 'object' && bankersData !== null) setBankers(bankersData);
          
          showMessage('Banker updated!', 'success');
        } else {
          showMessage(data.error, 'error');
        }
      } else {
        showMessage('Please place a bet first before setting as banker', 'info');
      }
    } catch (error) {
      showMessage(`Error setting banker: ${error.message}`, 'error');
    }
  }, [selectedUserId, bets, setBets, setBankers, showMessage, selectedRaceDay]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleUserSelect = useCallback((userId) => {
    setPendingUserId(userId);
    setPinInput('');
    setShowPinModal(true);
  }, []);

  const handlePinSubmit = useCallback(async () => {
    if (pinInput.length !== 4) {
      showMessage('Please enter your 4-digit PIN.', 'info');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pendingUserId, pin: pinInput })
      });
      const data = await response.json();
      if (data.success) {
        setSelectedUserId(pendingUserId);
        if (data.is_admin) setIsAdminAuthenticated(true);
        setShowPinModal(false);
        setPinInput('');
        setPendingUserId(null);
      } else {
        showMessage('Wrong PIN. Try again.', 'error');
        setPinInput('');
      }
    } catch (error) {
      showMessage(`Error: ${error.message}`, 'error');
    }
  }, [pendingUserId, pinInput, showMessage]);

  const handleUserLogout = useCallback(() => {
    setSelectedUserId(null);
    setIsAdminAuthenticated(false);
    if (activeTab === 'admin') setActiveTab('home');
  }, [activeTab]);

  const handleRegister = useCallback(async () => {
    if (!registerName.trim()) { showMessage('Please enter your name.', 'info'); return; }
    if (registerPin.length !== 4) { showMessage('PIN must be exactly 4 digits.', 'info'); return; }
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: registerName.trim(), pin: registerPin }),
      });
      const data = await res.json();
      if (!res.ok) { showMessage(data.error || 'Registration failed.', 'error'); return; }
      await fetchAllData();
      setSelectedUserId(data.id);
      setShowRegisterForm(false);
      setUserPickerOpen(false);
      setRegisterName('');
      setRegisterPin('');
      showMessage(`Bienvenue, ${data.name} !`, 'success');
    } catch (e) {
      showMessage(`Error: ${e.message}`, 'error');
    }
  }, [registerName, registerPin, fetchAllData, showMessage]);

  // Close user picker when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (userPickerRef.current && !userPickerRef.current.contains(e.target)) {
        setUserPickerOpen(false);
        setShowRegisterForm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const MessageBox = ({ text, type }) => {
    const bgColor = type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500';
    return (
      <div className={`fixed bottom-20 lg:bottom-4 left-1/2 -translate-x-1/2 z-50 ${bgColor} text-white p-4 rounded-lg shadow-xl transition-all duration-300 transform ${showMessageBox ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}>
        {text}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans antialiased text-gray-800">
      {/* Fixed mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg">
        <div className="absolute top-1 right-2 text-xs font-semibold text-amber-600 opacity-60">β</div>
        <div className="flex">
          {[
            { id: 'home', label: 'Accueil', Icon: Home },
            { id: 'races', label: 'Courses', Icon: Calendar },
            { id: 'leaderboard', label: 'Classement', Icon: Trophy },
            ...(isAdminAuthenticated ? [{ id: 'admin', label: 'Admin', Icon: Settings }] : []),
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                activeTab === id ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className={`w-6 h-6 ${activeTab === id ? 'stroke-[2.5]' : ''}`} />
              <span className="text-xs font-medium">{label}</span>
              {activeTab === id && <span className="absolute bottom-0 w-8 h-0.5 bg-indigo-600 rounded-t" />}
            </button>
          ))}
        </div>
      </nav>
      <div className="container mx-auto p-4 sm:p-8 pb-24 lg:pb-8">
        <div className="relative flex items-center justify-center mb-4">
          <h1
            className="text-4xl font-extrabold text-center text-indigo-800 tracking-tight select-none"
            onDoubleClick={handleAdminTabClick}
            title=""
          >
            Payen family's Lekours
          </h1>
          <span className="absolute right-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">β</span>
        </div>

        {/* User selector bar */}
        <div className="flex items-center justify-center mb-6">
          {selectedUserId ? (
            /* Logged in: badge + full name + Switch */
            <div className="flex items-center gap-2">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${getUserColour(users, selectedUserId)}`}>
                {initials(users.find(u => u.id === selectedUserId)?.name || '')}
              </span>
              <span className="font-bold text-indigo-700">{users.find(u => u.id === selectedUserId)?.name}</span>
              <button onClick={handleUserLogout} className="text-xs text-gray-400 hover:text-red-500 underline transition-colors ml-1">Changer</button>
            </div>
          ) : (
            /* Not logged in: deployable dropdown */
            <div ref={userPickerRef} className="relative w-full max-w-xs">
              <button
                onClick={() => { setUserPickerOpen(o => !o); setShowRegisterForm(false); }}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-gray-300 rounded-lg shadow-sm text-gray-600 hover:border-indigo-400 transition-colors"
              >
                <span className="text-sm font-medium">Choisir un joueur</span>
                <span className="text-gray-400 text-xs">{userPickerOpen ? '▲' : '▼'}</span>
              </button>

              {userPickerOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
                  {users.map((user, index) => (
                    <button
                      key={user.id}
                      onClick={() => { handleUserSelect(user.id); setUserPickerOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 transition-colors text-left"
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${BADGE_COLOURS[index % BADGE_COLOURS.length]}`}>
                        {initials(user.name)}
                      </span>
                      <span className="font-medium text-gray-800">{user.name}</span>
                    </button>
                  ))}
                  <div className="border-t border-gray-100">
                    {!showRegisterForm ? (
                      <button
                        onClick={() => setShowRegisterForm(true)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-indigo-500 text-sm"
                      >
                        <span className="w-8 h-8 rounded-full border-2 border-dashed border-indigo-300 flex items-center justify-center text-indigo-400 font-bold flex-shrink-0">+</span>
                        Créer un compte
                      </button>
                    ) : (
                      <div className="p-4 space-y-2">
                        <p className="text-sm font-semibold text-indigo-700">Créer un compte</p>
                        <input
                          type="text"
                          placeholder="Ton prénom"
                          value={registerName}
                          onChange={e => setRegisterName(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="PIN à 4 chiffres"
                          value={registerPin}
                          onChange={e => setRegisterPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          onKeyPress={e => e.key === 'Enter' && handleRegister()}
                          className="w-full p-2 border border-gray-300 rounded-md text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <div className="flex gap-2">
                          <button onClick={handleRegister} className="flex-1 bg-indigo-600 text-white py-2 rounded-md text-sm hover:bg-indigo-700 transition-colors">Rejoindre</button>
                          <button onClick={() => { setShowRegisterForm(false); setRegisterName(''); setRegisterPin(''); }} className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-md text-sm hover:bg-gray-300 transition-colors">Annuler</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1">

            {/* Desktop Navigation (hidden on mobile — replaced by bottom bar) */}
            <div className="hidden lg:flex justify-center mb-6">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button onClick={() => handleTabChange('home')} className={`py-3 px-6 rounded-md transition-colors duration-200 font-semibold ${activeTab === 'home' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-indigo-700'}`}>
                  <Home className="inline-block w-5 h-5 mr-2" />
                  Accueil
                </button>
                <button onClick={() => handleTabChange('races')} className={`py-3 px-6 rounded-md transition-colors duration-200 font-semibold ${activeTab === 'races' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-indigo-700'}`}>
                  <Calendar className="inline-block w-5 h-5 mr-2" />
                  Courses
                </button>
                <button onClick={() => handleTabChange('leaderboard')} className={`py-3 px-6 rounded-md transition-colors duration-200 font-semibold ${activeTab === 'leaderboard' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-indigo-700'}`}>
                  <Trophy className="inline-block w-5 h-5 mr-2" />
                  Classement
                </button>
                {isAdminAuthenticated && (
                  <button onClick={() => handleTabChange('admin')} className={`py-3 px-6 rounded-md transition-colors duration-200 font-semibold ${activeTab === 'admin' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-indigo-700'}`}>
                    <Settings className="inline-block w-5 h-5 mr-2" />
                    Admin
                  </button>
                )}
              </div>
            </div>

            {activeTab === 'home' && (
              <HomePage />
            )}

            {activeTab === 'races' && (
              <RaceDayTab
                races={races}
                currentRaceDay={currentRaceDay}
                availableRaceDays={availableRaceDays}
                selectedRaceDay={selectedRaceDay}
                fetchAllData={fetchAllData}
                fetchRaceDayData={fetchRaceDayData}
                loading={loading}
                isAdmin={isAdminAuthenticated}
                bets={bets}
                bankers={bankers}
                users={users}
                selectedUserId={selectedUserId}
                handleSetBet={handleSetBet}
                handleSetBanker={handleSetBanker}
              />
            )}

            {activeTab === 'leaderboard' && (
              <LeaderboardTab users={users} showMessage={showMessage} />
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

            {/* User PIN Modal */}
            {showPinModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full mx-4">
                  <h3 className="text-xl font-bold mb-1 text-indigo-700">
                    {users.find(u => u.id === pendingUserId)?.name}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">Enter your 4-digit PIN</p>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    onKeyPress={(e) => e.key === 'Enter' && handlePinSubmit()}
                    className="w-full p-3 border border-gray-300 rounded-md text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="••••"
                    autoFocus
                  />
                  <div className="flex gap-3 mt-4">
                    <button onClick={handlePinSubmit} className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors">
                      Login
                    </button>
                    <button onClick={() => { setShowPinModal(false); setPinInput(''); }} className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Admin Login Modal */}
            {showAdminLogin && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
                  <h3 className="text-xl font-bold mb-4 text-indigo-700">Admin Access Required</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Admin Password
                      </label>
                      <input
                        type="password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                        className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Enter admin password"
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={handleAdminLogin}
                        className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                      >
                        Login
                      </button>
                      <button
                        onClick={() => {
                          setShowAdminLogin(false);
                          setAdminPassword('');
                        }}
                        className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <MessageBox text={message.text} type={message.type} />
    </div>
  );
};

export default HorseBettingApp;

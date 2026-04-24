import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, Settings, Star, Activity, Home, Menu, X } from 'lucide-react';

import HomePage from './components/HomePage.jsx';
import RaceDayTab from './components/RaceDayTab.jsx';
import UserBetsTab from './components/UserBetsTab.jsx';
import LeaderboardTab from './components/LeaderboardTab.jsx';
import AdminTab from './components/AdminTab.jsx';

import API_BASE from './config';

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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // User PIN login state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [newUserPin, setNewUserPin] = useState('');

  // Admin tab state
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [backendFiles, setBackendFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);

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

  const handleUpdateUser = useCallback(async (userId, newName) => {
    if (!newName.trim()) {
      showMessage('Please enter a valid user name.', 'info');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/admin/users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name: newName })
      });
      const data = await response.json();
      if (data.success) {
        setUsers(prevUsers => 
          prevUsers.map(user => 
            user.id === userId ? { ...user, name: newName } : user
          )
        );
        showMessage('User updated successfully!', 'success');
      } else {
        showMessage(data.error, 'error');
      }
    } catch (error) {
      showMessage(`Error updating user: ${error.message}`, 'error');
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
    setIsMobileMenuOpen(false);
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
  }, []);

  const MessageBox = ({ text, type }) => {
    const bgColor = type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500';
    return (
      <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 ${bgColor} text-white p-4 rounded-lg shadow-xl transition-all duration-300 transform ${showMessageBox ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}>
        {text}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans antialiased text-gray-800">
      <div className="container mx-auto p-4 sm:p-8">
        <h1 className="text-4xl font-extrabold text-center text-indigo-800 mb-4 tracking-tight">Payen family's Lekours</h1>

        {/* User selector bar */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {selectedUserId ? (
            <>
              <span className="text-gray-600 text-sm">Playing as</span>
              <span className="font-bold text-indigo-700">{users.find(u => u.id === selectedUserId)?.name}</span>
              <button onClick={handleUserLogout} className="text-xs text-gray-400 hover:text-red-500 underline transition-colors">Switch</button>
            </>
          ) : (
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-3">Who are you?</p>
              <div className="flex flex-wrap justify-center gap-2">
                {users.map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleUserSelect(user.id)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
                  >
                    {user.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1">
            {/* Mobile Navigation */}
            <div className="lg:hidden mb-6">
              <div className="flex items-center justify-between bg-white rounded-lg shadow-md p-4">
                <span className="text-lg font-semibold text-indigo-700">
                  {activeTab === 'home' && 'Home'}
                  {activeTab === 'races' && 'Races'}
                  {activeTab === 'bets' && 'Your Bets'}
                  {activeTab === 'leaderboard' && 'Leaderboard'}
                  {activeTab === 'admin' && 'Admin'}
                </span>
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-2 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
                >
                  {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>
              
              {/* Mobile Dropdown Menu */}
              {isMobileMenuOpen && (
                <div className="mt-2 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                  <button 
                    onClick={() => handleTabChange('home')} 
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-indigo-50 transition-colors ${activeTab === 'home' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'}`}
                  >
                    <Home className="w-5 h-5" />
                    Home
                  </button>
                  <button 
                    onClick={() => handleTabChange('races')} 
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-indigo-50 transition-colors ${activeTab === 'races' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'}`}
                  >
                    <Activity className="w-5 h-5" />
                    Races
                  </button>
                  <button 
                    onClick={() => handleTabChange('bets')} 
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-indigo-50 transition-colors ${activeTab === 'bets' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'}`}
                  >
                    <Star className="w-5 h-5" />
                    Your Bets
                  </button>
                  <button 
                    onClick={() => handleTabChange('leaderboard')} 
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-indigo-50 transition-colors ${activeTab === 'leaderboard' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'}`}
                  >
                    <Trophy className="w-5 h-5" />
                    Leaderboard
                  </button>
                  <button 
                    onClick={handleAdminTabClick} 
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-indigo-50 transition-colors ${activeTab === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'}`}
                  >
                    <Settings className="w-5 h-5" />
                    Admin
                  </button>
                </div>
              )}
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex justify-center mb-6">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button onClick={() => handleTabChange('home')} className={`py-3 px-6 rounded-md transition-colors duration-200 font-semibold ${activeTab === 'home' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-indigo-700'}`}>
                  <Home className="inline-block w-5 h-5 mr-2" />
                  Home
                </button>
                <button onClick={() => handleTabChange('races')} className={`py-3 px-6 rounded-md transition-colors duration-200 font-semibold ${activeTab === 'races' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-indigo-700'}`}>
                  <Activity className="inline-block w-5 h-5 mr-2" />
                  Races
                </button>
                <button onClick={() => handleTabChange('bets')} className={`py-3 px-6 rounded-md transition-colors duration-200 font-semibold ${activeTab === 'bets' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-indigo-700'}`}>
                  <Star className="inline-block w-5 h-5 mr-2" />
                  Your Bets
                </button>
                <button onClick={() => handleTabChange('leaderboard')} className={`py-3 px-6 rounded-md transition-colors duration-200 font-semibold ${activeTab === 'leaderboard' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-indigo-700'}`}>
                  <Trophy className="inline-block w-5 h-5 mr-2" />
                  Leaderboard
                </button>
                <button onClick={handleAdminTabClick} className={`py-3 px-6 rounded-md transition-colors duration-200 font-semibold ${activeTab === 'admin' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-indigo-700'}`}>
                  <Settings className="inline-block w-5 h-5 mr-2" />
                  Admin
                </button>
              </div>
            </div>

            {activeTab === 'home' && (
              <HomePage users={users} showMessage={showMessage} />
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
              />
            )}

            {activeTab === 'bets' && (
              <UserBetsTab 
                races={races} 
                bets={bets} 
                bankers={bankers} 
                users={users}
                selectedUserId={selectedUserId}
                setSelectedUserId={setSelectedUserId}
                availableRaceDays={availableRaceDays}
                selectedRaceDay={selectedRaceDay}
                fetchRaceDayData={fetchRaceDayData}
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
                clearAllUserData={clearAllUserData}
                handleAdminLogout={handleAdminLogout}
                backendFiles={backendFiles}
                setBackendFiles={setBackendFiles}
                selectedFile={selectedFile}
                setSelectedFile={setSelectedFile}
                fileContent={fileContent}
                setFileContent={setFileContent}
                editingContent={editingContent}
                setEditingContent={setEditingContent}
                isEditing={isEditing}
                setIsEditing={setIsEditing}
                loadingFiles={loadingFiles}
                setLoadingFiles={setLoadingFiles}
                loadingFile={loadingFile}
                setLoadingFile={setLoadingFile}
                savingFile={savingFile}
                setSavingFile={setSavingFile}
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

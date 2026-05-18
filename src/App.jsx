import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Kiosk from './pages/Kiosk/Kiosk';
import Admin from './pages/Admin/Admin';
import Login from './pages/Auth/Login';
import SetupNeeded from './pages/SetupNeeded';
import { AuthProvider } from './contexts/AuthContext';
import RequireAuth from './contexts/RequireAuth';
import { startAutoSync } from './lib/offlineQueue';
import { isSupabaseConfigured } from './lib/supabase';
import './App.css';

function App() {
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    return startAutoSync();
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <div className="app-container">
        <main className="main-content">
          <SetupNeeded />
        </main>
      </div>
    );
  }

  return (
    <Router>
      <AuthProvider>
        <div className="app-container">
          <Navbar />
          <main className="main-content">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
              <Route path="/" element={<Kiosk />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;

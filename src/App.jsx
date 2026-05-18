import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import CheckIn from './pages/CheckIn/CheckIn';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
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
              <Route path="/register" element={<Register />} />
              <Route
                path="/check-in"
                element={
                  <RequireAuth>
                    <CheckIn />
                  </RequireAuth>
                }
              />
              <Route path="/" element={<Navigate to="/check-in" replace />} />
              <Route path="*" element={<Navigate to="/check-in" replace />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;

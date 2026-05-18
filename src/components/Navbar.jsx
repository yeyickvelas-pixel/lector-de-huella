import { ScanFace, LogOut, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { session, profile, signOut } = useAuth();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <nav className="navbar glass-panel">
      <Link to="/" className="navbar-brand">
        <ScanFace className="brand-icon" size={28} />
        <span className="brand-text">AsistApp</span>
      </Link>
      {session && (
        <div className="navbar-menu">
          {isAdminRoute ? (
            <Link to="/" className="logout-btn">Kiosko</Link>
          ) : (
            <Link to="/admin" className="logout-btn">
              <Settings size={14} style={{ verticalAlign: 'middle' }} /> Admin
            </Link>
          )}
          <span className="user-info">{profile?.nombre || session.user.email}</span>
          <button className="logout-btn" onClick={signOut} title="Cerrar sesión">
            <LogOut size={16} />
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;

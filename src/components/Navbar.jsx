import { Fingerprint, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { session, empleado, signOut } = useAuth();
  const displayName = empleado?.nombre || session?.user?.email;

  return (
    <nav className="navbar glass-panel">
      <div className="navbar-brand">
        <Fingerprint className="brand-icon" size={28} />
        <span className="brand-text">AsistApp</span>
      </div>
      {session && (
        <div className="navbar-menu">
          <span className="user-info">{displayName}</span>
          <button className="logout-btn" onClick={signOut} title="Cerrar sesión">
            <LogOut size={16} />
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;

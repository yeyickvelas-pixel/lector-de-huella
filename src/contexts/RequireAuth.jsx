import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div style={{ padding: 24 }}>Cargando…</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

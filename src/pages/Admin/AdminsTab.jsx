import { useCallback, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';

const AdminsTab = () => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, nombre, role, activo, created_at')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    setAdmins(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { (async () => { await refresh(); })(); }, [refresh]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    setCreating(true);
    try {
      // Guardamos la sesión actual del super admin
      const { data: { session: oldSession } } = await supabase.auth.getSession();
      if (!oldSession) throw new Error('Sesión expirada, vuelve a entrar');

      // signUp del nuevo admin (el trigger crea la fila en profiles como 'admin')
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { nombre: nombre.trim() } },
      });
      if (signUpError) throw new Error(signUpError.message);

      // signUp puede haber cambiado la sesión activa al nuevo user.
      // Restauramos la del super admin de inmediato.
      await supabase.auth.setSession({
        access_token: oldSession.access_token,
        refresh_token: oldSession.refresh_token,
      });

      // Si el sistema requiere confirmar email (que NO está activo), data.user existe pero sin sesión
      const userId = data.user?.id;
      if (userId) {
        // Asegurar nombre en profiles (por si el trigger no lo tomó del metadata)
        await supabase
          .from('profiles')
          .update({ nombre: nombre.trim() })
          .eq('id', userId);
      }

      setSuccess(`Admin "${nombre}" creado. Ya puede iniciar sesión con ${email}.`);
      setNombre(''); setEmail(''); setPassword('');
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1rem', marginTop: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>Agregar nuevo admin</h3>
      <form onSubmit={handleCreate} className="add-form admins-form">
        <input
          type="text" placeholder="Nombre"
          value={nombre} onChange={(e) => setNombre(e.target.value)} required
        />
        <input
          type="email" placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)} required
        />
        <input
          type="text" placeholder="Contraseña (mín 6)"
          value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
        />
        <button type="submit" className="btn btn-primary" disabled={creating}>
          <UserPlus size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          {creating ? 'Creando…' : 'Crear admin'}
        </button>
      </form>

      {error && <div className="error-msg" style={{ marginTop: '0.5rem' }}>{error}</div>}
      {success && <div className="success-msg" style={{ marginTop: '0.5rem' }}>{success}</div>}

      <h3 style={{ marginTop: '1.5rem' }}>Admins existentes</h3>
      {loading ? (
        <div className="empty-state">Cargando…</div>
      ) : (
        <table className="empleados-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Creado</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>{a.nombre || '—'}</td>
                <td>{a.email}</td>
                <td>
                  <span className={`status-badge ${a.role === 'super_admin' ? 'enrolled' : 'pending'}`}>
                    {a.role === 'super_admin' ? 'Super admin' : 'Admin'}
                  </span>
                </td>
                <td>{format(new Date(a.created_at), 'd MMM yyyy')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminsTab;

import { useCallback, useEffect, useState } from 'react';
import { Camera, Trash2, UserPlus, MapPin, Edit2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import FaceEnrollModal from '../../components/FaceEnrollModal';
import EditEmpleadoModal from './EditEmpleadoModal';
import RegistrosTab from './RegistrosTab';
import ReportesTab from './ReportesTab';
import AdminsTab from './AdminsTab';
import HoyTab from './HoyTab';
import '../../components/FaceEnrollModal.css';
import './Admin.css';

const Admin = () => {
  const { user, profile, isSuperAdmin } = useAuth();
  const [tab, setTab] = useState('hoy');
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [puesto, setPuesto] = useState('');
  const [creating, setCreating] = useState(false);
  const [enrollFor, setEnrollFor] = useState(null);
  const [editingEmpleado, setEditingEmpleado] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [savingOffice, setSavingOffice] = useState(false);
  const [radio, setRadio] = useState(profile?.oficina_radio ?? 150);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('empleados')
      .select('id, nombre, puesto, face_descriptors, enrolled_at, hora_entrada, hora_salida')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    setEmpleados(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { (async () => { await refresh(); })(); }, [refresh]);
  useEffect(() => {
    (async () => { setRadio(profile?.oficina_radio ?? 150); })();
  }, [profile?.oficina_radio]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setError(null); setSuccess(null);
    setCreating(true);
    const { data, error } = await supabase
      .from('empleados')
      .insert({
        nombre: nombre.trim(),
        puesto: puesto.trim() || null,
        admin_id: user.id,
      })
      .select()
      .single();
    setCreating(false);
    if (error) { setError(error.message); return; }
    setNombre(''); setPuesto('');
    setEmpleados((prev) => [data, ...prev]);
    setSuccess(`Empleado "${data.nombre}" creado. Pulsa "Registrar rostro".`);
  };

  const handleEnrollSaved = async (descriptors) => {
    if (!enrollFor) return;
    setError(null); setSuccess(null);
    const { error } = await supabase
      .from('empleados')
      .update({
        face_descriptors: descriptors,
        enrolled_at: new Date().toISOString(),
      })
      .eq('id', enrollFor.id);
    if (error) { setError(error.message); return; }
    setSuccess(`Rostro registrado para ${enrollFor.nombre}`);
    setEnrollFor(null);
    await refresh();
  };

  const handleDelete = async (empleado) => {
    if (!confirm(`¿Borrar a ${empleado.nombre}? Esto borra también sus registros.`)) return;
    const { error } = await supabase.from('empleados').delete().eq('id', empleado.id);
    if (error) { setError(error.message); return; }
    setEmpleados((prev) => prev.filter((e) => e.id !== empleado.id));
  };

  const handleSetOffice = async () => {
    setError(null); setSuccess(null);
    setSavingOffice(true);
    try {
      const pos = await new Promise((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 });
      });
      const { error } = await supabase
        .from('profiles')
        .update({
          oficina_lat: pos.coords.latitude,
          oficina_lng: pos.coords.longitude,
          oficina_radio: Number(radio) || 150,
        })
        .eq('id', user.id);
      if (error) throw new Error(error.message);
      setSuccess(`Oficina guardada: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} (radio ${radio}m)`);
    } catch (e) {
      setError(e.message || 'No se pudo capturar ubicación');
    } finally {
      setSavingOffice(false);
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h2>Panel admin {isSuperAdmin && <small style={{ opacity: 0.6 }}>(vista global)</small>}</h2>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === 'hoy' ? 'active' : ''}`}
          onClick={() => setTab('hoy')}
        >Hoy</button>
        <button
          className={`tab ${tab === 'empleados' ? 'active' : ''}`}
          onClick={() => setTab('empleados')}
        >Empleados</button>
        <button
          className={`tab ${tab === 'registros' ? 'active' : ''}`}
          onClick={() => setTab('registros')}
        >Registros</button>
        <button
          className={`tab ${tab === 'reportes' ? 'active' : ''}`}
          onClick={() => setTab('reportes')}
        >Reportes</button>
        {isSuperAdmin && (
          <button
            className={`tab ${tab === 'admins' ? 'active' : ''}`}
            onClick={() => setTab('admins')}
          >Admins</button>
        )}
      </div>

      {tab === 'empleados' && (
        <>
          <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem' }}>
              <MapPin size={16} style={{ verticalAlign: 'middle' }} /> Ubicación oficina
            </strong>
            <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '0 0 0.5rem' }}>
              {profile?.oficina_lat
                ? `Lat ${profile.oficina_lat.toFixed(5)}, Lng ${profile.oficina_lng.toFixed(5)} — radio ${profile.oficina_radio}m`
                : 'Sin definir. Párate en la entrada de tu oficina y pulsa "Capturar".'}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="number" min="20" max="2000" value={radio}
                onChange={(e) => setRadio(e.target.value)}
                style={{ width: 100, padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid #d1d5db' }}
                title="Radio en metros"
              />
              <span style={{ fontSize: '0.85rem' }}>metros</span>
              <button className="btn btn-primary" onClick={handleSetOffice} disabled={savingOffice}>
                {savingOffice ? 'Capturando…' : 'Capturar mi ubicación'}
              </button>
            </div>
          </div>

          <form className="add-form glass-panel" onSubmit={handleCreate} style={{ padding: '1rem' }}>
            <input
              type="text" placeholder="Nombre" value={nombre}
              onChange={(e) => setNombre(e.target.value)} required
            />
            <input
              type="text" placeholder="Puesto (opcional)" value={puesto}
              onChange={(e) => setPuesto(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={creating}>
              <UserPlus size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {creating ? 'Creando…' : 'Agregar'}
            </button>
          </form>

          {error && <div className="error-msg">{error}</div>}
          {success && <div className="success-msg">{success}</div>}

          <div className="glass-panel" style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
            {loading ? (
              <div className="empty-state">Cargando…</div>
            ) : empleados.length === 0 ? (
              <div className="empty-state">Aún no hay empleados.</div>
            ) : (
              <table className="empleados-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Puesto</th>
                    <th>Horario</th>
                    <th>Rostro</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {empleados.map((e) => {
                    const enrolled = Array.isArray(e.face_descriptors) && e.face_descriptors.length > 0;
                    const horario = e.hora_entrada && e.hora_salida
                      ? `${e.hora_entrada.slice(0,5)} – ${e.hora_salida.slice(0,5)}`
                      : (e.hora_entrada || e.hora_salida ? (e.hora_entrada?.slice(0,5) || '?') + ' – ' + (e.hora_salida?.slice(0,5) || '?') : '—');
                    return (
                      <tr key={e.id}>
                        <td>{e.nombre}</td>
                        <td>{e.puesto || '—'}</td>
                        <td>{horario}</td>
                        <td>
                          {enrolled
                            ? <span className="status-badge enrolled">Registrado</span>
                            : <span className="status-badge pending">Pendiente</span>}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-ghost" onClick={() => setEnrollFor(e)} title="Rostro">
                            <Camera size={14} />
                          </button>{' '}
                          <button className="btn btn-ghost" onClick={() => setEditingEmpleado(e)} title="Editar">
                            <Edit2 size={14} />
                          </button>{' '}
                          <button className="btn btn-ghost" onClick={() => handleDelete(e)} title="Borrar">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'hoy' && <HoyTab />}
      {tab === 'registros' && <RegistrosTab />}
      {tab === 'reportes' && <ReportesTab />}
      {tab === 'admins' && isSuperAdmin && <AdminsTab />}

      {enrollFor && (
        <FaceEnrollModal
          empleado={enrollFor}
          onClose={() => setEnrollFor(null)}
          onSaved={handleEnrollSaved}
        />
      )}

      {editingEmpleado && (
        <EditEmpleadoModal
          empleado={editingEmpleado}
          onClose={() => setEditingEmpleado(null)}
          onSaved={(updated) => {
            setEditingEmpleado(null);
            setEmpleados((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)));
          }}
        />
      )}
    </div>
  );
};

export default Admin;

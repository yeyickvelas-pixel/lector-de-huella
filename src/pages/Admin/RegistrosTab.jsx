import { useCallback, useEffect, useState } from 'react';
import { Edit2, Trash2, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '../../lib/supabase';
import EditRegistroModal from './EditRegistroModal';

const RegistrosTab = () => {
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('registros')
      .select('id, tipo, fecha_hora, nota, foto_url, lat, lng, empleado:empleado_id ( nombre )')
      .order('fecha_hora', { ascending: false })
      .limit(100);
    if (error) setError(error.message);
    setRegistros(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { (async () => { await refresh(); })(); }, [refresh]);

  const handleDelete = async (r) => {
    if (!confirm(`¿Borrar este registro de ${r.empleado?.nombre || ''}?`)) return;
    const { error } = await supabase.from('registros').delete().eq('id', r.id);
    if (error) { setError(error.message); return; }
    setRegistros((prev) => prev.filter((x) => x.id !== r.id));
  };

  return (
    <div className="glass-panel" style={{ padding: '0.5rem 1rem', marginTop: '1rem' }}>
      {error && <div className="error-msg">{error}</div>}
      {loading ? (
        <div className="empty-state">Cargando…</div>
      ) : registros.length === 0 ? (
        <div className="empty-state">Aún no hay registros.</div>
      ) : (
        <table className="empleados-table">
          <thead>
            <tr>
              <th>Fecha / Hora</th>
              <th>Empleado</th>
              <th>Tipo</th>
              <th>Nota</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id}>
                <td>{format(new Date(r.fecha_hora), "d MMM HH:mm", { locale: es })}</td>
                <td>{r.empleado?.nombre || '—'}</td>
                <td>
                  <span className={`status-badge ${r.tipo === 'entrada' ? 'enrolled' : 'pending'}`}>
                    {r.tipo}
                  </span>
                </td>
                <td style={{ fontSize: '0.82rem', opacity: 0.8 }}>
                  {r.nota || (r.foto_url ? <ImageIcon size={14} /> : '—')}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-ghost" onClick={() => setEditing(r)} title="Editar">
                    <Edit2 size={14} />
                  </button>{' '}
                  <button className="btn btn-ghost" onClick={() => handleDelete(r)} title="Borrar">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <EditRegistroModal
          registro={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setEditing(null);
            setRegistros((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
          }}
        />
      )}
    </div>
  );
};

export default RegistrosTab;

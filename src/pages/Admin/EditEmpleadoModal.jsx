import { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const EditEmpleadoModal = ({ empleado, onClose, onSaved }) => {
  const [nombre, setNombre] = useState(empleado.nombre);
  const [puesto, setPuesto] = useState(empleado.puesto || '');
  const [horaEntrada, setHoraEntrada] = useState(empleado.hora_entrada || '');
  const [horaSalida, setHoraSalida] = useState(empleado.hora_salida || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError(null);
    const { data, error } = await supabase
      .from('empleados')
      .update({
        nombre: nombre.trim(),
        puesto: puesto.trim() || null,
        hora_entrada: horaEntrada || null,
        hora_salida: horaSalida || null,
      })
      .eq('id', empleado.id)
      .select()
      .single();
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved(data);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <h3>Editar empleado</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required
              style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
            Puesto
            <input value={puesto} onChange={(e) => setPuesto(e.target.value)}
              style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6 }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
              Hora entrada
              <input type="time" value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)}
                style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
              Hora salida
              <input type="time" value={horaSalida} onChange={(e) => setHoraSalida(e.target.value)}
                style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6 }} />
            </label>
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditEmpleadoModal;

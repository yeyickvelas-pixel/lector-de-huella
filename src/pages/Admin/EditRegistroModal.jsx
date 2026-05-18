import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { signedPhotoUrl } from '../../lib/photo';

// "2026-05-17T19:13:00.000Z" → "2026-05-17T13:13" (formato datetime-local)
function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EditRegistroModal = ({ registro, onClose, onSaved }) => {
  const [tipo, setTipo] = useState(registro.tipo);
  const [fecha, setFecha] = useState(toLocalInput(registro.fecha_hora));
  const [nota, setNota] = useState(registro.nota || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fotoUrl, setFotoUrl] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!registro.foto_url) return;
      // Si el URL pasado es publicURL, intentamos extraer el path y firmarlo
      const m = registro.foto_url.match(/asistencia-fotos\/(.+)$/);
      const path = m?.[1];
      if (!path) { if (active) setFotoUrl(registro.foto_url); return; }
      const signed = await signedPhotoUrl(path);
      if (active) setFotoUrl(signed || registro.foto_url);
    })();
    return () => { active = false; };
  }, [registro.foto_url]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError(null);
    const { data, error } = await supabase
      .from('registros')
      .update({
        tipo,
        fecha_hora: new Date(fecha).toISOString(),
        nota: nota.trim() || null,
      })
      .eq('id', registro.id)
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
        <h3>Editar registro</h3>

        {fotoUrl && (
          <div style={{ textAlign: 'center' }}>
            <img src={fotoUrl} alt="foto del registro"
              style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8 }} />
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <label style={{ fontSize: '0.85rem' }}>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}
              style={{ display: 'block', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6, width: '100%' }}>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </label>
          <label style={{ fontSize: '0.85rem' }}>
            Fecha y hora
            <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} required
              style={{ display: 'block', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6, width: '100%' }} />
          </label>
          <label style={{ fontSize: '0.85rem' }}>
            Nota
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3}
              style={{ display: 'block', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6, width: '100%' }} />
          </label>
          {error && <div className="error-msg">{error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
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

export default EditRegistroModal;

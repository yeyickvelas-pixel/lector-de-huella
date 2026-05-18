import { useState } from 'react';

const NotaModal = ({ empleado, tipo, motivo, initialNota = '', onSave, onSkip }) => {
  const [nota, setNota] = useState(initialNota);

  return (
    <div className="modal-backdrop">
      <div className="modal-content glass-panel">
        <h3>{empleado.nombre}</h3>
        {motivo && (
          <p style={{ margin: 0, color: '#b45309' }}>
            {motivo}
          </p>
        )}
        <p style={{ fontSize: '0.9rem', opacity: 0.75 }}>
          {motivo
            ? `¿Por qué ${tipo === 'entrada' ? 'entras antes' : 'sales después'}? (opcional)`
            : `Agrega una nota para esta ${tipo} (opcional)`}
        </p>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej: cita médica, junta extra, etc."
          rows={3}
          style={{
            width: '100%',
            padding: '0.6rem',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            resize: 'vertical',
          }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onSkip}>
            {motivo ? 'Saltar' : 'Cancelar'}
          </button>
          <button className="btn btn-primary" onClick={() => onSave(nota.trim() || null)}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotaModal;

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

function fmtHoras(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

// Determina estado del empleado: activo (entró y aún no salió) | salido | sin marcar
function calcEstado(empleado, registrosDelDia, now) {
  const ordenados = [...registrosDelDia].sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
  if (ordenados.length === 0) return { estado: 'sin-marcar', minutosTrabajados: 0, llegadaTarde: false };

  // Pares (entrada, salida)
  let total = 0;
  let abierto = null; // entrada sin salida
  for (const r of ordenados) {
    if (r.tipo === 'entrada') {
      abierto = r;
    } else if (r.tipo === 'salida' && abierto) {
      total += new Date(r.fecha_hora) - new Date(abierto.fecha_hora);
      abierto = null;
    }
  }
  // Si hay entrada abierta, sumamos hasta ahora
  if (abierto) {
    total += now - new Date(abierto.fecha_hora);
  }

  const primeraEntrada = ordenados.find((r) => r.tipo === 'entrada');
  let llegadaTarde = false;
  let minutosTarde = 0;
  if (primeraEntrada && empleado.hora_entrada) {
    const [hh, mm] = empleado.hora_entrada.split(':').map(Number);
    const expected = new Date(primeraEntrada.fecha_hora);
    expected.setHours(hh, mm, 0, 0);
    const diff = (new Date(primeraEntrada.fecha_hora) - expected) / 60000;
    if (diff > 5) { llegadaTarde = true; minutosTarde = Math.round(diff); }
  }

  return {
    estado: abierto ? 'activo' : 'salido',
    minutosTrabajados: total,
    primeraEntrada: primeraEntrada ? new Date(primeraEntrada.fecha_hora) : null,
    llegadaTarde,
    minutosTarde,
  };
}

const HoyTab = () => {
  const [empleados, setEmpleados] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Reloj
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000); // refresh cada 30s
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    const desde = startOfToday().toISOString();
    const [emps, regs] = await Promise.all([
      supabase.from('empleados').select('id, nombre, puesto, hora_entrada, hora_salida'),
      supabase
        .from('registros')
        .select('id, empleado_id, tipo, fecha_hora')
        .gte('fecha_hora', desde),
    ]);
    if (emps.error) setError(emps.error.message);
    if (regs.error) setError(regs.error.message);
    setEmpleados(emps.data || []);
    setRegistros(regs.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { (async () => { await refresh(); })(); }, [refresh]);

  // Refresh data cada minuto también
  useEffect(() => {
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [refresh]);

  const datos = useMemo(() => {
    return empleados.map((e) => {
      const regs = registros.filter((r) => r.empleado_id === e.id);
      return { empleado: e, ...calcEstado(e, regs, now) };
    });
  }, [empleados, registros, now]);

  const summary = useMemo(() => {
    let activos = 0, salidos = 0, sinMarcar = 0, tarde = 0;
    for (const d of datos) {
      if (d.estado === 'activo') activos++;
      else if (d.estado === 'salido') salidos++;
      else sinMarcar++;
      if (d.llegadaTarde) tarde++;
    }
    return { activos, salidos, sinMarcar, tarde };
  }, [datos]);

  const ordenados = useMemo(() => {
    const orden = { 'activo': 0, 'salido': 1, 'sin-marcar': 2 };
    return [...datos].sort((a, b) => orden[a.estado] - orden[b.estado]);
  }, [datos]);

  return (
    <div className="glass-panel" style={{ padding: '1rem', marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>
          Hoy, {format(now, 'd MMM HH:mm')}
        </h3>
        <button className="btn btn-ghost" onClick={refresh}>
          <RefreshCw size={14} /> Refrescar
        </button>
      </div>

      <div className="dash-summary">
        <div><strong style={{ color: '#10b981' }}>{summary.activos}</strong> Activos</div>
        <div><strong>{summary.salidos}</strong> Ya salieron</div>
        <div><strong style={{ color: '#94a3b8' }}>{summary.sinMarcar}</strong> Sin marcar</div>
        <div><strong style={{ color: '#f59e0b' }}>{summary.tarde}</strong> Llegaron tarde</div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {loading ? (
        <div className="empty-state">Cargando…</div>
      ) : ordenados.length === 0 ? (
        <div className="empty-state">No hay empleados creados.</div>
      ) : (
        <div className="dashboard-grid">
          {ordenados.map((d) => (
            <div
              key={d.empleado.id}
              className={`dash-card ${d.estado === 'activo' ? 'active' : ''} ${d.llegadaTarde ? 'late' : ''} ${d.estado === 'salido' ? 'salido' : ''}`}
            >
              <div className="dash-name">
                <span className={`dot ${d.estado === 'activo' ? 'active' : 'idle'}`}></span>
                {d.empleado.nombre}
              </div>
              <div className="dash-meta">
                {d.empleado.puesto || '—'}
                {d.empleado.hora_entrada && ` · entrada esperada ${d.empleado.hora_entrada.slice(0,5)}`}
              </div>
              <div className="dash-stats">
                <div className="stat">
                  <Clock size={11} style={{ verticalAlign: 'middle' }} />{' '}
                  <strong>{fmtHoras(d.minutosTrabajados)}</strong>
                  {d.estado === 'activo' ? 'trabajadas (en curso)' : 'trabajadas hoy'}
                </div>
                {d.primeraEntrada && (
                  <div className="stat">
                    <strong>{format(d.primeraEntrada, 'HH:mm')}</strong>
                    entrada
                  </div>
                )}
              </div>
              {d.llegadaTarde && (
                <div style={{ color: '#b45309', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={12} /> Llegó {d.minutosTarde} min tarde
                </div>
              )}
              {d.estado === 'sin-marcar' && (
                <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>Aún no marca asistencia hoy</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HoyTab;

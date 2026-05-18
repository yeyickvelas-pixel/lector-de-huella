import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText, Calendar } from 'lucide-react';
import { format, startOfWeek, startOfMonth, addDays, addWeeks } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '../../lib/supabase';
import {
  buildDailyRows, summary, rowsToCsv, downloadFile, downloadPdf,
} from '../../lib/reports';

function isoDate(d) { return format(d, 'yyyy-MM-dd'); }

const presets = [
  { label: 'Hoy',          getRange: () => { const d = new Date(); return [d, d]; } },
  { label: 'Esta semana',  getRange: () => { const start = startOfWeek(new Date(), { weekStartsOn: 1 }); return [start, addDays(start, 6)]; } },
  { label: 'Semana pasada',getRange: () => { const start = addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), -1); return [start, addDays(start, 6)]; } },
  { label: 'Este mes',     getRange: () => { const start = startOfMonth(new Date()); const end = addDays(addDays(start, 31), -start.getDate() + 1); return [start, end]; } },
];

const ReportesTab = () => {
  const today = new Date();
  const [desde, setDesde] = useState(isoDate(startOfWeek(today, { weekStartsOn: 1 })));
  const [hasta, setHasta] = useState(isoDate(today));
  const [empleadoFiltro, setEmpleadoFiltro] = useState('all');
  const [empleados, setEmpleados] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const empleadosById = useMemo(
    () => Object.fromEntries(empleados.map((e) => [e.id, e])),
    [empleados]
  );

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    const [emps, regs] = await Promise.all([
      supabase.from('empleados').select('id, nombre, puesto'),
      supabase
        .from('registros')
        .select('id, empleado_id, tipo, fecha_hora, nota')
        .gte('fecha_hora', new Date(desde).toISOString())
        .lt('fecha_hora', new Date(new Date(hasta).getTime() + 86400000).toISOString())
        .order('fecha_hora', { ascending: true }),
    ]);
    if (emps.error) setError(emps.error.message);
    if (regs.error) setError(regs.error.message);
    setEmpleados(emps.data || []);
    setRegistros(regs.data || []);
    setLoading(false);
  }, [desde, hasta]);

  useEffect(() => { (async () => { await refresh(); })(); }, [refresh]);

  const filteredRegistros = useMemo(() => {
    return empleadoFiltro === 'all'
      ? registros
      : registros.filter((r) => r.empleado_id === empleadoFiltro);
  }, [registros, empleadoFiltro]);

  const rows = useMemo(
    () => buildDailyRows(filteredRegistros, empleadosById),
    [filteredRegistros, empleadosById]
  );
  const totals = useMemo(() => summary(rows), [rows]);

  const onPreset = (preset) => {
    const [d, h] = preset.getRange();
    setDesde(isoDate(d));
    setHasta(isoDate(h));
  };

  const handleCsv = () => {
    const csv = rowsToCsv(rows);
    downloadFile(`asistencia_${desde}_a_${hasta}.csv`, csv);
  };

  const handlePdf = async () => {
    await downloadPdf(rows, {
      titulo: 'Reporte de asistencia',
      desde, hasta,
      totalHoras: totals.totalHoras,
      dias: totals.dias,
    });
  };

  return (
    <div className="glass-panel" style={{ padding: '1rem', marginTop: '1rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem' }}>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            style={{ padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: 6 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem' }}>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            style={{ padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: 6 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem' }}>
          Empleado
          <select value={empleadoFiltro} onChange={(e) => setEmpleadoFiltro(e.target.value)}
            style={{ padding: '0.45rem', border: '1px solid #d1d5db', borderRadius: 6 }}>
            <option value="all">Todos</option>
            {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {presets.map((p) => (
            <button key={p.label} className="btn btn-ghost" onClick={() => onPreset(p)} style={{ fontSize: '0.8rem' }}>
              <Calendar size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
          <button className="btn btn-ghost" onClick={handleCsv} disabled={rows.length === 0}>
            <Download size={14} /> CSV
          </button>
          <button className="btn btn-primary" onClick={handlePdf} disabled={rows.length === 0}>
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
        <div><strong>Total horas:</strong> {totals.totalHoras}h</div>
        <div><strong>Días con registro:</strong> {totals.dias}</div>
        <div><strong>Filas:</strong> {rows.length}</div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
        {loading ? (
          <div className="empty-state">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">Sin datos en este rango.</div>
        ) : (
          <table className="empleados-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Empleado</th>
                <th>Puesto</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Horas</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.fecha}-${r.empleadoId}-${i}`}>
                  <td>{format(new Date(r.fecha), "d MMM", { locale: es })}</td>
                  <td>{r.nombre}</td>
                  <td>{r.puesto || '—'}</td>
                  <td>{r.entrada || '—'}</td>
                  <td>{r.salida || '—'}</td>
                  <td>{r.horas || '—'}</td>
                  <td style={{ fontSize: '0.82rem', opacity: 0.8 }}>{r.nota || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ReportesTab;

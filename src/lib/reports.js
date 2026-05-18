import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Empareja entradas y salidas por empleado/día.
 * Devuelve filas: { fecha, empleadoId, nombre, puesto, entrada, salida, horas, nota }
 */
export function buildDailyRows(registros, empleadosById) {
  // Agrupar por (empleado, día)
  const groups = {};
  for (const r of registros) {
    const fecha = format(new Date(r.fecha_hora), 'yyyy-MM-dd');
    const key = `${r.empleado_id}::${fecha}`;
    groups[key] ??= { fecha, empleado_id: r.empleado_id, entrada: null, salida: null, notas: [] };
    if (r.tipo === 'entrada' && (!groups[key].entrada || new Date(r.fecha_hora) < new Date(groups[key].entrada.fecha_hora))) {
      groups[key].entrada = r;
    }
    if (r.tipo === 'salida' && (!groups[key].salida || new Date(r.fecha_hora) > new Date(groups[key].salida.fecha_hora))) {
      groups[key].salida = r;
    }
    if (r.nota) groups[key].notas.push(r.nota);
  }

  return Object.values(groups)
    .map((g) => {
      const e = empleadosById[g.empleado_id] || {};
      const horas = g.entrada && g.salida
        ? (new Date(g.salida.fecha_hora) - new Date(g.entrada.fecha_hora)) / 3600000
        : null;
      return {
        fecha: g.fecha,
        empleadoId: g.empleado_id,
        nombre: e.nombre || '—',
        puesto: e.puesto || '',
        entrada: g.entrada ? format(new Date(g.entrada.fecha_hora), 'HH:mm') : '',
        salida: g.salida ? format(new Date(g.salida.fecha_hora), 'HH:mm') : '',
        horas: horas ? horas.toFixed(2) : '',
        nota: g.notas.join(' / '),
      };
    })
    .sort((a, b) => (a.fecha + a.nombre) < (b.fecha + b.nombre) ? 1 : -1);
}

export function summary(rows) {
  let totalHoras = 0;
  let dias = 0;
  for (const r of rows) {
    if (r.horas) { totalHoras += parseFloat(r.horas); dias += 1; }
  }
  return { totalHoras: totalHoras.toFixed(2), dias };
}

function csvEscape(s) {
  if (s == null) return '';
  const str = String(s);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function rowsToCsv(rows) {
  const header = ['Fecha', 'Empleado', 'Puesto', 'Entrada', 'Salida', 'Horas', 'Nota'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.fecha, r.nombre, r.puesto, r.entrada, r.salida, r.horas, r.nota,
    ].map(csvEscape).join(','));
  }
  return lines.join('\n');
}

export function downloadFile(filename, content, mime = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPdf(rows, { titulo = 'Reporte de asistencia', desde, hasta, totalHoras, dias } = {}) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(titulo, 14, 16);
  doc.setFontSize(9);
  const meta = [
    desde && `Desde ${format(new Date(desde), 'dd MMM yyyy', { locale: es })}`,
    hasta && `hasta ${format(new Date(hasta), 'dd MMM yyyy', { locale: es })}`,
    `Total horas: ${totalHoras}h`,
    `Días: ${dias}`,
  ].filter(Boolean).join('  ·  ');
  doc.text(meta, 14, 22);
  autoTable(doc, {
    head: [['Fecha', 'Empleado', 'Puesto', 'Entrada', 'Salida', 'Horas', 'Nota']],
    body: rows.map((r) => [r.fecha, r.nombre, r.puesto, r.entrada, r.salida, r.horas, r.nota]),
    startY: 28,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [79, 70, 229] },
  });
  doc.save(`reporte_${Date.now()}.pdf`);
}

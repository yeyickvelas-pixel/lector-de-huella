import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, AlertCircle, WifiOff, Lock, MapPin, SwitchCamera,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  loadFaceModels, buildMatcher, matchFromVideo, distanceMeters,
} from '../../lib/face';
import { captureFrame, uploadPhoto } from '../../lib/photo';
import { enqueueRegistro, listPending, syncPending, updatePendingNota } from '../../lib/offlineQueue';
import NotaModal from '../../components/NotaModal';
import '../../components/FaceEnrollModal.css';
import './Kiosk.css';

const getPosition = () =>
  new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000 }
    );
  });

// Devuelve { fueraDeHorario, motivo } según hora_entrada/salida del empleado
function checkHorario(tipo, empleado, when = new Date()) {
  const t = tipo === 'entrada' ? empleado.hora_entrada : empleado.hora_salida;
  if (!t) return { fueraDeHorario: false };
  const [hh, mm] = t.split(':').map(Number);
  const expected = new Date(when);
  expected.setHours(hh, mm, 0, 0);
  const diffMin = (when - expected) / 60000;
  // Entrada anticipada > 5 min antes → pedir nota
  if (tipo === 'entrada' && diffMin < -5) {
    return { fueraDeHorario: true, motivo: `Llegaste ${Math.abs(Math.round(diffMin))} min antes del horario (${t})` };
  }
  // Salida tardía > 5 min después → pedir nota
  if (tipo === 'salida' && diffMin > 5) {
    return { fueraDeHorario: true, motivo: `Saliste ${Math.round(diffMin)} min después del horario (${t})` };
  }
  return { fueraDeHorario: false };
}

const Kiosk = () => {
  const { session, profile, loading: authLoading } = useAuth();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const matcherRef = useRef(null);
  const empleadosByIdRef = useRef({});
  const lastMatchRef = useRef({ id: null, at: 0 });
  const detectLoopRef = useRef(null);
  const profileRef = useRef(profile);
  const pausedRef = useRef(false);

  const [now, setNow] = useState(new Date());
  const [stage, setStage] = useState('init');
  const [message, setMessage] = useState('Iniciando cámara…');
  const [lastResult, setLastResult] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [facing, setFacing] = useState('user'); // 'user' | 'environment'
  const [notaPrompt, setNotaPrompt] = useState(null); // { empleado, tipo, motivo, payload }
  const [addNotaTo, setAddNotaTo] = useState(null); // { empleado, tipo, clientId }

  useEffect(() => { profileRef.current = profile; }, [profile]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const refreshPending = useCallback(async () => {
    const list = await listPending();
    setPendingCount(list.length);
  }, []);

  useEffect(() => { (async () => { await refreshPending(); })(); }, [refreshPending]);

  useEffect(() => {
    if (!isOnline || !session) return;
    syncPending().then(refreshPending);
  }, [isOnline, session, refreshPending]);

  useEffect(() => {
    if (!session) return;
    let canceled = false;

    const resetIdle = () => {
      pausedRef.current = false;
      setStage('scanning');
      setMessage('Mira a la cámara para marcar tu asistencia');
    };

    const saveRegistro = async (empleado, tipo, pos, nota) => {
      const clientId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

      // Capturar foto y subirla
      let foto_url = null;
      try {
        if (videoRef.current) {
          const blob = await captureFrame(videoRef.current);
          const up = await uploadPhoto(session.user.id, clientId, blob);
          foto_url = up?.url ?? null;
        }
      } catch (e) {
        console.warn('photo upload failed', e);
      }

      await enqueueRegistro({
        client_id: clientId,
        empleado_id: empleado.id,
        tipo,
        fecha_hora: new Date().toISOString(),
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
        nota,
        foto_url,
      });
      await syncPending();
      await refreshPending();

      setLastResult({ nombre: empleado.nombre, tipo, time: new Date(), clientId, empleadoId: empleado.id });
      setMessage(`${tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada`);
      setTimeout(resetIdle, 8000);
    };

    const handleMatch = async (empleadoId) => {
      const empleado = empleadosByIdRef.current[empleadoId];
      if (!empleado) return;
      const t = Date.now();
      // Cooldown 2 minutos para evitar duplicados del mismo empleado
      const COOLDOWN_MS = 2 * 60 * 1000;
      if (lastMatchRef.current.id === empleadoId && t - lastMatchRef.current.at < COOLDOWN_MS) {
        const restanteSeg = Math.ceil((COOLDOWN_MS - (t - lastMatchRef.current.at)) / 1000);
        pausedRef.current = true;
        setStage('error');
        setMessage(`${empleado.nombre} ya tiene registro reciente. Espera ${restanteSeg}s.`);
        setTimeout(resetIdle, 3000);
        return;
      }
      lastMatchRef.current = { id: empleadoId, at: t };

      pausedRef.current = true;
      setStage('success');
      setMessage(`Identificado: ${empleado.nombre}`);

      const pos = await getPosition();
      const p = profileRef.current;
      if (p?.oficina_lat && pos) {
        const d = distanceMeters(pos.lat, pos.lng, p.oficina_lat, p.oficina_lng);
        if (d > (p.oficina_radio ?? 150)) {
          setStage('error');
          setMessage(`${empleado.nombre} fuera de oficina (${Math.round(d)}m)`);
          setTimeout(resetIdle, 3500);
          return;
        }
      }

      // Decidir entrada o salida
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { data: ultimos } = await supabase
        .from('registros')
        .select('tipo')
        .eq('empleado_id', empleadoId)
        .gte('fecha_hora', startOfDay.toISOString())
        .order('fecha_hora', { ascending: false })
        .limit(1);
      const tipo = ultimos?.[0]?.tipo === 'entrada' ? 'salida' : 'entrada';

      // ¿Fuera de horario? → pedir nota
      const horario = checkHorario(tipo, empleado);
      if (horario.fueraDeHorario) {
        setNotaPrompt({
          empleado,
          tipo,
          motivo: horario.motivo,
          payload: { pos },
        });
        return; // se completa al cerrar el modal
      }

      await saveRegistro(empleado, tipo, pos, null);
    };

    // Exponer al modal
    window.__kioskCompleteWithNota = async (nota) => {
      if (!notaPrompt) return;
      const { empleado, tipo, payload } = notaPrompt;
      setNotaPrompt(null);
      await saveRegistro(empleado, tipo, payload.pos, nota);
    };

    const startDetectLoop = () => {
      const tick = async () => {
        if (canceled) return;
        if (!pausedRef.current && videoRef.current && matcherRef.current) {
          try {
            const res = await matchFromVideo(videoRef.current, matcherRef.current);
            if (res) await handleMatch(res.empleadoId);
          } catch (e) {
            console.warn('detect error', e);
          }
        }
        detectLoopRef.current = setTimeout(tick, 600);
      };
      tick();
    };

    (async () => {
      try {
        setMessage('Cargando modelos de IA…');
        await loadFaceModels();
        if (canceled) return;

        setMessage('Cargando empleados…');
        const { data: empleados, error } = await supabase
          .from('empleados')
          .select('id, nombre, face_descriptors, hora_entrada, hora_salida')
          .eq('admin_id', session.user.id);
        if (error) throw new Error(error.message);

        empleadosByIdRef.current = Object.fromEntries(
          (empleados || []).map((e) => [e.id, e])
        );
        matcherRef.current = buildMatcher(empleados || []);

        if (!matcherRef.current) {
          setStage('error');
          setMessage('No hay empleados con rostro registrado. Ve a Admin.');
          return;
        }

        setMessage('Iniciando cámara…');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: 640, height: 480 },
        });
        if (canceled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setStage('scanning');
        setMessage('Mira a la cámara para marcar tu asistencia');
        startDetectLoop();
      } catch (e) {
        setStage('error');
        setMessage(e.message || 'No se pudo iniciar el kiosko');
      }
    })();

    return () => {
      canceled = true;
      if (detectLoopRef.current) clearTimeout(detectLoopRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      delete window.__kioskCompleteWithNota;
    };
  }, [session, refreshPending, facing, notaPrompt]);

  const toggleCamera = () => setFacing((f) => (f === 'user' ? 'environment' : 'user'));

  if (authLoading) return <div className="kiosk-container glass-panel">Cargando…</div>;

  if (!session) {
    return (
      <div className="kiosk-container glass-panel">
        <Lock size={32} />
        <h2>Kiosko bloqueado</h2>
        <p className="kiosk-locked">
          Pídale al administrador que inicie sesión en este dispositivo.
        </p>
        <Link to="/login" className="btn btn-primary">Iniciar sesión</Link>
      </div>
    );
  }

  return (
    <div className="kiosk-container glass-panel">
      <div className="kiosk-date">
        {format(now, "EEEE, d 'de' MMMM", { locale: es })}
      </div>
      <div className="kiosk-clock">{format(now, 'HH:mm:ss')}</div>

      {!isOnline && (
        <div className="kiosk-offline-banner">
          <WifiOff size={16} /> Sin conexión — se subirá al reconectar.
        </div>
      )}

      <div className="video-wrap">
        <video ref={videoRef} muted playsInline />
        <button className="cam-switch" onClick={toggleCamera} title="Cambiar cámara">
          <SwitchCamera size={18} />
        </button>
        {stage === 'success' && <div className="overlay-success"><CheckCircle2 size={80} color="#10b981" /></div>}
        {stage === 'error'   && <div className="overlay-error"><AlertCircle size={80} color="#ef4444" /></div>}
      </div>

      <div className={`kiosk-result ${stage === 'success' || stage === 'error' ? stage : ''}`}>
        {message}
      </div>

      {lastResult && (
        <div className="kiosk-last">
          {format(lastResult.time, 'HH:mm:ss')} — {lastResult.nombre} ({lastResult.tipo})
          {' '}
          <button
            className="btn btn-ghost"
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
            onClick={() => setAddNotaTo({
              empleado: { nombre: lastResult.nombre, id: lastResult.empleadoId },
              tipo: lastResult.tipo,
              clientId: lastResult.clientId,
            })}
          >
            + Agregar nota
          </button>
        </div>
      )}

      {profile?.oficina_lat && (
        <div className="kiosk-loc-tag">
          <MapPin size={14} /> Oficina configurada (radio {profile.oficina_radio}m)
        </div>
      )}

      {pendingCount > 0 && (
        <div className="kiosk-pending">
          {pendingCount} pendiente{pendingCount === 1 ? '' : 's'} de subir
        </div>
      )}

      {notaPrompt && (
        <NotaModal
          empleado={notaPrompt.empleado}
          tipo={notaPrompt.tipo}
          motivo={notaPrompt.motivo}
          onSave={(nota) => window.__kioskCompleteWithNota?.(nota)}
          onSkip={() => window.__kioskCompleteWithNota?.(null)}
        />
      )}

      {addNotaTo && (
        <NotaModal
          empleado={addNotaTo.empleado}
          tipo={addNotaTo.tipo}
          onSave={async (nota) => {
            if (!nota) { setAddNotaTo(null); return; }
            // Intenta actualizar en BD por client_id
            const { error } = await supabase
              .from('registros')
              .update({ nota })
              .eq('client_id', addNotaTo.clientId);
            // Si todavía está en cola offline, actualízala ahí
            if (error) await updatePendingNota(addNotaTo.clientId, nota);
            setAddNotaTo(null);
          }}
          onSkip={() => setAddNotaTo(null)}
        />
      )}
    </div>
  );
};

export default Kiosk;

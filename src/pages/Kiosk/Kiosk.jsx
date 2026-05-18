import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, WifiOff, Lock, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  loadFaceModels,
  buildMatcher,
  matchFromVideo,
  distanceMeters,
} from '../../lib/face';
import { enqueueRegistro, listPending, syncPending } from '../../lib/offlineQueue';
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

const Kiosk = () => {
  const { session, profile, loading: authLoading } = useAuth();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const matcherRef = useRef(null);
  const empleadosByIdRef = useRef({});
  const lastMatchRef = useRef({ id: null, at: 0 });
  const detectLoopRef = useRef(null);
  const profileRef = useRef(profile);

  const [now, setNow] = useState(new Date());
  const [stage, setStage] = useState('init');
  const [message, setMessage] = useState('Iniciando cámara…');
  const [lastResult, setLastResult] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

  // Setup completo cuando hay sesión
  useEffect(() => {
    if (!session) return;
    let canceled = false;

    const resetIdle = () => {
      setStage('scanning');
      setMessage('Mira a la cámara para marcar tu asistencia');
    };

    const handleMatch = async (empleadoId) => {
      const empleado = empleadosByIdRef.current[empleadoId];
      if (!empleado) return;
      const t = Date.now();
      if (lastMatchRef.current.id === empleadoId && t - lastMatchRef.current.at < 8000) return;
      lastMatchRef.current = { id: empleadoId, at: t };

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

      await enqueueRegistro({
        empleado_id: empleadoId,
        tipo,
        fecha_hora: new Date().toISOString(),
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
      });
      await syncPending();
      await refreshPending();

      setLastResult({ nombre: empleado.nombre, tipo, time: new Date() });
      setMessage(`${tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada`);
      setTimeout(resetIdle, 3500);
    };

    const startDetectLoop = () => {
      const tick = async () => {
        if (canceled || !videoRef.current || !matcherRef.current) return;
        try {
          const res = await matchFromVideo(videoRef.current, matcherRef.current);
          if (res) await handleMatch(res.empleadoId);
        } catch (e) {
          console.warn('detect error', e);
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
          .select('id, nombre, face_descriptors')
          .eq('admin_id', session.user.id);
        if (error) throw new Error(error.message);

        empleadosByIdRef.current = Object.fromEntries(
          (empleados || []).map((e) => [e.id, e])
        );
        matcherRef.current = buildMatcher(empleados || []);

        if (!matcherRef.current) {
          setStage('error');
          setMessage('No hay empleados con rostro registrado. Ve a Admin para registrarlos.');
          return;
        }

        setMessage('Iniciando cámara…');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
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
    };
  }, [session, refreshPending]);

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
        {stage === 'success' && <div className="overlay-success"><CheckCircle2 size={80} color="#10b981" /></div>}
        {stage === 'error'   && <div className="overlay-error"><AlertCircle size={80} color="#ef4444" /></div>}
      </div>

      <div className={`kiosk-result ${stage === 'success' || stage === 'error' ? stage : ''}`}>
        {message}
      </div>

      {lastResult && (
        <div className="kiosk-last">
          {format(lastResult.time, 'HH:mm:ss')} — {lastResult.nombre} ({lastResult.tipo})
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
    </div>
  );
};

export default Kiosk;

import { useState, useEffect, useCallback } from 'react';
import { Fingerprint, MapPin, Clock, CheckCircle2, AlertCircle, WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { enqueueRegistro, listPending, syncPending } from '../../lib/offlineQueue';
import './CheckIn.css';

const getPosition = () =>
  new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Geolocalización no soportada'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000,
    });
  });

const CheckIn = () => {
  const { empleado } = useAuth();
  const [status, setStatus] = useState('idle');
  const [location, setLocation] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [recordType, setRecordType] = useState('entrada');
  const [lastRecord, setLastRecord] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
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

  useEffect(() => {
    (async () => { await refreshPending(); })();
  }, [refreshPending]);

  useEffect(() => {
    if (!isOnline) return;
    syncPending().then(refreshPending);
  }, [isOnline, refreshPending]);

  const handleFingerprintScan = async () => {
    if (!empleado) {
      setErrorMsg('Tu perfil de empleado aún no está creado.');
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2500);
      return;
    }

    setErrorMsg(null);
    setStatus('scanning');

    try {
      // TODO: WebAuthn real -> navigator.credentials.get(...)
      await new Promise((r) => setTimeout(r, 1200));

      let lat = null, lng = null;
      try {
        const pos = await getPosition();
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        setLocation({ lat, lng });
      } catch (geoErr) {
        console.warn('Sin ubicación:', geoErr.message);
      }

      const registro = {
        empleado_id: empleado.id,
        tipo: recordType,
        fecha_hora: new Date().toISOString(),
        lat,
        lng,
      };

      await enqueueRegistro(registro);
      await syncPending();
      await refreshPending();

      setLastRecord({ ...registro, time: new Date(registro.fecha_hora) });
      setStatus('success');
      setRecordType((p) => (p === 'entrada' ? 'salida' : 'entrada'));
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Error al registrar');
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2500);
    }
  };

  return (
    <div className="check-in-container glass-panel">
      <div className="check-in-header">
        <h2>Registro de {recordType === 'entrada' ? 'Entrada' : 'Salida'}</h2>
        <p className="current-date">
          {format(currentTime, "EEEE, d 'de' MMMM", { locale: es })}
        </p>
      </div>

      <div className="time-display">{format(currentTime, 'HH:mm:ss')}</div>

      {!isOnline && (
        <div className="offline-banner">
          <WifiOff size={16} />
          <span>Sin conexión — los registros se guardarán y subirán solos.</span>
        </div>
      )}

      <div className="fingerprint-section">
        <button
          className={`fingerprint-btn ${status}`}
          onClick={handleFingerprintScan}
          disabled={status !== 'idle'}
        >
          {status === 'idle' && <Fingerprint size={80} />}
          {status === 'scanning' && <Fingerprint size={80} className="pulse-animation" />}
          {status === 'success' && <CheckCircle2 size={80} color="#10b981" />}
          {status === 'error' && <AlertCircle size={80} color="#ef4444" />}
        </button>
        <p className="scan-instruction">
          {status === 'idle' && 'Toca para registrar asistencia'}
          {status === 'scanning' && 'Escaneando biometría…'}
          {status === 'success' && '¡Registro guardado!'}
          {status === 'error' && (errorMsg || 'Error al registrar. Intenta de nuevo.')}
        </p>
      </div>

      <div className="location-info">
        <MapPin size={18} />
        <span>
          {location
            ? `Lat: ${location.lat.toFixed(4)}, Lng: ${location.lng.toFixed(4)}`
            : 'Esperando ubicación...'}
        </span>
      </div>

      {lastRecord && (
        <div className="last-record">
          <Clock size={16} />
          <span>Último registro: {format(lastRecord.time, 'HH:mm:ss')} ({lastRecord.tipo})</span>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="pending-badge">
          {pendingCount} registro{pendingCount === 1 ? '' : 's'} pendiente{pendingCount === 1 ? '' : 's'} de subir
        </div>
      )}
    </div>
  );
};

export default CheckIn;

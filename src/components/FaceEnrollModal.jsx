import { useEffect, useRef, useState } from 'react';
import { X, Camera } from 'lucide-react';
import { captureDescriptors, loadFaceModels } from '../lib/face';

const FaceEnrollModal = ({ empleado, onClose, onSaved }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState('init'); // init | ready | capturing | done | error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        await loadFaceModels();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 480, height: 360 },
        });
        if (canceled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('ready');
      } catch (e) {
        setError(e.message || 'No se pudo acceder a la cámara');
        setStatus('error');
      }
    })();
    return () => {
      canceled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleCapture = async () => {
    setStatus('capturing');
    setError(null);
    try {
      const descriptors = await captureDescriptors(videoRef.current, {
        samples: 5,
        onProgress: (n) => setProgress(n),
      });
      setStatus('done');
      onSaved(descriptors);
    } catch (e) {
      setError(e.message);
      setStatus('ready');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <h3>Registrar rostro: {empleado.nombre}</h3>
        <p style={{ fontSize: '0.9rem', opacity: 0.75 }}>
          Mira a la cámara y mantén el rostro centrado e iluminado. Vamos a tomar 5 muestras.
        </p>

        <div className="video-wrap">
          <video ref={videoRef} muted playsInline />
        </div>

        {status === 'init' && <p>Iniciando cámara…</p>}
        {status === 'capturing' && <p>Capturando {progress}/5…</p>}
        {error && <div className="error-msg">{error}</div>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={status !== 'ready'}
            onClick={handleCapture}
          >
            <Camera size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {status === 'capturing' ? 'Capturando…' : 'Capturar rostro'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FaceEnrollModal;

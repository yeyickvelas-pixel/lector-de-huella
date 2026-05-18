import { supabase } from './supabase';

const BUCKET = 'asistencia-fotos';

/** Captura un frame del <video> y lo devuelve como Blob JPEG. */
export function captureFrame(videoEl, { maxWidth = 480, quality = 0.7 } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      if (!vw || !vh) return reject(new Error('Video sin datos'));
      const scale = Math.min(1, maxWidth / vw);
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo capturar foto'))),
        'image/jpeg',
        quality
      );
    } catch (e) {
      reject(e);
    }
  });
}

/** Sube la foto a Storage. Devuelve { path, url } o null si falla. */
export async function uploadPhoto(adminId, clientId, blob) {
  if (!adminId || !clientId || !blob) return null;
  const path = `${adminId}/${clientId}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) {
    console.warn('upload photo error', error);
    return null;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

/** Genera un URL firmado para que el admin pueda ver la foto. */
export async function signedPhotoUrl(path, expiresSec = 300) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresSec);
  if (error) return null;
  return data.signedUrl;
}

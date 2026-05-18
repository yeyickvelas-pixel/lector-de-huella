import * as faceapi from '@vladmandic/face-api';

const MODELS_URL = '/models';
let modelsReady = null;

export function loadFaceModels() {
  if (modelsReady) return modelsReady;
  modelsReady = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
  ]);
  return modelsReady;
}

const detectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 320,
  scoreThreshold: 0.5,
});

/** Detecta UNA cara + descriptor. Devuelve null si no encuentra. */
export async function detectOne(videoOrImage) {
  await loadFaceModels();
  const result = await faceapi
    .detectSingleFace(videoOrImage, detectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result ?? null;
}

/** Toma N descriptores capturando cada 400ms desde un <video>. */
export async function captureDescriptors(videoEl, { samples = 5, onProgress } = {}) {
  const out = [];
  let attempts = 0;
  while (out.length < samples && attempts < samples * 4) {
    attempts += 1;
    const det = await detectOne(videoEl);
    if (det) {
      out.push(Array.from(det.descriptor));
      onProgress?.(out.length, samples);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (out.length === 0) throw new Error('No se detectó tu rostro. Acércate y enciende luz.');
  return out;
}

/**
 * Construye un matcher con los descriptores de la BD.
 * empleados: [{ id, nombre, face_descriptors: number[][] }]
 */
export function buildMatcher(empleados, threshold = 0.55) {
  const labeled = empleados
    .filter((e) => Array.isArray(e.face_descriptors) && e.face_descriptors.length > 0)
    .map(
      (e) =>
        new faceapi.LabeledFaceDescriptors(
          e.id,
          e.face_descriptors.map((d) => new Float32Array(d))
        )
    );
  if (labeled.length === 0) return null;
  return new faceapi.FaceMatcher(labeled, threshold);
}

/** Devuelve { empleadoId, distance } o null si no hay match. */
export async function matchFromVideo(videoEl, matcher) {
  if (!matcher) return null;
  const det = await detectOne(videoEl);
  if (!det) return null;
  const best = matcher.findBestMatch(det.descriptor);
  if (best.label === 'unknown') return null;
  return { empleadoId: best.label, distance: best.distance };
}

/** Distancia (metros) entre dos coordenadas WGS84 (haversine). */
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

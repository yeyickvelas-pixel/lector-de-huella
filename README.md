# AsistApp — Registro de asistencia

App de check-in (entrada/salida) con huella simulada, geolocalización y
**modo offline**: si no hay internet, los registros se guardan en IndexedDB
del navegador y se sincronizan solos cuando vuelve la conexión.

Stack: React 19 + Vite, Supabase (Postgres + Auth), Vercel.

---

## 1. Configurar Supabase

1. Crear cuenta en https://supabase.com y un **New project** (cualquier región cercana, ej. `East US`).
2. Esperar a que termine de provisionar (1–2 min).
3. En el proyecto, ir a **SQL Editor → New query**, pegar TODO el contenido de
   [`supabase/schema.sql`](supabase/schema.sql) y pulsar **Run**.
4. Ir a **Authentication → Providers → Email** y, para evitar el paso de
   confirmar email mientras pruebas, desactivar **Confirm email**.
5. En **Settings → API** copia estos dos valores (los vas a usar en Vercel y en local):
   - `Project URL`
   - `anon public key`

## 2. Probar en local

```bash
cp .env.example .env.local
# edita .env.local y pega tus dos valores
npm install
npm run dev
```

Abre http://localhost:5173 → **Regístrate** → te lleva a `/check-in`.

Para probar el modo offline: en DevTools → Network → marcar **Offline** →
pulsar la huella → verás el banner "Sin conexión" y el contador
"1 registro pendiente". Vuelve a marcar Online: el contador baja a 0 y el
registro aparece en Supabase (tabla `registros`).

## 3. Subir a GitHub

```bash
git init
git add .
git commit -m "Initial commit"
# crea un repo vacío en github.com llamado lector-de-huella, luego:
git remote add origin https://github.com/TU-USUARIO/lector-de-huella.git
git branch -M main
git push -u origin main
```

## 4. Deploy en Vercel

1. https://vercel.com → **Add New → Project** → importar el repo de GitHub.
2. Framework Preset: **Vite** (se detecta solo). No tocar build settings.
3. **Environment Variables** → añadir las dos:
   - `VITE_SUPABASE_URL` = tu Project URL
   - `VITE_SUPABASE_ANON_KEY` = tu anon public key
4. **Deploy**. En ~1 min tendrás una URL `*.vercel.app`.
5. Importante: en Supabase **Authentication → URL Configuration** añade tu
   URL de Vercel a **Site URL** y **Redirect URLs** (si no, el login puede
   redirigir mal).

Cada `git push` a `main` redeploya automáticamente.

---

## Estructura

```
src/
  lib/
    supabase.js         cliente Supabase
    offlineQueue.js     cola en IndexedDB + sync automático
  contexts/
    AuthContext.jsx     sesión + perfil de empleado
    RequireAuth.jsx     guard de rutas
  pages/
    Auth/Login.jsx
    Auth/Register.jsx
    CheckIn/CheckIn.jsx
  components/
    Navbar.jsx
supabase/
  schema.sql            tablas + RLS
```

## Pendiente (Fase 2)

- WebAuthn real (`navigator.credentials.create/get`) en vez del `setTimeout`.
- Página de historial con últimos N registros del empleado.
- Vista admin (RLS para rol manager).

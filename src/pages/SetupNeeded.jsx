const SetupNeeded = () => (
  <div className="glass-panel" style={{ maxWidth: 560, margin: '2rem auto', padding: '2rem' }}>
    <h2 style={{ marginTop: 0 }}>Falta configurar Supabase</h2>
    <p>Crea un archivo <code>.env.local</code> en la raíz del proyecto con:</p>
    <pre style={{
      background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 8, overflow: 'auto'
    }}>
{`VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key`}
    </pre>
    <p>Luego <strong>detén el servidor (Ctrl+C)</strong> y vuelve a ejecutar <code>npm run dev</code>.</p>
    <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
      Las claves se obtienen en tu proyecto Supabase → <em>Settings → API</em>.
    </p>
  </div>
);

export default SetupNeeded;

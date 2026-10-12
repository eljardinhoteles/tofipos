'use strict';

// Panel de control local del servidor de impresión: http://localhost:18181/
//
// Seguridad: el servidor escucha en 0.0.0.0 para que las tablets impriman por red local,
// pero el panel muestra el token y permite vincular/desvincular, así que SOLO responde a
// conexiones desde esta misma PC (loopback), sin cabeceras CORS, rechaza cualquier Origin
// ajeno (una web externa no puede leerlo) y exige la cabecera X-Panel en las acciones.

const express = require('express');

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function createPanelRouter({ port, getState, pair, retry, unlink, regenerateToken }) {
  const router = express.Router();
  const allowedOrigins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);

  router.use((req, res, next) => {
    const isPanel = req.path === '/' || req.path.startsWith('/panel/');
    if (!isPanel) return next();
    if (!LOOPBACK.has(req.socket.remoteAddress)) {
      return res.status(403).type('text/plain').send('El panel solo está disponible desde la PC del servidor.');
    }
    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ ok: false, error: 'origen no permitido' });
    next();
  });

  router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store').type('html').send(PAGE);
  });

  const api = express.Router();
  api.use(express.json());
  api.use((req, res, next) => {
    if (req.method !== 'GET' && req.get('x-panel') !== '1') return res.status(403).json({ ok: false, error: 'falta X-Panel' });
    res.set('Cache-Control', 'no-store');
    next();
  });

  api.get('/state', (req, res) => res.json({ ok: true, ...getState() }));

  api.post('/pair', async (req, res) => {
    try {
      await pair(String(req.body?.package || ''));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });
  api.post('/retry', (req, res) => { retry(); res.json({ ok: true }); });
  api.post('/unlink', (req, res) => { unlink(); res.json({ ok: true }); });
  api.post('/token', (req, res) => res.json({ ok: true, token: regenerateToken() }));

  router.use('/panel/api', api);
  return router;
}

const PAGE = /* html */ `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Servidor de impresión</title>
<style>
  :root {
    --bg: #f4f5f7; --card: #fff; --fg: #15171a; --muted: #6a7078; --line: #e4e6ea;
    --ok: #16803c; --ok-bg: #e4f6ea; --warn: #9a6200; --warn-bg: #fff2d6;
    --bad: #b42318; --bad-bg: #fde6e4; --accent: #15171a;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #111315; --card: #1b1e21; --fg: #f1f2f4; --muted: #9aa0a8; --line: #2a2e33;
      --ok: #5fd68a; --ok-bg: #12301d; --warn: #f0b84a; --warn-bg: #33270d;
      --bad: #ff8a80; --bad-bg: #3a1714; --accent: #f1f2f4; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; display: flex; flex-direction: column; gap: 16px; }
  h1 { font-size: 20px; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  header span { color: var(--muted); font-size: 13px; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0; }
  .row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .grow { flex: 1; min-width: 0; }
  .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; background: var(--muted); }
  .big { font-size: 17px; font-weight: 700; }
  .muted { color: var(--muted); font-size: 13px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .ok { background: var(--ok-bg); color: var(--ok); } .warn { background: var(--warn-bg); color: var(--warn); } .bad { background: var(--bad-bg); color: var(--bad); }
  .alert { border-radius: 12px; padding: 12px 14px; background: var(--bad-bg); color: var(--bad); font-weight: 600; }
  button { font: inherit; font-weight: 700; border: 1px solid var(--line); background: var(--card); color: var(--fg); border-radius: 12px; padding: 9px 16px; cursor: pointer; }
  button.primary { background: var(--accent); color: var(--bg); border-color: var(--accent); }
  button.danger { color: var(--bad); }
  button:disabled { opacity: .5; cursor: default; }
  code, .mono { font-family: ui-monospace, "Cascadia Mono", Menlo, monospace; }
  .token { font-size: 22px; font-weight: 800; letter-spacing: .08em; }
  input { font: inherit; width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--line); }
  li:first-child { border-top: 0; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Servidor de impresión</h1>
    <span id="meta"></span>
  </header>

  <section>
    <h2>Nube</h2>
    <div class="row">
      <span class="dot" id="dot"></span>
      <div class="grow"><div class="big" id="cloudTitle">Cargando…</div><div class="muted" id="cloudDetail"></div></div>
      <button id="retryBtn" hidden>Reintentar ahora</button>
    </div>
    <div class="alert" id="unlinkedAlert" hidden></div>
    <div id="pairBox" hidden>
      <div class="muted" style="margin-bottom:8px">Pega el paquete que genera la app en Ajustes → Impresión → Vincular con la nube.</div>
      <div class="row">
        <div class="grow"><input id="pairInput" placeholder="POS1.…" autocomplete="off" spellcheck="false"></div>
        <button class="primary" id="pairBtn">Vincular</button>
      </div>
      <div class="muted" id="pairMsg" style="margin-top:8px"></div>
    </div>
    <div><button class="danger" id="unlinkBtn" hidden>Desvincular este equipo</button></div>
  </section>

  <section>
    <h2>Red local (respaldo)</h2>
    <div class="muted">Dispositivos de la misma red pueden imprimir directo a estas direcciones usando el token.</div>
    <div id="ips" class="mono"></div>
    <div class="row">
      <div class="grow"><div class="muted">Token de impresión</div><div class="token mono" id="token">—</div></div>
      <button id="copyToken">Copiar</button>
      <button id="newToken">Generar nuevo</button>
    </div>
  </section>

  <section>
    <h2>Impresoras</h2>
    <ul id="printers"></ul>
  </section>

  <section>
    <h2>Últimos trabajos de la nube</h2>
    <ul id="jobs"></ul>
  </section>
</main>

<script>
const $ = (id) => document.getElementById(id);
const post = (path, body) => fetch('/panel/api/' + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Panel': '1' }, body: JSON.stringify(body || {}),
}).then(r => r.json());

const STATES = {
  local:      { dot: 'var(--muted)', title: 'Modo local', detail: 'Sin vincular con la nube. Las tablets imprimen por la red local.' },
  connecting: { dot: 'var(--warn)', title: 'Conectando con la nube…', detail: '' },
  online:     { dot: 'var(--ok)', title: 'Conectado a la nube', detail: 'Recibiendo trabajos de impresión.' },
  offline:    { dot: 'var(--warn)', title: 'Sin conexión a la nube', detail: 'Reintentando automáticamente.' },
  unlinked:   { dot: 'var(--bad)', title: 'Desvinculado de la nube', detail: 'Hay que volver a vincular este servidor.' },
};
const ago = (t) => { if (!t) return ''; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'hace ' + s + ' s' : 'hace ' + Math.round(s / 60) + ' min'; };
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let lastToken = '';
async function refresh() {
  let s;
  try { s = await fetch('/panel/api/state').then(r => r.json()); } catch { $('cloudTitle').textContent = 'El servidor no responde'; return; }
  const st = STATES[s.status.state] || STATES.local;
  $('dot').style.background = st.dot;
  $('cloudTitle').textContent = st.title;
  let detail = st.detail;
  if (s.status.state === 'offline' && s.status.message) detail += ' (' + s.status.message + ')';
  if (s.status.state === 'online' || s.status.state === 'offline') detail += ' · ' + ago(s.status.since);
  $('cloudDetail').textContent = detail;
  $('retryBtn').hidden = s.status.state !== 'offline';
  const un = s.status.state === 'unlinked';
  $('unlinkedAlert').hidden = !un;
  if (un) $('unlinkedAlert').textContent = s.status.message + (s.status.replacedBy ? ' Equipo actual: ' + s.status.replacedBy + '.' : '');
  $('pairBox').hidden = !(un || s.status.state === 'local');
  $('unlinkBtn').hidden = !s.cloud;
  $('meta').textContent = s.hostname + ' · v' + s.version + ' · ' + s.queue + ' en cola local';
  $('ips').innerHTML = s.ips.length ? s.ips.map(ip => 'http://' + esc(ip) + ':' + location.port).join('<br>') : '<span class="muted">Sin red local detectada</span>';
  lastToken = s.token; $('token').textContent = s.token;
  $('printers').innerHTML = s.printers.length ? s.printers.map(p =>
    '<li><span>' + esc(p.name) + '<span class="muted"> · ' + esc(p.target) + '</span></span><span>' +
    (p.roles || []).map(r => '<span class="badge ok">' + (r === 'kitchen' ? 'Cocina' : 'Caja') + '</span>').join(' ') +
    (p.active ? '' : ' <span class="badge warn">Inactiva</span>') + '</span></li>').join('')
    : '<li class="muted">Sin impresoras. Se configuran desde la app en Ajustes → Impresión.</li>';
  $('jobs').innerHTML = s.jobs.length ? s.jobs.slice(0, 10).map(j =>
    '<li><span>' + esc(j.kind) + (j.error ? '<div class="muted">' + esc(j.error) + '</div>' : '') + '</span><span><span class="badge ' + (j.ok ? 'ok' : 'bad') + '">' +
    (j.ok ? 'Impreso' : 'Falló') + '</span> <span class="muted">' + new Date(j.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) + '</span></span></li>').join('')
    : '<li class="muted">Aún no hay trabajos.</li>';
}

$('retryBtn').onclick = async () => { await post('retry'); refresh(); };
$('pairBtn').onclick = async () => {
  $('pairBtn').disabled = true; $('pairMsg').textContent = 'Vinculando…';
  const r = await post('pair', { package: $('pairInput').value.trim() }).catch(() => ({ ok: false, error: 'sin respuesta' }));
  $('pairBtn').disabled = false;
  $('pairMsg').textContent = r.ok ? 'Vinculado correctamente.' : 'No se pudo vincular: ' + r.error;
  if (r.ok) $('pairInput').value = '';
  refresh();
};
$('unlinkBtn').onclick = async () => { if (confirm('¿Desvincular este equipo de la nube? Dejará de recibir trabajos hasta volver a vincular.')) { await post('unlink'); refresh(); } };
$('copyToken').onclick = () => navigator.clipboard.writeText(lastToken).then(() => { $('copyToken').textContent = 'Copiado'; setTimeout(() => $('copyToken').textContent = 'Copiar', 1500); });
$('newToken').onclick = async () => { if (confirm('Los dispositivos en red local tendrán que usar el token nuevo. ¿Continuar?')) { await post('token'); refresh(); } };

refresh(); setInterval(refresh, 3000);
</script>
</body>
</html>`;

module.exports = { createPanelRouter };

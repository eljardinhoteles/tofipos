#!/usr/bin/env node
'use strict';

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Estado persistente ────────────────────────────────────────────────────────

function statePath() {
  const dir = process.env.POS_PRINT_SERVER_DATA_DIR ||
    (process.platform === 'win32'
      ? path.join(process.env.APPDATA || os.homedir(), 'pos-print-server')
      : path.join(os.homedir(), '.pos-print-server'));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'print-server-state.json');
}

const STATE_PATH = statePath();

function loadState() {
  try {
    if (fs.existsSync(STATE_PATH)) return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {}
  return { printers: [], queue: [] };
}

function saveState() {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

const state = loadState();

// Migración desde el formato viejo (una sola impresora en `printer`) al nuevo
// (lista `printers`, cada una con roles). Se ejecuta una sola vez.
if (!Array.isArray(state.printers)) {
  state.printers = state.printer
    ? [{ id: randomUUID(), name: state.printer.name, target: state.printer.target, roles: ['kitchen', 'receipt'], active: state.printer.active ?? true }]
    : [];
  delete state.printer;
  saveState();
}

// ── Autenticación ────────────────────────────────────────────────────────────
// Token compartido: cada tablet/celular debe enviarlo en el header
// X-Print-Token para poder consultar o cambiar configuración e imprimir.
// Se genera una sola vez y se persiste junto al resto del estado, así que
// sobrevive a reinicios del servidor.

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I

function generateToken() {
  const part = (n) => Array.from({ length: n }, () => TOKEN_CHARS[Math.floor(Math.random() * TOKEN_CHARS.length)]).join('');
  return `${part(4)}-${part(4)}`;
}

if (!state.auth_token) {
  state.auth_token = generateToken();
  saveState();
}

console.log('=========================================');
console.log(` Token de impresión (configúralo en cada dispositivo): ${state.auth_token}`);
console.log('=========================================');

function requireToken(req, res, next) {
  const provided = req.get('x-print-token') || '';
  if (provided === state.auth_token) return next();
  res.status(401).json({ ok: false, error: 'token de impresión inválido o faltante' });
}

// ── Impresión ─────────────────────────────────────────────────────────────────
// Roles disponibles: 'kitchen' (comandas de cocina) y 'receipt' (precuentas/
// recibos de caja). Un job con kind 'test' se manda solo a la impresora que
// se está probando (no se reparte). Cada impresora puede tener uno o ambos
// roles activos, y varias impresoras pueden compartir el mismo rol (se
// imprime en todas).

function printRawToPrinterName(printerName, content) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `pos-print-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
    // ESC/POS: reset size, feed 5 lines then full cut (GS V 65 5)
    const resetAndCut = Buffer.from([
      0x1b, 0x21, 0x00,  // SIZE_NORMAL
      0x1b, 0x45, 0x00,  // BOLD_OFF
      0x1b, 0x61, 0x00,  // ALIGN_LEFT
      0x1d, 0x56, 0x41, 0x05, // GS V 65 5 — feed 5 lines + full cut
    ]);
    const contentBuf = Buffer.from(content, 'utf8');
    fs.writeFileSync(tmpFile, Buffer.concat([contentBuf, resetAndCut]));
    console.log(`[deliver] printer name: ${printerName}, tmp: ${tmpFile}`);

    // Send raw bytes directly via WinAPI WritePrinter — bypasses GDI/fonts/margins
    const psScript = `
$printerName = '${printerName.replace(/'/g, "''")}';
$bytes = [System.IO.File]::ReadAllBytes('${tmpFile.replace(/\\/g, '\\\\')}');
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrint {
  [DllImport("winspool.drv",CharSet=CharSet.Auto,SetLastError=true)]
  public static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv",CharSet=CharSet.Auto,SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr h,int lvl,ref DOCINFO d);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)]
  public static extern bool WritePrinter(IntPtr h,byte[] b,int n,out int w);
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Auto)]
  public struct DOCINFO { public string pDocName; public string pOutputFile; public string pDatatype; }
}
'@
$h = [IntPtr]::Zero;
[RawPrint]::OpenPrinter($printerName,[ref]$h,[IntPtr]::Zero) | Out-Null;
$di = New-Object RawPrint+DOCINFO;
$di.pDocName = 'POS';
$di.pDatatype = 'RAW';
[RawPrint]::StartDocPrinter($h,1,[ref]$di) | Out-Null;
[RawPrint]::StartPagePrinter($h) | Out-Null;
$w = 0;
[RawPrint]::WritePrinter($h,$bytes,$bytes.Length,[ref]$w) | Out-Null;
[RawPrint]::EndPagePrinter($h) | Out-Null;
[RawPrint]::EndDocPrinter($h) | Out-Null;
[RawPrint]::ClosePrinter($h) | Out-Null;
Write-Host "printed $w bytes";
`;

    const child = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-Command', psScript,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    const outChunks = [];
    const errChunks = [];
    child.stdout.on('data', d => { outChunks.push(d); console.log('[ps stdout]', d.toString()); });
    child.stderr.on('data', d => { errChunks.push(d); console.log('[ps stderr]', d.toString()); });

    child.on('close', code => {
      console.log(`cmd exit code: ${code}`);
      try { fs.unlinkSync(tmpFile); } catch {}
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(errChunks).toString() || `exit code ${code}`));
    });

    child.on('error', reject);
  });
}

// Impresoras activas a las que debe llegar un job, según su rol.
// 'test' es especial: se resuelve por printer_id en el propio job, no por rol.
function printersForJob(job) {
  if (job.kind === 'test') {
    return state.printers.filter(p => p.active && p.id === job.printer_id);
  }
  return state.printers.filter(p => p.active && (p.roles || []).includes(job.kind));
}

async function processQueue() {
  while (true) {
    const job = state.queue.find(j => j.status !== 'done');
    if (!job) break;

    job.status = 'printing';
    job.attempts += 1;
    job.updated_at = new Date().toISOString();
    saveState();

    const targets = printersForJob(job);
    if (targets.length === 0) {
      job.status = 'failed';
      job.last_error = `sin impresora activa para el rol "${job.kind}"`;
      job.updated_at = new Date().toISOString();
      saveState();
      throw new Error(job.last_error);
    }

    const content = job.raw_text?.trim() ? job.raw_text : JSON.stringify(job.payload, null, 2);
    const errors = [];
    for (const printer of targets) {
      try {
        await printRawToPrinterName(printer.target, content);
      } catch (err) {
        errors.push(`${printer.name}: ${err.message}`);
      }
    }

    if (errors.length === 0) {
      job.status = 'done';
      job.last_error = null;
      job.updated_at = new Date().toISOString();
      state.queue = state.queue.filter(j => j.status !== 'done');
      saveState();
    } else {
      job.status = 'failed';
      job.last_error = errors.join(' | ');
      job.updated_at = new Date().toISOString();
      saveState();
      throw new Error(job.last_error);
    }
  }
}

// ── Servidor ──────────────────────────────────────────────────────────────────

const app = express();
// CORS abierto en origin: las tablets acceden por IP:puerto directo, sin un
// origen fijo conocido de antemano. La seguridad real la da el token
// (requireToken), no CORS.
app.use(cors({ methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'X-Print-Token'] }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    queue: state.queue.length,
    printerConfigured: state.printers.some(p => p.active),
    active: state.printers.some(p => p.active),
  });
});

// Impresoras que Windows ya conoce (para elegir sin escribir nombres a mano).
app.get('/system-printers', requireToken, (req, res) => {
  const child = spawn('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    '(Get-Printer | Select-Object -ExpandProperty Name) -join "|"',
  ], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });

  const outChunks = [];
  const errChunks = [];
  child.stdout.on('data', d => outChunks.push(d));
  child.stderr.on('data', d => errChunks.push(d));
  child.on('close', code => {
    if (code !== 0) {
      return res.status(500).json({ ok: false, error: Buffer.concat(errChunks).toString() || `exit code ${code}` });
    }
    const raw = Buffer.concat(outChunks).toString().trim();
    const printers = raw ? raw.split('|').map(s => s.trim()).filter(Boolean) : [];
    res.json({ ok: true, printers });
  });
  child.on('error', err => res.status(500).json({ ok: false, error: err.message }));
});

// Impresoras configuradas por el usuario (subset del catálogo de Windows,
// cada una con los roles a los que responde: 'kitchen', 'receipt').
app.get('/printers', requireToken, (req, res) => {
  res.json({ ok: true, printers: state.printers });
});

app.post('/printers', requireToken, (req, res) => {
  const { name, target, roles, active } = req.body;
  if (!name || !target) {
    return res.status(400).json({ ok: false, error: 'name y target son requeridos' });
  }
  const printer = {
    id: randomUUID(),
    name,
    target,
    roles: Array.isArray(roles) ? roles : [],
    active: active ?? true,
  };
  state.printers.push(printer);
  saveState();
  res.json({ ok: true, printer });
});

app.put('/printers/:id', requireToken, (req, res) => {
  const printer = state.printers.find(p => p.id === req.params.id);
  if (!printer) return res.status(404).json({ ok: false, error: 'printer not found' });

  const { name, target, roles, active } = req.body;
  if (name !== undefined) printer.name = name;
  if (target !== undefined) printer.target = target;
  if (roles !== undefined) printer.roles = Array.isArray(roles) ? roles : [];
  if (active !== undefined) printer.active = active;
  saveState();
  res.json({ ok: true, printer });
});

app.delete('/printers/:id', requireToken, (req, res) => {
  const before = state.printers.length;
  state.printers = state.printers.filter(p => p.id !== req.params.id);
  if (state.printers.length === before) return res.status(404).json({ ok: false, error: 'printer not found' });
  saveState();
  res.json({ ok: true });
});

app.post('/jobs', requireToken, async (req, res) => {
  const { kind, title, payload, raw_text, printer_id } = req.body;
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(), kind, title,
    payload: payload ?? {},
    raw_text: raw_text ?? '',
    // Solo se usa cuando kind === 'test': dirige el job a una impresora
    // puntual en vez de repartirlo por rol.
    printer_id: printer_id ?? null,
    status: 'queued',
    attempts: 0,
    created_at: now,
    updated_at: now,
    last_error: null,
  };
  state.queue.push(job);
  saveState();

  try {
    await processQueue();
    res.json({ ok: true, job });
  } catch (err) {
    res.status(202).json({ ok: true, queued: true, warning: err.message });
  }
});

app.post('/jobs/:id/reprint', requireToken, async (req, res) => {
  const existing = state.queue.find(j => j.id === req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'job not found' });

  const now = new Date().toISOString();
  const job = { ...existing, status: 'queued', updated_at: now };
  state.queue.push(job);
  saveState();

  try {
    await processQueue();
    res.json({ ok: true, job });
  } catch (err) {
    res.status(202).json({ ok: true, queued: true, warning: err.message });
  }
});

app.post('/jobs/flush', requireToken, async (req, res) => {
  try {
    await processQueue();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

const PORT = 18181;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`print server listening on 0.0.0.0:${PORT}`);
});

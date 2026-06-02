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
  return { printer: null, queue: [] };
}

function saveState() {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

const state = loadState();

// ── Impresión ─────────────────────────────────────────────────────────────────

function deliverJob(job) {
  return new Promise((resolve, reject) => {
    const printer = state.printer;
    console.log(`[deliver] printer:`, printer?.target ?? 'none');
    if (!printer || !printer.active) return reject(new Error('printer not configured'));

    const content = job.raw_text?.trim() ? job.raw_text : JSON.stringify(job.payload, null, 2);
    const target = printer.target;
    console.log(`[deliver] cmd: ${target.slice(0, 80)}`);

    if (!target.startsWith('cmd:')) return reject(new Error('unsupported target; use cmd:'));

    const cmd = target.slice(4).trim();
    console.log(`[deliver] final cmd: ${cmd.slice(0, 120)}`);

    // Extract printer name and write content to temp file to avoid escaping issues
    const printerName = cmd.match(/-Name '([^']+)'/)?.[1] ?? cmd.match(/-Name "([^"]+)"/)?.[1] ?? cmd.trim();
    if (!printerName) return reject(new Error('no se pudo extraer nombre de impresora del target'));

    const tmpFile = path.join(os.tmpdir(), `pos-print-${Date.now()}.bin`);
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

async function processQueue() {
  while (true) {
    const job = state.queue.find(j => j.status !== 'done');
    if (!job) break;

    job.status = 'printing';
    job.attempts += 1;
    job.updated_at = new Date().toISOString();
    saveState();

    try {
      await deliverJob(job);
      job.status = 'done';
      job.last_error = null;
      job.updated_at = new Date().toISOString();
      state.queue = state.queue.filter(j => j.status !== 'done');
      saveState();
    } catch (err) {
      job.status = 'failed';
      job.last_error = err.message;
      job.updated_at = new Date().toISOString();
      saveState();
      throw err;
    }
  }
}

// ── Servidor ──────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    queue: state.queue.length,
    printerConfigured: !!state.printer,
    active: state.printer?.active ?? false,
  });
});

app.get('/config', (req, res) => {
  res.json({ printer: state.printer });
});

app.post('/config', (req, res) => {
  const { name, target, paper_width, active } = req.body;
  state.printer = { name, target, paper_width: paper_width ?? 48, active: active ?? true };
  saveState();
  res.json({ ok: true, printer: state.printer });
});

app.post('/jobs', async (req, res) => {
  const { kind, title, payload, raw_text } = req.body;
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(), kind, title,
    payload: payload ?? {},
    raw_text: raw_text ?? '',
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

app.post('/jobs/:id/reprint', async (req, res) => {
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

app.post('/jobs/flush', async (req, res) => {
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

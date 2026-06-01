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
    if (!printer || !printer.active) return reject(new Error('printer not configured'));

    const content = job.raw_text?.trim() ? job.raw_text : JSON.stringify(job.payload, null, 2);
    const target = printer.target;

    if (!target.startsWith('cmd:')) return reject(new Error('unsupported target; use cmd:'));

    const cmd = target.slice(4).trim();
    const child = spawn('cmd', ['/c', cmd], {
      stdio: ['pipe', 'ignore', 'pipe'],
      shell: false,
    });

    child.stdin.write(content, 'utf8');
    child.stdin.end();

    const errChunks = [];
    child.stderr.on('data', d => errChunks.push(d));

    child.on('close', code => {
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

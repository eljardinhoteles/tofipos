/**
 * Genera una imagen PNG con diseño de "comprobante de app" (no texto de
 * impresora térmica) para compartir el detalle de una reserva con el
 * cliente por WhatsApp/email. A diferencia del ticket de impresión — que es
 * texto monoespaciado plano pensado para 80mm — esto dibuja tarjetas,
 * jerarquía tipográfica y color sobre un <canvas>, a partir de datos
 * estructurados (no parseando el texto del ticket de impresora).
 */

export interface TicketImageItem {
  cantidad: number;
  nombre: string;
  precio: number;
  modificadores?: string[];
  nota?: string;
}

export interface TicketImagePago {
  tipo: 'pago' | 'reembolso';
  monto: number;
  metodo?: string;
  fecha?: string;
}

export interface TicketImageData {
  orgName: string;
  orgTelefono?: string;
  orgDireccion?: string;
  estado: string;
  cliente: string;
  fecha: string;
  hora: string;
  personas: number;
  zona?: string;
  telefono?: string;
  nota?: string;
  items: TicketImageItem[];
  ivaPercent: number;
  totalAbonado: number;
  pagos: TicketImagePago[];
}

const WIDTH = 640;
const PAD = 36;
const COLOR = {
  bg: '#ffffff',
  headerBg: '#0f172a',
  headerText: '#ffffff',
  headerSub: '#94a3b8',
  text: '#111827',
  muted: '#6b7280',
  line: '#e5e7eb',
  cardBg: '#f8fafc',
  primary: '#16a34a',
  amber: '#b45309',
  amberBg: '#fffbeb',
  amberBorder: '#fde68a',
};

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'PENDIENTE',
  confirmada: 'CONFIRMADA',
  completada: 'COMPLETADA',
  cancelada: 'CANCELADA',
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function renderTicketReservaToPngBlob(data: TicketImageData): Promise<Blob> {
  const scale = 2;
  const contentWidth = WIDTH - PAD * 2;

  // --- Paso 1: medir en un canvas temporal para saber la altura total ---
  const measure = document.createElement('canvas');
  const mctx = measure.getContext('2d')!;

  const subtotal = data.items.reduce((acc, it) => acc + it.precio * it.cantidad, 0);
  const iva = subtotal * (data.ivaPercent / 100);
  const total = subtotal + iva;
  const saldo = Math.max(0, total - data.totalAbonado);

  let y = 0;
  y += 168; // header (marca + estado)
  y += 24; // gap

  // tarjeta de datos de la reserva
  const measuredInfoLines = 3 + (data.zona ? 1 : 0) + (data.telefono ? 1 : 0);
  const measuredInfoCardH = 28 + measuredInfoLines * 26 + 16;
  y += measuredInfoCardH + 20;

  if (data.nota) {
    mctx.font = '15px -apple-system, "Segoe UI", sans-serif';
    const notaLines = wrapText(mctx, data.nota, contentWidth - 32);
    y += 20 + notaLines.length * 20 + 16 + 20;
  }

  // productos
  if (data.items.length > 0) {
    y += 30; // "PRODUCTOS" title
    mctx.font = '14px -apple-system, "Segoe UI", sans-serif';
    data.items.forEach((it) => {
      y += 26;
      if (it.modificadores?.length) y += it.modificadores.length * 18;
      if (it.nota) y += 18;
    });
    y += 12;
  }

  // totales
  y += 3 * 26 + 10; // subtotal, iva, total
  if (data.totalAbonado > 0) {
    y += 2 * 26 + 10; // abonado + saldo
  }
  if (data.pagos.length > 0) {
    y += 26; // "Historial de abonos" title
    y += data.pagos.length * 24;
  }

  y += 60; // footer

  const height = Math.ceil(y + PAD);

  // --- Paso 2: dibujar de verdad ---
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, WIDTH, height);

  let cy = 0;

  // ── Header oscuro con marca + estado ──────────────────────────────
  const headerH = 168;
  ctx.fillStyle = COLOR.headerBg;
  ctx.fillRect(0, 0, WIDTH, headerH);

  ctx.fillStyle = COLOR.headerText;
  ctx.font = '700 24px -apple-system, "Segoe UI", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(data.orgName.toUpperCase(), PAD, 48);

  ctx.fillStyle = COLOR.headerSub;
  ctx.font = '13px -apple-system, "Segoe UI", sans-serif';
  const contactBits = [data.orgDireccion, data.orgTelefono].filter(Boolean).join('  ·  ');
  if (contactBits) ctx.fillText(contactBits, PAD, 68);

  ctx.fillStyle = COLOR.headerSub;
  ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
  ctx.fillText('COMPROBANTE DE RESERVA', PAD, 98);

  ctx.fillStyle = COLOR.headerText;
  ctx.font = '700 26px -apple-system, "Segoe UI", sans-serif';
  ctx.fillText(data.cliente, PAD, 130);

  // Badge de estado, esquina superior derecha
  const estadoLabel = ESTADO_LABEL[data.estado] || data.estado.toUpperCase();
  ctx.font = '700 12px -apple-system, "Segoe UI", sans-serif';
  const badgeW = ctx.measureText(estadoLabel).width + 28;
  const badgeColor = data.estado === 'cancelada' ? '#ef4444' : data.estado === 'completada' ? '#64748b' : COLOR.primary;
  roundRect(ctx, WIDTH - PAD - badgeW, 40, badgeW, 26, 13);
  ctx.fillStyle = badgeColor;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(estadoLabel, WIDTH - PAD - badgeW / 2, 57);
  ctx.textAlign = 'left';

  cy = headerH + 24;

  // ── Tarjeta de datos de la reserva ────────────────────────────────
  const infoLines = 3 + (data.zona ? 1 : 0) + (data.telefono ? 1 : 0);
  const infoCardH = 28 + infoLines * 26 + 16;
  roundRect(ctx, PAD, cy, contentWidth, infoCardH, 12);
  ctx.fillStyle = COLOR.cardBg;
  ctx.fill();

  let iy = cy + 30;
  const infoRow = (label: string, value: string) => {
    ctx.font = '13px -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = COLOR.muted;
    ctx.fillText(label, PAD + 20, iy);
    ctx.font = '700 14px -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = COLOR.text;
    ctx.textAlign = 'right';
    ctx.fillText(value, WIDTH - PAD - 20, iy);
    ctx.textAlign = 'left';
    iy += 26;
  };
  infoRow('Fecha', data.fecha);
  infoRow('Hora', data.hora);
  infoRow('Comensales', `${data.personas} personas`);
  if (data.zona) infoRow('Zona preferida', data.zona);
  if (data.telefono) infoRow('Teléfono', data.telefono);

  cy += infoCardH + 20;

  // ── Nota ───────────────────────────────────────────────────────────
  if (data.nota) {
    ctx.font = '15px -apple-system, "Segoe UI", sans-serif';
    const notaLines = wrapText(ctx, data.nota, contentWidth - 32);
    const notaH = 20 + notaLines.length * 20 + 16;
    roundRect(ctx, PAD, cy, contentWidth, notaH, 12);
    ctx.fillStyle = COLOR.amberBg;
    ctx.fill();
    ctx.strokeStyle = COLOR.amberBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLOR.amber;
    ctx.font = 'italic 14px -apple-system, "Segoe UI", sans-serif';
    let ny = cy + 26;
    notaLines.forEach((line, idx) => {
      ctx.fillText(idx === 0 ? `“${line}` : line, PAD + 16, ny);
      ny += 20;
    });
    // cierre de comillas en la última línea
    cy += notaH + 20;
  }

  // ── Productos ────────────────────────────────────────────────────
  if (data.items.length > 0) {
    ctx.font = '700 12px -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = COLOR.muted;
    ctx.fillText('PRODUCTOS', PAD, cy + 14);
    cy += 24;
    ctx.strokeStyle = COLOR.line;
    ctx.beginPath();
    ctx.moveTo(PAD, cy);
    ctx.lineTo(WIDTH - PAD, cy);
    ctx.stroke();
    cy += 22;

    data.items.forEach((it) => {
      const itemTotal = it.precio * it.cantidad;
      ctx.font = '600 14px -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = COLOR.text;
      ctx.fillText(`${it.cantidad}×  ${it.nombre}`, PAD, cy);
      ctx.textAlign = 'right';
      ctx.fillText(`$${itemTotal.toFixed(2)}`, WIDTH - PAD, cy);
      ctx.textAlign = 'left';
      cy += 22;

      if (it.modificadores?.length) {
        it.modificadores.forEach((mod) => {
          ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
          ctx.fillStyle = COLOR.muted;
          ctx.fillText(`· ${mod}`, PAD + 18, cy);
          cy += 18;
        });
      }
      if (it.nota) {
        ctx.font = 'italic 12px -apple-system, "Segoe UI", sans-serif';
        ctx.fillStyle = COLOR.amber;
        ctx.fillText(`Nota: ${it.nota}`, PAD + 18, cy);
        cy += 18;
      }
      cy += 4;
    });
    cy += 8;
  }

  // ── Totales ──────────────────────────────────────────────────────
  ctx.strokeStyle = COLOR.line;
  ctx.beginPath();
  ctx.moveTo(PAD, cy);
  ctx.lineTo(WIDTH - PAD, cy);
  ctx.stroke();
  cy += 26;

  const totalRow = (label: string, value: string, opts?: { bold?: boolean; color?: string; big?: boolean }) => {
    ctx.font = `${opts?.bold ? '700' : '400'} ${opts?.big ? 18 : 14}px -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = opts?.color || COLOR.text;
    ctx.fillText(label, PAD, cy);
    ctx.textAlign = 'right';
    ctx.fillText(value, WIDTH - PAD, cy);
    ctx.textAlign = 'left';
    cy += 26;
  };

  totalRow('Subtotal', `$${subtotal.toFixed(2)}`, { color: COLOR.muted });
  totalRow(`IVA (${data.ivaPercent}%)`, `$${iva.toFixed(2)}`, { color: COLOR.muted });
  totalRow('TOTAL', `$${total.toFixed(2)}`, { bold: true, big: true });

  if (data.totalAbonado > 0) {
    cy += 4;
    totalRow('Abonado', `$${data.totalAbonado.toFixed(2)}`, { color: COLOR.primary, bold: true });
    totalRow('Saldo pendiente', `$${saldo.toFixed(2)}`, { bold: true, color: saldo > 0 ? COLOR.amber : COLOR.text });
  }

  // ── Historial de abonos ─────────────────────────────────────────
  if (data.pagos.length > 0) {
    cy += 6;
    ctx.font = '700 12px -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = COLOR.muted;
    ctx.fillText('HISTORIAL DE ABONOS', PAD, cy);
    cy += 20;
    data.pagos.forEach((pg) => {
      ctx.font = '13px -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = COLOR.text;
      const label = `${pg.tipo === 'reembolso' ? 'Reembolso' : 'Abono'}${pg.metodo ? ' · ' + pg.metodo : ''}`;
      ctx.fillText(label, PAD, cy);
      ctx.textAlign = 'right';
      ctx.fillStyle = pg.tipo === 'reembolso' ? '#ef4444' : COLOR.primary;
      ctx.fillText(`${pg.tipo === 'reembolso' ? '-' : '+'}$${pg.monto.toFixed(2)}`, WIDTH - PAD, cy);
      ctx.textAlign = 'left';
      cy += 24;
    });
  }

  // ── Footer ───────────────────────────────────────────────────────
  cy += 20;
  ctx.strokeStyle = COLOR.line;
  ctx.beginPath();
  ctx.moveTo(PAD, cy);
  ctx.lineTo(WIDTH - PAD, cy);
  ctx.stroke();
  cy += 24;
  ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = COLOR.muted;
  ctx.textAlign = 'center';
  ctx.fillText('Documento informativo sin validez tributaria', WIDTH / 2, cy);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo generar la imagen del ticket'));
    }, 'image/png');
  });
}

export function downloadTicketReservaAsImage(data: TicketImageData, filename: string): void {
  renderTicketReservaToPngBlob(data)
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    })
    .catch((err) => {
      console.error(err);
      throw err;
    });
}

// @ts-nocheck
import type { Comanda, ComandaItem, Pago } from '../db/database';
import { getOrgCache } from '../lib/orgCache';

/**
 * Servicio de Formateo y Generación de Documentos de Impresión Térmica
 * Diseñado específicamente para impresoras estándar de 80mm (48 columnas)
 */

export interface PrinterConfig {
  columns: number; // Por defecto 48 (80mm)
}

const DEFAULT_CONFIG: PrinterConfig = {
  columns: 48,
};

export function cleanHabitacionName(name: string): string {
  return name.replace(/^(HAB(ITACI[OÓ]N)?\.?\s*:?\s*)/i, '').trim();
}

/**
 * Separa "Hab. 1 (Cabaña Jacuzzi)" en tipo ("CABAÑA JACUZZI") y número ("1"),
 * para el bloque de cabecera "TIPO  NUM" de comandas/tickets con habitación.
 */
function splitHabitacionTipoNum(habitacionNombre: string): string {
  const tipo = habitacionNombre.match(/\(([^)]+)\)/)?.[1]?.trim().toUpperCase();
  const num = habitacionNombre.match(/Hab\.?\s*(\d+)/i)?.[1] ?? habitacionNombre.replace(/\D/g, '');
  return tipo ? `${tipo}  ${num}` : cleanHabitacionName(habitacionNombre).toUpperCase();
}

/** Línea de checkboxes en blanco para marcar a mano la forma de pago usada. */
function formaPagoLine(width: number = DEFAULT_CONFIG.columns): string {
  return `Tarjeta:[  ]  Transferencia:[  ]  Efectivo:[  ]`.substring(0, width);
}

/**
 * Bloque de datos de facturación a llenar a mano: cada campo en su propia
 * línea, con una línea de guiones completa debajo para escribir el dato.
 */
function datosFacturacionBlock(width: number = DEFAULT_CONFIG.columns): string {
  const campos = ['Razon Social:', 'RUC/CI/PS:', 'Correo:', 'Telefono:', 'Direccion:'];
  let s = `*Datos de facturacion (obligatorio):\n`;
  campos.forEach(campo => {
    s += `${campo}\n${'-'.repeat(width)}\n`;
  });
  return s;
}

// ESC/POS command helpers
const ESC = '\x1B';
const GS = '\x1D';
export const POS = {
  INIT: ESC + '@',
  BOLD_ON: ESC + 'E\x01',
  BOLD_OFF: ESC + 'E\x00',
  // Double width + double height
  SIZE_2X: ESC + '!\x30',
  // Double height only
  SIZE_TALL: ESC + '!\x10',
  SIZE_NORMAL: ESC + '!\x00',
  ALIGN_CENTER: ESC + 'a\x01',
  ALIGN_LEFT: ESC + 'a\x00',
  CUT_FULL: GS + 'V\x41\x05',  // feed 5 + full cut
  CUT_PARTIAL: GS + 'V\x42\x04',  // feed 4 + partial cut
};

/**
 * Centra un texto dentro del ancho de columnas especificado
 */
export function alignCenter(text: string, width: number = DEFAULT_CONFIG.columns): string {
  if (text.length >= width) return text.substring(0, width);
  const leftPadding = Math.floor((width - text.length) / 2);
  return ' '.repeat(leftPadding) + text;
}

/**
 * Alinea un texto a la derecha
 */
export function alignRight(text: string, width: number = DEFAULT_CONFIG.columns): string {
  if (text.length >= width) return text.substring(0, width);
  return ' '.repeat(width - text.length) + text;
}

/**
 * Justifica un texto a la izquierda y otro a la derecha
 * "1x Hamburguesa.........................$12.00"
 */
export function justifyBetween(left: string, right: string, width: number = DEFAULT_CONFIG.columns, fillChar: string = ' '): string {
  const totalLength = left.length + right.length;
  if (totalLength >= width) {
    // Si excede, acortamos la parte izquierda
    const allowedLeftLength = width - right.length - 2;
    const truncatedLeft = left.substring(0, allowedLeftLength) + '..';
    const spaces = width - truncatedLeft.length - right.length;
    return truncatedLeft + fillChar.repeat(spaces) + right;
  }
  const spaces = width - totalLength;
  return left + fillChar.repeat(spaces) + right;
}

/**
 * Dibuja una línea divisoria (ej: "------------------------------------------------")
 */
export function drawDivider(char: string = '-', width: number = DEFAULT_CONFIG.columns): string {
  return char.repeat(width);
}

function truncateToWidth(text: string, width: number): string {
  if (text.length <= width) return text;
  if (width <= 3) return text.substring(0, width);
  return text.substring(0, width - 3) + '...';
}

function padEndWidth(text: string, width: number): string {
  const value = truncateToWidth(text, width);
  return value.padEnd(width, ' ');
}

function padStartWidth(text: string, width: number): string {
  const value = truncateToWidth(text, width);
  return value.padStart(width, ' ');
}

/**
 * Formatea una fila de producto típica para tickets de cobro:
 * "Cant Descripcion                            Total"
 * "1x   Hamburguesa doble con queso          $12.50"
 */
export function formatProductRow(cant: number, desc: string, total: number, width: number = DEFAULT_CONFIG.columns): string {
  const qtyCol = 4;
  const totalStr = `$${total.toFixed(2)}`;
  const totalCol = Math.max(8, totalStr.length);
  const descCol = Math.max(1, width - qtyCol - totalCol - 1);

  const qtyPart = padEndWidth(`${cant}`, qtyCol);
  const descPart = padEndWidth(desc, descCol);
  const totalPart = padStartWidth(totalStr, totalCol);

  return `${qtyPart} ${descPart}${totalPart}`;
}

// --- PLANTILLAS DE DOCUMENTOS ---

interface PrintableItem extends Partial<ComandaItem> {
  nombre: string;
  precio: number;
  cantidad: number;
  qtyToPay?: number;
  es_bebida?: boolean;
  anulado_motivo?: string | null;
}

/**
 * 1. COMANDA DE COCINA (TICKET DE PRODUCCIÓN)
 * Diseño ultra compacto, tipografía gigante simulada, sin precios ni totales.
 */
export function generarComandaCocina(
  comanda: Comanda,
  items: PrintableItem[],
  mesaNombre: string,
  esAdicional = false,
  habitacionNombre?: string,
  forPrinter = false,
  itemsAnulados?: PrintableItem[],
): string {
  // Shorthand: only emit ESC/POS sequences when printing
  const p = (cmd: string) => forPrinter ? cmd : '';

  let t = '';

  if (forPrinter) t += POS.INIT;

  const cleanMesa = mesaNombre.toUpperCase().replace('MESA ', 'MESA #');

  // Header: si hay habitación, va arriba; la mesa debajo. Ambas líneas en el
  // mismo tamaño grande (2x) para que no se vea angosta/desbalanceada.
  t += p(POS.ALIGN_CENTER) + p(POS.SIZE_2X) + p(POS.BOLD_ON);
  t += `------------------------\n`;
  if (habitacionNombre) {
    t += `${splitHabitacionTipoNum(habitacionNombre)}\n`;
    t += `${cleanMesa}\n`;
  } else {
    t += `    ${cleanMesa}\n`;
  }
  t += `------------------------\n`;
  t += p(POS.SIZE_NORMAL) + p(POS.BOLD_OFF);

  t += p(POS.ALIGN_LEFT);
  t += `ORDEN: #${comanda.folio}\n`;
  t += `Fecha: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}\n`;

  if (esAdicional) {
    t += '\n';
    t += p(POS.ALIGN_CENTER) + p(POS.SIZE_2X) + p(POS.BOLD_ON);
    t += `*** ADICIONAL ***\n`;
    t += p(POS.BOLD_OFF) + p(POS.SIZE_NORMAL) + p(POS.ALIGN_LEFT);
    t += `${'='.repeat(48)}\n\n`;
  } else {
    t += `${'='.repeat(48)}\n\n`;
  }

  const itemsCocina = items.filter(i => !i.es_bebida);
  const itemsBebida = items.filter(i => i.es_bebida);

  function imprimirGrupo(groupItems: PrintableItem[]): string {
    let s = '';
    const groups: {
      [key: string]: {
        nombre: string;
        totalQty: number;
        subItems: Array<{ cantidad: number; modifiers: string[]; nota?: string }>;
      }
    } = {};

    groupItems.forEach(item => {
      const key = item.item_id || item.nombre;
      if (!groups[key]) {
        groups[key] = { nombre: item.nombre, totalQty: 0, subItems: [] };
      }
      groups[key].totalQty += item.cantidad;
      groups[key].subItems.push({
        cantidad: item.cantidad,
        modifiers: item.modificadores || [],
        nota: item.nota,
      });
    });

    const list = Object.values(groups);
    list.forEach((group, index) => {
      s += p(POS.SIZE_2X) + p(POS.BOLD_ON);
      s += `${group.totalQty}  ${group.nombre.toUpperCase()}\n`;
      s += p(POS.BOLD_OFF) + p(POS.SIZE_NORMAL);

      group.subItems.forEach(sub => {
        if (sub.modifiers.length > 0) {
          const modsStr = sub.modifiers.join(' · ').toUpperCase();
          s += group.subItems.length === 1 ? `   -> ${modsStr}\n` : `   (${sub.cantidad}) -> ${modsStr}\n`;
        }
        if (sub.nota) {
          const notaStr = sub.nota.toUpperCase();
          s += p(POS.SIZE_2X) + p(POS.BOLD_ON);
          s += group.subItems.length === 1 ? `   * NOTA: ${notaStr} *\n` : `   * NOTA (${sub.cantidad}): ${notaStr} *\n`;
          s += p(POS.BOLD_OFF) + p(POS.SIZE_NORMAL);
        }
      });
      if (index < list.length - 1) {
        s += `\n${'- '.repeat(24)}\n\n`;
      } else {
        s += '\n';
      }
    });
    return s;
  }

  const notasBlock = () => {
    let n = '\n\n';
    n += `Notas:\n`;
    n += `${'-'.repeat(48)}\n`;
    n += `${'-'.repeat(48)}\n`;
    n += '\n\n\n';
    return n;
  };

  if (itemsCocina.length > 0) {
    t += imprimirGrupo(itemsCocina);
    t += notasBlock();
  }

  if (itemsBebida.length > 0) {
    if (itemsCocina.length > 0) {
      if (forPrinter) {
        t += p(POS.CUT_PARTIAL);
      } else {
        t += `${'='.repeat(48)}\n`;
        t += `${' '.repeat(16)}RECORTAR AQUI${' '.repeat(19)}\n`;
        t += `${'='.repeat(48)}\n\n`;
      }
    }
    t += p(POS.ALIGN_CENTER) + p(POS.SIZE_2X) + p(POS.BOLD_ON);
    t += `------------------------\n`;
    if (habitacionNombre) {
      t += `${splitHabitacionTipoNum(habitacionNombre)}\n`;
      t += `${cleanMesa}\n`;
    } else {
      t += `    ${cleanMesa}\n`;
    }
    t += `------------------------\n`;
    t += p(POS.SIZE_NORMAL) + p(POS.BOLD_OFF) + p(POS.ALIGN_LEFT);
    t += `ORDEN: #${comanda.folio}\n`;
    t += `Fecha: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}\n`;
    if (esAdicional) {
      t += p(POS.BOLD_ON) + `\n*** PEDIDO ADICIONAL ***\n` + p(POS.BOLD_OFF);
      t += `${'='.repeat(48)}\n\n`;
    } else {
      t += `${'='.repeat(48)}\n\n`;
    }
    t += p(POS.ALIGN_CENTER) + p(POS.BOLD_ON);
    t += `BEBIDAS / BAR\n`;
    t += p(POS.BOLD_OFF) + p(POS.ALIGN_LEFT) + '\n';
    t += imprimirGrupo(itemsBebida);
    t += notasBlock();
  } else if (itemsCocina.length === 0) {
    t += notasBlock();
  }

  // Sección final: ítems anulados desde la última confirmación (se acabó
  // el insumo, error de cocina). No se borran del sistema — aquí solo se
  // avisa a cocina para que no los prepare / deje de prepararlos.
  if (itemsAnulados && itemsAnulados.length > 0) {
    if (forPrinter) {
      t += p(POS.CUT_PARTIAL);
    } else {
      t += `${'='.repeat(48)}\n`;
      t += `${' '.repeat(16)}RECORTAR AQUI${' '.repeat(19)}\n`;
      t += `${'='.repeat(48)}\n\n`;
    }
    t += p(POS.ALIGN_CENTER) + p(POS.SIZE_2X) + p(POS.BOLD_ON);
    t += `*** ITEMS ANULADOS ***\n`;
    t += p(POS.BOLD_OFF) + p(POS.SIZE_NORMAL) + p(POS.ALIGN_LEFT);
    t += `${'='.repeat(48)}\n\n`;
    itemsAnulados.forEach(item => {
      t += p(POS.BOLD_ON);
      t += `${item.cantidad}  ${item.nombre.toUpperCase()} — ANULADO\n`;
      t += p(POS.BOLD_OFF);
      if (item.anulado_motivo) {
        t += `   Motivo: ${item.anulado_motivo}\n`;
      }
      t += '\n';
    });
  }

  return t;
}

/**
 * 2. PRECUENTA (SUBTOTAL DE MESA)
 * Documento entregado al comensal para revisar consumos antes del pago.
 */
export function generarPrecuenta(
  comanda: Comanda,
  items: PrintableItem[],
  mesaNombre: string,
  ivaPercent: number = 15,
  pagos: Pago[] = [],
  habitacionNombre?: string,
  forPrinter = false,
): string {
  const p = (cmd: string) => forPrinter ? cmd : '';
  const W = 48;
  let t = '';

  if (forPrinter) t += POS.INIT;

  // ── Encabezado ──────────────────────────────────────────────────
  const orgName = getOrgCache().nombre || 'EL JARDIN';
  t += p(POS.ALIGN_CENTER) + p(POS.BOLD_ON) + p(POS.SIZE_2X);
  t += `${orgName.toUpperCase()}\n`;
  t += p(POS.SIZE_NORMAL) + p(POS.BOLD_OFF);
  t += p(POS.ALIGN_LEFT);
  t += `${'-'.repeat(W)}\n`;

  // ── Info de la orden ────────────────────────────────────────────
  t += justifyBetween(`PRECUENTA #${comanda.folio}`, new Date().toLocaleDateString('es-ES'), W) + '\n';
  t += p(POS.BOLD_ON) + mesaNombre.toUpperCase() + p(POS.BOLD_OFF) + '\n';
  if (habitacionNombre) {
    t += `Habitacion: ${cleanHabitacionName(habitacionNombre)}\n`;
  }
  if (comanda.cliente && comanda.cliente !== 'Consumidor Final') {
    t += `Huesped: ${comanda.cliente}\n`;
  }
  if (comanda.mesero) {
    t += `Mesero: ${comanda.mesero}\n`;
  }
  t += `${'-'.repeat(W)}\n`;

  // ── Cabecera de columnas ────────────────────────────────────────
  t += p(POS.BOLD_ON);
  t += justifyBetween('CANT  DESCRIPCION', 'TOTAL', W) + '\n';
  t += p(POS.BOLD_OFF);
  t += `${'-'.repeat(W)}\n`;

  // ── Items ───────────────────────────────────────────────────────
  // Los ítems anulados no se cobran ni se muestran: esta precuenta es para
  // que el cliente revise lo que va a pagar, no un registro interno.
  let subtotal = 0;
  items.filter(item => !item.anulado).forEach(item => {
    const itemTotal = item.precio * item.cantidad;
    subtotal += itemTotal;
    t += formatProductRow(item.cantidad, item.nombre, itemTotal, W) + '\n';
    if (item.modificadores && item.modificadores.length > 0) {
      item.modificadores.forEach((mod: string) => {
        t += `     * ${mod.toUpperCase()}\n`;
      });
    }
    if (item.nota) {
      t += `     NOTA: ${item.nota.toUpperCase()}\n`;
    }
  });

  t += `${'-'.repeat(W)}\n`;

  // ── Totales ─────────────────────────────────────────────────────
  const ivaFactor = ivaPercent / 100;
  const iva = subtotal * ivaFactor;
  const total = subtotal + iva;

  t += justifyBetween('Subtotal:', `$${subtotal.toFixed(2)}`, W) + '\n';
  t += justifyBetween(`IVA (${ivaPercent}%):`, `$${iva.toFixed(2)}`, W) + '\n';
  t += `${'-'.repeat(W)}\n`;
  t += p(POS.BOLD_ON);
  t += justifyBetween('TOTAL:', `$${total.toFixed(2)}`, W) + '\n';
  t += p(POS.BOLD_OFF);

  // ── Pagos / Abonos ──────────────────────────────────────────────
  if (pagos && pagos.length > 0) {
    const totalPagado = pagos.reduce((acc, pg) => acc + pg.monto, 0);
    if (totalPagado > 0) {
      t += `${'-'.repeat(W)}\n`;
      t += justifyBetween('Abonado:', `$${totalPagado.toFixed(2)}`, W) + '\n';
      const saldo = Math.max(0, total - totalPagado);
      t += p(POS.BOLD_ON) + justifyBetween('Saldo pendiente:', `$${saldo.toFixed(2)}`, W) + p(POS.BOLD_OFF) + '\n';
    }
  }

  // ── Datos de facturación ────────────────────────────────────────
  t += `\n${'-'.repeat(W)}\n`;
  t += datosFacturacionBlock(W);

  // ── Pie ─────────────────────────────────────────────────────────
  t += `\n`;
  t += p(POS.ALIGN_CENTER);
  t += `Documento interno sin validez tributaria.\n`;
  t += p(POS.ALIGN_LEFT);
  t += `\n${'-'.repeat(W)}\n`;
  t += `${formaPagoLine(W)}\n`;
  t += `${'-'.repeat(W)}\n`;
  t += '\n\n\n';

  return t;
}

/**
 * 2b. PRECUENTA CONSOLIDADA DE HABITACIÓN
 * Junta todas las comandas seleccionadas del checkout de habitación en un
 * solo documento, cada una con su propio detalle, y el total general al
 * final — para que el huésped revise todo su consumo antes de pagar.
 */
export function generarPrecuentaConsolidadaHabitacion(
  comandas: Array<{ comanda: Comanda; items: PrintableItem[] }>,
  mesaNombre: string,
  ivaPercent: number = 15,
  habitacionNombre?: string,
  forPrinter = false,
): string {
  const p = (cmd: string) => forPrinter ? cmd : '';
  const W = 48;
  let t = '';

  if (forPrinter) t += POS.INIT;

  // ── Encabezado ──────────────────────────────────────────────────
  const orgName = getOrgCache().nombre || 'EL JARDIN';
  t += p(POS.ALIGN_CENTER) + p(POS.BOLD_ON) + p(POS.SIZE_2X);
  t += `${orgName.toUpperCase()}\n`;
  t += p(POS.SIZE_NORMAL) + p(POS.BOLD_OFF);
  t += p(POS.ALIGN_LEFT);
  t += `${'-'.repeat(W)}\n`;

  t += justifyBetween('PRECUENTA CONSOLIDADA', new Date().toLocaleDateString('es-ES'), W) + '\n';
  t += p(POS.BOLD_ON) + mesaNombre.toUpperCase() + p(POS.BOLD_OFF) + '\n';
  if (habitacionNombre) {
    t += `Habitacion: ${cleanHabitacionName(habitacionNombre)}\n`;
  }
  t += `${'-'.repeat(W)}\n`;

  // ── Una sección por comanda ─────────────────────────────────────
  let granSubtotal = 0;
  comandas.forEach(({ comanda, items }) => {
    const fechaComanda = comanda.created_at ? new Date(comanda.created_at).toLocaleDateString('es-ES') : '';
    t += p(POS.BOLD_ON);
    t += `Comanda #${comanda.folio}${fechaComanda ? ` (${fechaComanda})` : ''}\n`;
    t += p(POS.BOLD_OFF);
    t += justifyBetween('CANT  DESCRIPCION', 'VALOR', W) + '\n';
    t += `${'-'.repeat(W)}\n`;

    items.filter(item => !item.anulado).forEach(item => {
      const itemTotal = item.precio * item.cantidad;
      granSubtotal += itemTotal;
      t += formatProductRow(item.cantidad, item.nombre, itemTotal, W) + '\n';
      if (item.modificadores && item.modificadores.length > 0) {
        item.modificadores.forEach((mod: string) => {
          t += `     * ${mod.toUpperCase()}\n`;
        });
      }
      if (item.nota) {
        t += `     NOTA: ${item.nota.toUpperCase()}\n`;
      }
    });
    t += '\n';
  });

  // ── Totales ─────────────────────────────────────────────────────
  const ivaFactor = ivaPercent / 100;
  const ivaTotal = granSubtotal * ivaFactor;
  const totalGeneral = granSubtotal + ivaTotal;

  t += `${'-'.repeat(W)}\n`;
  t += justifyBetween('Subtotal:', `$${granSubtotal.toFixed(2)}`, W) + '\n';
  t += justifyBetween(`IVA (${ivaPercent}%):`, `$${ivaTotal.toFixed(2)}`, W) + '\n';
  t += `${'-'.repeat(W)}\n`;
  t += p(POS.BOLD_ON) + p(POS.SIZE_2X);
  t += justifyBetween('A PAGAR:', `$${totalGeneral.toFixed(2)}`, W) + '\n';
  t += p(POS.SIZE_NORMAL) + p(POS.BOLD_OFF);

  // ── Datos de facturación ────────────────────────────────────────
  t += `\n${'-'.repeat(W)}\n`;
  t += datosFacturacionBlock(W);

  // ── Pie ─────────────────────────────────────────────────────────
  t += `\n`;
  t += p(POS.ALIGN_CENTER);
  t += `Documento interno sin validez tributaria.\n`;
  t += p(POS.ALIGN_LEFT);
  t += `\n${'-'.repeat(W)}\n`;
  t += `${formaPagoLine(W)}\n`;
  t += `${'-'.repeat(W)}\n`;
  t += '\n\n\n';

  return t;
}

/**
 * TICKET DE RESERVA
 * Documento impreso con los detalles de una reserva y su pedido anticipado.
 */
export function generarTicketReserva(
  reserva: Reserva,
  items: PrintableItem[],
  zonaNombre: string,
  ivaPercent: number = 15,
  pagos: Pago[] = []
): string {
  let t = '';

  t += `RESERVA CONFIRMADA\n\n`;

  t += `Cliente: ${reserva.nombre || 'Sin nombre'}\n`;
  t += `Fecha: ${reserva.fecha}  Hora: ${reserva.hora}\n`;
  t += `Personas: ${reserva.personas}\n`;
  if (zonaNombre) {
    t += `Preferencia: ${zonaNombre}\n`;
  }
  if (reserva.telefono) {
    t += `Telefono: ${reserva.telefono}\n`;
  }
  if (reserva.notas) {
    t += `Notas: ${reserva.notas}\n`;
  }
  t += `---------------\n`;

  if (items.length > 0) {
    t += `PEDIDO ANTICIPADO:\n`;
    t += `Cant  -  Detalle  -  Total\n\n`;

    let subtotal = 0;
    items.filter(item => !item.anulado).forEach(item => {
      const itemTotal = item.precio * item.cantidad;
      subtotal += itemTotal;
      t += `${item.cantidad} - ${item.nombre.toUpperCase()} - $${itemTotal.toFixed(2)}\n`;

      if (item.modificadores && item.modificadores.length > 0) {
        item.modificadores.forEach((mod: string) => {
          t += `   * ${mod.toUpperCase()}\n`;
        });
      }
      if (item.nota) {
        t += `   * NOTA: ${item.nota.toUpperCase()}\n`;
      }
    });

    t += `---------------\n`;

    const ivaFactor = ivaPercent / 100;
    const iva = subtotal * ivaFactor;
    const total = subtotal + iva;

    t += `Subtotal: - $${subtotal.toFixed(2)}\n`;
    t += `IVA (${ivaPercent}%): - $${iva.toFixed(2)}\n`;
    t += `Total Estimado: - $${total.toFixed(2)}\n`;

    if (pagos && pagos.length > 0) {
      const totalPagado = pagos.reduce((acc, p) => acc + p.monto, 0);
      if (totalPagado > 0) {
        t += `Abono Previo: - $${totalPagado.toFixed(2)}\n`;
        const saldoPendiente = Math.max(0, total - totalPagado);
        t += `Saldo a Pagar: - $${saldoPendiente.toFixed(2)}\n`;
      }
    }
    t += `---------------\n`;
  }

  t += '\n\n';
  return t;
}

/**
 * 3. TICKET DE PAGO (RECIBO FINAL)
 * Documento final emitido tras la conciliación y el pago.
 */
export function generarTicketPago(
  comanda: Comanda,
  items: PrintableItem[],
  pagos: Pago[],
  mesaNombre: string,
  ivaPercent: number = 15,
  width: number = DEFAULT_CONFIG.columns,
  habitacionNombre?: string,
  forPrinter = false,
): string {
  const p = (cmd: string) => forPrinter ? cmd : '';
  const W = width;
  let t = '';

  if (forPrinter) t += POS.INIT;

  // ── Encabezado ──────────────────────────────────────────────────
  const org = getOrgCache();
  t += p(POS.ALIGN_CENTER) + p(POS.BOLD_ON) + p(POS.SIZE_2X);
  t += `${(org.nombre || 'EL JARDIN').toUpperCase()}\n`;
  t += p(POS.SIZE_NORMAL) + p(POS.BOLD_OFF);
  t += p(POS.ALIGN_LEFT);
  if (org.direccion) t += `${org.direccion}\n`;
  if (org.telefono) t += `Teléfono: ${org.telefono}\n`;
  if (org.ruc) t += `RUC: ${org.ruc}\n`;
  t += `${'-'.repeat(W)}\n`;

  // ── Info de la orden ────────────────────────────────────────────
  t += justifyBetween(`TICKET #${comanda.folio}`, new Date().toLocaleDateString('es-ES'), W) + '\n';
  t += p(POS.BOLD_ON) + mesaNombre.toUpperCase() + p(POS.BOLD_OFF) + '\n';
  if (habitacionNombre) {
    t += `Habitacion: ${cleanHabitacionName(habitacionNombre)}\n`;
  }
  t += `Mesero: ${comanda.mesero || 'Genérico'}\n`;
  t += `Cliente: ${comanda.cliente || 'Consumidor Final'}\n`;

  const activeComandaClient = comanda.cliente_id;
  if (activeComandaClient && activeComandaClient !== '99999999999') {
    // Si es un cliente registrado, mostrar más info si estuviera disponible, o DNI
    t += `C.I. / RUC: ${activeComandaClient}\n`;
  }
  t += `${'-'.repeat(W)}\n`;

  // ── Cabecera de columnas ────────────────────────────────────────
  t += p(POS.BOLD_ON);
  t += justifyBetween('CANT  DESCRIPCION', 'VALOR', W) + '\n';
  t += p(POS.BOLD_OFF);
  t += `${'-'.repeat(W)}\n`;

  // ── Items ───────────────────────────────────────────────────────
  let subtotal = 0;
  items.filter(item => !item.anulado).forEach(item => {
    const itemTotal = item.precio * item.cantidad;
    subtotal += itemTotal;
    t += formatProductRow(item.cantidad, item.nombre, itemTotal, W) + '\n';
    if (item.modificadores && item.modificadores.length > 0) {
      item.modificadores.forEach((mod: string) => {
        t += `     * ${mod.toUpperCase()}\n`;
      });
    }
  });

  t += `${'-'.repeat(W)}\n`;

  // ── Totales ─────────────────────────────────────────────────────
  const ivaFactor = ivaPercent / 100;
  const iva = subtotal * ivaFactor;
  const total = subtotal + iva;

  t += justifyBetween('Subtotal:', `$${subtotal.toFixed(2)}`, W) + '\n';
  t += justifyBetween(`IVA (${ivaPercent}%):`, `$${iva.toFixed(2)}`, W) + '\n';
  t += `${'-'.repeat(W)}\n`;
  t += p(POS.BOLD_ON);
  t += justifyBetween('TOTAL:', `$${total.toFixed(2)}`, W) + '\n';
  t += p(POS.BOLD_OFF);

  // ── Desglose de pagos ───────────────────────────────────────────
  t += `${'-'.repeat(W)}\n`;
  t += `DESGLOSE DE PAGO:\n`;
  let totalPagado = 0;
  pagos.forEach(pago => {
    // metodo_pago puede venir null: el checkout ya no elige método al
    // cerrar, se define después al anclar en Centro de Ventas.
    const metodoLabel = pago.metodo_pago ? pago.metodo_pago.toUpperCase() : 'PENDIENTE DE DEFINIR';
    t += justifyBetween(`${metodoLabel}:`, `$${pago.monto.toFixed(2)}`, W) + '\n';
    totalPagado += pago.monto;
  });
  if (totalPagado > total) {
    const cambio = totalPagado - total;
    t += justifyBetween('CAMBIO / VUELTO:', `$${cambio.toFixed(2)}`, W) + '\n';
  }

  // ── Pie ─────────────────────────────────────────────────────────
  t += `\n${'-'.repeat(W)}\n`;
  t += p(POS.ALIGN_CENTER);
  t += `¡Muchas gracias por su visita!\n`;
  t += `Documento interno sin validez tributaria.\n`;
  t += p(POS.ALIGN_LEFT);
  t += `\n${'-'.repeat(W)}\n`;
  t += `${formaPagoLine(W)}\n`;
  t += `${'-'.repeat(W)}\n`;
  t += '\n\n\n';

  return t;
}

export function generarPrecuentaDividida(
  comanda: Comanda,
  items: PrintableItem[],
  mesaNombre: string,
  nombrePagador: string,
  montoTotal: number,
  ivaPercent: number = 15,
  habitacionNombre?: string,
  forPrinter = false,
): string {
  const p = (cmd: string) => forPrinter ? cmd : '';
  const W = 48;
  let t = '';

  if (forPrinter) t += POS.INIT;

  // ── Encabezado ──────────────────────────────────────────────────
  const orgName = getOrgCache().nombre || 'EL JARDIN';
  t += p(POS.ALIGN_CENTER) + p(POS.BOLD_ON) + p(POS.SIZE_2X);
  t += `${orgName.toUpperCase()}\n`;
  t += p(POS.SIZE_NORMAL) + p(POS.BOLD_OFF);
  t += p(POS.ALIGN_LEFT);
  t += `${'-'.repeat(W)}\n`;

  // ── Info de la orden ────────────────────────────────────────────
  t += justifyBetween(`PRECUENTA #${comanda.folio}`, new Date().toLocaleDateString('es-ES'), W) + '\n';
  t += p(POS.BOLD_ON) + mesaNombre.toUpperCase() + p(POS.BOLD_OFF) + '\n';
  if (habitacionNombre) {
    t += `Habitacion: ${cleanHabitacionName(habitacionNombre)}\n`;
  }
  if (nombrePagador) {
    t += `Cliente que paga: ${nombrePagador.toUpperCase()}\n`;
  }
  if (comanda.mesero) {
    t += `Mesero: ${comanda.mesero}\n`;
  }
  t += `${'-'.repeat(W)}\n`;

  // ── Cabecera de columnas ────────────────────────────────────────
  t += p(POS.BOLD_ON);
  t += justifyBetween('CANT  DESCRIPCION', 'TOTAL', W) + '\n';
  t += p(POS.BOLD_OFF);
  t += `${'-'.repeat(W)}\n`;

  // ── Items ───────────────────────────────────────────────────────
  let subtotal = 0;
  if (items && items.length > 0) {
    items.filter(item => !item.anulado).forEach(item => {
      const qty = item.qtyToPay || item.cantidad || 1;
      const itemTotal = item.precio * qty;
      subtotal += itemTotal;
      t += formatProductRow(qty, item.nombre, itemTotal, W) + '\n';
      if (item.modificadores && item.modificadores.length > 0) {
        item.modificadores.forEach((mod: string) => {
          t += `     * ${mod.toUpperCase()}\n`;
        });
      }
      if (item.nota) {
        t += `     NOTA: ${item.nota.toUpperCase()}\n`;
      }
    });
  } else {
    subtotal = montoTotal / (1 + ivaPercent / 100);
    t += formatProductRow(1, 'CONSUMO PARCIAL', montoTotal, W) + '\n';
  }

  t += `${'-'.repeat(W)}\n`;

  // ── Totales ─────────────────────────────────────────────────────
  const ivaFactor = ivaPercent / 100;
  const iva = subtotal * ivaFactor;
  const total = subtotal + iva;

  t += justifyBetween('Subtotal:', `$${subtotal.toFixed(2)}`, W) + '\n';
  t += justifyBetween(`IVA (${ivaPercent}%):`, `$${iva.toFixed(2)}`, W) + '\n';
  t += `${'-'.repeat(W)}\n`;
  t += p(POS.BOLD_ON);
  t += justifyBetween('TOTAL PARCIAL:', `$${total.toFixed(2)}`, W) + '\n';
  t += p(POS.BOLD_OFF);

  // ── Datos de facturación ────────────────────────────────────────
  t += `\n${'-'.repeat(W)}\n`;
  t += datosFacturacionBlock(W);

  // ── Pie ─────────────────────────────────────────────────────────
  t += `\n`;
  t += p(POS.ALIGN_CENTER);
  t += `Documento interno sin validez tributaria.\n`;
  t += p(POS.ALIGN_LEFT);
  t += `\n${'-'.repeat(W)}\n`;
  t += `${formaPagoLine(W)}\n`;
  t += `${'-'.repeat(W)}\n`;
  t += '\n\n\n';

  return t;
}

/**
 * 4. REPORTE CONSOLIDADO DE COCINA
 * Muestra el pedido de varias mesas y al final un resumen de totales.
 */
export function generarReporteCocinaConsolidado(
  mesasData: Array<{
    mesaNombre: string;
    habitacionNombre?: string;
    items: PrintableItem[];
  }>
): string {
  let t = '';

  t += `REPORTE COCINA CONSOLIDADO\n`;
  t += `Fecha: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}\n`;
  t += `================================\n\n`;

  // Estructura global para totales
  const globalGroups: {
    [key: string]: {
      nombre: string;
      totalQty: number;
    }
  } = {};

  // Iterar por cada mesa
  mesasData.forEach((mesaData) => {
    t += `--- ${mesaData.mesaNombre.toUpperCase()} ---\n`;
    if (mesaData.habitacionNombre) {
      t += `HAB: ${cleanHabitacionName(mesaData.habitacionNombre).toUpperCase()}\n`;
    }

    // Agrupar items de la mesa
    const mesaGroups: {
      [key: string]: {
        nombre: string;
        totalQty: number;
        subItems: Array<{ cantidad: number; modifiers: string[]; nota?: string }>;
      }
    } = {};

    mesaData.items.forEach(item => {
      // Local
      const key = item.item_id || item.nombre;
      if (!mesaGroups[key]) {
        mesaGroups[key] = {
          nombre: item.nombre,
          totalQty: 0,
          subItems: []
        };
      }
      mesaGroups[key].totalQty += item.cantidad;
      mesaGroups[key].subItems.push({
        cantidad: item.cantidad,
        modifiers: item.modificadores || [],
        nota: item.nota
      });

      // Global
      if (!globalGroups[key]) {
        globalGroups[key] = {
          nombre: item.nombre,
          totalQty: 0
        };
      }
      globalGroups[key].totalQty += item.cantidad;
    });

    // Imprimir mesa
    const groupedList = Object.values(mesaGroups);
    groupedList.forEach((group) => {
      t += `[${group.totalQty}]  ${group.nombre.toUpperCase()}\n`;
      group.subItems.forEach(sub => {
        if (sub.modifiers.length > 0) {
          const modsStr = sub.modifiers.join(' · ').toUpperCase();
          if (group.subItems.length === 1) {
            t += `  ${modsStr}\n`;
          } else {
            t += `  ${sub.cantidad} = ${modsStr}\n`;
          }
        }
        if (sub.nota) {
          const notaStr = sub.nota.toUpperCase();
          if (group.subItems.length === 1) {
            t += `  NOTA: ${notaStr}\n`;
          } else {
            t += `  NOTA: ${sub.cantidad} = ${notaStr}\n`;
          }
        }
      });
    });
    t += '\n';
  });

  t += `================================\n`;
  t += `TOTALES GLOBALES\n`;
  t += `================================\n`;

  const globalList = Object.values(globalGroups);
  globalList.forEach(g => {
    t += `[${g.totalQty}]  ${g.nombre.toUpperCase()}\n`;
  });

  t += '\n\n\n';
  return t;
}

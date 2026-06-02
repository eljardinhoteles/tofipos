// @ts-nocheck
import type { Comanda, ComandaItem, Pago } from '../db/database';

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
  return name.replace(/^(HAB(ITACI[OÓ]N)?\s*:?\s*)/i, '').trim();
}

// ESC/POS command helpers
const ESC = '\x1B';
const GS  = '\x1D';
export const POS = {
  INIT:         ESC + '@',
  BOLD_ON:      ESC + 'E\x01',
  BOLD_OFF:     ESC + 'E\x00',
  // Double width + double height
  SIZE_2X:      ESC + '!\x30',
  // Double height only
  SIZE_TALL:    ESC + '!\x10',
  SIZE_NORMAL:  ESC + '!\x00',
  ALIGN_CENTER: ESC + 'a\x01',
  ALIGN_LEFT:   ESC + 'a\x00',
  CUT:          GS  + 'V\x00',
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

/**
 * Formatea una fila de producto típica para tickets de cobro:
 * "Cant Descripcion                            Total"
 * "1x   Hamburguesa doble con queso          $12.50"
 */
export function formatProductRow(cant: number, desc: string, total: number, width: number = DEFAULT_CONFIG.columns): string {
  const prefix = `${cant}x `.padEnd(5, ' '); // "1x   " (5 caracteres)
  const totalStr = `$${total.toFixed(2)}`; // "$12.50" (ej. 7 caracteres)

  // Columnas restantes para la descripción
  const remainingWidth = width - prefix.length - totalStr.length - 1; // -1 de espacio separador
  let description = desc;
  if (desc.length > remainingWidth) {
    description = desc.substring(0, remainingWidth - 3) + '...';
  }

  const rightPart = totalStr;
  const leftPart = prefix + description;

  return justifyBetween(leftPart, rightPart, width, ' ');
}

// --- PLANTILLAS DE DOCUMENTOS ---

interface PrintableItem extends Partial<ComandaItem> {
  nombre: string;
  precio: number;
  cantidad: number;
  qtyToPay?: number;
  es_bebida?: boolean;
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
): string {
  // Shorthand: only emit ESC/POS sequences when printing
  const p = (cmd: string) => forPrinter ? cmd : '';

  let t = '';

  if (forPrinter) t += POS.INIT;

  const cleanMesa = mesaNombre.toUpperCase().replace('MESA ', 'MESA #');

  // Header: mesa centrada en tamaño doble
  t += p(POS.ALIGN_CENTER) + p(POS.SIZE_2X) + p(POS.BOLD_ON);
  t += `${cleanMesa}\n`;
  t += p(POS.SIZE_NORMAL) + p(POS.BOLD_OFF) + p(POS.ALIGN_LEFT);

  t += p(POS.BOLD_ON) + `ORDEN: #${comanda.folio}` + p(POS.BOLD_OFF) + '\n';
  if (habitacionNombre) {
    t += `HAB: ${cleanHabitacionName(habitacionNombre).toUpperCase()}\n`;
  }
  t += `Fecha: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}\n`;

  if (esAdicional) {
    t += p(POS.BOLD_ON) + `\n*** PEDIDO ADICIONAL ***\n` + p(POS.BOLD_OFF);
    t += `================================\n\n`;
  } else {
    t += `\n\n`;
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
      // Cantidad y nombre en doble tamaño + negrita
      s += p(POS.SIZE_2X) + p(POS.BOLD_ON);
      s += `${group.totalQty}  ${group.nombre.toUpperCase()}`;
      s += p(POS.BOLD_OFF) + p(POS.SIZE_NORMAL) + '\n';

      group.subItems.forEach(sub => {
        if (sub.modifiers.length > 0) {
          const modsStr = sub.modifiers.join(' · ').toUpperCase();
          s += group.subItems.length === 1 ? `  ${modsStr}\n` : `  ${sub.cantidad} = ${modsStr}\n`;
        }
        if (sub.nota) {
          const notaStr = sub.nota.toUpperCase();
          s += group.subItems.length === 1 ? `  NOTA: ${notaStr}\n` : `  NOTA: ${sub.cantidad} = ${notaStr}\n`;
        }
      });
      if (index < list.length - 1) s += '\n---\n\n';
    });
    return s;
  }

  if (itemsCocina.length > 0) {
    t += imprimirGrupo(itemsCocina);
  }

  if (itemsBebida.length > 0) {
    if (itemsCocina.length > 0) {
      t += '\n\n';
      t += `================================\n`;
      t += `         RECORTAR AQUI          \n`;
      t += `================================\n\n`;
    }
    t += p(POS.ALIGN_CENTER) + p(POS.SIZE_2X) + p(POS.BOLD_ON);
    t += `${cleanMesa}\n`;
    t += p(POS.SIZE_NORMAL) + p(POS.BOLD_OFF) + p(POS.ALIGN_LEFT);
    t += p(POS.BOLD_ON) + `ORDEN: #${comanda.folio}` + p(POS.BOLD_OFF) + '\n';
    if (habitacionNombre) {
      t += `HAB: ${cleanHabitacionName(habitacionNombre).toUpperCase()}\n`;
    }
    t += `Fecha: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}\n`;
    if (esAdicional) {
      t += p(POS.BOLD_ON) + `\n*** PEDIDO ADICIONAL ***\n` + p(POS.BOLD_OFF);
      t += `================================\n\n`;
    } else {
      t += `\n`;
    }
    t += p(POS.BOLD_ON) + `--- BEBIDAS / BAR ---\n` + p(POS.BOLD_OFF) + '\n';
    t += imprimirGrupo(itemsBebida);
  }

  t += '\n\n';
  t += `Notas:\n`;
  t += `------------------------------\n`;
  t += `------------------------------\n`;
  t += '\n\n';
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
  habitacionNombre?: string
): string {
  let t = '';

  t += `PRECUENTA #${comanda.folio}\n\n`;

  t += `${mesaNombre}\n`;
  if (habitacionNombre) {
    t += `Habitacion: ${cleanHabitacionName(habitacionNombre)}\n`;
  }
  if (comanda.cliente && comanda.cliente !== 'Consumidor Final') {
    t += `Huesped: ${comanda.cliente}\n`;
  }
  t += `Fecha: ${new Date(comanda.created_at).toLocaleDateString('es-ES')}\n`;
  t += `---------------\n`;
  t += `Cant  -  Detalle  -  Total\n\n`;

  let subtotal = 0;
  items.forEach(item => {
    const itemTotal = item.precio * item.cantidad;
    subtotal += itemTotal;
    t += `${item.cantidad} - ${item.nombre.toUpperCase()} - $${itemTotal.toFixed(2)}\n`;

    // Modificadores tabulados debajo
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
  t += `Total: - $${total.toFixed(2)}\n`;

  t += `---------------\n\n`;

  if (pagos && pagos.length > 0) {
    const totalPagado = pagos.reduce((acc, p) => acc + p.monto, 0);
    if (totalPagado > 0) {
      t += `Abonado / Pagado: - $${totalPagado.toFixed(2)}\n`;
      const saldoPendiente = Math.max(0, total - totalPagado);
      t += `Saldo Pendiente: - $${saldoPendiente.toFixed(2)}\n`;
    }
  }

  t += `------------------------------\n`;
  t += `*Obligatorio escribir sus datos de facturación:\n`;
  t += `Razón Social:\n`;
  t += `------------------------------\n`;
  t += `RUC/CI/PS:\n`;
  t += `------------------------------\n`;
  t += `Correo:\n`;
  t += `------------------------------\n`;
  t += `Telefono:\n`;
  t += `------------------------------\n`;
  t += `Direccion:\n`;
  t += `------------------------------\n\n`;

  t += `EL JARDIN / Documento interno sin validéz tributaria.\n`;
  t += `\n\n`;

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
    items.forEach(item => {
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
  habitacionNombre?: string
): string {
  let t = '';

  t += alignCenter('RESTAURANTE EL JARDIN', width) + '\n';
  t += alignCenter('Calle de las Flores #123', width) + '\n';
  t += alignCenter('Quito - Ecuador', width) + '\n';
  t += alignCenter('Teléfono: 099-999-9999', width) + '\n';
  t += alignCenter('RUC: 17929381001', width) + '\n';
  t += drawDivider('=', width) + '\n';

  t += alignCenter('*** COMPROBANTE DE COMPRA ***', width) + '\n';
  t += justifyBetween(`Ticket: #${comanda.folio}`, `Mesa: ${mesaNombre}`, width) + '\n';
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

  t += justifyBetween(
    `Fecha: ${new Date().toLocaleDateString('es-ES')}`,
    `Hora: ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
    width
  ) + '\n';
  t += drawDivider('-', width) + '\n';

  t += justifyBetween('Cant  Descripcion', 'Total', width) + '\n';
  t += drawDivider('-', width) + '\n';

  let subtotal = 0;
  items.forEach(item => {
    const itemTotal = item.precio * item.cantidad;
    subtotal += itemTotal;
    t += formatProductRow(item.cantidad, item.nombre, itemTotal, width) + '\n';

    if (item.modificadores && item.modificadores.length > 0) {
      item.modificadores.forEach((mod: string) => {
        t += `   * ${mod}\n`;
      });
    }
  });

  t += drawDivider('-', width) + '\n';

  const ivaFactor = ivaPercent / 100;
  const iva = subtotal * ivaFactor;
  const total = subtotal + iva;

  t += justifyBetween('Subtotal:', `$${subtotal.toFixed(2)}`, width) + '\n';
  t += justifyBetween(`IVA (${ivaPercent}%):`, `$${iva.toFixed(2)}`, width) + '\n';
  t += justifyBetween('TOTAL TICKET:', `$${total.toFixed(2)}`, width) + '\n';

  t += drawDivider('-', width) + '\n';

  // Desglose de Pagos
  t += alignCenter('DESGLOSE DE PAGO', width) + '\n';
  let totalPagado = 0;
  pagos.forEach(pago => {
    const metodoLabel = pago.metodo_pago.toUpperCase();
    t += justifyBetween(`${metodoLabel}:`, `$${pago.monto.toFixed(2)}`, width) + '\n';
    totalPagado += pago.monto;
  });

  // Vuelto / Cambio si aplica
  if (totalPagado > total) {
    const cambio = totalPagado - total;
    t += justifyBetween('CAMBIO / VUELTO:', `$${cambio.toFixed(2)}`, width) + '\n';
  }

  t += drawDivider('=', width) + '\n';
  t += alignCenter('¡Muchas gracias por su visita!', width) + '\n';
  t += alignCenter('Documento interno del sistema', width) + '\n';
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
  habitacionNombre?: string
): string {
  let t = '';

  t += `PRECUENTA #${comanda.folio}\n\n`;

  t += `${mesaNombre}\n`;
  if (habitacionNombre) {
    t += `Habitacion: ${cleanHabitacionName(habitacionNombre)}\n`;
  }
  t += `Fecha: ${new Date(comanda.created_at || new Date()).toLocaleDateString('es-ES')}\n`;
  if (nombrePagador) {
    t += `Cliente que paga: ${nombrePagador.toUpperCase()}\n`;
  }
  t += `---------------\n`;
  t += `Cant  -  Detalle  -  Total\n\n`;

  let subtotal = 0;
  if (items && items.length > 0) {
    items.forEach(item => {
      const qty = item.qtyToPay || item.cantidad || 1;
      const itemTotal = item.precio * qty;
      subtotal += itemTotal;
      t += `${qty} - ${item.nombre.toUpperCase()} - $${itemTotal.toFixed(2)}\n`;

      // Modificadores tabulados debajo
      if (item.modificadores && item.modificadores.length > 0) {
        item.modificadores.forEach((mod: string) => {
          t += `   * ${mod.toUpperCase()}\n`;
        });
      }
      if (item.nota) {
        t += `   * NOTA: ${item.nota.toUpperCase()}\n`;
      }
    });
  } else {
    subtotal = montoTotal / (1 + ivaPercent / 100);
    t += `1 - CONSUMO PARCIAL - $${subtotal.toFixed(2)}\n`;
  }

  t += `---------------\n`;

  const iva = subtotal * (ivaPercent / 100);
  const total = subtotal + iva;

  t += `Subtotal: - $${subtotal.toFixed(2)}\n`;
  t += `IVA (${ivaPercent}%): - $${iva.toFixed(2)}\n`;
  t += `Total: - $${total.toFixed(2)}\n`;

  t += `---------------\n\n`;

  t += `------------------------------\n`;
  t += `*Obligatorio escribir sus datos de facturación:\n`;
  t += `Razón Social:\n`;
  t += `------------------------------\n`;
  t += `RUC/CI/PS:\n`;
  t += `------------------------------\n`;
  t += `Correo:\n`;
  t += `------------------------------\n`;
  t += `Telefono:\n`;
  t += `------------------------------\n`;
  t += `Direccion:\n`;
  t += `------------------------------\n\n`;

  t += `EL JARDIN / Documento interno sin validéz tributaria.\n`;
  t += `\n\n`;

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

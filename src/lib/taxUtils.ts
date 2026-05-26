import type { MenuItem, ComandaItem } from '../db/database';

/**
 * Obtiene el porcentaje de IVA aplicable para un producto específico
 * basado en su modalidad de IVA configurada y la tasa general del sistema.
 */
export function obtenerIvaProducto(item: Partial<MenuItem> | undefined, tasaSistema: number): number {
  if (!item) return tasaSistema;
  
  const modalidad = item.iva_modalidad || 'sistema';
  
  if (modalidad === 'exento') {
    return 0;
  }
  
  if (modalidad === 'especifico') {
    return typeof item.iva_porcentaje === 'number' ? item.iva_porcentaje : tasaSistema;
  }
  
  return tasaSistema;
}

/**
 * Realiza los cálculos detallados de impuestos para un item individual.
 * Soporta modalidad de precios con IVA Incluido y precios con IVA Excluido (adicionado).
 */
export function calcularPreciosItem(
  precioBase: number,
  cantidad: number,
  porcentajeIva: number,
  preciosConIvaGlobal: boolean
) {
  const pct = porcentajeIva / 100;
  
  let precioNeto = 0;
  let precioBruto = 0;
  
  if (preciosConIvaGlobal) {
    // IVA Incluido: El precioBase ya incluye impuestos
    precioBruto = precioBase;
    precioNeto = precioBase / (1 + pct);
  } else {
    // IVA Excluido: El precioBase es neto, el IVA se le adiciona
    precioNeto = precioBase;
    precioBruto = precioBase * (1 + pct);
  }
  
  const subtotalNeto = precioNeto * cantidad;
  const subtotalBruto = precioBruto * cantidad;
  const ivaTotal = subtotalBruto - subtotalNeto;
  const ivaUnitario = precioBruto - precioNeto;
  
  return {
    precioNeto,
    precioBruto,
    ivaUnitario,
    ivaTotal,
    subtotalNeto,
    subtotalBruto
  };
}

export interface TotalesCalculados {
  subtotalNeto: number;     // Suma de los precios antes de impuestos (netos)
  ivaTotal: number;         // Suma de todos los impuestos (IVA)
  total: number;            // Suma final a pagar (bruto)
  desgloseIva: { [porcentaje: number]: number }; // Desglose de impuestos por tasa
}

/**
 * Calcula los totales consolidados para un listado de items de comanda.
 * Realiza el cálculo item por item, soportando diferentes tasas de IVA y desglose final.
 */
export function calcularTotalesComanda(
  comandaItems: ComandaItem[],
  menuItems: MenuItem[],
  tasaSistema: number,
  preciosConIvaGlobal: boolean
): TotalesCalculados {
  let subtotalNeto = 0;
  let ivaTotal = 0;
  let total = 0;
  const desgloseIva: { [porcentaje: number]: number } = {};
  
  // Crear un mapa rápido de MenuItem para buscar en O(1)
  const menuMap = new Map<string, MenuItem>();
  menuItems.forEach(item => menuMap.set(item.id, item));
  
  comandaItems.forEach(item => {
    // 1. Obtener el MenuItem de referencia para conocer sus impuestos
    const menuItem = menuMap.get(item.item_id);
    
    // 2. Obtener el IVA del producto
    const pctIva = obtenerIvaProducto(menuItem, tasaSistema);
    
    // 3. Calcular montos para este item
    // Nota: Usamos item.precio que es el precio al que se registró en la comanda
    const calculo = calcularPreciosItem(item.precio, item.cantidad, pctIva, preciosConIvaGlobal);
    
    subtotalNeto += calculo.subtotalNeto;
    ivaTotal += calculo.ivaTotal;
    total += calculo.subtotalBruto;
    
    // 4. Acumular desglose de IVA por tasa
    if (pctIva > 0) {
      desgloseIva[pctIva] = (desgloseIva[pctIva] || 0) + calculo.ivaTotal;
    } else {
      desgloseIva[0] = (desgloseIva[0] || 0) + 0;
    }
  });
  
  return {
    subtotalNeto,
    ivaTotal,
    total,
    desgloseIva
  };
}

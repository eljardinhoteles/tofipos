// Importación masiva de productos de menú vía CSV.
// Columnas esperadas (encabezado, insensible a mayúsculas/acentos):
// nombre, precio, categoria, descripcion, es_bebida, activo, iva_modalidad, iva_porcentaje

export interface MenuCsvRow {
  rowNumber: number; // línea del archivo (1 = primera fila de datos, sin contar encabezado)
  nombre: string;
  precio: number;
  categoria: string;
  descripcion?: string;
  es_bebida: boolean;
  activo: boolean;
  iva_modalidad: 'sistema' | 'especifico' | 'exento';
  iva_porcentaje?: number;
  errors: string[];
}

const REQUIRED_HEADERS = ['nombre', 'precio', 'categoria'];

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // quita acentos
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  const v = value.trim().toLowerCase();
  return ['1', 'true', 'si', 'sí', 'yes', 'x'].includes(v);
}

// Parser CSV simple con soporte de comillas dobles y comas escapadas ("a, b")
function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { field += char; }
      continue;
    }

    if (char === '"') { inQuotes = true; }
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\r') { /* ignorar */ }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else { field += char; }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

export interface ParsedMenuCsv {
  rows: MenuCsvRow[];
  headerErrors: string[];
}

export function parseMenuCsv(text: string): ParsedMenuCsv {
  const lines = parseCsvLines(text);
  if (lines.length === 0) {
    return { rows: [], headerErrors: ['El archivo está vacío.'] };
  }

  const headerRaw = lines[0];
  const header = headerRaw.map(normalizeHeader);
  const missing = REQUIRED_HEADERS.filter(h => !header.includes(h));
  if (missing.length > 0) {
    return { rows: [], headerErrors: [`Faltan columnas requeridas: ${missing.join(', ')}`] };
  }

  const col = (name: string) => header.indexOf(name);
  const idxNombre = col('nombre');
  const idxPrecio = col('precio');
  const idxCategoria = col('categoria');
  const idxDescripcion = col('descripcion');
  const idxEsBebida = col('es_bebida');
  const idxActivo = col('activo');
  const idxIvaModalidad = col('iva_modalidad');
  const idxIvaPorcentaje = col('iva_porcentaje');

  const rows: MenuCsvRow[] = lines.slice(1).map((cells, i) => {
    const errors: string[] = [];

    const nombre = (cells[idxNombre] || '').trim();
    if (!nombre) errors.push('Nombre vacío');

    const precioRaw = (cells[idxPrecio] || '').trim().replace(',', '.');
    const precio = Number(precioRaw);
    if (!precioRaw || Number.isNaN(precio)) errors.push('Precio inválido');
    else if (precio < 0) errors.push('Precio negativo');

    const categoria = (cells[idxCategoria] || '').trim();
    if (!categoria) errors.push('Categoría vacía');

    const descripcion = idxDescripcion >= 0 ? (cells[idxDescripcion] || '').trim() : undefined;
    const es_bebida = parseBoolean(idxEsBebida >= 0 ? cells[idxEsBebida] : undefined, false);
    const activo = parseBoolean(idxActivo >= 0 ? cells[idxActivo] : undefined, true);

    let iva_modalidad: MenuCsvRow['iva_modalidad'] = 'sistema';
    const iva_modalidad_raw = idxIvaModalidad >= 0 ? (cells[idxIvaModalidad] || '').trim().toLowerCase() : '';
    if (iva_modalidad_raw === 'especifico' || iva_modalidad_raw === 'específico') iva_modalidad = 'especifico';
    else if (iva_modalidad_raw === 'exento') iva_modalidad = 'exento';
    else if (iva_modalidad_raw && iva_modalidad_raw !== 'sistema') errors.push(`iva_modalidad desconocido: "${iva_modalidad_raw}"`);

    let iva_porcentaje: number | undefined;
    if (idxIvaPorcentaje >= 0 && (cells[idxIvaPorcentaje] || '').trim() !== '') {
      const raw = (cells[idxIvaPorcentaje] || '').trim().replace(',', '.');
      const n = Number(raw);
      if (Number.isNaN(n)) errors.push('iva_porcentaje inválido');
      else iva_porcentaje = n;
    }
    if (iva_modalidad === 'especifico' && iva_porcentaje === undefined) {
      errors.push('iva_modalidad "especifico" requiere iva_porcentaje');
    }

    return {
      rowNumber: i + 1,
      nombre,
      precio: Number.isNaN(precio) ? 0 : precio,
      categoria,
      descripcion: descripcion || undefined,
      es_bebida,
      activo,
      iva_modalidad,
      iva_porcentaje,
      errors,
    };
  });

  return { rows, headerErrors: [] };
}

export const MENU_CSV_TEMPLATE =
  'nombre,precio,categoria,descripcion,es_bebida,activo,iva_modalidad,iva_porcentaje\n' +
  'Hamburguesa Clásica,8.50,Platos Fuertes,Con papas fritas,false,true,sistema,\n' +
  'Limonada Natural,3.00,Bebidas,,true,true,sistema,\n';

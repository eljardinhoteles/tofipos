// Cómo se muestra y se busca el documento de un cliente en los selectores, para
// poder distinguir a dos personas con el mismo nombre ("Cédula 0912345678").
// El documento puede estar en `dni` (datos del cliente) o en `numero_doc` (datos
// de facturación, con su tipo): se prefiere el de facturación, que trae el tipo.

type ClienteDoc = {
  dni?: string | null
  tipo_doc?: string | null
  numero_doc?: string | null
  tipo_cliente?: string | null
  telefono?: string | null
  email?: string | null
}

const ETIQUETA_TIPO: Record<string, string> = { cedula: 'Cédula', ruc: 'RUC', pasaporte: 'Pasaporte', otro: 'Documento' }

/** "Cédula 0912345678", "Pasaporte AB123", o null si no tiene ningún documento. */
export function documentoCliente(c: ClienteDoc): string | null {
  const numeroDoc = c.numero_doc?.trim()
  if (numeroDoc) return `${ETIQUETA_TIPO[c.tipo_doc ?? ''] ?? 'Documento'} ${numeroDoc}`
  const dni = c.dni?.trim()
  if (dni) return `${c.tipo_cliente === 'extranjero' ? 'Pasaporte' : 'Cédula'} ${dni}`
  return null
}

/** Segunda línea del selector: el documento y, si no hay, un dato de contacto. */
export function detalleCliente(c: ClienteDoc): string {
  return documentoCliente(c) ?? (c.telefono?.trim() || c.email?.trim() || 'Sin documento')
}

/** ¿El cliente coincide con lo escrito? Busca por nombre y por cualquiera de sus documentos. */
export function clienteCoincide(c: ClienteDoc & { nombre?: string | null }, termino: string): boolean {
  const t = termino.trim().toLowerCase()
  if (!t) return false
  return [c.nombre, c.dni, c.numero_doc].some(v => !!v && v.toLowerCase().includes(t))
}

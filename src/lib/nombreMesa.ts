/** "Mesa 1" se queda como está; "1" pasa a "Mesa 1". Evita el "Mesa Mesa 1" al anteponer la palabra a un nombre que ya la trae. */
export function nombreMesaCompleto(nombre: string): string {
  const n = (nombre || '').trim();
  return /^mesa\b/i.test(n) ? n : `Mesa ${n}`;
}

/** Corrige referencias ya guardadas con la palabra repetida ("Mesa Mesa 1 · #101" → "Mesa 1 · #101"). */
export function limpiarReferencia(referencia: string | null | undefined): string {
  return (referencia || '').replace(/^(\s*mesa)\s+mesa\b/i, '$1');
}

const TIPOS = /^(image\/|application\/pdf$)/;

const extension = (tipo: string) => (tipo === 'application/pdf' ? 'pdf' : tipo.split('/')[1]?.replace('jpeg', 'jpg') || 'png');

/** El pegado a un `File` con nombre (las capturas llegan sin nombre). */
function comoArchivo(blob: Blob): File {
  if (blob instanceof File && blob.name) return blob;
  return new File([blob], `comprobante-${Date.now()}.${extension(blob.type)}`, { type: blob.type });
}

/** Imagen o PDF de un evento de pegado (Ctrl+V), o null si no trae ninguno. */
export function archivoDeEventoPegado(e: { clipboardData: DataTransfer | null }): File | null {
  const f = Array.from(e.clipboardData?.files ?? []).find((x) => TIPOS.test(x.type));
  return f ? comoArchivo(f) : null;
}

/** Lee el portapapeles con el botón «Pegar». Lanza si no hay permiso o no hay imagen/PDF copiado. */
export async function archivoDePortapapeles(): Promise<File> {
  if (!navigator.clipboard?.read) throw new Error('Este navegador no permite pegar con el botón. Usa Ctrl+V.');
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const tipo = item.types.find((t) => TIPOS.test(t));
    if (tipo) return comoArchivo(await item.getType(tipo));
  }
  throw new Error('No hay ninguna imagen ni PDF copiado.');
}

import { supabase } from './supabase';
import {
  guardarComprobanteOffline,
  obtenerComprobanteOffline,
  eliminarComprobanteOffline,
  listarComprobantesPendientes,
} from './offlineStorage';
import { initVerticalRxDb } from '../db/rxdb';
import { comprimirImagenComprobante } from './imageCompressor';

// Cache en memoria para URLs de ObjectURL locales (offline-file://)
const localUrlCache = new Map<string, string>();

/**
 * Obtener la Presigned URL de R2 desde la Edge Function de Supabase.
 */
async function obtenerPresignedR2Url(file: File, organizationId: string, registroId: string) {
  const workerUrl = import.meta.env.VITE_R2_WORKER_URL;

  // Opción 1: Si hay un Cloudflare Worker configurado directamente en el entorno frontend
  if (workerUrl) {
    const res = await fetch(`${workerUrl.replace(/\/$/, '')}/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        organizationId,
        registroId,
      }),
    });
    if (!res.ok) {
      throw new Error(`Cloudflare Worker error (${res.status})`);
    }
    return (await res.json()) as { uploadUrl: string; publicUrl: string; key: string };
  }

  // Opción 2: Fallback a Supabase Edge Function
  const { data, error } = await supabase.functions.invoke('r2-upload-url', {
    body: {
      fileName: file.name,
      fileType: file.type,
      organizationId,
      registroId,
    },
  });

  if (error) {
    if (error.context) {
      try {
        const bodyText = await error.context.text();
        console.error('Detalle error Edge Function R2:', bodyText);
      } catch {}
    }
    throw new Error(error.message || 'Error al obtener Presigned URL de R2');
  }

  if (!data?.uploadUrl) {
    throw new Error('La respuesta de R2 no incluyó uploadUrl');
  }

  return data as { uploadUrl: string; publicUrl: string; key: string };
}

/**
 * Sube un archivo directamente a Cloudflare R2 vía la Presigned URL firmada.
 */
async function subirDirectoAR2(file: File, uploadUrl: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!res.ok) {
    throw new Error(`Error en Cloudflare R2 upload (HTTP ${res.status})`);
  }
}

/**
 * Sube un comprobante/documento:
 * 1. Intenta subida directa a Cloudflare R2 si hay internet.
 * 2. Si está offline o falla la red/Edge Function, guarda en IndexedDB local
 *    y devuelve una URI sintética `offline-file://<id>` para sincronizar después.
 */
export async function subirComprobante(rawFile: File, organizationId: string, registroId: string): Promise<string> {
  const file = await comprimirImagenComprobante(rawFile);

  if (navigator.onLine) {
    try {
      const { uploadUrl, publicUrl } = await obtenerPresignedR2Url(file, organizationId, registroId);
      await subirDirectoAR2(file, uploadUrl);
      return publicUrl;
    } catch (e) {
      console.warn('Subida directa R2 falló/no configurada, guardando en cola offline:', e);
    }
  }

  // Fallback Offline-First
  const { localUrl } = await guardarComprobanteOffline(file, organizationId, registroId);
  return localUrl;
}

/**
 * Elimina físicamente un comprobante de Cloudflare R2 o de IndexedDB si estaba offline.
 */
export async function eliminarComprobante(url: string | null | undefined): Promise<void> {
  if (!url) return;

  // 1. Si es un archivo guardado localmente (Offline)
  if (url.startsWith('offline-file://')) {
    const id = url.replace('offline-file://', '');
    await eliminarComprobanteOffline(id);
    if (localUrlCache.has(id)) {
      URL.revokeObjectURL(localUrlCache.get(id)!);
      localUrlCache.delete(id);
    }
    return;
  }

  // 2. Si es un archivo en Cloudflare R2 servido por el Worker o CDN
  const workerUrl = import.meta.env.VITE_R2_WORKER_URL;
  if (workerUrl && (url.startsWith('http://') || url.startsWith('https://'))) {
    try {
      // Extraer la ruta de la clave (key) desde la URL
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      if (pathname.includes('/file/')) {
        const key = pathname.substring(pathname.indexOf('/file/') + 6);
        const res = await fetch(`${workerUrl.replace(/\/$/, '')}/delete/${key}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          console.warn(`No se pudo eliminar el archivo en R2 (HTTP ${res.status})`);
        }
      }
    } catch (e) {
      console.warn('Error intentando eliminar comprobante en R2:', e);
    }
  }
}

/**
 * Convierte cualquier URL de comprobante a una URL navegable/renderizable:
 * - `https://...` (Cloudflare R2 / CDN): se retorna tal cual.
 * - `offline-file://<id>`: genera o recupera un blob ObjectURL desde IndexedDB.
 * - `localstorage://...` (legacy): lee de localStorage para compatibilidad previa.
 */
export async function resolverComprobanteUrlAsync(url: string): Promise<string> {
  if (!url) return '';
  if (url.startsWith('https://') || url.startsWith('http://')) return url;

  if (url.startsWith('offline-file://')) {
    const id = url.replace('offline-file://', '');
    if (localUrlCache.has(id)) {
      return localUrlCache.get(id)!;
    }
    const blob = await obtenerComprobanteOffline(id);
    if (blob) {
      const objectUrl = URL.createObjectURL(blob);
      localUrlCache.set(id, objectUrl);
      return objectUrl;
    }
    return '';
  }

  if (url.startsWith('localstorage://')) {
    const key = url.slice('localstorage://'.length);
    return localStorage.getItem(key) ?? '';
  }

  return url;
}

/**
 * Limpia todas las URLs de objetos creadas localmente para liberar memoria.
 */
export function limpiarCacheComprobantes() {
  localUrlCache.forEach((url) => {
    URL.revokeObjectURL(url);
  });
  localUrlCache.clear();
}

/**
 * Versión síncrona para compatibilidad rápida de renderizado de componentes.
 */
export function resolverComprobanteUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('https://') || url.startsWith('http://')) return url;

  if (url.startsWith('offline-file://')) {
    const id = url.replace('offline-file://', '');
    return localUrlCache.get(id) || '';
  }

  if (url.startsWith('localstorage://')) {
    const key = url.slice('localstorage://'.length);
    return localStorage.getItem(key) ?? '';
  }

  return url;
}

/**
 * Sincroniza en background los comprobantes pendientes de IndexedDB hacia Cloudflare R2
 * cuando la conexión a internet es restaurada.
 */
export async function sincronizarComprobantesPendientesR2(): Promise<{ procesados: number; fallidos: number }> {
  if (!navigator.onLine) return { procesados: 0, fallidos: 0 };

  const pendientes = await listarComprobantesPendientes();
  if (pendientes.length === 0) return { procesados: 0, fallidos: 0 };

  let procesados = 0;
  let fallidos = 0;

  for (const item of pendientes) {
    try {
      const file = new File([item.blob], item.fileName, { type: item.fileType });
      const { uploadUrl, publicUrl } = await obtenerPresignedR2Url(file, item.organizationId, item.registroId);
      await subirDirectoAR2(file, uploadUrl);

      // Actualizar la URL del comprobante en la venta / movimiento de RxDB
      try {
        const rxDb = await initVerticalRxDb();
        const offlineUrlPattern = `offline-file://${item.id}`;
        
        // Buscar la venta correspondiente por registroId o consultar ventas que contengan la URL offline
        const ventaDoc = await rxDb.ventas.findOne(item.registroId).exec();
        if (ventaDoc) {
          const json = ventaDoc.toJSON();
          const nuevosMovimientos = (json.movimientos || []).map((m: any) => {
            if (m.comprobante_url === offlineUrlPattern) {
              return { ...m, comprobante_url: publicUrl };
            }
            return m;
          });
          await ventaDoc.patch({ movimientos: nuevosMovimientos });
        }
      } catch (dbErr) {
        console.warn('No se pudo actualizar el comprobante en RxDB:', dbErr);
      }

      await eliminarComprobanteOffline(item.id);
      if (localUrlCache.has(item.id)) {
        URL.revokeObjectURL(localUrlCache.get(item.id)!);
        localUrlCache.delete(item.id);
      }
      procesados++;
    } catch (err) {
      console.error(`Error al sincronizar comprobante ${item.id} a R2:`, err);
      fallidos++;
    }
  }

  return { procesados, fallidos };
}

// Listener automático para iniciar la sincronización al volver a estar online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    sincronizarComprobantesPendientesR2().catch((err) =>
      console.error('Error en sync automático de comprobantes:', err)
    );
  });
}

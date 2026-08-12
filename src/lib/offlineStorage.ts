import Dexie, { type Table } from 'dexie';

export interface PendingComprobante {
  id: string;
  organizationId: string;
  registroId: string;
  fileName: string;
  fileType: string;
  blob: Blob;
  createdAt: number;
  attempts: number;
}

class OfflineComprobanteDB extends Dexie {
  pending_comprobantes!: Table<PendingComprobante, string>;

  constructor() {
    super('pos_offline_comprobantes');
    this.version(1).stores({
      pending_comprobantes: 'id, organizationId, registroId, createdAt',
    });
  }
}

export const dbOfflineComprobantes = new OfflineComprobanteDB();

/**
 * Guarda un archivo binario localmente cuando el dispositivo está offline o no se pudo subir a R2.
 */
export async function guardarComprobanteOffline(
  file: File,
  organizationId: string,
  registroId: string
): Promise<{ id: string; localUrl: string }> {
  const id = `${organizationId}_${registroId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await dbOfflineComprobantes.pending_comprobantes.put({
    id,
    organizationId,
    registroId,
    fileName: file.name,
    fileType: file.type,
    blob: file,
    createdAt: Date.now(),
    attempts: 0,
  });
  return { id, localUrl: `offline-file://${id}` };
}

/**
 * Obtiene el Blob de un comprobante almacenado localmente en IndexedDB.
 */
export async function obtenerComprobanteOffline(id: string): Promise<Blob | null> {
  const record = await dbOfflineComprobantes.pending_comprobantes.get(id);
  return record ? record.blob : null;
}

/**
 * Elimina un comprobante local de IndexedDB una vez sincronizado a R2.
 */
export async function eliminarComprobanteOffline(id: string): Promise<void> {
  await dbOfflineComprobantes.pending_comprobantes.delete(id);
}

/**
 * Lista todos los comprobantes pendientes de subir a R2.
 */
export async function listarComprobantesPendientes(): Promise<PendingComprobante[]> {
  return await dbOfflineComprobantes.pending_comprobantes.toArray();
}

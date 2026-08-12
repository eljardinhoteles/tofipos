import {
  ArrowsClockwise,
  WifiHigh,
  WifiSlash,
  CheckCircle,
  WarningCircle,
  XCircle,
  Database,
} from '@phosphor-icons/react';
import type { SyncStatus } from '../../db/rxdb';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const COLLECTION_LABELS: Record<string, string> = {
  mesas: 'Mesas',
  comandas: 'Comandas',
  items: 'Items',
  pisos: 'Pisos',
  clientes: 'Clientes',
  categorias: 'Categorías',
  habitacionCuentas: 'Habitaciones',
  reservas: 'Reservas',
  pagos: 'Pagos',
  ajustesIva: 'Ajustes IVA',
  usuarios: 'Usuarios',
  menuItems: 'Productos',
};

export function SyncStatusModal({ opened, onClose, status, onForceSync, syncing }: {
  opened: boolean;
  onClose: () => void;
  status: SyncStatus;
  onForceSync: () => void;
  syncing: boolean;
}) {
  const overallOk = status.online && status.supabaseOk && !status.hasError;
  const collectionEntries = Object.entries(status.collections);

  return (
    <Dialog open={opened} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm gap-4">
        <DialogHeader>
          <DialogTitle>Estado de Sincronización</DialogTitle>
          <DialogDescription className="sr-only">
            Estado de la conexión y sincronización de datos con Supabase
          </DialogDescription>
        </DialogHeader>

        {/* Estado General */}
        <div className={cn(
          "p-3 rounded-xl border flex items-center gap-3",
          overallOk
            ? "bg-emerald-50/60 border-emerald-200 text-emerald-900"
            : !status.online
              ? "bg-amber-50/60 border-amber-200 text-amber-900"
              : "bg-red-50/60 border-red-200 text-red-900"
        )}>
          {!status.online ? (
            <WifiSlash size={20} className="text-amber-600 shrink-0" />
          ) : status.hasError ? (
            <XCircle size={20} className="text-red-600 shrink-0" />
          ) : status.supabaseOk ? (
            <CheckCircle size={20} className="text-emerald-600 shrink-0" />
          ) : (
            <WarningCircle size={20} className="text-amber-600 shrink-0" />
          )}

          <div className="flex flex-col gap-0.5">
            <span className="font-extrabold text-xs">
              {!status.online
                ? 'Sin conexión'
                : status.hasError
                  ? `Error en ${status.errorCollections.length} colección(es)`
                  : status.supabaseOk === null
                    ? 'Verificando...'
                    : 'Sincronización activa'}
            </span>
            <span className="text-[11px] opacity-80">
              {!status.online
                ? 'El dispositivo no tiene internet'
                : status.supabaseOk === null
                  ? 'Verificando conexión...'
                  : status.supabaseOk
                    ? 'Supabase conectado y accesible'
                    : 'No se puede alcanzar Supabase'}
            </span>
          </div>
        </div>

        {/* Status Rows */}
        <div className="flex flex-col gap-2 text-xs font-semibold">
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              {status.online ? <WifiHigh size={16} /> : <WifiSlash size={16} />}
              <span>Red</span>
            </div>
            <span className={cn(
              "px-2 py-0.5 rounded-md text-[10px] font-bold",
              status.online ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            )}>
              {status.online ? 'Online' : 'Offline'}
            </span>
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Database size={16} />
              <span>Supabase</span>
            </div>
            <span className={cn(
              "px-2 py-0.5 rounded-md text-[10px] font-bold",
              status.supabaseOk === null
                ? "bg-muted text-muted-foreground"
                : status.supabaseOk
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
            )}>
              {status.supabaseOk === null ? 'Verificando' : status.supabaseOk ? 'OK' : 'Error'}
            </span>
          </div>
        </div>

        {/* Colecciones */}
        {collectionEntries.length > 0 && (
          <div className="flex flex-col gap-2 pt-2 border-t border-border">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Colecciones</span>
            <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-1">
              {collectionEntries.map(([key, col]) => (
                <div key={key} className={cn(
                  "flex items-center justify-between py-1 px-2 rounded-lg text-xs",
                  col.error && "bg-red-50 text-red-900"
                )}>
                  <div className="flex items-center gap-1.5">
                    {col.error ? (
                      <XCircle size={14} className="text-red-600" />
                    ) : col.stopped ? (
                      <WarningCircle size={14} className="text-amber-600" />
                    ) : (
                      <CheckCircle size={14} className="text-emerald-600" />
                    )}
                    <span className="font-semibold text-foreground">{COLLECTION_LABELS[key] || key}</span>
                  </div>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-md text-[10px] font-bold",
                    col.error ? "bg-red-100 text-red-700" : col.stopped ? "bg-amber-100 text-amber-700" : col.active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                  )}>
                    {col.error ? 'Error' : col.stopped ? 'Detenido' : col.active ? 'Activo' : 'En espera'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            disabled={!status.online || syncing}
            onClick={onForceSync}
            className="gap-1.5"
          >
            <ArrowsClockwise size={14} className={syncing ? 'animate-spin' : ''} />
            Forzar Resync
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

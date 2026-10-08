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
import { appVersionLabel, appBuildDateLabel } from '@/lib/appVersion';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerHandle,
} from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/useIsMobile';

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
  const isMobile = useIsMobile();

  const pendientes = status.activePushQueue;
  const todoOk = overallOk && pendientes === 0;

  const titulo = !status.online
    ? 'Sin conexión'
    : status.hasError
      ? `Error en ${status.errorCollections.length} colección(es)`
      : pendientes > 0
        ? `${pendientes} pendiente${pendientes === 1 ? '' : 's'} de envío`
        : status.supabaseOk === null
          ? 'Verificando...'
          : status.supabaseOk
            ? 'Todo sincronizado'
            : 'Sin acceso a Supabase';
  const subtitulo = !status.online
    ? 'Los cambios se guardan en el equipo y se enviarán al volver internet'
    : pendientes > 0 || status.hasError
      ? 'Revisa el detalle abajo o fuerza un resync'
      : 'Los datos están al día con Supabase';

  const filaEstado = (ok: boolean | null, okLabel: string, badLabel: string) => (
    <span className={cn(
      "px-2.5 py-1 rounded-full text-[11px] font-bold",
      ok === null ? "bg-muted text-muted-foreground" : ok ? "bg-muted text-muted-foreground" : "bg-destructive/15 text-destructive"
    )}>
      {ok === null ? 'Verificando' : ok ? okLabel : badLabel}
    </span>
  );

  const estadoGeneral = (
    <>
      {/* Estado general: franja compacta tintada, integrada con las tarjetas de abajo */}
      <div className={cn(
        "rounded-2xl border px-3.5 py-2.5 flex items-center gap-3",
        todoOk
          ? "bg-muted border-border text-muted-foreground"
          : "bg-destructive/10 border-destructive/25 text-destructive"
      )}>
        <span className={cn(
          "shrink-0",
          todoOk ? "text-primary" : "text-destructive"
        )}>
          {!status.online ? <WifiSlash size={20} weight="bold" />
            : status.hasError ? <XCircle size={20} weight="bold" />
            : todoOk ? <CheckCircle size={20} weight="bold" />
            : <WarningCircle size={20} weight="bold" />}
        </span>
        <div className="flex flex-col min-w-0">
          <span className="font-extrabold text-sm leading-tight">{titulo}</span>
          <span className="text-[11px] opacity-75 leading-snug">{subtitulo}</span>
        </div>
      </div>
    </>
  );

  const cuerpo = (
    <>
      {/* Conexión */}
      <div className="flex flex-col gap-1.5">
        <span className="px-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Conexión</span>
        <div className="rounded-2xl bg-muted/50 divide-y divide-border/60">
          <div className="flex items-center justify-between px-3.5 py-3">
            <div className="flex items-center gap-2.5 text-sm font-semibold">
              {status.online ? <WifiHigh size={18} className="text-muted-foreground" /> : <WifiSlash size={18} className="text-muted-foreground" />}
              Red
            </div>
            {filaEstado(status.online, 'Online', 'Offline')}
          </div>
          <div className="flex items-center justify-between px-3.5 py-3">
            <div className="flex items-center gap-2.5 text-sm font-semibold">
              <Database size={18} className="text-muted-foreground" />
              Supabase
            </div>
            {filaEstado(status.supabaseOk, 'OK', 'Error')}
          </div>
          <div className="flex items-center justify-between px-3.5 py-3">
            <div className="flex items-center gap-2.5 text-sm font-semibold">
              <ArrowsClockwise size={18} className="text-muted-foreground" />
              Pendientes de envío
            </div>
            <span className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-bold tabular-nums",
              pendientes > 0 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
            )}>
              {pendientes}
            </span>
          </div>
        </div>
      </div>

      {/* Colecciones */}
      {collectionEntries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Colecciones</span>
          <div className="rounded-2xl bg-muted/50 grid grid-cols-1 sm:grid-cols-2 sm:gap-x-px">
            {collectionEntries.map(([key, col]) => (
              <div key={key} className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    col.error ? "bg-destructive" : col.stopped ? "bg-warning-foreground" : col.active ? "bg-primary" : "bg-muted-foreground/40"
                  )} />
                  <span className="text-sm font-semibold text-foreground truncate">{COLLECTION_LABELS[key] || key}</span>
                </div>
                <span className={cn(
                  "text-[11px] font-bold",
                  col.error ? "text-destructive" : col.stopped ? "text-warning-foreground" : col.active ? "text-primary" : "text-muted-foreground"
                )}>
                  {col.error ? 'Error' : col.stopped ? 'Detenido' : col.active ? 'Activo' : 'En espera'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Versión del sistema: comparar entre dispositivos para saber que todos
          tienen la última actualización. */}
      <div className="flex flex-col items-center gap-0.5 pt-1 text-center">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          Versión {appVersionLabel()}
        </span>
        <span className="text-[10px] text-muted-foreground">Compilado: {appBuildDateLabel()}</span>
      </div>
    </>
  );

  const acciones = (
    <>
      <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">
        Cerrar
      </Button>
      <Button
        disabled={!status.online || syncing}
        onClick={onForceSync}
        className="gap-1.5 flex-1 sm:flex-none"
      >
        <ArrowsClockwise size={14} className={syncing ? 'animate-spin' : ''} />
        Forzar Resync
      </Button>
    </>
  );

  // Móvil: panel que sube desde abajo y se cierra arrastrando la manija hacia
  // abajo (vaul, igual que el resto de paneles); escritorio: diálogo.
  if (isMobile) {
    return (
      <Drawer open={opened} onOpenChange={(open) => { if (!open) onClose(); }} dismissible handleOnly>
        <DrawerPortal>
          <DrawerOverlay />
          <DrawerContent className="fixed bottom-0 left-0 right-0 h-[95dvh] max-h-[95dvh] bg-card rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.25)] z-50 flex flex-col overflow-hidden p-0 border-0 before:hidden">
            <DrawerHandle />
            <DrawerTitle className="sr-only">Estado de Sincronización</DrawerTitle>
            <DrawerDescription className="sr-only">
              Estado de la conexión y sincronización de datos con Supabase
            </DrawerDescription>
            <div className="px-4 pt-7 pb-3 shrink-0">{estadoGeneral}</div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
              {cuerpo}
            </div>
            <div className="flex flex-row gap-2 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] border-t border-border shrink-0">
              {acciones}
            </div>
          </DrawerContent>
        </DrawerPortal>
      </Drawer>
    );
  }

  return (
    <Dialog open={opened} onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* Alto acotado al viewport: cabecera y pie fijos, solo el cuerpo hace scroll,
          así "Cerrar" y "Forzar Resync" siempre quedan a la vista. */}
      <DialogContent className="max-w-md max-h-[85dvh] gap-0 p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle>Estado de Sincronización</DialogTitle>
          <DialogDescription className="sr-only">
            Estado de la conexión y sincronización de datos con Supabase
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 pb-3 shrink-0">{estadoGeneral}</div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 flex flex-col gap-4">
          {cuerpo}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-card shrink-0">
          {acciones}
        </div>
      </DialogContent>
    </Dialog>
  );
}

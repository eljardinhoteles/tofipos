import { useState, useMemo, useEffect } from 'react';
import { X, Receipt, CreditCard, Plus, Check, PencilSimple, Trash, ListBullets } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { useHorizontalWheel } from '../../../../hooks/useHorizontalWheel';
import { type Mesa, type HabitacionCuenta } from '../../../../db/database';
import { initVerticalRxDb, updateRxHabitacionCuenta, updateRxMesa } from '../../../../db/rxdb';
import { TicketPreviewModal } from '../../../Common/TicketPreviewModal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUI } from '../../../../context/UIContext';
import { showToast } from '@/lib/toast';

// Id centinela de la subcuenta principal en el editor de nombres.
const PRINCIPAL_ID = '__principal__';

export function CuentaView({
  cuenta,
  selectedMesa,
  onClose,
  onCheckout,
  onOpenComanda,
}: {
  cuenta: HabitacionCuenta;
  selectedMesa: Mesa;
  onClose: () => void;
  onCheckout: (data: any) => void;
  onOpenComanda?: (comandaId: string) => void;
}) {
  const { openPrompt } = useUI();
  const wheelRef = useHorizontalWheel();
  const roomType = selectedMesa.nombre.match(/\(([^)]+)\)/)?.[1] || selectedMesa.piso || 'Sin tipo';
  const roomNum = selectedMesa.nombre.match(/Hab\.\s*(\d+)/)?.[1] || selectedMesa.nombre.replace(/\D/g, '') || selectedMesa.nombre;
  const [comandas, setComandas] = useState<any[]>([]);
  const [previewTicketText, setPreviewTicketText] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);
  // Filtro de subcuenta de la lista: 'todas', null (principal) o id de subcuenta.
  const [filtroSub, setFiltroSub] = useState<string | null>('todas');
  const [agregandoSub, setAgregandoSub] = useState(false);
  const [nuevaSub, setNuevaSub] = useState('');
  // Id de la subcuenta que se está renombrando (reusa el mismo editor que "agregar").
  const [renombrandoId, setRenombrandoId] = useState<string | null>(null);
  const subcuentas = cuenta.subcuentas ?? [];
  const nombrePrincipal = cuenta.principal_nombre?.trim() || 'Principal';
  const nombreSub = (id?: string | null) => subcuentas.find(s => s.id === id)?.nombre ?? (id ? undefined : nombrePrincipal);

  useEffect(() => {
    let alive = true;
    (async () => {
      const rxDb = await initVerticalRxDb();
      const docs = await rxDb.comandas.find({ selector: { habitacion_cuenta_id: cuenta.id, _deleted: { $ne: true } } }).exec();
      if (!alive) return;
      setComandas(docs.map((d: any) => d.toJSON()));
    })();
    return () => { alive = false; };
  }, [cuenta.id]);

  const opcionesSub = useMemo(() => [
    { id: 'todas' as string | null, nombre: 'Todas', cantidad: comandas.length },
    { id: null as string | null, nombre: nombrePrincipal, cantidad: comandas.filter(c => !c.habitacion_subcuenta_id).length },
    ...subcuentas.map(x => ({ id: x.id as string | null, nombre: x.nombre, cantidad: comandas.filter(c => c.habitacion_subcuenta_id === x.id).length })),
  ], [comandas, subcuentas, nombrePrincipal]);

  const comandasVisibles = useMemo(
    () => filtroSub === 'todas' ? comandas : comandas.filter(c => (c.habitacion_subcuenta_id ?? null) === filtroSub),
    [comandas, filtroSub]
  );

  const totalConIva = useMemo(() => {
    return comandasVisibles.reduce((acc, c) => acc + (c.total || 0), 0);
  }, [comandasVisibles]);

  const cerrarEditorSub = () => { setAgregandoSub(false); setRenombrandoId(null); setNuevaSub(''); };

  const handleGuardarSub = async () => {
    const nombre = nuevaSub.trim();
    if (!nombre) return;
    const esPrincipal = renombrandoId === PRINCIPAL_ID;
    const otroPrincipal = esPrincipal ? '' : nombrePrincipal.toLowerCase();
    if (
      subcuentas.some(s => s.id !== renombrandoId && s.nombre.toLowerCase() === nombre.toLowerCase()) ||
      nombre.toLowerCase() === otroPrincipal ||
      (!esPrincipal && nombre.toLowerCase() === 'principal')
    ) {
      showToast.error('Ese nombre ya existe');
      return;
    }
    try {
      if (esPrincipal) {
        await updateRxHabitacionCuenta(cuenta.id, { principal_nombre: nombre === 'Principal' ? null : nombre });
        cerrarEditorSub();
        return;
      }
      const siguientes = renombrandoId
        ? subcuentas.map(s => s.id === renombrandoId ? { ...s, nombre } : s)
        : [...subcuentas, { id: crypto.randomUUID(), nombre }];
      await updateRxHabitacionCuenta(cuenta.id, { subcuentas: siguientes });
      cerrarEditorSub();
    } catch (e) {
      console.error(e);
      showToast.error(renombrandoId ? 'No se pudo renombrar la subcuenta' : 'No se pudo crear la subcuenta');
    }
  };

  // Solo se puede eliminar una subcuenta sin comandas cargadas, para no dejar
  // consumos apuntando a una subcuenta inexistente.
  const handleEliminarSub = async () => {
    if (!renombrandoId || renombrandoId === PRINCIPAL_ID) return;
    if (comandas.some(c => c.habitacion_subcuenta_id === renombrandoId)) {
      showToast.error('No se puede eliminar', 'Esta subcuenta ya tiene comandas cargadas.');
      return;
    }
    try {
      await updateRxHabitacionCuenta(cuenta.id, { subcuentas: subcuentas.filter(s => s.id !== renombrandoId) });
      if (filtroSub === renombrandoId) setFiltroSub('todas');
      cerrarEditorSub();
    } catch (e) {
      console.error(e);
      showToast.error('No se pudo eliminar la subcuenta');
    }
  };

  // Solo se permite anular una cuenta sin consumos cargados — con comandas
  // ya asociadas, el flujo correcto es el checkout normal (cobrar o marcar
  // a crédito), no una anulación silenciosa que dejaría consumos huérfanos.
  const puedeAnular = comandas.length === 0;

  const handleAnular = () => {
    if (!puedeAnular) {
      showToast.error('No se puede anular: esta cuenta ya tiene comandas cargadas.');
      return;
    }
    openPrompt({
      title: 'Anular cuenta de habitación',
      label: 'Motivo de anulación',
      placeholder: 'Ej. Check-in duplicado, error al abrir la cuenta...',
      required: true,
      onConfirm: async (motivo) => {
        setAnulando(true);
        try {
          await updateRxHabitacionCuenta(cuenta.id, {
            estado: 'cerrada',
            notas: [cuenta.notas, `Anulada: ${motivo}`].filter(Boolean).join(' · '),
          });
          await updateRxMesa(selectedMesa.id, { estado: 'libre' });
          showToast.success('Cuenta anulada');
          onClose();
        } catch (e) {
          console.error(e);
          showToast.error('No se pudo anular la cuenta');
        } finally {
          setAnulando(false);
        }
      },
    });
  };

  return (
    <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
      {/* Header — mismo lenguaje que SidebarDetails: badge circular con el
          número de la unidad, título + subtítulo, fondo temático en desktop. */}
      <header className="p-4 flex items-center justify-between shrink-0 shadow-xs bg-card text-foreground md:bg-sky-600 md:text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl font-black text-base flex items-center justify-center shrink-0 bg-sky-600 text-white md:bg-white/15">
            {roomNum}
          </div>
          <div className="flex flex-col">
            <h3 className="font-extrabold text-base leading-tight md:text-white">
              {cuenta.huesped}
            </h3>
            <span className="text-[10px] font-bold text-muted-foreground md:text-white/70">
              {roomType} · {selectedMesa.nombre}
            </span>
          </div>
        </div>

        <Button variant="ghost" size="icon-lg" onClick={onClose} className="rounded-xl text-muted-foreground md:text-white">
          <X size={18} weight="bold" />
        </Button>
      </header>

      {/* Subcuentas: p. ej. las 2 familias de una villa que llevan sus consumos por separado */}
      <div className="shrink-0 border-b border-border bg-muted px-3 py-2.5 flex flex-col gap-2">
        {agregandoSub || renombrandoId ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              placeholder="Nombre (ej: Familia Pérez)"
              value={nuevaSub}
              onChange={(e) => setNuevaSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleGuardarSub();
                if (e.key === 'Escape') cerrarEditorSub();
              }}
              className="h-11 text-base"
            />
            <Button size="icon" className="h-11 w-11 shrink-0 rounded-xl" onClick={handleGuardarSub} disabled={!nuevaSub.trim()} aria-label={renombrandoId ? 'Guardar nombre' : 'Crear subcuenta'}>
              <Check size={20} weight="bold" />
            </Button>
            {renombrandoId && renombrandoId !== PRINCIPAL_ID && !comandas.some(c => c.habitacion_subcuenta_id === renombrandoId) && (
              <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 rounded-xl text-destructive" onClick={handleEliminarSub} aria-label="Eliminar subcuenta">
                <Trash size={20} weight="bold" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 rounded-xl" onClick={cerrarEditorSub} aria-label="Cancelar">
              <X size={20} weight="bold" />
            </Button>
          </div>
        ) : (
          <div ref={wheelRef} className="flex gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] md:[scrollbar-width:thin] [&::-webkit-scrollbar]:hidden md:[&::-webkit-scrollbar]:block md:[&::-webkit-scrollbar]:h-1.5 md:[&::-webkit-scrollbar-thumb]:rounded-full md:[&::-webkit-scrollbar-thumb]:bg-border md:pb-1.5">
            {subcuentas.length > 0 && opcionesSub.map(o => {
              const activo = filtroSub === o.id;
              // "Todas": solo un ícono (círculo), como en las subcomandas de mesa.
              if (o.id === 'todas') {
                return (
                  <button
                    key="todas"
                    type="button"
                    onClick={() => setFiltroSub('todas')}
                    aria-label={`Ver todas las comandas (${o.cantidad})`}
                    className={cn(
                      'shrink-0 w-12 h-12 rounded-full border flex items-center justify-center cursor-pointer',
                      activo ? 'border-sky-600 bg-sky-600 text-white' : 'border-border bg-card'
                    )}
                  >
                    <ListBullets size={20} weight="bold" />
                  </button>
                );
              }
              return (
                <button
                  key={o.id ?? 'principal'}
                  type="button"
                  onClick={() => setFiltroSub(o.id)}
                  className={cn(
                    'shrink-0 min-w-[5.5rem] max-w-[10rem] h-12 rounded-full border px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors',
                    activo ? 'border-sky-600 bg-sky-600 text-white' : 'border-border bg-card'
                  )}
                >
                  <span className="w-full text-xs font-extrabold leading-tight truncate">{o.nombre}</span>
                  <span className={cn('text-[10px] font-medium leading-tight', activo ? 'text-white/80' : 'text-muted-foreground')}>
                    {o.cantidad} {o.cantidad === 1 ? 'comanda' : 'comandas'}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setAgregandoSub(true)}
              aria-label="Agregar subcuenta"
              className={cn(
                'shrink-0 h-12 rounded-full border border-dashed border-border bg-transparent text-muted-foreground flex items-center justify-center gap-1.5 cursor-pointer active:scale-95',
                subcuentas.length > 0 ? 'w-12' : 'px-4 text-sm font-bold'
              )}
            >
              <Plus size={subcuentas.length > 0 ? 18 : 16} weight="bold" />
              {subcuentas.length === 0 && 'Subcuenta'}
            </button>
          </div>
        )}
      </div>

      {/* Lista de comandas cargadas — mismo patrón zebra + badge que ComandaItemRow */}
      <main className="flex-1 overflow-y-auto">
        {comandasVisibles.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
            <Receipt size={48} className="text-muted-foreground/40" />
            <span className="font-bold text-xs text-foreground">Sin consumos aún</span>
            <span className="text-[11px] text-muted-foreground">Las comandas cargadas a esta habitación aparecerán aquí.</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {comandasVisibles.map((c, index) => {
              const isOdd = index % 2 === 1;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpenComanda?.(c.id)}
                  disabled={!onOpenComanda}
                  className={cn("w-full text-left flex items-center gap-3 px-4 py-3 focus:outline-none focus-visible:bg-primary/10 border-l-4 border-l-transparent",
                    // Sin transition-colors: con el sombreado intercalado, al cambiar
                    // el filtro el índice de la fila cambia y el fondo se animaba (flash).
                    isOdd && "bg-muted/70", onOpenComanda && "enabled:cursor-pointer enabled:hover:border-l-primary")}
                >
                  <div className="w-7 h-7 rounded-md font-bold text-xs flex items-center justify-center border shrink-0 bg-muted border-border text-foreground">
                    <Receipt size={14} />
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-foreground truncate">
                        Comanda #{c.folio}
                        {subcuentas.length > 0 && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 text-[10px] font-extrabold">
                            {nombreSub(c.habitacion_subcuenta_id) ?? nombrePrincipal}
                          </span>
                        )}
                      </span>
                      <span className="font-black text-sm text-foreground shrink-0">
                        ${c.total?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      {new Date(c.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })} · {new Date(c.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer y Acciones — mismo bloque de total y grid de botones que SidebarDetails */}
      <footer className="p-4 bg-card border-t border-border flex flex-col gap-3 shrink-0">
        <div className="flex flex-col gap-0.5 px-2 py-1">
          {filtroSub === 'todas' ? (
            <div className="flex items-center justify-between">
              <span className="text-base font-black text-foreground">Total Cuenta</span>
              <span className="text-xl font-black text-primary">${totalConIva.toFixed(2)}</span>
            </div>
          ) : (
            <>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Cuenta</span>
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-black text-foreground flex items-center gap-1 min-w-0">
                  <span className="truncate">{nombreSub(filtroSub) ?? nombrePrincipal}</span>
                  <button
                    type="button"
                    aria-label="Editar subcuenta"
                    onClick={() => { setRenombrandoId(filtroSub ?? PRINCIPAL_ID); setNuevaSub(nombreSub(filtroSub) ?? ''); }}
                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                  >
                    <PencilSimple size={16} weight="bold" />
                  </button>
                </span>
                <span className="text-xl font-black text-primary shrink-0">${totalConIva.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            className="w-full h-10 font-bold bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => onCheckout({ extras: [], incluidos: [], subcuentaId: filtroSub === 'todas' ? undefined : filtroSub })}
          >
            <CreditCard size={18} weight="bold" className="mr-1.5" /> Checkout
          </Button>
          <Button
            variant="ghost" className="w-full h-10 font-bold text-destructive"
            onClick={handleAnular}
            disabled={anulando || !puedeAnular}
            title={puedeAnular ? undefined : 'No se puede anular: esta cuenta ya tiene comandas cargadas'}
          >
            Anular
          </Button>
        </div>
      </footer>

      <TicketPreviewModal
        opened={previewTicketText !== null}
        onClose={() => setPreviewTicketText(null)}
        title="Precuenta de Habitación"
        content={previewTicketText || ''}
      />
    </div>
  );
}

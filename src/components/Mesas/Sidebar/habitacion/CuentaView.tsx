import { imprimirConAviso } from '../../../../lib/imprimir';
import { queueRawReceiptPrint } from '../../../../lib/printServerClient';
import { useState, useMemo, useEffect } from 'react';
import { folioLabel } from '../../../../lib/folio';
import { X, Receipt, CreditCard, Plus, Check, PencilSimple, Trash, ListBullets, WarningCircle, DotsThreeVertical, ArrowsLeftRight, ArrowUUpLeft } from '@phosphor-icons/react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useHorizontalWheel } from '../../../../hooks/useHorizontalWheel';
import { type Mesa, type HabitacionCuenta } from '../../../../db/database';
import { ReservaHeader } from '../ReservaHeader';
import { initVerticalRxDb, updateRxHabitacionCuenta, updateRxMesa, updateRxComanda, type RxComanda } from '../../../../db/rxdb';
import { isOperativeComanda } from '../../../../db/comandaState';
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
  const { openPrompt, openConfirm } = useUI();
  const wheelRef = useHorizontalWheel();
  const roomType = selectedMesa.nombre.match(/\(([^)]+)\)/)?.[1] || selectedMesa.piso || 'Sin tipo';
  const roomNum = selectedMesa.nombre.match(/Hab\.\s*(\d+)/)?.[1] || selectedMesa.nombre.replace(/\D/g, '') || selectedMesa.nombre;
  // Todas las comandas vinculadas a la habitación. Las abiertas desde una mesa y aún sin
  // cargar (sincronizado=false) se listan en gris: no suman ni se abren hasta cargarlas,
  // porque pueden terminar cargadas a otra habitación o pagadas por el cliente.
  const [comandasTodas, setComandasTodas] = useState<any[]>([]);
  const comandas = useMemo(() => comandasTodas.filter(c => c.sincronizado !== false), [comandasTodas]);
  const [previewTicketText, setPreviewTicketText] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);
  // Filtro de subcuenta de la lista: 'todas', null (principal) o id de subcuenta.
  const [filtroSub, setFiltroSub] = useState<string | null>('todas');
  const [agregandoSub, setAgregandoSub] = useState(false);
  const [nuevaSub, setNuevaSub] = useState('');
  // Id de la subcuenta que se está renombrando (reusa el mismo editor que "agregar").
  const [renombrandoId, setRenombrandoId] = useState<string | null>(null);
  const subcuentas = useMemo(() => cuenta.subcuentas ?? [], [cuenta.subcuentas]);
  // Comandas abiertas desde esta habitación que aún no se cargan: el checkout se bloquea
  // para que no queden huérfanas (hay que cargarlas a una habitación o cobrarlas antes).
  const sinCargarCount = useMemo(() => comandasTodas.filter(c => c.sincronizado === false).length, [comandasTodas]);
  const nombrePrincipal = cuenta.principal_nombre?.trim() || 'Principal';
  // Destinos al mover una comanda: la subcuenta principal y las demás, menos en la que ya está.
  const opcionesMover = (c: RxComanda): Array<{ id: string | null; nombre: string }> =>
    [{ id: null, nombre: nombrePrincipal }, ...subcuentas.map(x => ({ id: x.id as string | null, nombre: x.nombre }))]
      .filter(o => subcuentas.length > 0 && o.id !== (c.habitacion_subcuenta_id ?? null));
  const nombreSub = (id?: string | null) => subcuentas.find(s => s.id === id)?.nombre ?? (id ? undefined : nombrePrincipal);

  useEffect(() => {
    let alive = true;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      // Suscripción (no una lectura única): al mover una comanda de subcuenta o quitarla de la habitación, la lista se actualiza sola.
      sub = rxDb.comandas.find({ selector: { habitacion_cuenta_id: cuenta.id, _deleted: { $ne: true } } }).$.subscribe((docs) => {
        if (!alive) return;
        // Una mesa abierta desde la habitación y cobrada directo por el cliente ya no es de la cuenta.
        setComandasTodas(docs.map((d) => d.toJSON() as RxComanda).filter((c) =>
          c.estado !== 'anulada' && !(c.sincronizado === false && ['cerrado', 'facturado'].includes(c.estado))));
      });
    })();
    return () => { alive = false; sub?.unsubscribe(); };
  }, [cuenta.id]);

  // Solo se puede mover o quitar una comanda ya cargada y aún sin cobrar en un checkout.
  const sePuedeEditar = (c: RxComanda) => c.sincronizado !== false && !['cerrado', 'facturado', 'anulada'].includes(c.estado);

  const moverASubcuenta = async (c: RxComanda, destino: string | null) => {
    try {
      await updateRxComanda(c.id, { habitacion_subcuenta_id: destino });
      showToast.success('Comanda movida', `Comanda #${folioLabel(c)} → ${nombreSub(destino) ?? nombrePrincipal}`);
    } catch (e) {
      showToast.fallo('mover la comanda', e);
    }
  };

  // Un cargo a la habitación equivocada se deshace sacando la comanda de la cuenta: vuelve a quedar abierta en su mesa, lista para cargarla
  // a la habitación correcta o cobrarla. No se anula el consumo.
  const quitarDeHabitacion = async (c: RxComanda) => {
    try {
      const rxDb = await initVerticalRxDb();
      const enMesa = await rxDb.comandas.find({ selector: { mesa_id: c.mesa_id, _deleted: { $ne: true } } }).exec();
      if (enMesa.some((d) => d.id !== c.id && isOperativeComanda(d.toJSON()))) {
        showToast.warning('La mesa ya tiene otra cuenta abierta', `${c.mesa_nombre || 'La mesa'} está en uso: cierra esa cuenta antes de devolver esta comanda.`);
        return;
      }
      await updateRxComanda(c.id, { habitacion_cuenta_id: null, habitacion_subcuenta_id: null } as unknown as Partial<RxComanda>);
      try { await updateRxMesa(c.mesa_id, { estado: c.estado === 'cuenta' ? 'cuenta' : 'ocupada' }); } catch { /* la mesa ya no existe: la comanda queda igualmente fuera de la habitación */ }
      showToast.success('Comanda quitada de la habitación', `La comanda #${folioLabel(c)} volvió a ${c.mesa_nombre || 'su mesa'}.`);
    } catch (e) {
      showToast.fallo('quitar la comanda de la habitación', e);
    }
  };

  const opcionesSub = useMemo(() => [
    { id: 'todas' as string | null, nombre: 'Todas', cantidad: comandas.length },
    { id: null as string | null, nombre: nombrePrincipal, cantidad: comandas.filter(c => !c.habitacion_subcuenta_id).length },
    ...subcuentas.map(x => ({ id: x.id as string | null, nombre: x.nombre, cantidad: comandas.filter(c => c.habitacion_subcuenta_id === x.id).length })),
  ], [comandas, subcuentas, nombrePrincipal]);

  const comandasVisibles = useMemo(
    () => filtroSub === 'todas' ? comandasTodas : comandasTodas.filter(c => (c.habitacion_subcuenta_id ?? null) === filtroSub),
    [comandasTodas, filtroSub]
  );

  const totalConIva = useMemo(() => {
    return comandasVisibles.filter(c => c.sincronizado !== false).reduce((acc, c) => acc + (c.total || 0), 0);
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
      showToast.warning('Ya existe una subcuenta con ese nombre');
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
    if (comandasTodas.some(c => c.habitacion_subcuenta_id === renombrandoId)) {
      showToast.warning('No se puede eliminar la subcuenta', 'Ya tiene comandas cargadas.');
      return;
    }
    try {
      await updateRxHabitacionCuenta(cuenta.id, { subcuentas: subcuentas.filter(s => s.id !== renombrandoId) });
      if (filtroSub === renombrandoId) setFiltroSub('todas');
      cerrarEditorSub();
    } catch (e) {
      console.error(e);
      showToast.fallo('eliminar la subcuenta', e);
    }
  };

  // Solo se permite anular una cuenta sin consumos cargados — con comandas
  // ya asociadas, el flujo correcto es el checkout normal (cobrar o marcar
  // a crédito), no una anulación silenciosa que dejaría consumos huérfanos.
  const puedeAnular = comandasTodas.length === 0;

  const handleAnular = () => {
    if (!puedeAnular) {
      showToast.warning('No se puede anular la cuenta', 'Ya tiene comandas cargadas.');
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
          showToast.fallo('anular la cuenta', e);
        } finally {
          setAnulando(false);
        }
      },
    });
  };

  return (
    <div className="h-full w-full bg-card flex flex-col justify-between overflow-hidden shadow-xl">
      <ReservaHeader tono="info" badge={<span className="t-titulo">{roomNum}</span>} titulo={cuenta.huesped} tituloEsCliente
        subtitulo={`${roomType} · ${selectedMesa.nombre}`} onClose={onClose} />

      {/* Subcuentas: p. ej. las 2 familias de una villa que llevan sus consumos por separado */}
      <div className="shrink-0 border-b border-border bg-muted/40 px-3 py-2.5 flex flex-col gap-2">
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
            <Button size="icon" className="h-11 w-11 shrink-0 rounded-2xl" onClick={handleGuardarSub} disabled={!nuevaSub.trim()} aria-label={renombrandoId ? 'Guardar nombre' : 'Crear subcuenta'}>
              <Check size={20} weight="bold" />
            </Button>
            {renombrandoId && renombrandoId !== PRINCIPAL_ID && !comandasTodas.some(c => c.habitacion_subcuenta_id === renombrandoId) && (
              <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 rounded-2xl text-destructive" onClick={handleEliminarSub} aria-label="Eliminar subcuenta">
                <Trash size={20} weight="bold" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 rounded-2xl" onClick={cerrarEditorSub} aria-label="Cancelar">
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
                      activo ? 'border-info bg-info text-white' : 'border-transparent bg-card shadow-(--shadow-btn)'
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
                    activo ? 'border-info bg-info text-white' : 'border-transparent bg-card shadow-(--shadow-btn)'
                  )}
                >
                  <span className="w-full t-dato leading-tight truncate">{o.nombre}</span>
                  <span className={cn('t-meta leading-tight', activo ? 'text-white/70' : 'text-muted-foreground')}>
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
                subcuentas.length > 0 ? 'w-12' : 'px-4 t-cuerpo-fuerte'
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
          <div className="flex flex-col items-center justify-center gap-3 text-center px-8 py-16">
            <span className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
              <Receipt size={28} weight="bold" />
            </span>
            <span className="t-cuerpo-fuerte text-foreground">Sin consumos aún</span>
            <span className="t-meta text-muted-foreground max-w-[16rem]">Las comandas cargadas a esta habitación aparecerán aquí.</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {comandasVisibles.map((c, index) => {
              const isOdd = index % 2 === 1;
              const sinCargar = c.sincronizado === false;
              return (
                <div
                  key={c.id}
                  className={cn("flex items-stretch border-l-4 border-l-transparent",
                    // Sin transition-colors: con el sombreado intercalado, al cambiar el filtro el índice de la fila cambia y el fondo se animaba (flash).
                    isOdd && "bg-muted/40", sinCargar && "opacity-50 grayscale", onOpenComanda && !sinCargar && "hover:border-l-primary")}
                >
                <button
                  type="button"
                  onClick={() => onOpenComanda?.(c.id)}
                  disabled={!onOpenComanda || sinCargar}
                  title={sinCargar ? 'Mesa abierta desde esta habitación; aparecerá cuando se cargue' : undefined}
                  className="flex-1 min-w-0 text-left flex items-center gap-3 pl-4 pr-2 py-3 focus:outline-none focus-visible:bg-primary/10 enabled:cursor-pointer disabled:cursor-default"
                >
                  <div className="w-7 h-7 rounded-lg t-dato flex items-center justify-center border shrink-0 bg-muted border-border text-foreground">
                    <Receipt size={14} weight="bold" />
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="t-cuerpo-fuerte text-foreground truncate">
                        Comanda #{folioLabel(c)}
                        {subcuentas.length > 0 && (
                          <span className="ml-2 px-1.5 py-0.5 rounded-md bg-info/15 text-info-foreground dark:bg-info/40 dark:text-info-soft t-dato">
                            {nombreSub(c.habitacion_subcuenta_id) ?? nombrePrincipal}
                          </span>
                        )}
                      </span>
                      <span className="t-cuerpo-fuerte text-foreground shrink-0">
                        {sinCargar ? 'Sin cargar' : `$${c.total?.toFixed(2) || '0.00'}`}
                      </span>
                    </div>
                    <span className="t-meta text-muted-foreground">
                      {sinCargar && `${c.mesa_nombre || 'Mesa'} · `}{new Date(c.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })} · {new Date(c.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </button>
                {sePuedeEditar(c) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label={`Acciones de la comanda ${folioLabel(c)}`} title="Mover o quitar"
                        className="shrink-0 w-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer focus:outline-none focus-visible:bg-primary/10">
                        <DotsThreeVertical size={20} weight="bold" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {opcionesMover(c).map(o => (
                        <DropdownMenuItem key={o.id ?? 'principal'} onSelect={() => void moverASubcuenta(c, o.id)}>
                          <ArrowsLeftRight size={18} aria-hidden /> Mover a {o.nombre}
                        </DropdownMenuItem>
                      ))}
                      {opcionesMover(c).length > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem variant="destructive" onSelect={() => openConfirm('QUITAR DE ESTA HABITACIÓN', `La comanda #${folioLabel(c)} sale de esta cuenta y vuelve a quedar abierta en ${c.mesa_nombre || 'su mesa'}, para cargarla a la habitación correcta o cobrarla. El consumo no se anula.`, () => { void quitarDeHabitacion(c); })}>
                        <ArrowUUpLeft size={18} aria-hidden /> Quitar de esta habitación
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer y Acciones — mismo bloque de total y grid de botones que SidebarDetails */}
      <footer className="p-4 bg-muted/40 border-t border-border flex flex-col gap-3 shrink-0">
        <div className="flex flex-col gap-0.5 px-2 py-1">
          {filtroSub === 'todas' ? (
            <div className="flex items-center justify-between">
              <span className="t-titulo text-foreground">Total Cuenta</span>
              <span className="t-valor text-foreground">${totalConIva.toFixed(2)}</span>
            </div>
          ) : (
            <>
              <span className="t-etiqueta text-muted-foreground">Total Cuenta</span>
              <div className="flex items-center justify-between gap-3">
                <span className="t-titulo text-foreground flex items-center gap-1 min-w-0">
                  <span className="truncate">{nombreSub(filtroSub) ?? nombrePrincipal}</span>
                  <button
                    type="button"
                    aria-label="Editar subcuenta"
                    onClick={() => { setRenombrandoId(filtroSub ?? PRINCIPAL_ID); setNuevaSub(nombreSub(filtroSub) ?? ''); }}
                    className="shrink-0 size-8 pointer-coarse:size-11 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                  >
                    <PencilSimple size={16} weight="bold" />
                  </button>
                </span>
                <span className="t-valor text-foreground shrink-0">${totalConIva.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>

        {sinCargarCount > 0 && (
          <div className="flex items-start gap-2 rounded-2xl bg-warning-soft px-3 py-2.5 text-warning-foreground">
            <WarningCircle size={18} weight="fill" className="shrink-0 mt-px" />
            <p className="t-dato leading-snug">
              {sinCargarCount === 1 ? 'Hay 1 comanda' : `Hay ${sinCargarCount} comandas`} sin cargar. Cárgala{sinCargarCount === 1 ? '' : 's'} a una habitación o cóbrala{sinCargarCount === 1 ? '' : 's'} en su mesa para hacer el checkout.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="warning" className="w-full h-10 font-bold"
            disabled={sinCargarCount > 0}
            title={sinCargarCount > 0 ? `Hay ${sinCargarCount} ${sinCargarCount === 1 ? 'comanda abierta' : 'comandas abiertas'} desde esta habitación sin cargar` : undefined}
            onClick={() => onCheckout({ extras: [], incluidos: [], subcuentaId: filtroSub === 'todas' ? undefined : filtroSub })}
          >
            <CreditCard size={18} weight="bold" className="mr-1.5" /> Checkout
          </Button>
          <Button
            variant="dangerGhost" className="w-full h-10 font-bold"
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
        onPrint={() => {
          const texto = previewTicketText || '';
          void imprimirConAviso(() => queueRawReceiptPrint(texto, 'Precuenta de Habitación'), 'Pre-cuenta de habitación');
        }}
      />
    </div>
  );
}

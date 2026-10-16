import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, PencilSimple, Plus, Tag, Trash } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ReservaHeader } from '../../components/Mesas/Sidebar/ReservaHeader';
import { Campo, Fila, Grupo, Seccion, Vacio } from '../../components/Ajustes/AjustesUI';
import { showToast } from '@/lib/toast';
import {
  TONOS_ELEGIBLES, TONOS_ETIQUETA, crearEtiqueta, editarEtiqueta, eliminarEtiqueta, moverEtiqueta,
  productosDeEtiqueta, usePlanificacion, type EtiquetaPlan, type TonoEtiqueta,
} from '../../lib/planificacion';

interface FormProps {
  /** Etiqueta a editar; null = crear una nueva. */
  etiqueta: EtiquetaPlan | null;
  /** Color sugerido al crear (el siguiente que no se haya usado). */
  tonoInicial: TonoEtiqueta;
  onClose: () => void;
  onEliminar: (e: EtiquetaPlan) => void;
}

// Formulario de una etiqueta, en sidebar (igual que usuarios e IVA): nombre, color y, al editar, eliminar.
function FormEtiqueta({ etiqueta, tonoInicial, onClose, onEliminar }: FormProps) {
  const [nombre, setNombre] = useState(etiqueta?.nombre ?? '');
  const [tono, setTono] = useState<TonoEtiqueta>(etiqueta?.tono ?? tonoInicial);

  const guardar = () => {
    const r = etiqueta ? editarEtiqueta(etiqueta.id, { nombre, tono }) : crearEtiqueta(nombre, tono);
    if (!r.ok) { showToast.warning(r.motivo); return; }
    onClose();
  };

  return (
    <>
      <SheetHeader className="p-0 gap-0 space-y-0">
        <SheetTitle className="sr-only">{etiqueta ? 'Editar etiqueta' : 'Nueva etiqueta'}</SheetTitle>
        <SheetDescription className="sr-only">Nombre y color de la etiqueta del planificador</SheetDescription>
        <ReservaHeader tono="neutro" badge={<Tag size={20} weight="bold" />} titulo={etiqueta ? 'Editar etiqueta' : 'Nueva etiqueta'} subtitulo="Planificador" onClose={onClose} />
      </SheetHeader>

      <main className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-6">
        <Campo etiqueta="Nombre" htmlFor="etiqueta-nombre">
          <Input id="etiqueta-nombre" value={nombre} maxLength={30} placeholder="Ej. Promoción" onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') guardar(); }} className="h-12 text-base" />
        </Campo>

        <Campo etiqueta="Color">
          <div role="radiogroup" aria-label="Color de la etiqueta" className="grid grid-cols-2 gap-2">
            {TONOS_ELEGIBLES.map(({ tono: t, nombre: nombreColor }) => {
              const elegido = tono === t;
              return (
                <button key={t} type="button" role="radio" aria-checked={elegido} onClick={() => setTono(t)}
                  className={cn('flex items-center gap-3 h-14 px-4 rounded-2xl border text-left cursor-pointer transition-colors touch-manipulation',
                    TONOS_ETIQUETA[t].chip, elegido && 'ring-2 ring-foreground/50')}>
                  <Tag size={18} weight="fill" className="shrink-0" />
                  <span className="flex-1 t-cuerpo-fuerte">{nombreColor}</span>
                  {elegido && <Check size={16} weight="bold" className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </Campo>

        {/* Vista previa: así se ve en el planificador. */}
        <div className="flex flex-col gap-2">
          <span className="t-etiqueta text-muted-foreground">Vista previa</span>
          <div className={cn('flex items-center gap-2 h-11 px-3 rounded-2xl border t-cuerpo-fuerte', TONOS_ETIQUETA[tono].chip)}>
            <span className="truncate">{nombre.trim() || 'Nombre de la etiqueta'}</span>
          </div>
        </div>
      </main>

      <footer className="p-4 border-t border-border bg-muted/40 flex flex-col gap-2 shrink-0">
        <Button onClick={guardar} disabled={!nombre.trim()} className="h-12 w-full">{etiqueta ? 'Guardar cambios' : 'Crear etiqueta'}</Button>
        {etiqueta && (
          <Button variant="dangerGhost" onClick={() => onEliminar(etiqueta)} className="h-12 w-full gap-2">
            <Trash size={16} /> Eliminar etiqueta
          </Button>
        )}
      </footer>
    </>
  );
}

// Ajustes › Planificador: las etiquetas (filas) del planificador. La lista solo ordena y abre el formulario;
// crear, renombrar, cambiar de color y eliminar se hacen en el sidebar.
export default function AjustesPlanificador() {
  const { etiquetas } = usePlanificacion();
  // undefined = cerrado · null = nueva · etiqueta = editando
  const [formulario, setFormulario] = useState<EtiquetaPlan | null | undefined>(undefined);
  const [porEliminar, setPorEliminar] = useState<EtiquetaPlan | null>(null);

  const tonoSugerido = (): TonoEtiqueta => {
    const usados = new Set(etiquetas.map((e) => e.tono));
    return (TONOS_ELEGIBLES.find((t) => !usados.has(t.tono)) ?? TONOS_ELEGIBLES[0]).tono;
  };

  const confirmarEliminar = () => {
    if (!porEliminar) return;
    const r = eliminarEtiqueta(porEliminar.id);
    if (!r.ok) showToast.warning('No se puede eliminar la etiqueta', r.motivo);
    else setFormulario(undefined);
    setPorEliminar(null);
  };
  const productos = porEliminar ? productosDeEtiqueta(porEliminar.id) : 0;

  return (
    <>
      <Seccion
        titulo="Etiquetas"
        descripcion="Cada etiqueta es una fila del planificador: promociones, menús de huéspedes, plato del día…"
        accion={
          <Button onClick={() => setFormulario(null)} className="h-12 gap-1.5 px-5">
            <Plus size={18} weight="bold" /> Nueva etiqueta
          </Button>
        }
      >
        <Grupo>
          {etiquetas.length === 0 ? (
            <Vacio>Sin etiquetas todavía: crea la primera para empezar a planificar.</Vacio>
          ) : etiquetas.map((e, i) => {
            const n = productosDeEtiqueta(e.id);
            return (
              <Fila
                key={e.id}
                icono={<Tag size={22} weight="fill" className={cn('shrink-0', TONOS_ETIQUETA[e.tono].fila)} />}
                titulo={e.nombre}
                ayuda={n === 0 ? 'Sin productos planificados' : `${n} ${n === 1 ? 'producto planificado' : 'productos planificados'}`}
              >
                <Button type="button" variant="ghost" size="icon" aria-label={`Subir ${e.nombre}`} disabled={i === 0} onClick={() => moverEtiqueta(e.id, -1)} className="size-11 text-muted-foreground touch-manipulation">
                  <ArrowUp size={18} weight="bold" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Bajar ${e.nombre}`} disabled={i === etiquetas.length - 1} onClick={() => moverEtiqueta(e.id, 1)} className="size-11 text-muted-foreground touch-manipulation">
                  <ArrowDown size={18} weight="bold" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Editar ${e.nombre}`} onClick={() => setFormulario(e)} className="size-11 text-muted-foreground touch-manipulation">
                  <PencilSimple size={18} />
                </Button>
              </Fila>
            );
          })}
        </Grupo>
      </Seccion>

      <Sheet open={formulario !== undefined} onOpenChange={(o) => { if (!o) setFormulario(undefined); }}>
        <SheetContent showCloseButton={false} onOpenAutoFocus={(e) => e.preventDefault()}
          className="data-[side=right]:w-full data-[side=right]:sm:max-w-[462px] flex flex-col gap-0 p-0 data-[side=right]:border-l-0">
          {formulario !== undefined && (
            <FormEtiqueta key={formulario?.id ?? 'nueva'} etiqueta={formulario} tonoInicial={tonoSugerido()}
              onClose={() => setFormulario(undefined)} onEliminar={setPorEliminar} />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={porEliminar !== null} onOpenChange={(o) => { if (!o) setPorEliminar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la etiqueta «{porEliminar?.nombre}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {productos > 0
                ? `Se quitarán también los ${productos} ${productos === 1 ? 'producto planificado' : 'productos planificados'} con esta etiqueta. Esto no se puede deshacer.`
                : 'No tiene productos planificados. Esto no se puede deshacer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarEliminar}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

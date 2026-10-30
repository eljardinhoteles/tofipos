import { useEffect, useState } from 'react';
import { Check, CheckCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FondoHoja } from '@/components/Common/FondoHoja';
import { Drawer, DrawerPortal, DrawerContent, DrawerTitle, DrawerDescription, DrawerHandle } from '@/components/ui/drawer';

interface Grupo {
  nombre: string;
  opciones: string[];
  obligatorio?: boolean;
  multi?: boolean;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  product: { nombre: string; modificadores?: Grupo[] } | null;
  /**
   * `agregar`: cada «Agregar» llama a `onConfirm` y la hoja se queda abierta para repetir el mismo producto o armar otro con
   * opciones distintas. `editar`: un solo «Guardar» y se cierra.
   */
  mode?: 'agregar' | 'editar';
  /** Opciones ya elegidas (al editar una línea), para que la hoja abra con ellas marcadas. */
  iniciales?: string[];
  onConfirm: (selectedOptions: string[]) => void | Promise<void>;
}

type Selecciones = Record<string, string[]>;

const desdeIniciales = (grupos: Grupo[], iniciales: string[] = []): Selecciones =>
  Object.fromEntries(grupos.map((g) => [g.nombre, g.opciones.filter((o) => iniciales.includes(o))]));

/**
 * Hoja inferior de modificadores: todos los grupos a la vista (sin pasos). Al agregar no se cierra: «Agregar otro» repite lo
 * mismo (la comanda suma la cantidad si las opciones son iguales) y «Reiniciar» limpia las elecciones para armar uno distinto.
 */
export function ProductModifiersSheet({ opened, onClose, product: productoProp, mode = 'agregar', iniciales, onConfirm }: Props) {
  // El padre quita el producto al cerrar: se conserva el último para que la hoja se vea completa mientras baja (si no, se desmonta
  // de golpe y el cierre es brusco).
  const [ultimo, setUltimo] = useState(productoProp);
  if (productoProp && productoProp !== ultimo) setUltimo(productoProp);
  const product = productoProp ?? ultimo;
  const grupos = product?.modificadores ?? [];
  const [selecciones, setSelecciones] = useState<Selecciones>({});
  const [agregadas, setAgregadas] = useState(0);
  // Qué se agregó la última vez: «Agregar otro igual» solo tiene sentido mientras lo elegido siga siendo eso.
  const [ultimaFirma, setUltimaFirma] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!opened || !product) return;
    setSelecciones(desdeIniciales(product.modificadores ?? [], iniciales));
    setAgregadas(0);
    setUltimaFirma(null);
    // Solo al abrir o cambiar de producto: `iniciales` cambia de identidad en cada render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, product]);

  if (!product || grupos.length === 0) return null;

  const elegidas = grupos.flatMap((g) => selecciones[g.nombre] ?? []);
  const faltan = grupos.filter((g) => g.obligatorio && (selecciones[g.nombre] ?? []).length === 0);
  const puede = faltan.length === 0 && !ocupado;
  const editando = mode === 'editar';
  const firma = [...elegidas].sort().join('|');
  const esOtroIgual = !editando && ultimaFirma !== null && firma === ultimaFirma;

  const elegir = (g: Grupo, opcion: string) => {
    setSelecciones((prev) => {
      const actuales = prev[g.nombre] ?? [];
      const ya = actuales.includes(opcion);
      if (g.multi) return { ...prev, [g.nombre]: ya ? actuales.filter((o) => o !== opcion) : [...actuales, opcion] };
      // Opción única: tocar otra la cambia; tocar la elegida la quita solo si el grupo es opcional.
      return { ...prev, [g.nombre]: ya ? (g.obligatorio ? actuales : []) : [opcion] };
    });
  };

  const confirmar = async () => {
    if (!puede) return;
    setOcupado(true);
    try {
      await onConfirm(elegidas);
      if (editando) onClose();
      else { setAgregadas((n) => n + 1); setUltimaFirma(firma); }
    } catch {
      // Quien llama ya avisó del error; la hoja queda abierta para reintentar.
    } finally {
      setOcupado(false);
    }
  };

  const reiniciar = () => { setSelecciones(desdeIniciales(grupos)); setUltimaFirma(null); };

  return (
    <>
      <FondoHoja abierto={opened} onClose={onClose} />
      <Drawer open={opened} onOpenChange={(o) => { if (!o) onClose(); }} dismissible>
        <DrawerPortal>
          <DrawerContent className="fixed bottom-0 left-0 right-0 max-h-[88dvh] bg-card rounded-t-marco shadow-[0_-8px_30px_rgba(0,0,0,0.25)] z-50 flex flex-col overflow-hidden p-0 border-0 before:hidden">
            <DrawerHandle />
            {/* Producto y lo agregado, en una tarjeta aparte para separarlos de las opciones. */}
            <div className="px-5 pt-7 pb-4 shrink-0">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/60 px-4 py-3">
                <DrawerTitle className="t-titulo truncate min-w-0">{product.nombre}</DrawerTitle>
                <DrawerDescription className="sr-only">Elige los modificadores del producto</DrawerDescription>
                {!editando && agregadas > 0 && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-success/15 text-success t-dato shrink-0" aria-live="polite">
                    <CheckCircle size={16} weight="fill" /> {agregadas === 1 ? '1 agregado' : `${agregadas} agregados`}
                  </span>
                )}
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto px-5 pb-4 flex flex-col gap-5">
              {grupos.map((g) => {
                const sel = selecciones[g.nombre] ?? [];
                return (
                  <section key={g.nombre} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="t-cuerpo-fuerte text-foreground min-w-0">{g.nombre}</h4>
                      <span className={cn('px-2 py-0.5 rounded-md t-dato shrink-0',
                        g.obligatorio ? (sel.length > 0 ? 'bg-success/15 text-success' : 'bg-destructive/10 text-destructive') : 'bg-muted text-muted-foreground')}>
                        {g.obligatorio ? (sel.length > 0 ? 'Listo' : 'Requerido') : g.multi ? 'Opcional · varias' : 'Opcional'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {g.opciones.map((o) => {
                        const activa = sel.includes(o);
                        return (
                          <button
                            key={o} type="button" onClick={() => elegir(g, o)} aria-pressed={activa}
                            // Elegida = solo color (sin icono ni cambio de peso): así la opción no cambia de ancho y las filas no se mueven.
                            className={cn('min-h-11 px-4 rounded-2xl border-2 t-cuerpo flex items-center cursor-pointer select-none active:scale-95 transition-colors',
                              activa ? 'bg-primary border-primary text-primary-foreground' : 'bg-card border-border text-foreground')}
                          >
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* El botón principal va SIEMPRE abajo del todo y los secundarios encima, sin cambiar de sitio al elegir opciones. */}
            <div className="shrink-0 border-t border-border px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] flex flex-col gap-2">
              {!editando && agregadas > 0 && (
                <div className="flex gap-2">
                  <Button type="button" variant="suave" onClick={reiniciar} disabled={elegidas.length === 0} className="flex-1 h-11 rounded-2xl">Otro distinto</Button>
                  {esOtroIgual ? (
                    <Button type="button" variant="suave" onClick={confirmar} disabled={!puede} className="flex-1 h-11 rounded-2xl">Agregar otro igual</Button>
                  ) : (
                    <Button type="button" variant="suave" onClick={onClose} className="flex-1 h-11 gap-1.5 rounded-2xl"><Check size={18} weight="bold" /> Listo</Button>
                  )}
                </div>
              )}
              {esOtroIgual ? (
                // Ya se agregó y lo elegido sigue igual: lo principal es terminar.
                <Button type="button" onClick={onClose} className="h-12 w-full gap-2 rounded-2xl"><Check size={20} weight="bold" /> Listo</Button>
              ) : (
                <Button type="button" onClick={confirmar} disabled={!puede} className="h-12 w-full gap-2 rounded-2xl">
                  {editando ? 'Guardar cambios' : 'Agregar'}
                  {!puede && faltan.length > 0 && <span className="t-meta opacity-80">· falta {faltan[0].nombre}</span>}
                </Button>
              )}
            </div>
          </DrawerContent>
        </DrawerPortal>
      </Drawer>
    </>
  );
}

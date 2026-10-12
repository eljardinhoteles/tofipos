import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageFrame, PageHeader, PageContent } from '../components/Common/PageHeader';
import { CabeceraDia } from '../components/Planificacion/CabeceraDia';
import { CeldaDia, EtiquetaFila } from '../components/Planificacion/CeldaDia';
import { NavegacionPlan } from '../components/Planificacion/NavegacionPlan';
import { ConfirmarDiaDialog } from '../components/Planificacion/ConfirmarDiaDialog';
import type { ProductoPlan } from '../components/Planificacion/SidebarSeleccionProductos';
import { useAuth } from '../context/AuthContext';
import { useRxMenuCatalog } from '../hooks/useRxMenuCatalog';
import { showToast } from '@/lib/toast';
import { fechaLocal } from '../lib/fechaLocal';
import {
  DIAS, MIN_ANCHO_DIA, MIN_ANCHO_EDITANDO, fechaCorta, inicioDe, inicioPorDefecto, nombreDia, sumarDias,
} from '../lib/planificadorFechas';
import {
  alternarDestino, abrirDestino, confirmacionVigente, confirmarDia, useDestinoPlan, usePlanificacion,
  type CeldaPlan,
} from '../lib/planificacion';

// Planificador: 5 días lado a lado (desde ayer) y una fila por etiqueta. Al tocar una celda se abre a la
// derecha el sidebar para elegir sus productos; confirmar un día lo bloquea. Solo PC/iPad. En modo de
// prueba (ver lib/planificacion.ts). Los botones del header son los estándar de la app; las medidas de la
// cuadrícula pensadas para tocar con el dedo (objetivos de 44 px, nada que dependa del hover).

const SIN_ITEMS: CeldaPlan[] = [];

export default function PlanificacionV2() {
  const { menuItems } = useRxMenuCatalog();
  const { etiquetas, celdas, confirmaciones } = usePlanificacion();
  const { currentMesero, adminUser } = useAuth();
  const usuario = currentMesero?.nombre ?? adminUser?.email ?? 'Administrador';
  const [inicio, setInicio] = useState(inicioPorDefecto);
  // Fecha cuyo menú se está por firmar (abre el modal de resumen).
  const [confirmando, setConfirmando] = useState<string | null>(null);
  // Celda abierta: se pinta en el sidebar derecho global del layout (el mismo de Mesas).
  const destino = useDestinoPlan();
  useEffect(() => () => abrirDestino(null), []); // al salir del módulo se cierra

  // Con el sidebar abierto el área se angosta: la celda elegida se lleva a la vista.
  const celdaElegidaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!destino) return;
    const t = setTimeout(() => celdaElegidaRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }), 350);
    return () => clearTimeout(t);
  }, [destino]);

  const hoy = fechaLocal();
  const ayer = fechaLocal(sumarDias(inicioDe(new Date()), -1));
  const manana = fechaLocal(sumarDias(inicioDe(new Date()), 1));
  const dias = useMemo(() => Array.from({ length: DIAS }, (_, i) => sumarDias(inicio, i)), [inicio]);
  const fechas = useMemo(() => dias.map((d) => fechaLocal(d)), [dias]);
  // "Hoy - Sábado · 10 de octubre" por fecha: lo usan el sidebar y el modal de firma.
  const textoDia = useMemo(
    () => new Map(dias.map((d, i) => [fechas[i], `${nombreDia(d, fechas[i], hoy, ayer, manana)} · ${fechaCorta(d)}`])),
    [dias, fechas, hoy, ayer, manana],
  );

  const porId = useMemo(() => new Map<string, ProductoPlan>(menuItems.map((p: ProductoPlan) => [p.id, p])), [menuItems]);
  const nombreProducto = useCallback((id: string) => porId.get(id)?.nombre ?? 'Producto eliminado', [porId]);

  const celdasDe = useMemo(() => {
    const m = new Map<string, CeldaPlan[]>();
    for (const c of celdas) {
      const k = `${c.etiqueta_id}|${c.fecha}`;
      const l = m.get(k);
      if (l) l.push(c); else m.set(k, [c]);
    }
    return m;
  }, [celdas]);
  const diasConProductos = useMemo(() => new Set(celdas.map((c) => c.fecha)), [celdas]);
  const confirmadas = useMemo(
    () => new Map(fechas.flatMap((f) => { const c = confirmacionVigente(confirmaciones, f); return c ? [[f, c] as const] : []; })),
    [fechas, confirmaciones],
  );

  // Ancho mínimo del día: el que se edita es más ancho para que el sidebar (que angosta el área) no lo comprima.
  const minAncho = (f: string) => (destino?.fecha === f ? MIN_ANCHO_EDITANDO : MIN_ANCHO_DIA);
  const abrirCelda = useCallback((etiquetaId: string, fecha: string) => {
    alternarDestino({ etiqueta_id: etiquetaId, fecha, diaTexto: textoDia.get(fecha) ?? fecha });
  }, [textoDia]);
  const verConfirmado = useCallback((fecha: string) => {
    abrirDestino({ etiqueta_id: etiquetas[0]?.id ?? '', fecha, diaTexto: textoDia.get(fecha) ?? fecha });
  }, [etiquetas, textoDia]);

  const empiezaHoy = fechaLocal(inicio) === fechaLocal(inicioPorDefecto());

  return (
    <PageFrame>
      <PageHeader
        title="Planificador"
        subtitle={<span className="inline-block first-letter:uppercase">{inicio.toLocaleDateString('es', { month: 'long', year: 'numeric' })}</span>}
      />

      <PageContent>
        {/* Misma anatomía que el calendario de Reservas: columna fija de etiquetas a la izquierda, navegación de
            fechas en la esquina y una cabecera por día. Cada celda lleva sus productos como tarjetas del color de
            su etiqueta. */}
        <div className="flex-1 min-h-0 overflow-auto overscroll-contain bg-muted">
          {/* Pistas `minmax(auto,1fr)`: el ancho mínimo de cada día lo ponen sus celdas (190 px, o 300 px el
              día en edición), sin estilos en línea. DIAS = 5 debe coincidir con `repeat(5, …)`. */}
          <div className="grid grid-cols-[minmax(176px,208px)_repeat(5,minmax(auto,1fr))]">
            <div className="sticky top-0 left-0 z-30 px-2 bg-card border-b border-r border-border flex items-center shadow-[2px_0_0_0_var(--border)]">
              <NavegacionPlan inicio={inicio} empiezaHoy={empiezaHoy} onCambiar={setInicio} />
            </div>
            {dias.map((d, i) => {
              const f = fechas[i];
              return (
                <CabeceraDia
                  key={f}
                  fecha={f}
                  diaSemana={d.toLocaleDateString('es-ES', { weekday: 'long' })}
                  diaNumero={d.getDate()}
                  relativo={f === hoy ? 'Hoy' : f === ayer ? 'Ayer' : f === manana ? 'Mañana' : undefined}
                  esHoy={f === hoy}
                  pasado={f < hoy}
                  tieneProductos={diasConProductos.has(f)}
                  confirmadoPor={confirmadas.get(f)?.confirmado_por ?? null}
                  minAncho={minAncho(f)}
                  onConfirmar={setConfirmando}
                  onVerConfirmado={verConfirmado}
                />
              );
            })}

            {etiquetas.map((et) => (
              <Fragment key={et.id}>
                <EtiquetaFila etiqueta={et} />
                {fechas.map((f) => (
                  <CeldaDia
                    key={`${et.id}|${f}`}
                    etiqueta={et}
                    fecha={f}
                    items={celdasDe.get(`${et.id}|${f}`) ?? SIN_ITEMS}
                    nombreProducto={nombreProducto}
                    esHoy={f === hoy}
                    pasado={f < hoy}
                    bloqueado={confirmadas.has(f)}
                    elegida={destino?.etiqueta_id === et.id && destino.fecha === f}
                    minAncho={minAncho(f)}
                    refElegida={celdaElegidaRef}
                    onAbrir={abrirCelda}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </PageContent>
      <ConfirmarDiaDialog
        fecha={confirmando}
        diaTexto={confirmando ? textoDia.get(confirmando) ?? confirmando : ''}
        usuario={usuario}
        etiquetas={etiquetas}
        celdas={celdas}
        nombreProducto={nombreProducto}
        onCerrar={() => setConfirmando(null)}
        onConfirmar={() => {
          if (confirmando && confirmarDia(confirmando, usuario)) showToast.success('Menú confirmado', 'El día quedó bloqueado.');
          setConfirmando(null);
        }}
      />
    </PageFrame>
  );
}

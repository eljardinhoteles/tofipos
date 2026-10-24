import type { ReactNode } from 'react';
import { Bed, ForkKnife, PencilSimple, ShoppingBag, User, Wallet, type Icon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import type { RxCliente } from '../../../db/rxdb';
import type { ItemExtra } from '../../../hooks/useExtrasSeleccion';
import { Seccion } from '../detalle/comunes';
import { dinero, fechaLarga, plural } from '../detalle/formatos';
import { importePlan, incluyeDelPlan, planSeCobra, type PlanAlimentacion } from '../../../lib/hotelPlanesApi';
import type { Elegida, Paso } from './tipos';

/** Último paso de crear una reserva: resumen de estadía, cliente y extras con el total, cada bloque con su «Editar». */
export function PasoRevision({ llegada, salida, noches, elegidas, esGrupo, huesped, cliente, guardarCliente, notas, plan, extras, montoExtra, totalEstadia, totalExtras, netoExtras, ivaExtras, onEditar, cotizacion = false, referencial = false, totalPlan = 0 }: {
  llegada: string; salida: string; noches: number; elegidas: Elegida[]; esGrupo: boolean;
  huesped: { nombre: string; email: string; telefono: string; pais: string; documento?: string }; cliente: RxCliente | null; guardarCliente: boolean; notas: string;
  plan: PlanAlimentacion | null; extras: ItemExtra[]; montoExtra: (x: ItemExtra) => number; totalEstadia: number; totalExtras: number; netoExtras: number; ivaExtras: number; onEditar: (p: Paso) => void;
  /** Se está cotizando: no hay ficha de cliente ni envío a Cloudbeds, y el precio final incluye el plan con cargo. */
  cotizacion?: boolean; referencial?: boolean; totalPlan?: number;
}) {
  const adultos = elegidas.reduce((n, e) => n + e.l.adultos, 0);
  const ninos = elegidas.reduce((n, e) => n + e.l.ninos, 0);
  return (
    <div className="flex flex-col gap-3">
      <Bloque titulo="Estadía" icono={Bed} color="info" onEditar={() => onEditar(1)}>
        <p className="t-cuerpo">{cotizacion && referencial ? <>Fechas por definir <span className="text-muted-foreground">(muestra: {fechaLarga(llegada)} → {fechaLarga(salida)})</span></> : <>{fechaLarga(llegada)} → {fechaLarga(salida)}</>} · {plural(noches, 'noche', 'noches')}</p>
        <ul className="flex flex-col gap-1.5">
          {elegidas.map((e) => (
            <li key={e.o.roomTypeID} className="flex items-baseline justify-between gap-3">
              <span className="flex flex-col min-w-0">
                <span className="t-cuerpo-fuerte truncate">{e.nombre}</span>
                <span className="t-meta text-muted-foreground">
                  {plural(e.l.adultos, 'adulto', 'adultos')}{e.l.ninos ? ` · ${plural(e.l.ninos, 'niño', 'niños')}` : ''}
                  {e.l.cama ? ` · cama ${e.l.cama}` : ''}
                  {e.planes.length > 1 ? ` · ${e.plan.nombre}` : ''}
                  {e.manualValida ? ` · tarifa manual (Cloudbeds ${dinero(e.plan.total)})` : ''}
                </span>
              </span>
              <span className="t-cuerpo-fuerte shrink-0">{dinero(e.totalPOS)}</span>
            </li>
          ))}
        </ul>
        {esGrupo && !cotizacion && <p className="t-meta text-muted-foreground">Se crea una reserva por habitación en Cloudbeds, enlazadas como grupo en el POS.</p>}
      </Bloque>

      <Bloque titulo="Cliente" icono={User} onEditar={() => onEditar(2)}>
        <p className="t-cuerpo-fuerte">{huesped.nombre}</p>
        <p className="t-meta text-muted-foreground">{[huesped.documento, huesped.email, huesped.telefono, huesped.pais].filter(Boolean).join(' · ')}</p>
        {!cotizacion && <p className="t-meta text-muted-foreground">{cliente ? 'Enlazada a su ficha de Clientes' : guardarCliente ? 'Se guardará como cliente nuevo' : 'Sin ficha de cliente'}</p>}
        {notas.trim() && <p className="t-meta text-muted-foreground">Nota: {notas.trim()}</p>}
      </Bloque>

      <Bloque titulo="Plan de alimentación" icono={ForkKnife} color="warning" onEditar={() => onEditar(3)}>
        {plan ? (
          <>
            <p className="t-cuerpo-fuerte">{plan.nombre}</p>
            <div className="flex flex-col gap-0.5 t-meta text-muted-foreground">
              {incluyeDelPlan(plan, ninos).map((l) => <span key={l.texto + (l.quien ?? '')} className="text-foreground">{l.quien && <b>{l.quien}: </b>}{l.texto}</span>)}
              <span>
                Para {plural(adultos, 'adulto', 'adultos')}{ninos ? ` y ${plural(ninos, 'niño', 'niños')}` : ''} · {plural(noches, 'noche', 'noches')}
                {planSeCobra(plan) ? <> · <b className="text-foreground">se cobra {dinero(importePlan(plan, adultos, ninos, noches))}</b></> : <> · incluido en la tarifa</>}
              </span>
            </div>
          </>
        ) : <p className="t-meta text-muted-foreground">Sin plan (solo alojamiento)</p>}
      </Bloque>

      {extras.length > 0 && (
      <Bloque titulo="Extras" icono={ShoppingBag} onEditar={() => onEditar(3)}>
          <ul className="flex flex-col gap-1">
            {extras.map((x) => (
              <li key={x.key} className="flex items-baseline justify-between gap-3 t-cuerpo">
                <span className="truncate">{x.cantidad > 1 ? `${x.cantidad}× ` : ''}{x.producto.nombre}{esGrupo ? <span className="t-meta text-muted-foreground"> · {elegidas.find((e) => e.o.roomTypeID === x.roomTypeID)?.nombre}</span> : null}</span>
                <span className="shrink-0">{dinero(montoExtra(x))}</span>
              </li>
            ))}
          </ul>
      </Bloque>
      )}

      <Seccion icono={Wallet} color="success" titulo={cotizacion ? 'Precio final' : 'Total en el POS'}>
        <div className="flex flex-col gap-1.5">
          <Linea2 t="Estadía" v={dinero(totalEstadia)} />
          {totalPlan > 0 && <Linea2 t="Plan de alimentación" v={dinero(totalPlan)} />}
          {totalExtras > 0 && (
            <>
              <Linea2 t="Extras (sin IVA)" v={dinero(netoExtras)} />
              <Linea2 t="IVA de los extras" v={dinero(ivaExtras)} />
            </>
          )}
          <div className="flex items-baseline justify-between gap-3 pt-1">
            <span className="t-cuerpo-fuerte">{cotizacion ? 'Precio final' : 'Total a cobrar'}</span>
            <span className="t-valor text-lg text-primary tabular-nums">{dinero(totalEstadia + totalExtras + totalPlan)}</span>
          </div>
        </div>
        <p className="t-meta text-muted-foreground">{cotizacion ? `Impuestos incluidos. ${referencial ? 'Precio de referencia, sin fechas: vale 7 días' : 'La cotización vale 48 horas'} y no reserva las habitaciones.` : 'A Cloudbeds se sube con su tarifa estándar. Los cobros se registran en el Centro de Ventas.'}</p>
      </Seccion>
    </div>
  );
}

function Bloque({ titulo, icono, color, onEditar, children }: { titulo: string; icono: Icon; color?: 'primary' | 'info' | 'success' | 'warning'; onEditar: () => void; children: ReactNode }) {
  return (
    <Seccion icono={icono} color={color} titulo={titulo}
      accion={<Button type="button" variant="outline" className="h-9 gap-1.5" onClick={onEditar} aria-label={`Editar ${titulo.toLowerCase()}`}><PencilSimple size={14} /> Editar</Button>}>
      {children}
    </Seccion>
  );
}

function Linea2({ t, v }: { t: string; v: string }) {
  return <div className="flex items-baseline justify-between gap-3 t-cuerpo"><span className="text-muted-foreground">{t}</span><span>{v}</span></div>;
}

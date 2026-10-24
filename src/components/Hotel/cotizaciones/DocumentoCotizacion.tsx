import { forwardRef } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { Bed, ForkKnife, Gift, Moon, ShoppingBag, Users } from '@phosphor-icons/react';
import { getOrgCache } from '../../../lib/orgCache';
import { ANCHO_DOCUMENTO } from '../../../lib/exportarCotizacion';
import { numeroCotizacion, type Cotizacion } from '../../../lib/hotelCotizacionesApi';
import { TEXTOS } from '../../../lib/textosCotizacion';

const dinero = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * El documento de la cotización: lo que se descarga como imagen o se imprime como PDF. Es una hoja clara, angosta y alta (vertical, para
 * leerla en el celular), y no sigue el tema de la app, para que el archivo salga igual en cualquier pantalla.
 */
export const DocumentoCotizacion = forwardRef<HTMLDivElement, { cotizacion: Cotizacion }>(function DocumentoCotizacion({ cotizacion: c }, ref) {
  const t = TEXTOS[c.idioma];
  const org = getOrgCache();
  const noches = dayjs(c.salida).diff(dayjs(c.llegada), 'day');
  // Fecha corta («vie 24 oct»); el año solo si no es el actual.
  const fecha = (f: string) => dayjs(f).locale(t.locale).format(dayjs(f).year() === dayjs().year() ? 'ddd D MMM' : 'ddd D MMM YYYY');
  const hasta = dayjs(c.vence_at).locale(t.locale).format('D [de] MMMM [a las] HH:mm');
  const contacto = [c.cliente.telefono, c.cliente.email].filter(Boolean).join(' · ');
  const datosOrg = [org.ruc && `RUC ${org.ruc}`, org.direccion, org.telefono].filter(Boolean).join(' · ');

  return (
    <div ref={ref} style={{ width: ANCHO_DOCUMENTO, colorScheme: 'light' }} className="bg-white text-[#1b1f1d] px-7 py-6 flex flex-col gap-4 font-sans">
      <header className="flex items-start justify-between gap-4 pb-3 border-b border-[#2f5d46]">
        <div className="flex flex-col min-w-0">
          <h1 className="text-[18px] font-extrabold leading-tight text-[#2f5d46] truncate">{org.nombre || 'Hotel'}</h1>
          {datosOrg && <p className="text-[11px] leading-snug text-[#5b6660]">{datosOrg}</p>}
        </div>
        <div className="text-right shrink-0 flex flex-col leading-tight">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#5b6660]">{t.titulo}</span>
          <span className="text-[16px] font-extrabold tabular-nums">{numeroCotizacion(c.numero)}</span>
        </div>
      </header>

      {(c.cliente.nombre || contacto) && (
        <section className="flex flex-col leading-tight">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#5b6660]">{t.preparadaPara}</span>
          {c.cliente.nombre && <span className="text-[20px] font-extrabold">{c.cliente.nombre}</span>}
          {contacto && <span className="text-[12px] text-[#5b6660]">{contacto}</span>}
        </section>
      )}

      <section aria-label={t.estadia} className="rounded-2xl bg-[#eef2ee] px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {c.referencial
          ? <div className="col-span-2"><Dato etiqueta={t.estadia} valor={t.fechasPorDefinir} /></div>
          : <><Dato etiqueta={t.llegada} valor={fecha(c.llegada)} /><Dato etiqueta={t.salida} valor={fecha(c.salida)} /></>}
        <Dato etiqueta={t.nochesTitulo} valor={String(noches)} icono={<Moon size={12} weight="bold" />} />
        <Dato etiqueta={t.huespedes} valor={`${t.adultos(c.adultos)}${c.ninos > 0 ? `, ${t.ninos(c.ninos)}` : ''}`} icono={<Users size={12} weight="bold" />} />
      </section>

      <section className="flex flex-col gap-1.5">
        <Titulo icono={<Bed size={14} weight="bold" />}>{t.alojamiento}</Titulo>
        <ul className="flex flex-col divide-y divide-[#e2e7e3] rounded-2xl border border-[#e2e7e3]">
          {c.lineas.map((l, i) => (
            <li key={`${l.nombre}-${i}`} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
              <span className="flex flex-col min-w-0 leading-snug">
                <span className="text-[14px] font-bold">{l.nombre}{l.vista && <span className="font-normal text-[#5b6660]"> · {l.vista}</span>}</span>
                {l.cama && <span className="text-[12px] text-[#5b6660]">{t.cama} <b className="text-[#1b1f1d]">{l.cama}</b></span>}
                {l.amenidades && l.amenidades.length > 0 && (
                  <span className="flex flex-wrap gap-1 pt-1">
                    {l.amenidades.map((a) => <span key={a} className="rounded-full bg-[#eef2ee] px-2 py-0.5 text-[10.5px] font-medium text-[#2f5d46]">{a}</span>)}
                  </span>
                )}
              </span>
              <span className="flex flex-col items-end shrink-0 leading-snug">
                <span className="text-[15px] font-extrabold tabular-nums">{dinero(l.precio)}</span>
                <span className="text-[12px] text-[#5b6660] text-right">{t.adultos(l.adultos)}{l.ninos > 0 ? ` · ${t.ninos(l.ninos)}` : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {c.plan && (
        <section className="flex flex-col gap-1.5">
          <Titulo icono={<ForkKnife size={14} weight="bold" />}>{t.plan}</Titulo>
          <div className="rounded-2xl border border-[#e2e7e3] px-3.5 py-2.5 flex items-start justify-between gap-3">
            <div className="flex flex-col min-w-0 leading-snug">
              <span className="text-[14px] font-bold">{c.plan.nombre}</span>
              {c.plan.incluye.map((l) => (
                <span key={l.texto + (l.quien ?? '')} className="text-[12px] text-[#5b6660]">{l.quien && <b className="text-[#1b1f1d]">{l.quien}: </b>}{l.texto}</span>
              ))}
            </div>
            <span className="text-[12px] font-bold tabular-nums shrink-0">{c.plan.seCobra ? dinero(c.plan.importe) : t.incluidoEnTarifa}</span>
          </div>
        </section>
      )}

      {c.extras.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <Titulo icono={<ShoppingBag size={14} weight="bold" />}>{t.extras}</Titulo>
          <ul className="flex flex-col divide-y divide-[#e2e7e3] rounded-2xl border border-[#e2e7e3]">
            {c.extras.map((x, i) => (
              <li key={`${x.descripcion}-${i}`} className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                <span className="text-[13px] leading-snug">{x.descripcion}</span>
                <span className="text-[13px] font-bold tabular-nums shrink-0">{dinero(x.monto)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.cortesias.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <Titulo icono={<Gift size={14} weight="bold" />}>{t.cortesias}</Titulo>
          <ul className="flex flex-col gap-1 rounded-2xl bg-[#fff6e0] px-3.5 py-2.5">
            {c.cortesias.map((x, i) => (
              <li key={`${x}-${i}`} className="flex items-baseline justify-between gap-3 text-[13px] leading-snug">
                <span>{x}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#8a5a00] shrink-0">{t.cortesia}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.notas?.trim() && (
        <section className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#5b6660]">{t.notas}</span>
          <p className="text-[13px] leading-snug whitespace-pre-line">{c.notas.trim()}</p>
        </section>
      )}

      <section className="rounded-2xl bg-[#2f5d46] text-white px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-[12px] font-bold uppercase tracking-[0.14em] opacity-90">{t.precioFinal}</span>
          <span className="text-[11px] opacity-80">{t.impuestosIncluidos}</span>
        </div>
        <span className="text-[30px] font-extrabold leading-none tabular-nums">{dinero(c.total)}</span>
      </section>


      <footer className="pt-3 border-t border-[#e2e7e3] flex flex-col leading-snug text-[11px] text-[#5b6660]">
        <span className="font-bold text-[#1b1f1d]">{t.vigencia(hasta)}</span>
        <span>{c.referencial ? t.notaReferencial : t.sujetaDisponibilidad}</span>
        <span className="pt-1">{t.emitida} {dayjs(c.created_at).locale(t.locale).format('D [de] MMMM YYYY')}</span>
      </footer>
    </div>
  );
});

function Titulo({ icono, children }: { icono: React.ReactNode; children: React.ReactNode }) {
  return <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2f5d46]">{icono}{children}</h2>;
}

function Dato({ etiqueta, valor, icono }: { etiqueta: string; valor: string; icono?: React.ReactNode }) {
  return (
    <div className="flex flex-col min-w-0 leading-tight">
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#5b6660]">{icono}{etiqueta}</span>
      <span className="text-[13px] font-bold capitalize">{valor}</span>
    </div>
  );
}

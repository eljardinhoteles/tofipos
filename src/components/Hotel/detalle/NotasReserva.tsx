import { useState } from 'react';
import { Check, Note, PencilSimple, Plus, ShoppingBag, Trash, UsersThree, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showToast } from '@/lib/toast';
import { useUI } from '../../../context/UIContext';
import { Girando } from '../Espera';
import {
  agregarNotaHotel, editarNotaHotel, NOTA_MAX_CARACTERES, notasReservaDisponible, quitarNotaHotel, type NotaReserva, type ReservaHotel,
} from '../../../lib/hotelReservasApi';
import { Seccion } from './comunes';

const SIN_EXTRA = '__sin__';
const TODO_GRUPO = '__grupo__';

interface FormProps {
  r: ReservaHotel;
  /** Extra al que va ligada la nota. `undefined` = se puede elegir (o dejarla general); `null` = general. */
  extraFijo?: string | null;
  /** La reserva es de un grupo: se ofrece una nota para todo el grupo (sin nombre de habitación en el documento). */
  enGrupo?: boolean;
  usuario?: string;
  onGuardado: (r: ReservaHotel) => void;
  onCancelar: () => void;
}

/** Nota corta nueva: horario de un tour, una alergia… Ligada a un extra o general. */
export function FormNota({ r, extraFijo, enGrupo, usuario, onGuardado, onCancelar }: FormProps) {
  const [texto, setTexto] = useState('');
  const [extraId, setExtraId] = useState<string>(extraFijo ?? SIN_EXTRA);
  const [guardando, setGuardando] = useState(false);
  const extrasConImporte = r.extras.filter((e) => e.monto > 0);

  const guardar = async () => {
    if (!texto.trim()) return;
    setGuardando(true);
    try {
      onGuardado(await agregarNotaHotel(r, texto, extraId === SIN_EXTRA || extraId === TODO_GRUPO ? null : extraId, usuario, extraId === TODO_GRUPO));
      showToast.success('Nota añadida');
    } catch (e) {
      showToast.fallo('guardar la nota', e);
    } finally {
      setGuardando(false);
    }
  };

  // Bajo un extra: una sola fila (campo + guardar + cerrar), sin contador ni botones grandes.
  if (extraFijo !== undefined) {
    return (
      <div className="flex items-center gap-1.5">
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={NOTA_MAX_CARACTERES} autoFocus disabled={guardando}
          placeholder="Nota: horario, detalle…" aria-label="Nota del extra"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void guardar(); } if (e.key === 'Escape') onCancelar(); }} className="h-10 text-base" />
        <button type="button" onClick={() => void guardar()} disabled={!texto.trim() || guardando} aria-label="Guardar nota"
          className="size-10 rounded-xl flex items-center justify-center text-primary-foreground bg-primary disabled:opacity-40 cursor-pointer shrink-0">{guardando ? <Girando /> : <Check size={18} weight="bold" />}</button>
        <button type="button" onClick={onCancelar} disabled={guardando} aria-label="Cancelar nota"
          className="size-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted cursor-pointer shrink-0"><X size={18} /></button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 border-t border-border pt-3">
      <Input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={NOTA_MAX_CARACTERES} autoFocus
        placeholder="Ej. Salida del tour 09:30, martes 20 de octubre" aria-label="Nota de la reserva"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void guardar(); } }} className="h-11 text-base" />
      {extraFijo === undefined && (extrasConImporte.length > 0 || enGrupo) && (
        <Select value={extraId} onValueChange={setExtraId}>
          <SelectTrigger className="data-[size=default]:h-11 w-full px-2.5 text-base rounded-2xl bg-card border-border shadow-xs" aria-label="Extra al que va ligada"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_EXTRA} className="t-cuerpo">{enGrupo ? 'Solo esta habitación' : 'Nota general (sin extra)'}</SelectItem>
            {enGrupo && <SelectItem value={TODO_GRUPO} className="t-cuerpo">Todo el grupo</SelectItem>}
            {extrasConImporte.map((e) => <SelectItem key={e.id} value={e.id} className="t-cuerpo">{e.descripcion}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="t-meta text-muted-foreground tabular-nums">{texto.length}/{NOTA_MAX_CARACTERES}</span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" className="h-11" onClick={onCancelar} disabled={guardando}>Cancelar</Button>
          <Button type="button" className="h-11 gap-2" onClick={() => void guardar()} disabled={!texto.trim() || guardando}>
            {guardando ? <><Girando /> Guardando…</> : <><Check size={16} weight="bold" /> Añadir nota</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ItemProps {
  r: ReservaHotel;
  nota: NotaReserva;
  puedeEditar: boolean;
  usuario?: string;
  /** Muestra a qué extra va ligada (en la lista general; dentro de un extra ya se sabe). */
  mostrarExtra?: boolean;
  /** Nota con relevancia: recuadro ámbar y acciones solo al pasar el cursor (dentro de un extra). */
  destacada?: boolean;
  onCambio: (r: ReservaHotel) => void;
}

/** Una nota con su texto, y —si se puede editar— sus acciones de editar y quitar. */
export function ItemNota({ r, nota, puedeEditar, usuario, mostrarExtra, destacada, onCambio }: ItemProps) {
  const { openConfirm } = useUI();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nota.texto);
  const [ocupado, setOcupado] = useState(false);

  const guardar = async () => {
    if (!texto.trim() || texto.trim() === nota.texto) { setEditando(false); return; }
    setOcupado(true);
    try { onCambio(await editarNotaHotel(r, nota.id, texto, usuario)); setEditando(false); } catch (e) { showToast.fallo('editar la nota', e); } finally { setOcupado(false); }
  };
  const quitar = () => openConfirm('Quitar nota', `Se quita la nota «${nota.texto}».`, () => {
    void quitarNotaHotel(r, nota.id, usuario).then(onCambio).catch((e) => showToast.fallo('quitar la nota', e));
  });
  // Si el extra ya no está en la reserva, la nota se conserva como general y se indica de cuál era.
  const extraVigente = !!nota.extra_id && r.extras.some((e) => e.id === nota.extra_id);

  if (editando) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={NOTA_MAX_CARACTERES} autoFocus aria-label="Editar nota"
          onKeyDown={(e) => { if (e.key === 'Enter') void guardar(); if (e.key === 'Escape') { setTexto(nota.texto); setEditando(false); } }} className="h-10 text-base" />
        <button type="button" onClick={() => void guardar()} disabled={ocupado} aria-label="Guardar nota" className="size-10 rounded-xl flex items-center justify-center text-success hover:bg-success-soft cursor-pointer shrink-0"><Check size={18} weight="bold" /></button>
        <button type="button" onClick={() => { setTexto(nota.texto); setEditando(false); }} aria-label="Cancelar edición" className="size-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted cursor-pointer shrink-0"><X size={18} /></button>
      </div>
    );
  }

  return (
    <div className={destacada ? 'group/nota flex items-start gap-2 rounded-lg bg-warning-soft px-2.5 py-1.5 ml-[26px]' : 'flex items-start gap-2 py-1'}>
      {destacada && <Note size={15} weight="fill" className="text-warning-foreground shrink-0 mt-1" aria-hidden />}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className={destacada ? 't-cuerpo break-words text-foreground font-semibold' : 't-cuerpo break-words'}>{nota.texto}</span>
        {((mostrarExtra && (nota.extra || nota.grupo)) || nota.usuario) && (
          <span className="t-meta text-muted-foreground">
            {mostrarExtra && nota.extra && <><ShoppingBag size={12} className="inline -mt-0.5 mr-1" />{nota.extra}{extraVigente ? '' : ' (quitado)'}</>}
            {mostrarExtra && nota.grupo && <><UsersThree size={12} className="inline -mt-0.5 mr-1" />Todo el grupo</>}
            {mostrarExtra && (nota.extra || nota.grupo) && nota.usuario ? ' · ' : ''}{nota.usuario ?? ''}
          </span>
        )}
      </div>
      {puedeEditar && (
        <div className={destacada ? 'flex items-center shrink-0 -my-1.5 -mr-1.5 '+'[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/nota:opacity-100 [@media(hover:hover)]:group-focus-within/nota:opacity-100 transition-opacity' : 'flex items-center shrink-0 -my-1'}>
          <button type="button" onClick={() => setEditando(true)} aria-label="Editar nota" className="size-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"><PencilSimple size={15} /></button>
          <button type="button" onClick={quitar} aria-label="Quitar nota" className="size-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"><Trash size={15} /></button>
        </div>
      )}
    </div>
  );
}

interface SeccionProps {
  r: ReservaHotel;
  puedeEditar: boolean;
  enGrupo?: boolean;
  usuario?: string;
  onCambio: (r: ReservaHotel) => void;
}

/** Todas las notas de la reserva (generales y ligadas a un extra), con su alta. */
export function SeccionNotas({ r, puedeEditar, enGrupo, usuario, onCambio }: SeccionProps) {
  const [abierto, setAbierto] = useState(false);
  if (!notasReservaDisponible && r.notas_items.length === 0) return null;
  return (
    <Seccion icono={Note} color="warning" titulo="Notas de la reserva"
      accion={puedeEditar && !abierto && notasReservaDisponible ? <Button type="button" variant="suave" className="h-9 gap-1.5" onClick={() => setAbierto(true)}><Plus size={14} weight="bold" /> Nota</Button> : undefined}>
      {r.notas_items.length === 0 && !abierto && (
        <p className="t-meta text-muted-foreground">Sin notas. Úsalas para organizar actividades (horarios de un tour) o avisar de una alergia.</p>
      )}
      {r.notas_items.length > 0 && (
        <ul className="flex flex-col" aria-label="Notas de la reserva">
          {r.notas_items.map((n) => <li key={n.id}><ItemNota r={r} nota={n} puedeEditar={puedeEditar} usuario={usuario} mostrarExtra onCambio={onCambio} /></li>)}
        </ul>
      )}
      {abierto && <FormNota r={r} enGrupo={enGrupo} usuario={usuario} onCancelar={() => setAbierto(false)} onGuardado={(n) => { setAbierto(false); onCambio(n); }} />}
    </Seccion>
  );
}

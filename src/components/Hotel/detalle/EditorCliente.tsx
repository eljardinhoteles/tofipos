import { useEffect, useState } from 'react';
import { User, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { showToast } from '@/lib/toast';
import { Girando } from '../Espera';
import { useRxClientes } from '../../../hooks/useRxClientes';
import { updateRxCliente, type RxCliente } from '../../../db/rxdb';
import { partirNombre } from '../../../lib/hotelConciliacion';
import { ClienteSelector } from '../../Common/ClienteSelector';
import { actualizarDatosHuespedHotel, conciliacionDisponible, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { etiquetaCampo } from './formatos';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  r: ReservaHotel;
  usuario?: string;
  onCancelar: () => void;
  onGuardado: (r: ReservaHotel) => void;
  onSucio: (sucio: boolean) => void;
}

/** Datos del huésped de la reserva y su ficha de Clientes. Se guardan SOLO en el POS: Cloudbeds conserva los suyos. */
export function EditorCliente({ r, usuario, onCancelar, onGuardado, onSucio }: Props) {
  const { clientes } = useRxClientes() as { clientes: RxCliente[] };
  const [nombre, setNombre] = useState(r.huesped_nombre);
  const [apellido, setApellido] = useState(r.huesped_apellido);
  const [email, setEmail] = useState(r.huesped_email);
  const [telefono, setTelefono] = useState(r.huesped_telefono ?? '');
  const [pais, setPais] = useState(r.huesped_pais);
  // La dirección vive solo en la ficha de Clientes (una sola fuente): se lee y se guarda allí, no en la reserva.
  const [direccion, setDireccion] = useState('');
  const [direccionTocada, setDireccionTocada] = useState(false);
  const [notas, setNotas] = useState(r.notas ?? '');
  const [clienteId, setClienteId] = useState<string | null>(r.cliente_id);
  const [busqueda, setBusqueda] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const enlazado = clientes.find((c) => c.id === clienteId);
  // La ficha puede cargar después de abrir el editor: se rellena una vez, mientras nadie haya escrito.
  useEffect(() => { if (!direccionTocada) setDireccion(enlazado?.direccion ?? ''); }, [enlazado?.id, enlazado?.direccion, direccionTocada]);
  const direccionCambio = !!enlazado && direccion.trim() !== (enlazado.direccion ?? '').trim();
  const hayCambios = nombre !== r.huesped_nombre || apellido !== r.huesped_apellido || email !== r.huesped_email
    || telefono !== (r.huesped_telefono ?? '') || pais !== r.huesped_pais || direccionCambio || notas !== (r.notas ?? '') || clienteId !== r.cliente_id;
  useEffect(() => { onSucio(hayCambios); }, [hayCambios, onSucio]);

  const faltas = {
    nombre: !nombre.trim(), apellido: !apellido.trim(),
    email: !EMAIL_RE.test(email.trim()), pais: !/^[A-Za-z]{2}$/.test(pais.trim()),
  };

  const elegir = (c: RxCliente) => {
    const n = partirNombre(c.nombre);
    setClienteId(c.id);
    setNombre(n.nombre); setApellido(n.apellido);
    if (c.email) setEmail(c.email);
    if (c.telefono) setTelefono(c.telefono);
    setDireccionTocada(false);
    setDireccion(c.direccion ?? '');
    setBusqueda('');
  };

  const guardar = async () => {
    setIntentado(true);
    if (Object.values(faltas).some(Boolean)) return;
    setGuardando(true);
    try {
      const nueva = await actualizarDatosHuespedHotel(r, { nombre, apellido, email, telefono, pais, notas, clienteId }, usuario);
      if (direccionCambio && clienteId) await updateRxCliente(clienteId, { direccion: direccion.trim() || undefined });
      showToast.success('Datos del huésped actualizados', 'Solo en el POS: Cloudbeds conserva los suyos.');
      onSucio(false);
      onGuardado(nueva);
    } catch (e) {
      showToast.fallo('guardar los datos del huésped', e);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {conciliacionDisponible && (
        <div className="flex flex-col gap-2">
          <span className={etiquetaCampo}>Ficha de Clientes</span>
          {enlazado ? (
            <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
              <User size={18} className="text-primary shrink-0" />
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="t-cuerpo-fuerte truncate">{enlazado.nombre}</span>
              </span>
              <button type="button" onClick={() => setClienteId(null)} aria-label="Quitar el enlace con la ficha" className="size-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted cursor-pointer"><X size={16} /></button>
            </div>
          ) : (
            <>
              <ClienteSelector value={busqueda} onChange={setBusqueda} onSelect={elegir} placeholder="Buscar cliente por nombre, correo o teléfono" tono="info" maxResults={5} />
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Nombre" id="ec-nombre" error={intentado && faltas.nombre ? 'Escribe el nombre' : ''}>
          <Input id="ec-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-invalid={intentado && faltas.nombre} className="h-11 text-base" />
        </Campo>
        <Campo label="Apellido" id="ec-apellido" error={intentado && faltas.apellido ? 'Escribe el apellido' : ''}>
          <Input id="ec-apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} aria-invalid={intentado && faltas.apellido} className="h-11 text-base" />
        </Campo>
        <Campo label="Correo" id="ec-email" error={intentado && faltas.email ? 'Escribe un correo válido' : ''}>
          <Input id="ec-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={intentado && faltas.email} className="h-11 text-base" />
        </Campo>
        <Campo label="Teléfono" id="ec-tel">
          <Input id="ec-tel" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="h-11 text-base" />
        </Campo>
        <Campo label="País (2 letras)" id="ec-pais" error={intentado && faltas.pais ? 'Usa el código de 2 letras: EC, US…' : ''}>
          <Input id="ec-pais" value={pais} maxLength={2} onChange={(e) => setPais(e.target.value.toUpperCase())} aria-invalid={intentado && faltas.pais} className="h-11 text-base uppercase w-24" />
        </Campo>
      </div>
      {enlazado ? (
        <Campo label="Dirección (de la ficha del cliente)" id="ec-dir">
          <Input id="ec-dir" value={direccion} onChange={(e) => { setDireccionTocada(true); setDireccion(e.target.value); }} autoComplete="street-address" placeholder="Calle, ciudad…" className="h-11 text-base" />
        </Campo>
      ) : (
        <p className="t-meta text-muted-foreground">La dirección se guarda en la ficha de Clientes: enlaza una ficha para añadirla.</p>
      )}
      <Campo label="Notas internas" id="ec-notas">
        <Textarea id="ec-notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Llegada tarde, alergias, celebración…" className="min-h-16 text-base" />
      </Campo>
      <p className="t-meta text-muted-foreground">Estos datos viven solo en el POS: Cloudbeds conserva los que tiene.</p>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onCancelar} disabled={guardando}>Descartar</Button>
        <Button type="button" className="h-11 gap-2" onClick={() => void guardar()} disabled={!hayCambios || guardando}>
          {guardando ? <><Girando /> Guardando…</> : 'Guardar datos'}
        </Button>
      </div>
    </div>
  );
}

function Campo({ label, id, error, children }: { label: string; id: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Label htmlFor={id} className={etiquetaCampo}>{label}</Label>
      {children}
      {error && <p className="t-meta text-destructive">{error}</p>}
    </div>
  );
}

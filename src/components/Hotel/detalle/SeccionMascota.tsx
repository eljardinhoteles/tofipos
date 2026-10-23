import { useState } from 'react';
import { PawPrint, Plus } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showToast } from '@/lib/toast';
import { Girando } from '../Espera';
import { TAMANOS_MASCOTA, TIPOS_MASCOTA, cambiarMascotaReservaHotel, textoMascota, type MascotaReserva, type ReservaHotel } from '../../../lib/hotelReservasApi';
import { Contador } from './Contador';
import { Seccion } from './comunes';
import { etiquetaCampo } from './formatos';

const selectClass = 'h-11 w-full px-3 text-base rounded-2xl bg-card border-border shadow-xs';

interface Props {
  r: ReservaHotel;
  puedeEditar: boolean;
  usuario?: string;
  onCambio: (r: ReservaHotel) => void;
}

/** Registro (opcional) de la mascota que viaja con el huésped: tipo, tamaño y un comentario. Solo del POS. */
export function SeccionMascota({ r, puedeEditar, usuario, onCambio }: Props) {
  const [editando, setEditando] = useState(false);
  const [cantidad, setCantidad] = useState(r.mascota?.cantidad ?? 1);
  const [tipo, setTipo] = useState<MascotaReserva['tipo']>(r.mascota?.tipo ?? 'Perro');
  const [tamano, setTamano] = useState<MascotaReserva['tamano']>(r.mascota?.tamano ?? 'Pequeño');
  const [comentario, setComentario] = useState(r.mascota?.comentario ?? '');
  const [guardando, setGuardando] = useState(false);

  const abrir = () => {
    setCantidad(r.mascota?.cantidad ?? 1); setTipo(r.mascota?.tipo ?? 'Perro'); setTamano(r.mascota?.tamano ?? 'Pequeño'); setComentario(r.mascota?.comentario ?? '');
    setEditando(true);
  };
  const guardar = async (mascota: MascotaReserva | null) => {
    setGuardando(true);
    try {
      onCambio(await cambiarMascotaReservaHotel(r, mascota, usuario));
      setEditando(false);
      showToast.success(mascota ? 'Mascota registrada' : 'Mascota quitada');
    } catch (e) {
      showToast.fallo('guardar la mascota', e);
    } finally {
      setGuardando(false);
    }
  };

  const accion = puedeEditar && !editando ? (
    <Button type="button" variant="suave" className="h-9 gap-1.5" onClick={abrir}>{r.mascota ? 'Editar' : <><Plus size={14} weight="bold" /> Añadir</>}</Button>
  ) : undefined;

  return (
    <Seccion icono={PawPrint} color="warning" titulo="Mascota" accion={accion}>
      {!editando && (r.mascota ? (
        <div className="flex flex-col gap-1">
          <span className="t-cuerpo-fuerte break-words">{textoMascota(r.mascota)}</span>
        </div>
      ) : (
        <p className="t-meta text-muted-foreground">Sin mascota. Regístrala si el huésped viaja con una.</p>
      ))}
      {editando && (
        <div className="flex flex-col gap-3">
          <Contador etiquetaTexto="Cantidad" valor={cantidad} min={1} max={10} onCambio={setCantidad} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className={etiquetaCampo}>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as MascotaReserva['tipo'])}>
                <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_MASCOTA.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className={etiquetaCampo}>Tamaño</Label>
              <Select value={tamano} onValueChange={(v) => setTamano(v as MascotaReserva['tamano'])}>
                <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent>{TAMANOS_MASCOTA.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mascota-comentario" className={etiquetaCampo}>Comentario (opcional)</Label>
            <Input id="mascota-comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Raza, nombre, indicaciones…" maxLength={200} className="h-11 text-base" />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {r.mascota && <Button type="button" variant="ghost" className="h-11 text-destructive mr-auto" onClick={() => void guardar(null)} disabled={guardando}>Quitar mascota</Button>}
            <Button type="button" variant="ghost" className="h-11" onClick={() => setEditando(false)} disabled={guardando}>Descartar</Button>
            <Button type="button" className="h-11 gap-2" onClick={() => void guardar({ cantidad, tipo, tamano, ...(comentario.trim() ? { comentario: comentario.trim() } : {}) })} disabled={guardando}>
              {guardando ? <Girando /> : null} Guardar
            </Button>
          </div>
        </div>
      )}
    </Seccion>
  );
}

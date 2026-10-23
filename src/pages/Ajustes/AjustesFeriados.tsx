import { useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { CalendarStar, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { showToast } from '@/lib/toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ReservaHeader } from '../../components/Mesas/Sidebar/ReservaHeader';
import { Fila, Grupo, Seccion, TITULO_SECCION, Vacio } from '../../components/Ajustes/AjustesUI';
import { guardarFeriado, quitarFeriado, useFeriados, type Feriado } from '../../lib/feriados';

// Ajustes → Feriados: días que se marcan en los calendarios (Hotel, Reservas, Planificador y selectores de fecha). Solo visual.
export default function AjustesFeriados() {
  const { feriados } = useFeriados();
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null); // fecha original al editar
  const [fecha, setFecha] = useState('');
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);

  const hoy = dayjs().format('YYYY-MM-DD');
  const proximos = feriados.filter((f) => f.fecha >= hoy);
  const pasados = feriados.filter((f) => f.fecha < hoy).reverse();

  const cerrar = () => { setAbierto(false); setEditando(null); setFecha(''); setNombre(''); };
  const nuevo = () => { setEditando(null); setFecha(hoy); setNombre(''); setAbierto(true); };
  const editar = (f: Feriado) => { setEditando(f.fecha); setFecha(f.fecha); setNombre(f.nombre); setAbierto(true); };

  const guardar = async () => {
    if (!fecha) { showToast.warning('Elige la fecha del feriado'); return; }
    if (!nombre.trim()) { showToast.warning('Escribe el nombre del feriado'); return; }
    setGuardando(true);
    try {
      if (editando && editando !== fecha) await quitarFeriado(editando);
      await guardarFeriado(fecha, nombre);
      showToast.success('Feriado guardado');
      cerrar();
    } catch (e) {
      showToast.fallo('guardar el feriado', e);
    } finally {
      setGuardando(false);
    }
  };
  const eliminar = async (f: Feriado) => {
    try { await quitarFeriado(f.fecha); showToast.success('Feriado eliminado'); }
    catch (e) { showToast.fallo('eliminar el feriado', e); }
  };

  const fila = (f: Feriado) => (
    <Fila key={f.fecha}
      titulo={<span className="first-letter:uppercase inline-block">{dayjs(f.fecha).locale('es').format('dddd D [de] MMMM YYYY')}</span>}
      ayuda={f.nombre}>
      <Button type="button" variant="ghost" size="icon" title="Editar" aria-label="Editar feriado" onClick={() => editar(f)} className="size-11 text-muted-foreground touch-manipulation"><PencilSimple size={18} /></Button>
      <Button type="button" variant="ghost" size="icon" title="Eliminar" aria-label="Eliminar feriado" onClick={() => void eliminar(f)} className="size-11 text-muted-foreground hover:text-destructive touch-manipulation"><Trash size={18} /></Button>
    </Fila>
  );

  return (
    <>
      <Seccion
        titulo="Feriados"
        descripcion="Días que se marcan en los calendarios del Hotel, de Reservas, del Planificador y en los selectores de fecha, para organizarte con tiempo. Es solo visual: no cambia tarifas ni disponibilidad."
        accion={<Button type="button" onClick={nuevo} className="h-12 gap-1.5 px-5"><Plus size={18} weight="bold" /> Nuevo feriado</Button>}
      >
        <Grupo>
          {feriados.length === 0 ? <Vacio>No hay feriados configurados todavía.</Vacio> : proximos.map(fila)}
          {feriados.length > 0 && proximos.length === 0 && <Vacio>No hay feriados próximos.</Vacio>}
        </Grupo>
        {pasados.length > 0 && (
          <details className="mt-3">
            <summary className="t-dato text-muted-foreground cursor-pointer select-none">Pasados ({pasados.length})</summary>
            <div className="mt-2"><Grupo>{pasados.map(fila)}</Grupo></div>
          </details>
        )}
      </Seccion>

      <Sheet open={abierto} onOpenChange={(o) => { if (!o) cerrar(); }}>
        <SheetContent showCloseButton={false} onOpenAutoFocus={(e) => e.preventDefault()}
          className="data-[side=right]:w-full data-[side=right]:sm:max-w-[462px] flex flex-col gap-0 p-0 data-[side=right]:border-l-0">
          <SheetHeader className="p-0 gap-0 space-y-0">
            <SheetTitle className="sr-only">{editando ? 'Editar feriado' : 'Nuevo feriado'}</SheetTitle>
            <SheetDescription className="sr-only">Fecha y nombre del feriado</SheetDescription>
            <ReservaHeader tono="neutro" badge={<CalendarStar size={20} weight="bold" />} titulo={editando ? 'Editar feriado' : 'Nuevo feriado'} subtitulo="Feriados" onClose={cerrar} />
          </SheetHeader>
          <main className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label className={TITULO_SECCION}>Fecha</Label>
              <DatePickerField value={fecha} onChange={setFecha} className="h-12 bg-card border-border" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="feriado-nombre" className={TITULO_SECCION}>Nombre</Label>
              <Input id="feriado-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Viernes Santo" maxLength={80} className="h-12 t-fila" />
            </div>
          </main>
          <footer className="p-4 border-t border-border bg-muted/40 flex items-center gap-2 shrink-0">
            <Button type="button" variant="outline" onClick={cerrar} disabled={guardando} className="h-12 px-5 font-bold">Cancelar</Button>
            <Button type="button" onClick={() => void guardar()} disabled={guardando} className="h-12 flex-1 font-bold">{guardando ? 'Guardando…' : 'Guardar'}</Button>
          </footer>
        </SheetContent>
      </Sheet>
    </>
  );
}

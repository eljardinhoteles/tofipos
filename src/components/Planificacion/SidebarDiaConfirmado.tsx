import { useState } from 'react';
import { PencilSimple, SealCheck, Warning } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ReservaHeader } from '../Mesas/Sidebar/ReservaHeader';
import { ResumenDia } from './ResumenDia';
import { huellaDia, type CeldaPlan, type ConfirmacionPlan, type EtiquetaPlan } from '../../lib/planificacion';

interface Props {
  fecha: string;
  diaTexto: string;
  confirmacion: ConfirmacionPlan;
  etiquetas: EtiquetaPlan[];
  celdas: CeldaPlan[];
  nombreProducto: (id: string) => string;
  onEditar: () => void;
  onClose: () => void;
}

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Sidebar de un día ya confirmado: resumen, datos de la firma y el botón para editar, que avisa
// que romperá la confirmación (los productos se conservan).
export function SidebarDiaConfirmado({ fecha, diaTexto, confirmacion, etiquetas, celdas, nombreProducto, onEditar, onClose }: Props) {
  const [avisando, setAvisando] = useState(false);
  const alterado = huellaDia(celdas, fecha) !== confirmacion.huella;
  const cuando = fechaHora(confirmacion.confirmado_at);

  return (
    <div className="h-full w-full bg-card flex flex-col overflow-hidden">
      <ReservaHeader solido tono="success" badge={<SealCheck size={22} weight="bold" />} titulo="Menú confirmado" subtitulo={diaTexto} onClose={onClose} />

      <main className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-6">
        <section className="flex flex-col gap-1.5 rounded-2xl border border-border p-4 t-cuerpo">
          <p className="font-bold text-foreground">Confirmado por {confirmacion.confirmado_por}</p>
          <p className="font-medium text-muted-foreground first-letter:uppercase">{cuando}</p>
          <p className="t-dato text-muted-foreground tabular-nums">Código de verificación: {confirmacion.huella}</p>
        </section>

        {alterado && (
          <div className="flex items-start gap-2 rounded-2xl bg-destructive/10 p-3 t-cuerpo text-destructive">
            <Warning size={18} weight="bold" className="mt-0.5 shrink-0" />
            El contenido de este día no coincide con lo que se firmó. Conviene anular la confirmación y volver a firmar.
          </div>
        )}

        <ResumenDia etiquetas={etiquetas} celdas={celdas} fecha={fecha} nombreProducto={nombreProducto} />
      </main>

      <footer className="p-4 border-t border-border bg-muted/40 shrink-0">
        <Button type="button" variant="outline" className="h-14 w-full gap-2 t-fila touch-manipulation" onClick={() => setAvisando(true)}>
          <PencilSimple size={18} weight="bold" /> Editar menú
        </Button>
      </footer>

      <AlertDialog open={avisando} onOpenChange={setAvisando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Editar un menú confirmado?</AlertDialogTitle>
            <AlertDialogDescription>
              Este menú fue confirmado el {cuando} por {confirmacion.confirmado_por}. Si lo editas se anula la confirmación y habrá que volver a firmarlo. Los productos se conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onEditar}>Anular y editar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

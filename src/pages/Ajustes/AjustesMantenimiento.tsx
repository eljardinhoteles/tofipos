import { useState } from'react';
import { Trash, Database } from'@phosphor-icons/react';
import { useAuth } from'../../context/AuthContext';
import { showToast } from'@/lib/toast';

export default function AjustesMantenimiento() {
 const { activeOrganizationId, desvincularDispositivo } = useAuth();
 const [resetting, setResetting] = useState(false);

 const handleReset = async () => {
 if (resetting) return;
 if (!activeOrganizationId) {
 showToast.error('Sin organización activa','Vincula un hotel antes de ejecutar el reset.');
 return;
 }

 const ok = window.confirm('Esto borrará TODOS los datos de la organización activa primero en Supabase y luego en el dispositivo. ¿Deseas continuar?');
 if (!ok) return;

 setResetting(true);
 try {
 const functionUrl =`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/maintenance-reset`;
 const res = await fetch(functionUrl, {
 method:'POST',
 headers: {'Content-Type':'application/json','apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,'Authorization':`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
 },
 body: JSON.stringify({ organization_id: activeOrganizationId }),
 });

 if (!res.ok) {
 const data = await res.json().catch(() => ({}));
 throw new Error(data?.error ||'No se pudo limpiar el remoto.');
 }

 await res.json().catch(() => ({}));

 await desvincularDispositivo();
 showToast.success('Base limpia','Se reinició el remoto y el dispositivo local.');
 } catch (error) {
 console.error('Error reseteando mantenimiento:', error);
 showToast.error('Error al limpiar', error instanceof Error ? error.message :'No se pudo completar el reset.');
 } finally {
 setResetting(false);
 }
 };

 return (
 <div className="flex flex-col gap-6 py-6">
 <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col gap-4">
 <div className="flex items-center justify-between">
 <div className="flex flex-col gap-1">
 <span className="w-fit px-2 py-0.5 rounded-md bg-destructive/10 text-destructive font-extrabold text-[10px] uppercase">
 Peligroso
 </span>
 <h3 className="font-extrabold text-base text-foreground">Mantenimiento</h3>
 <p className="text-xs text-muted-foreground">
 Reinicia los datos de la organización activa en remoto y limpia este dispositivo para empezar pruebas desde cero.
 </p>
 </div>
 </div>

 <div className="w-full h-[1px] bg-border"/>

 <button
 type="button"disabled={resetting || !activeOrganizationId}
 onClick={handleReset}
 className="w-fit px-4 py-2.5 rounded-xl bg-destructive disabled:opacity-50 text-white font-extrabold text-xs flex items-center gap-2 cursor-pointer transition-colors shadow-xs">
 <Trash size={18} weight="bold"/> Reiniciar base de pruebas
 </button>

 {!activeOrganizationId && (
 <span className="text-xs text-muted-foreground font-semibold">Vincula un hotel para habilitar el reset.</span>
 )}

 <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-semibold pt-2">
 <Database size={16} />
 <span>Orden: remoto primero, local después.</span>
 </div>
 </div>
 </div>
 );
}

import { useMemo, useState } from'react';
import { ClockCounterClockwise, MagnifyingGlass, ShieldCheck, CalendarBlank } from'@phosphor-icons/react';
import dayjs from'dayjs';
import { supabase } from'../../lib/supabase';
import { cn } from'@/lib/utils';
import { Input } from'@/components/ui/input';

type AuditLog = {
 id: string;
 entity: string;
 entity_id?: string;
 action: string;
 summary: string;
 actor_id?: string;
 actor_name?: string;
 actor_role?: string;
 actor_email?: string;
 created_at: string;
 before_state?: string | null;
 after_state?: string | null;
};

export default function AjustesAuditoria() {
 const [logs, setLogs] = useState<AuditLog[]>([]);
 const [loading, setLoading] = useState(false);
 const [hasLoadedToday, setHasLoadedToday] = useState(false);
 const [userQuery, setUserQuery] = useState('');
 const [entityFilter, setEntityFilter] = useState<string>('');
 const [actionFilter, setActionFilter] = useState<string>('');

 const loadToday = async () => {
 const orgId = localStorage.getItem('pos_active_org_id') ||'';
 if (!orgId) return;
 setLoading(true);
 try {
 const today = dayjs().format('YYYY-MM-DD');
 const from =`${today}T00:00:00.000Z`;
 const to =`${today}T23:59:59.999Z`;
 const { data, error } = await supabase
 .from('audit_logs')
 .select('id, entity, entity_id, action, summary, actor_id, actor_name, actor_role, actor_email, created_at, before_state, after_state')
 .eq('organization_id', orgId)
 .gte('created_at', from)
 .lte('created_at', to)
 .order('created_at', { ascending: false });
 if (error) throw error;
 setLogs((data || []) as AuditLog[]);
 setHasLoadedToday(true);
 } catch (error) {
 console.error('Error cargando auditoría de hoy:', error);
 } finally {
 setLoading(false);
 }
 };

 const filteredLogs = useMemo(() => {
 return logs.filter((log) => {
 if (userQuery.trim()) {
 const q = userQuery.toLowerCase();
 const hayMatch = [
 log.actor_name,
 log.actor_email,
 log.actor_role,
 log.summary,
 log.entity,
 ].some((value) => String(value ||'').toLowerCase().includes(q));
 if (!hayMatch) return false;
 }

 if (entityFilter && log.entity !== entityFilter) return false;
 if (actionFilter && log.action !== actionFilter) return false;

 return true;
 });
 }, [logs, userQuery, entityFilter, actionFilter]);

 return (
 <div className="flex flex-col gap-6 py-6">
 <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col gap-6">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
 <ShieldCheck size={22} weight="fill"/>
 </div>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground">Auditoría</h3>
 <p className="text-xs text-muted-foreground">Revisa cambios sensibles por usuario, entidad y tipo de acción.</p>
 </div>
 </div>

 <div className="flex items-center gap-2">
 <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-extrabold text-xs">
 {filteredLogs.length} eventos
 </span>
 {!hasLoadedToday && (
 <button
 type="button"onClick={loadToday}
 title="Cargar eventos de hoy"className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <CalendarBlank size={16} />
 </button>
 )}
 <button
 type="button"onClick={() => { setUserQuery(''); setEntityFilter(''); setActionFilter(''); }}
 title="Limpiar filtros"className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center cursor-pointer transition-colors">
 <ClockCounterClockwise size={16} />
 </button>
 </div>
 </div>

 <div className="w-full h-[1px] bg-muted"/>

 <div className="grid grid-cols-3 gap-3">
 <div className="relative">
 <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10"/>
 <Input
 type="text"placeholder="Buscar por usuario o resumen..."value={userQuery}
 onChange={(e) => setUserQuery(e.target.value)}
 className="pl-9 h-9 text-xs"/>
 </div>

 <select
 value={entityFilter}
 onChange={(e) => setEntityFilter(e.target.value)}
 className="h-9 px-3 text-xs bg-muted border border-border rounded-lg focus:outline-none focus:border-primary font-semibold">
 <option value="">Todas las entidades</option>
 <option value="comanda">Comandas</option>
 <option value="comanda_item">Ítems de comanda</option>
 <option value="pago">Pagos</option>
 <option value="usuario">Usuarios</option>
 <option value="mesa">Mesas</option>
 <option value="reserva">Reservas</option>
 </select>

 <select
 value={actionFilter}
 onChange={(e) => setActionFilter(e.target.value)}
 className="h-9 px-3 text-xs bg-muted border border-border rounded-lg focus:outline-none focus:border-primary font-semibold">
 <option value="">Todas las acciones</option>
 <option value="create">Creación</option>
 <option value="update">Edición</option>
 <option value="delete">Eliminación</option>
 <option value="status_change">Cambio de estado</option>
 </select>
 </div>

 <div className="max-h-[500px] overflow-y-auto flex flex-col gap-2 pr-1">
 {!hasLoadedToday && !loading && (
 <div className="p-8 rounded-2xl bg-muted border border-border text-center flex flex-col items-center gap-2">
 <img src="/hotel.webp"alt=""className="w-16 h-16 object-contain opacity-70"/>
 <span className="font-bold text-xs text-foreground/80">Auditoría sin cargar</span>
 <span className="text-[11px] text-muted-foreground">Haz clic en el calendario para consultar los eventos del servidor.</span>
 </div>
 )}

 {loading && (
 <div className="p-4 rounded-xl bg-muted text-muted-foreground font-semibold text-xs text-center">
 Cargando auditoría desde la nube...
 </div>
 )}

 {!loading && hasLoadedToday && filteredLogs.length === 0 && (
 <div className="p-8 rounded-2xl bg-muted border border-border text-center flex flex-col items-center gap-2">
 <img src="/no_resultado.webp"alt=""className="w-16 h-16 object-contain opacity-70"/>
 <span className="font-bold text-xs text-foreground/80">Sin resultados</span>
 <span className="text-[11px] text-muted-foreground">No hay eventos que coincidan con los filtros.</span>
 </div>
 )}

 {filteredLogs.map((log) => (
 <div key={log.id} className="p-4 rounded-xl bg-card border border-border shadow-2xs flex flex-col gap-1.5">
 <div className="flex items-center gap-2">
 <span className={cn("px-2 py-0.5 rounded-md font-bold text-[10px] uppercase",
 log.action ==='delete'?"bg-destructive/10 text-destructive": log.action ==='status_change'?"bg-amber-100 text-amber-700":"bg-primary/10 text-primary")}>
 {log.action}
 </span>
 <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-bold text-[10px] uppercase">
 {log.entity}
 </span>
 </div>
 <span className="font-extrabold text-xs text-foreground">{log.summary}</span>
 <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-semibold">
 <span>{dayjs(log.created_at).format('DD/MM/YYYY HH:mm:ss')}</span>
 <span>·</span>
 <span>{log.actor_name || log.actor_email ||'Sistema'}</span>
 {log.actor_role && (
 <span className="px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-bold">
 {log.actor_role}
 </span>
 )}
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
}

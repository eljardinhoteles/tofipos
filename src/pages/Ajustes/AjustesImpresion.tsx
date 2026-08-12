import { useEffect, useState } from'react';
import { Printer, Key, ArrowsClockwise, ForkKnife, Receipt, Trash } from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import { Input } from'@/components/ui/input';
import { Button } from'@/components/ui/button';
import { Switch } from'@/components/ui/switch';
import {
 getPrintServerStatus,
 testPrintServerPrinter,
 savePrintToken,
 savePrintServerUrl,
 listSystemPrinters,
 listConfiguredPrinters,
 addConfiguredPrinter,
 updateConfiguredPrinter,
 deleteConfiguredPrinter,
 type ConfiguredPrinter,
 type PrinterRole,
} from'../../lib/printServerClient';
import { cn } from'@/lib/utils';

const ROLE_LABELS: Record<PrinterRole, { label: string; icon: React.ElementType }> = {
 kitchen: { label:'Cocina', icon: ForkKnife },
 receipt: { label:'Caja / Recibos', icon: Receipt },
};

export default function AjustesImpresion() {
 const [serverOk, setServerOk] = useState<boolean | null>(null);
 const [serverQueue, setServerQueue] = useState<number | null>(null);
 const [serverUrl, setServerUrl] = useState('http://127.0.0.1:18181');
 const [serverUrlInput, setServerUrlInput] = useState('http://127.0.0.1:18181');
 const [, setLastAction] = useState('Sin verificar');
 const [tokenInput, setTokenInput] = useState('');

 const [systemPrinters, setSystemPrinters] = useState<string[]>([]);
 const [configuredPrinters, setConfiguredPrinters] = useState<ConfiguredPrinter[]>([]);
 const [loadingCatalog, setLoadingCatalog] = useState(false);
 const [connectingName, setConnectingName] = useState<string | null>(null);
 const [testingId, setTestingId] = useState<string | null>(null);

 useEffect(() => {
 const storedUrl = localStorage.getItem('pos_print_server_url') ||'http://127.0.0.1:18181';
 setServerUrl(storedUrl);
 setServerUrlInput(storedUrl);
 setTokenInput(localStorage.getItem('pos_print_server_token') ||'');
 }, []);

 const refreshStatus = async () => {
 try {
 const status = await getPrintServerStatus();
 setServerOk(status.ok);
 setServerQueue(status.queue ?? null);
 setLastAction(`Servidor OK. Cola: ${status.queue ?? 0}`);
 } catch (error) {
 setServerOk(false);
 setServerQueue(null);
 const message = error instanceof Error ? error.message :'error desconocido';
 setLastAction(`Servidor sin respuesta: ${message}`);
 }
 };

 const loadCatalog = async () => {
 setLoadingCatalog(true);
 try {
 const [system, configured] = await Promise.all([
 listSystemPrinters(),
 listConfiguredPrinters(),
 ]);
 setSystemPrinters(system);
 setConfiguredPrinters(configured);
 } catch (err) {
 const message = err instanceof Error ? err.message :'No se pudo cargar el catálogo de impresoras';
 showToast.error('Error', message);
 } finally {
 setLoadingCatalog(false);
 }
 };

 useEffect(() => {
 refreshStatus();
 loadCatalog();
 }, []);

 const handleSaveServerUrl = async () => {
 savePrintServerUrl(serverUrlInput);
 const storedUrl = localStorage.getItem('pos_print_server_url') ||'http://127.0.0.1:18181';
 setServerUrl(storedUrl);
 setServerUrlInput(storedUrl);
 showToast.success('URL guardada','Este dispositivo ahora apunta a ese print server.');
 await loadCatalog();
 await refreshStatus();
 };

 const handleSaveToken = async () => {
 savePrintToken(tokenInput);
 showToast.success('Token guardado','Este dispositivo ya puede autenticarse con el print server.');
 await loadCatalog();
 await refreshStatus();
 };

 const configuredNames = new Set(configuredPrinters.map(p => p.name));

 const handleConnect = async (name: string) => {
 setConnectingName(name);
 try {
 const { printer } = await addConfiguredPrinter({ name, target: name, roles: [], active: true });
 setConfiguredPrinters(prev => [...prev, printer]);
 showToast.success('Impresora conectada',`${name} ya está disponible. Asígnale un rol para recibir tickets.`);
 await refreshStatus();
 } catch (err) {
 const message = err instanceof Error ? err.message :'No se pudo conectar la impresora';
 showToast.error('Error', message);
 } finally {
 setConnectingName(null);
 }
 };

 const handleDisconnect = async (printer: ConfiguredPrinter) => {
 try {
 await deleteConfiguredPrinter(printer.id);
 setConfiguredPrinters(prev => prev.filter(p => p.id !== printer.id));
 showToast.success('Impresora desconectada');
 await refreshStatus();
 } catch (err) {
 const message = err instanceof Error ? err.message :'No se pudo desconectar la impresora';
 showToast.error('Error', message);
 }
 };

 const handleToggleRole = async (printer: ConfiguredPrinter, role: PrinterRole) => {
 const hasRole = printer.roles.includes(role);
 const roles = hasRole ? printer.roles.filter(r => r !== role) : [...printer.roles, role];
 try {
 const { printer: updated } = await updateConfiguredPrinter(printer.id, { roles });
 setConfiguredPrinters(prev => prev.map(p => p.id === printer.id ? updated : p));
 } catch (err) {
 const message = err instanceof Error ? err.message :'No se pudo actualizar el rol';
 showToast.error('Error', message);
 }
 };

 const handleToggleActive = async (printer: ConfiguredPrinter, active: boolean) => {
 try {
 const { printer: updated } = await updateConfiguredPrinter(printer.id, { active });
 setConfiguredPrinters(prev => prev.map(p => p.id === printer.id ? updated : p));
 } catch (err) {
 const message = err instanceof Error ? err.message :'No se pudo actualizar el estado';
 showToast.error('Error', message);
 }
 };

 const handleTestPrinter = async (printer: ConfiguredPrinter) => {
 setTestingId(printer.id);
 try {
 await testPrintServerPrinter(printer.id,`=== PRUEBA: ${printer.name} ===\nSi lees esto, la impresora está bien conectada.\n`);
 showToast.success('Prueba enviada',`${printer.name} recibió la orden de prueba.`);
 await refreshStatus();
 } catch (err) {
 const message = err instanceof Error ? err.message :'No se pudo enviar la prueba de impresión';
 showToast.error('Error', message);
 } finally {
 setTestingId(null);
 }
 };

 const unconfiguredSystemPrinters = systemPrinters.filter(name => !configuredNames.has(name));

 return (
 <div className="flex flex-col gap-6 py-6">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
 <Printer size={22} weight="fill"/>
 </div>
 <div className="flex flex-col">
 <h3 className="font-extrabold text-base text-foreground">Gestión de Impresoras</h3>
 <p className="text-xs text-muted-foreground">Conecta las impresoras que ya tienes instaladas en esta PC y asígnales un rol.</p>
 </div>
 </div>

 <Button variant="outline"size="sm"disabled={loadingCatalog} onClick={loadCatalog}>
 <ArrowsClockwise size={16} className={loadingCatalog ?'animate-spin':''} /> Actualizar
 </Button>
 </div>

 <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col gap-4">
 <h4 className="font-extrabold text-sm text-foreground">Estado del print server</h4>

 <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
 <div className="flex flex-col">
 <span className="text-muted-foreground">Servidor</span>
 <span className={cn(serverOk ?"text-emerald-600":"text-destructive","font-extrabold")}>
 {serverOk === null ?'Sin verificar': serverOk ?'Online':'Offline'}
 </span>
 </div>
 <div className="flex flex-col">
 <span className="text-muted-foreground">Cola pendiente</span>
 <span className="font-extrabold text-foreground">{serverQueue === null ?'-': serverQueue}</span>
 </div>
 </div>

 <div className="flex flex-col gap-1.5">
 <span className="text-xs text-muted-foreground font-bold">URL del print server</span>
 <div className="flex items-center gap-3">
 <Input
 type="text"placeholder="http://192.168.0.137:18181"value={serverUrlInput}
 onChange={(e) => setServerUrlInput(e.target.value)}
 className="flex-1 text-xs font-mono"/>
 <Button size="sm"onClick={handleSaveServerUrl}>
 Guardar URL
 </Button>
 </div>
 <span className="text-[11px] text-muted-foreground">
 En este dispositivo usa 127.0.0.1. En celulares/tablets de la misma red, usa la IP local de la PC con el print server (ej: 192.168.0.137).
 </span>
 </div>
 </div>

 <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col gap-4">
 <h4 className="font-extrabold text-sm text-foreground">Token de impresión</h4>
 <div className="flex items-center gap-3">
 <Input
 type="text"placeholder="Ej: AB3K-9XQZ"value={tokenInput}
 onChange={(e) => setTokenInput(e.target.value)}
 className="flex-1 text-xs font-mono"/>
 <Button size="sm"onClick={handleSaveToken}>
 <Key size={16} /> Guardar Token
 </Button>
 </div>
 </div>

 {/* Impresoras Conectadas */}
 <div className="flex flex-col gap-3">
 <h4 className="font-extrabold text-sm text-foreground">Impresoras conectadas</h4>
 {configuredPrinters.length === 0 ? (
 <div className="bg-card p-8 rounded-2xl border border-border text-center flex flex-col items-center gap-2">
 <Printer size={36} className="text-muted-foreground"/>
 <span className="font-bold text-xs text-foreground">No hay impresoras conectadas todavía</span>
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {configuredPrinters.map((printer) => (
 <div key={printer.id} className="bg-card p-5 rounded-2xl border border-border shadow-xs flex flex-col gap-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Printer size={18} className="text-primary"/>
 <span className="font-extrabold text-sm text-foreground">{printer.name}</span>
 </div>
 <Switch
 checked={printer.active}
 onCheckedChange={(checked) => handleToggleActive(printer, checked)}
 />
 </div>

 <div className="flex flex-col gap-1.5">
 <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recibe tickets de:</span>
 <div className="flex items-center gap-2">
 {(Object.keys(ROLE_LABELS) as PrinterRole[]).map((role) => {
 const { label } = ROLE_LABELS[role];
 const active = printer.roles.includes(role);
 return (
 <button
 key={role}
 type="button"onClick={() => handleToggleRole(printer, role)}
 className={cn("px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer border",
 active ?"bg-primary text-primary-foreground border-primary":"bg-card text-muted-foreground border-border")}
 >
 {label}
 </button>
 );
 })}
 </div>
 </div>

 <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
 <button
 type="button"disabled={testingId === printer.id}
 onClick={() => handleTestPrinter(printer)}
 className="px-3 py-1.5 rounded-lg bg-muted text-foreground font-bold text-xs cursor-pointer">
 Probar
 </button>
 <button
 type="button"onClick={() => handleDisconnect(printer)}
 className="p-1.5 rounded-lg text-destructive cursor-pointer">
 <Trash size={16} />
 </button>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Impresoras Disponibles en Windows */}
 <div className="flex flex-col gap-3">
 <h4 className="font-extrabold text-sm text-foreground">Impresoras disponibles en esta PC</h4>
 {unconfiguredSystemPrinters.length === 0 ? (
 <div className="bg-card p-6 rounded-2xl border border-border text-center text-xs text-muted-foreground font-semibold">
 Todas las impresoras detectadas ya están conectadas o no hay impresoras en Windows.
 </div>
 ) : (
 <div className="flex flex-col gap-2">
 {unconfiguredSystemPrinters.map((name) => (
 <div key={name} className="bg-card p-4 rounded-xl border border-border flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Printer size={16} className="text-muted-foreground"/>
 <span className="font-bold text-xs text-foreground">{name}</span>
 </div>
 <button
 type="button"disabled={connectingName === name}
 onClick={() => handleConnect(name)}
 className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold text-xs cursor-pointer transition-colors">
 Conectar
 </button>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 );
}

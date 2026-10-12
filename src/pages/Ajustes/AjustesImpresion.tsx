import { useEffect, useRef, useState } from'react';
import { Printer, ArrowsClockwise, ForkKnife, Receipt, Trash, FloppyDiskIcon, Copy, LinkSimple, LinkBreak, ArrowSquareOut, Warning } from'@phosphor-icons/react';
import { showToast } from'@/lib/toast';
import { Input } from'@/components/ui/input';
import { Button } from'@/components/ui/button';
import { CheckRedondo } from '../../components/Common/CheckRedondo';
import { Casilla } from '../../components/Common/Casilla';
import { Tabs, TabsList, TabsTrigger } from'@/components/ui/tabs';
import { EstadoBadge } from '../../components/Common/EstadoBadge';
import { Campo, Fila, Grupo, Seccion, TITULO_SECCION, Vacio } from'../../components/Ajustes/AjustesUI';
import {
 getPrintServerStatus,
 testPrintServerPrinter,
 savePrintToken,
 savePrintServerUrl,
 listSystemPrinters,
 createPrintPairing,
 unpairPrintServer,
 fetchCloudPrintServer,
 getCachedCloudPrintServer,
 isCloudServerOnline,
 type CloudPrintServer,
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
 const [, setServerUrl] = useState('http://127.0.0.1:18181');
 const [serverUrlInput, setServerUrlInput] = useState('http://127.0.0.1:18181');
 const [, setLastAction] = useState('Sin verificar');
 const [tokenInput, setTokenInput] = useState('');

 const [systemPrinters, setSystemPrinters] = useState<string[]>([]);
 const [configuredPrinters, setConfiguredPrinters] = useState<ConfiguredPrinter[]>([]);
 const [loadingCatalog, setLoadingCatalog] = useState(false);
 const [connectingName, setConnectingName] = useState<string | null>(null);
 const [testingId, setTestingId] = useState<string | null>(null);
 // Cola en la nube: servidor vinculado + paquete de vinculación pendiente.
 const [cloudServer, setCloudServer] = useState<CloudPrintServer | null>(() => getCachedCloudPrintServer());
 const [pairing, setPairing] = useState<{ package: string; code: string; expiresAt: string } | null>(null);
 const [pairingBusy, setPairingBusy] = useState(false);
 // Servidor visto en la última lectura: permite avisar si desapareció o lo reemplazó otro equipo.
 const lastServerRef = useRef<CloudPrintServer | null>(getCachedCloudPrintServer());
 const [aviso, setAviso] = useState<string | null>(null);
 // Sin servidor vinculado: qué opción de conexión se muestra.
 const [modoConexion, setModoConexion] = useState<'nube' | 'local'>(() => (localStorage.getItem('pos_print_server_url') ? 'local' : 'nube'));

 useEffect(() => {
 const storedUrl = localStorage.getItem('pos_print_server_url') ||'http://127.0.0.1:18181';
 setServerUrl(storedUrl);
 setServerUrlInput(storedUrl);
 setTokenInput(localStorage.getItem('pos_print_server_token') ||'');
 }, []);

 const refreshStatus = async () => {
 try {
 const status = await getPrintServerStatus({ detailed: true });
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

 // `silent`: no muestra ningún toast propio (ni éxito ni error) y relanza
 // el error para que el caller decida qué mostrar — usado quien encadena
 // esta carga con otro paso (ej. guardar conexión) y solo quiere un único
 // toast final, no uno por cada función intermedia.
 const loadCatalog = async (opts?: { notify?: boolean; silent?: boolean }) => {
 setLoadingCatalog(true);
 try {
 const [system, configured] = await Promise.all([
 listSystemPrinters(),
 listConfiguredPrinters(),
 ]);
 setSystemPrinters(system);
 setConfiguredPrinters(configured);
 if (opts?.notify) {
 showToast.success('Catálogo actualizado');
 }
 } catch (err) {
 if (opts?.silent) throw err;
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
 useEffect(() => {
 let alive = true;
 const refresh = async () => {
 const server = await fetchCloudPrintServer();
 if (!alive) return;
 const previo = lastServerRef.current;
 if (previo && !server) {
 setAviso('El servidor de impresión fue desvinculado. Los tickets no saldrán por la nube hasta vincular de nuevo.');
 } else if (previo && server && previo.id !== server.id) {
 setAviso(`El servidor de impresión fue reemplazado${server.hostname ? ` por ${server.hostname}` :''}. Solo se permite un servidor por organización.`);
 } else if (server) {
 setAviso(null);
 }
 lastServerRef.current = server;
 setCloudServer(server);
 if (server && pairing) {
 // El servidor acaba de vincularse: cierra el paso a paso y recarga impresoras.
 setPairing(null);
 await loadCatalog();
 await refreshStatus();
 showToast.success('Servidor vinculado', server.hostname ? `${server.hostname} ya imprime por la nube.` : 'Ya imprime por la nube.');
 }
 };
 refresh();
 // Pendiente de vincular: revisa cada 4 s. Ya vinculado: refresca el latido cada 15 s.
 const id = setInterval(() => { refresh(); if (!pairing) refreshStatus(); }, pairing ? 4000 : 15000);
 return () => { alive = false; clearInterval(id); };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [pairing]);

 const handleCreatePairing = async () => {
 setPairingBusy(true);
 try {
 setPairing(await createPrintPairing());
 } catch (err) {
 showToast.error('No se pudo generar el paquete', err instanceof Error ? err.message : 'Error desconocido');
 } finally {
 setPairingBusy(false);
 }
 };

 const handleCopyPairing = async () => {
 if (!pairing) return;
 try {
 await navigator.clipboard.writeText(pairing.package);
 showToast.success('Paquete copiado');
 } catch {
 showToast.error('No se pudo copiar', 'El navegador bloqueó el portapapeles. Vuelve a pulsar "Copiar paquete" o genera uno nuevo.');
 }
 };

 const handleUnpair = async () => {
 if (!cloudServer) return;
 try {
 await unpairPrintServer(cloudServer.id);
 lastServerRef.current = null;
 setAviso(null);
 setCloudServer(null);
 setConfiguredPrinters([]);
 showToast.success('Servidor desvinculado', 'Las impresiones vuelven a usar la conexión local.');
 await refreshStatus();
 } catch (err) {
 showToast.error('No se pudo desvincular', err instanceof Error ? err.message : 'Error desconocido');
 }
 };

 // Un solo botón guarda ambos ajustes (URL + token) — casi siempre se
 // configuran juntos al vincular un dispositivo nuevo al print server.
 // En cadena: si recargar el catálogo o el estado falla (ej. la URL nueva
 // todavía no responde), se muestra SOLO ese error, nunca junto al toast
 // de éxito — evita el mensaje contradictorio de "guardado" + "falló".
 const handleSaveConnection = async () => {
 savePrintServerUrl(serverUrlInput);
 savePrintToken(tokenInput);
 const storedUrl = localStorage.getItem('pos_print_server_url') ||'http://127.0.0.1:18181';
 setServerUrl(storedUrl);
 setServerUrlInput(storedUrl);
 try {
 await loadCatalog({ silent: true });
 await refreshStatus();
 showToast.success('Ajustes guardados','Este dispositivo ahora apunta a ese print server.');
 } catch (err) {
 const message = err instanceof Error ? err.message :'No se pudo conectar con el print server';
 showToast.error('Error', message);
 }
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

  // Estado visible del servidor: punto + frase + detalle. Con la nube vinculada, el detalle suma la última señal.
  const estado = serverOk === null
    ? { punto: 'bg-muted-foreground/50', texto: 'Sin verificar' }
    : serverOk
      ? { punto: 'bg-success', texto: 'Servidor en línea' }
      : { punto: 'bg-destructive', texto: 'Servidor sin conexión' };
  const detalleEstado = [
    `Cola pendiente: ${serverQueue === null ? '-' : serverQueue}`,
    cloudServer?.last_seen && !isCloudServerOnline(cloudServer)
      ? `Sin señal desde ${new Date(cloudServer.last_seen).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
      : null,
    cloudServer?.version ? `v${cloudServer.version}` : null,
  ].filter(Boolean).join(' · ');
  // Si no hay servidor vinculado se ofrece elegir cómo conectar: nube (recomendado) o red local.
  const modoActivo = cloudServer || pairing ? 'nube' : modoConexion;

  return (
    <div className="flex flex-col gap-6">
      {aviso && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-destructive-soft text-destructive px-4 py-3 t-cuerpo-fuerte">
          <Warning size={20} weight="bold" className="shrink-0 mt-0.5" />
          <span className="flex-1">{aviso} Abre el panel del servidor en la PC de impresión para volver a vincularlo.</span>
          <button type="button" className="underline shrink-0" onClick={() => setAviso(null)}>Cerrar</button>
        </div>
      )}

      {/* 1 · Estado */}
      <Seccion titulo="Estado del servidor" descripcion="El servidor de impresión es el programa que corre en la PC del local y manda los tickets a las impresoras.">
        <Fila
          icono={<span aria-hidden="true" className={cn('size-3 rounded-full shrink-0', estado.punto)} />}
          titulo={estado.texto}
          ayuda={detalleEstado}
        >
          <Button variant="outline" className="gap-2" asChild>
            <a href="http://localhost:18181/" target="_blank" rel="noreferrer">
              <ArrowSquareOut size={18} /> Panel del servidor
            </a>
          </Button>
          <Button variant="outline" className="gap-2" disabled={loadingCatalog}
            onClick={async () => { await loadCatalog(); await refreshStatus(); showToast.success('Estado actualizado'); }}>
            <ArrowsClockwise size={18} className={loadingCatalog ? 'animate-spin' : ''} /> Actualizar
          </Button>
        </Fila>
      </Seccion>

      {/* 2 · Conexión */}
      <Seccion titulo="Conexión" descripcion="Cómo se comunica este dispositivo con el servidor de impresión.">
        {!cloudServer && !pairing && (
          <Tabs value={modoConexion} onValueChange={(v) => setModoConexion(v as 'nube' | 'local')}>
            <TabsList aria-label="Tipo de conexión">
              <TabsTrigger value="nube">Nube (recomendado)</TabsTrigger>
              <TabsTrigger value="local">Red local</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {modoActivo === 'nube' && (
          <>
            {cloudServer ? (
              <Grupo>
                <Fila
                  icono={
                    <span className={cn('size-10 rounded-xl flex items-center justify-center shrink-0',
                      isCloudServerOnline(cloudServer) ? 'bg-success-soft text-success-foreground' : 'bg-destructive-soft text-destructive')}>
                      <LinkSimple size={20} weight="bold" />
                    </span>
                  }
                  titulo={cloudServer.hostname || 'Servidor de impresión'}
                  ayuda={isCloudServerOnline(cloudServer) ? 'Vinculado por la nube · conectado' : 'Vinculado por la nube · sin señal'}
                >
                  <Button variant="outline" className="gap-2 text-destructive" onClick={handleUnpair}>
                    <LinkBreak size={16} weight="bold" /> Desvincular
                  </Button>
                </Fila>
              </Grupo>
            ) : pairing ? (
              <div className="flex flex-col gap-4">
                <ol className="flex flex-col gap-3 t-cuerpo text-muted-foreground">
                  <li><span className="t-cuerpo-fuerte text-foreground">1.</span> Copia el paquete de vinculación (vence {new Date(pairing.expiresAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}).</li>
                  <li><span className="t-cuerpo-fuerte text-foreground">2.</span> En la PC con las impresoras ejecuta: <span className="font-mono t-cuerpo-fuerte text-foreground select-text">pos-print-server.exe --pair &lt;paquete&gt;</span></li>
                  <li><span className="t-cuerpo-fuerte text-foreground">3.</span> Esta pantalla se actualizará sola al vincularse.</li>
                </ol>
                {/* El paquete no se muestra en pantalla: solo se copia al portapapeles. */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 basis-48 min-w-0 rounded-2xl bg-muted px-4 h-12 flex items-center t-cuerpo font-mono text-muted-foreground tracking-widest select-none" aria-label="Paquete oculto">
                    POS1.••••••••••••••••••••
                  </div>
                  <Button className="h-12 shrink-0 gap-2 px-5" onClick={handleCopyPairing}><Copy size={18} weight="bold" /> Copiar paquete</Button>
                </div>
                <div><Button variant="ghost" className="text-muted-foreground" onClick={() => setPairing(null)}>Cancelar</Button></div>
              </div>
            ) : (
              <Grupo>
                <Fila titulo="Vincular con la nube" ayuda="Imprime desde cualquier tablet o celular sin configurar IP ni token.">
                  <Button className="gap-2" disabled={pairingBusy} onClick={handleCreatePairing}>
                    <LinkSimple size={16} weight="bold" /> Generar paquete
                  </Button>
                </Fila>
              </Grupo>
            )}

            {cloudServer && (
              <Campo etiqueta="Token de red local (opcional)" htmlFor="print-token"
                ayuda="La IP del servidor se descubre sola. Con el token, este dispositivo imprime directo por la red local (más rápido y sin internet); sin él, imprime por la nube.">
                <div className="flex items-center gap-2">
                  <Input id="print-token" type="password" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                    placeholder="Ej: AB3K-9XQZ" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} className="flex-1 min-w-0 h-12 text-base font-mono" />
                  <Button className="h-12 shrink-0 gap-2 px-5"
                    onClick={() => { savePrintToken(tokenInput); showToast.success('Token guardado', 'Este dispositivo imprimirá por la red local cuando pueda.'); }}>
                    <FloppyDiskIcon size={18} weight="bold" /> Guardar
                  </Button>
                </div>
              </Campo>
            )}
          </>
        )}

        {modoActivo === 'local' && (
          <div className="flex flex-col gap-5">
            <Campo etiqueta="URL del servidor" htmlFor="print-url"
              ayuda="En este dispositivo usa 127.0.0.1. En celulares o tablets de la misma red, usa la IP local de la PC con el servidor (ej: 192.168.0.137).">
              <Input id="print-url" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                placeholder="http://192.168.0.137:18181" value={serverUrlInput} onChange={(e) => setServerUrlInput(e.target.value)} className="h-12 text-base font-mono" />
            </Campo>
            <Campo etiqueta="Token de impresión" htmlFor="print-token-local">
              <div className="flex items-center gap-2">
                <Input id="print-token-local" type="password" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                  placeholder="Ej: AB3K-9XQZ" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} className="flex-1 min-w-0 h-12 text-base font-mono" />
                <Button className="h-12 shrink-0 gap-2 px-5" onClick={handleSaveConnection}>
                  <FloppyDiskIcon size={18} weight="bold" /> Guardar
                </Button>
              </div>
            </Campo>
          </div>
        )}
      </Seccion>

      {/* 3 · Impresoras */}
      <Seccion titulo="Impresoras" descripcion="Activa cada impresora y elige qué tickets recibe.">
        {configuredPrinters.length === 0 ? (
          <Grupo><Vacio>No hay impresoras conectadas todavía.</Vacio></Grupo>
        ) : (
          <Grupo>
            {configuredPrinters.map((printer) => (
              <div key={printer.id} className="flex flex-col gap-3 px-1 py-4 border-b border-border/60 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Printer size={22} className={cn('shrink-0', printer.active ? 'text-foreground' : 'text-muted-foreground opacity-50')} />
                    <span className={cn('t-fila truncate', !printer.active && 'text-muted-foreground')}>{printer.name}</span>
                    {!printer.active && <EstadoBadge tono="neutral">Inactiva</EstadoBadge>}
                  </div>
                  <CheckRedondo checked={printer.active} aria-label={`Activar ${printer.name}`} onCheckedChange={(checked) => handleToggleActive(printer, checked)} />
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pl-9">
                  <span className={TITULO_SECCION}>Recibe tickets de</span>
                  {(Object.keys(ROLE_LABELS) as PrinterRole[]).map((role) => (
                    <Casilla key={role} checked={printer.roles.includes(role)} onChange={() => handleToggleRole(printer, role)}>
                      {ROLE_LABELS[role].label}
                    </Casilla>
                  ))}
                </div>

                <div className="flex items-center gap-2 pl-9">
                  <Button variant="outline" className="h-11" disabled={testingId === printer.id} onClick={() => handleTestPrinter(printer)}>
                    {testingId === printer.id ? 'Enviando…' : 'Imprimir prueba'}
                  </Button>
                  <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-destructive" onClick={() => handleDisconnect(printer)}>
                    <Trash size={16} /> Desconectar
                  </Button>
                </div>
              </div>
            ))}
          </Grupo>
        )}

        {/* Impresoras de Windows que aún no están conectadas: solo se muestran si hay alguna. */}
        {unconfiguredSystemPrinters.length > 0 && (
          <div className="flex flex-col gap-2 pt-2">
            <h4 className={TITULO_SECCION}>Disponibles en esta PC</h4>
            <Grupo className="border-t border-border/60">
              {unconfiguredSystemPrinters.map((name) => (
                <Fila key={name} icono={<Printer size={20} className="text-muted-foreground shrink-0" />} titulo={name}>
                  <Button className="h-11" disabled={connectingName === name} onClick={() => handleConnect(name)}>
                    {connectingName === name ? 'Conectando…' : 'Conectar'}
                  </Button>
                </Fila>
              ))}
            </Grupo>
          </div>
        )}
      </Seccion>
    </div>
  );
}

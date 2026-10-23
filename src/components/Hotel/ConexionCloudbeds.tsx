import { useCallback, useEffect, useState } from 'react';
import { ArrowsClockwise, CheckCircle, Plugs, PlugsConnected, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showToast } from '@/lib/toast';
import { EstadoBadge } from '../Common/EstadoBadge';
import { Girando } from './Espera';
import { Campo, Fila, Grupo, Seccion } from '../Ajustes/AjustesUI';
import {
  cloudbedsConfigurado, desconectarIntegracionCloudbeds, getFuentesCloudbeds, getIntegracionCloudbeds, guardarIntegracionCloudbeds,
  probarIntegracionCloudbeds, registrarAvisosCloudbeds, type EstadoIntegracionCloudbeds,
} from '../../lib/cloudbeds';

interface Props {
  /** Se llama tras guardar, probar o desconectar, para que la pantalla vuelva a comprobar el estado del módulo. */
  onCambio?: () => void;
}

// Hotel › Estado: conectar la organización con SU cuenta de Cloudbeds (solo administradores). La API key se escribe aquí, viaja por HTTPS al
// Worker, que la prueba contra Cloudbeds y la guarda cifrada. El navegador no la vuelve a recibir: solo el estado.
export function ConexionCloudbeds({ onCambio }: Props) {
  const [estado, setEstado] = useState<EstadoIntegracionCloudbeds | null>(null);
  const [error, setError] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [fuente, setFuente] = useState('');
  const [trabajando, setTrabajando] = useState<null | 'guardar' | 'probar' | 'avisos' | 'desconectar'>(null);
  const [confirmando, setConfirmando] = useState(false);

  const cargar = useCallback(async () => {
    setError('');
    try { setEstado(await getIntegracionCloudbeds()); } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo consultar el estado';
      // Un Worker anterior a esta pantalla no conoce la ruta y responde como si faltara la cuenta: se explica qué falta de verdad.
      setError(/no tiene una cuenta de Cloudbeds conectada|No encontrado/i.test(msg)
        ? 'El servidor de Cloudbeds (Worker) todavía no tiene esta pantalla: hay que desplegar su versión nueva (con la migración 20261022000400 y los secretos SUPABASE_SERVICE_KEY y CREDENCIALES_KEY).'
        : msg);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  // Con la cuenta ya conectada se ofrecen las fuentes de reservas de Cloudbeds para elegir la del POS (sin teclear el id).
  const [fuentes, setFuentes] = useState<Array<{ id: string; nombre: string }> | null>(null);
  const conectadoDesdeAjustes = estado?.conectado && estado.origen === 'ajustes';
  useEffect(() => {
    if (!conectadoDesdeAjustes) { setFuentes(null); return; }
    let vigente = true;
    getFuentesCloudbeds().then((r) => { if (vigente) setFuentes(r.fuentes); }).catch(() => { if (vigente) setFuentes([]); });
    return () => { vigente = false; };
  }, [conectadoDesdeAjustes]);

  const correr = async (que: NonNullable<typeof trabajando>, accion: () => Promise<void>) => {
    setTrabajando(que);
    try { await accion(); } catch (e) { showToast.fallo(que === 'guardar' ? 'guardar la conexión' : que === 'probar' ? 'probar la conexión' : que === 'avisos' ? 'registrar los avisos' : 'desconectar', e); } finally { setTrabajando(null); }
  };

  const soloFuente = !apiKey.trim() && !!conectadoDesdeAjustes && !!fuente.trim();
  const guardar = () => correr('guardar', async () => {
    const e = await guardarIntegracionCloudbeds(apiKey.trim(), fuente);
    setEstado(e);
    setApiKey('');
    setFuente('');
    onCambio?.();
    showToast.success(soloFuente ? 'Fuente guardada' : 'Conexión guardada', soloFuente ? 'Las reservas nuevas usarán esa fuente. Las pendientes se reintentan solas.' : `${e.hotel ?? 'Cloudbeds'} respondió correctamente. La clave quedó cifrada y no se vuelve a mostrar.`);
  });

  const probar = () => correr('probar', async () => {
    const r = await probarIntegracionCloudbeds();
    if (r.ok) { showToast.success('Conexión correcta', r.hotel ?? 'Cloudbeds respondió'); onCambio?.(); }
    else showToast.error('La conexión falló', r.error);
  });

  const avisos = () => correr('avisos', async () => {
    const r = await registrarAvisosCloudbeds();
    if (r.fallidos.length === 0) showToast.success('Avisos registrados', `${r.registrados} de ${r.total} eventos de Cloudbeds llegarán al POS al instante.`);
    else showToast.warning(`${r.registrados} de ${r.total} avisos registrados`, r.fallidos.join(' · '));
  });

  const desconectar = () => correr('desconectar', async () => {
    setEstado(await desconectarIntegracionCloudbeds());
    setConfirmando(false);
    onCambio?.();
    showToast.success('Cloudbeds desconectado', 'Se borró la clave guardada de esta organización.');
  });

  const listo = estado?.listos.servidor && estado?.listos.cifrado;
  const ocupado = trabajando !== null;

  return (
    <div className="flex flex-col gap-6">
      <Seccion
        titulo="Cloudbeds"
        descripcion="Conecta esta organización con su propiedad de Cloudbeds para ver el calendario, reservar y sincronizar cambios. Cada sucursal usa su propia clave."
        accion={estado ? (estado.conectado ? <EstadoBadge tono="success">Conectado</EstadoBadge> : <EstadoBadge tono="neutral">No configurado</EstadoBadge>) : undefined}
      >
        {!cloudbedsConfigurado && (
          <p className="t-cuerpo text-destructive flex items-start gap-2"><WarningCircle size={18} weight="fill" className="shrink-0 mt-0.5" /> Falta la dirección del Worker de Cloudbeds en esta instalación (VITE_CLOUDBEDS_WORKER_URL).</p>
        )}
        {error && <p role="alert" className="t-cuerpo text-destructive flex items-start gap-2"><WarningCircle size={18} weight="fill" className="shrink-0 mt-0.5" /> {error}</p>}
        {!estado && !error && <p className="t-cuerpo text-muted-foreground">Consultando…</p>}

        {estado && (
          <>
            <Grupo>
              <Fila
                icono={estado.conectado ? <PlugsConnected size={22} className="text-success shrink-0" /> : <Plugs size={22} className="text-muted-foreground shrink-0" />}
                titulo={estado.conectado ? (estado.hotel ?? 'Cuenta de Cloudbeds conectada') : 'Sin cuenta de Cloudbeds'}
                ayuda={estado.conectado
                  ? `${estado.origen === 'ajustes' ? 'Configurada desde Ajustes' : 'Configurada en el servidor'}${estado.propiedad ? ` · propiedad ${estado.propiedad}` : ''}${estado.fuente ? ' · con fuente de reservas' : ''}`
                  : 'Pega la API key de tu propiedad para conectarla.'}
              >
                {estado.conectado && (
                  <Button type="button" variant="outline" onClick={() => void probar()} disabled={ocupado} className="gap-1.5">
                    {trabajando === 'probar' ? <Girando /> : <ArrowsClockwise size={16} weight="bold" />} Probar conexión
                  </Button>
                )}
              </Fila>
              {estado.conectado && estado.origen === 'ajustes' && (
                <Fila titulo="Avisos en vivo" ayuda="Registra en Cloudbeds los avisos de reservas y bloqueos para que el POS se entere al instante. Se hace una vez por organización.">
                  <Button type="button" variant="outline" onClick={() => void avisos()} disabled={ocupado}>{trabajando === 'avisos' ? <Girando /> : null} Registrar avisos</Button>
                </Fila>
              )}
            </Grupo>

            {!listo && (
              <p className="t-cuerpo rounded-xl bg-warning-soft text-warning-foreground px-3 py-2">
                El servidor todavía no puede guardar claves: falta configurar {!estado.listos.servidor && 'SUPABASE_SERVICE_KEY'}{!estado.listos.servidor && !estado.listos.cifrado && ' y '}{!estado.listos.cifrado && 'CREDENCIALES_KEY'} en el Worker.
              </p>
            )}

            {estado.origen === 'secreto' && (
              <p className="t-meta text-muted-foreground">
                Esta conexión está configurada en el servidor y funciona. Si quieres gestionarla desde aquí, pega su API key: pasará a Ajustes (cifrada) y los avisos en vivo ya registrados seguirán llegando.
              </p>
            )}
            {(
              <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if ((apiKey.trim() || soloFuente) && listo && !ocupado) void guardar(); }} autoComplete="off">
                <Campo etiqueta={estado.origen === 'ajustes' ? 'Reemplazar la API key' : estado.conectado ? 'Pasar la conexión a Ajustes (pega su API key)' : 'API key de Cloudbeds'} htmlFor="cb-api-key"
                  ayuda="Se prueba contra Cloudbeds antes de guardarse y se almacena cifrada. Después no se vuelve a mostrar.">
                  <Input id="cb-api-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="new-password" spellCheck={false}
                    placeholder="••••••••••••••••" className="h-12 text-base" disabled={!listo || ocupado} />
                </Campo>
                <Campo etiqueta="Fuente de reservas del POS" htmlFor="cb-fuente" ayuda="La fuente con la que Cloudbeds registra las reservas hechas desde el POS. Debe verse como s-123456789. Si ya conectaste, elígela de la lista; las reservas pendientes se reintentan solas al guardarla.">
                  {fuentes && fuentes.length > 0 ? (
                    <Select value={fuente} onValueChange={setFuente} disabled={!listo || ocupado}>
                      <SelectTrigger id="cb-fuente" className="data-[size=default]:h-12 w-full px-2.5 text-base rounded-2xl bg-card border-border shadow-xs"><SelectValue placeholder="Elige la fuente" /></SelectTrigger>
                      <SelectContent>{fuentes.map((f) => <SelectItem key={f.id} value={f.id} className="t-cuerpo">{f.nombre ? `${f.nombre} · ${f.id}` : f.id}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input id="cb-fuente" value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder="s-123456789" spellCheck={false} className="h-12 text-base" disabled={!listo || ocupado} />
                  )}
                </Campo>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {estado.conectado && estado.origen === 'ajustes' ? (
                    confirmando ? (
                      <span className="flex items-center gap-2">
                        <span className="t-cuerpo text-destructive">¿Borrar la clave guardada?</span>
                        <Button type="button" variant="outline" onClick={() => setConfirmando(false)} disabled={ocupado}>No</Button>
                        <Button type="button" variant="destructive" onClick={() => void desconectar()} disabled={ocupado}>{trabajando === 'desconectar' ? <Girando /> : null} Sí, desconectar</Button>
                      </span>
                    ) : (
                      <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmando(true)} disabled={ocupado}>Desconectar</Button>
                    )
                  ) : <span />}
                  <Button type="submit" disabled={(!apiKey.trim() && !soloFuente) || !listo || ocupado} className="gap-1.5">
                    {trabajando === 'guardar' ? <><Girando /> {soloFuente ? 'Guardando…' : 'Probando…'}</> : <><CheckCircle size={16} weight="bold" /> {soloFuente ? 'Guardar fuente' : 'Guardar y probar conexión'}</>}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </Seccion>
    </div>
  );
}

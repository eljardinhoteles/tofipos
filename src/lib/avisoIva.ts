import dayjs from 'dayjs';

// Tasas de IVA con vigencia (p. ej. 8% en feriados) generan avisos para que el
// personal cambie el IVA a mano: en el sistema, en las comandas ya abiertas y
// en el terminal de tarjetas. Nada se activa solo.

export type AjusteIvaAviso = {
  id: string;
  porcentaje: number;
  activo: boolean;
  vigente_desde?: string | null;
  vigente_hasta?: string | null;
  _deleted?: boolean;
};

export type AvisoIva = {
  /** activar: ya rige la tasa temporal · proximo: rige mañana · revertir: terminó, volver a la normal */
  tipo: 'activar' | 'proximo' | 'revertir';
  /** Tasa que está activa hoy en el sistema. */
  actual: number;
  /** Tasa a la que hay que cambiar. */
  destino: AjusteIvaAviso;
  /** Vigencia de la tasa temporal involucrada (YYYY-MM-DD). */
  desde: string;
  hasta: string;
  /** Clave estable: un aviso se muestra una vez por sesión y día. */
  clave: string;
};

export function hoyLocal(): string {
  return dayjs().format('YYYY-MM-DD');
}

export function calcularAvisoIva(ajustes: AjusteIvaAviso[], hoy: string = hoyLocal()): AvisoIva | null {
  const vivos = ajustes.filter(a => !a._deleted);
  const activa = vivos.find(a => a.activo);
  if (!activa) return null;

  const temporales = vivos.filter(a => a.vigente_desde && a.vigente_hasta);
  const build = (tipo: AvisoIva['tipo'], destino: AjusteIvaAviso, temporal: AjusteIvaAviso): AvisoIva => ({
    tipo,
    actual: activa.porcentaje,
    destino,
    desde: temporal.vigente_desde as string,
    hasta: temporal.vigente_hasta as string,
    clave: `${tipo}:${destino.id}:${hoy}`,
  });

  // 1) Hoy rige una tasa temporal que aún no está activa → hay que cambiarla.
  const vigente = temporales.find(t => !t.activo && t.vigente_desde! <= hoy && hoy <= t.vigente_hasta!);
  if (vigente) return build('activar', vigente, vigente);

  // 2) La tasa activa era temporal y ya venció → volver a la normal.
  if (activa.vigente_hasta && hoy > activa.vigente_hasta) {
    const normal = vivos
      .filter(a => !a.activo && !a.vigente_desde && !a.vigente_hasta)
      .sort((a, b) => b.porcentaje - a.porcentaje)[0];
    if (normal) return build('revertir', normal, activa);
  }

  // 3) Mañana empieza una tasa temporal → aviso previo.
  const manana = dayjs(hoy).add(1, 'day').format('YYYY-MM-DD');
  const proxima = temporales.find(t => !t.activo && t.vigente_desde === manana);
  if (proxima) return build('proximo', proxima, proxima);

  return null;
}

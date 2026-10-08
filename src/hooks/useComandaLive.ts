import { filtrarCuentasHabitacionVigentes } from '../lib/habitacionCuentas';
import { useEffect, useState } from 'react';
import { initVerticalRxDb } from '../db/rxdb';
import { isOperativeComanda } from '../db/comandaState';

// Datos en vivo de la comanda abierta en el sidebar: la propia comanda, sus
// pagos y ventas (Centro de Ventas: trae abonos registrados antes de que la
// comanda existiera como mesa, p. ej. al asignar mesa a una reserva con pagos
// previos), las ventas de TODAS las comandas de la mesa (el anticipo es de la
// mesa, no de una comanda), la habitación vinculada, las habitaciones activas
// y las mesas.
// Se recarga cuando cambia cualquiera de esas colecciones.
export function useComandaLive(activeComandaProp: any) {
  const [liveComanda, setLiveComanda] = useState<any | null>(activeComandaProp || null);
  const [pagos, setPagos] = useState<any[]>([]);
  const [ventasComanda, setVentasComanda] = useState<any[]>([]);
  const [linkedMesa, setLinkedMesa] = useState<any | null>(null);
  const [activeRoomAccounts, setActiveRoomAccounts] = useState<any[]>([]);
  const [allMesas, setAllMesas] = useState<any[]>([]);
  const [ventasMesa, setVentasMesa] = useState<any[]>([]);
  const [comandasOperativasMesa, setComandasOperativasMesa] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const subs: Array<{ unsubscribe: () => void }> = [];
    (async () => {
      const rxDb = await initVerticalRxDb();
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      // Las consultas son independientes: se lanzan en paralelo y se aplican
      // juntas (un solo render). Antes eran 6-7 awaits en serie con un setState
      // cada una, y al cambiar de subcomanda (el componente se remonta por key)
      // el panel tardaba en completarse.
      const refresh = async () => {
        if (!activeComandaProp?.id) return;
        const comandaId = activeComandaProp.id;
        const [c, p, v, hc, rac, ms, cMesa] = await Promise.all([
          rxDb.comandas.findOne(comandaId).exec(),
          rxDb.pagos.find({ selector: { comanda_id: comandaId, _deleted: { $ne: true } } }).exec(),
          rxDb.ventas.find({ selector: { comanda_id: comandaId, _deleted: { $ne: true } } }).exec(),
          activeComandaProp.habitacion_cuenta_id
            ? rxDb.habitacion_cuentas.findOne(activeComandaProp.habitacion_cuenta_id).exec()
            : Promise.resolve(null),
          rxDb.habitacion_cuentas.find({ selector: { organization_id: orgId, estado: 'activa', _deleted: { $ne: true } } }).exec(),
          rxDb.mesas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).exec(),
          activeComandaProp.mesa_id
            ? rxDb.comandas.find({ selector: { mesa_id: activeComandaProp.mesa_id, _deleted: { $ne: true } } }).exec()
            : Promise.resolve([]),
        ]);
        if (!alive) return;
        const hcJson = hc ? hc.toJSON() : null;
        const comandasMesa = (cMesa as any[]).map((d: any) => d.toJSON()).filter((x: any) => x.estado !== 'anulada');
        const ventasDeMesa = comandasMesa.length > 0
          ? await rxDb.ventas.find({ selector: { comanda_id: { $in: comandasMesa.map((x: any) => x.id) }, _deleted: { $ne: true } } }).exec()
          : [];
        const roomMesa = hcJson ? await rxDb.mesas.findOne(hcJson.mesa_id).exec() : null;
        if (!alive) return;
        setLiveComanda(c ? c.toJSON() : activeComandaProp);
        setPagos(p.map((d: any) => d.toJSON()));
        setVentasComanda(v.map((d: any) => d.toJSON()));
        setLinkedMesa(roomMesa ? roomMesa.toJSON() : null);
        const mesasJson = ms.map((d: any) => d.toJSON());
        // Solo cuentas vigentes (habitación existente, una por habitación), en orden numérico.
        setActiveRoomAccounts(filtrarCuentasHabitacionVigentes(rac.map((d: any) => d.toJSON()), mesasJson, orgId));
        setAllMesas(mesasJson);
        setVentasMesa((ventasDeMesa as any[]).map((d: any) => d.toJSON()));
        setComandasOperativasMesa(comandasMesa.filter((x: any) => isOperativeComanda(x)).map((x: any) => x.id));
      };
      await refresh();
      if (activeComandaProp?.id) {
        subs.push(rxDb.comandas.findOne(activeComandaProp.id).$.subscribe(() => refresh()));
        subs.push(rxDb.pagos.find({ selector: { comanda_id: activeComandaProp.id, _deleted: { $ne: true } } }).$.subscribe(() => refresh()));
        subs.push(rxDb.ventas.find({ selector: { comanda_id: activeComandaProp.id, _deleted: { $ne: true } } }).$.subscribe(() => refresh()));
        if (activeComandaProp.mesa_id) {
          // Otras comandas de la mesa (se cierran, se aplican anticipos): al cerrar
          // una se recarga el anticipo disponible para las demás.
          subs.push(rxDb.comandas.find({ selector: { mesa_id: activeComandaProp.mesa_id, _deleted: { $ne: true } } }).$.subscribe(() => refresh()));
        }
      }
    })().catch(() => {});
    return () => {
      alive = false;
      subs.forEach(s => s.unsubscribe());
    };
    // Solo depende del id y de la habitación vinculada: el resto de la comanda
    // llega por la suscripción, y re-ejecutar por cada cambio de objeto
    // reiniciaría las consultas en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeComandaProp?.id, activeComandaProp?.habitacion_cuenta_id, activeComandaProp?.mesa_id]);

  return { liveComanda, pagos, ventasComanda, linkedMesa, activeRoomAccounts, allMesas, ventasMesa, comandasOperativasMesa };
}

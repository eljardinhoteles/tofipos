// @ts-nocheck
import { useEffect, useState } from 'react';
import { initVerticalRxDb } from '../db/rxdb';
import { useDbEpoch } from './useDbEpoch';

export function useIvaActivo() {
  const [activeIvaObj, setActiveIvaObj] = useState<any | null>(null);
  const dbEpoch = useDbEpoch();

  useEffect(() => {
    let alive = true;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      const rxDb = await initVerticalRxDb();
      const query = rxDb.ajustes_iva.find({ selector: { activo: true, _deleted: { $ne: true } } });
      sub = query.$.subscribe((docs: any[]) => {
        if (!alive) return;
        setActiveIvaObj(docs[0] ? docs[0].toJSON() : null);
      });
    })().catch(() => {});
    return () => {
      alive = false;
      sub?.unsubscribe();
    };
  }, [dbEpoch]);

  const porcentaje = activeIvaObj ? activeIvaObj.porcentaje : 15;
  const valor = porcentaje / 100;
  const preciosConIva = activeIvaObj ? !!activeIvaObj.precios_con_iva : false;
  
  return { 
    valor, 
    porcentaje,
    preciosConIva,
    loading: activeIvaObj === undefined 
  };
}

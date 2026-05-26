// @ts-nocheck
import { useEffect, useState } from 'react';
import { initVerticalRxDb } from '../db/rxdb';

export function useIvaActivo() {
  const [activeIvaObj, setActiveIvaObj] = useState<any | null>(null);

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
  }, []);

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

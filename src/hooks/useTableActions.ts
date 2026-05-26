import { type Mesa } from '../db/database';
import { sileo } from 'sileo';
import { useUI } from '../context/UIContext';
import { createRxComanda, updateRxComanda, updateRxMesa, getVerticalRxDb } from '../db/rxdb';

export function useTableActions() {
  const { openConfirm, openPrompt } = useUI();

  const getOrgId = () => localStorage.getItem('pos_active_org_id') || '';

  const findMesaComandas = async (mesaId: string, estadoFilter?: string) => {
    const orgId = getOrgId();
    const rxDb = await getVerticalRxDb();
    const selector: Record<string, unknown> = {
      mesa_id: mesaId,
      organization_id: orgId
    };

    if (estadoFilter) {
      selector.estado = estadoFilter;
    } else {
      selector.estado = { $nin: ['cerrado', 'facturado', 'anulada'] };
    }

    return rxDb.comandas.find({ selector }).exec();
  };

  const handleTableAction = async (
    mesa: Mesa, 
    action: string, 
    onComplete?: (action: string) => void,
    setCheckoutView?: (val: boolean) => void
  ) => {
    if (action === 'add_product') {
      onComplete?.('productos');
    } else if (action.startsWith('abrir:')) {
      const orgId = getOrgId();
      if (!orgId) {
        sileo.error({
          title: 'Sin organización activa',
          description: 'No se pudo abrir la mesa porque no hay hotel vinculado.'
        });
        return;
      }
      const existingComandas = await findMesaComandas(mesa.id);

      // Evitar doble apertura si ya hay una comanda activa directa (no consumos de habitación)
      const directComandas = existingComandas.filter((c: any) => !c.habitacion_cuenta_id);
      if (directComandas.length > 0) {
        onComplete?.('productos');
        return;
      }

      const rawPayload = action.slice('abrir:'.length);
      let customerNameFromSidebar = '';
      let guestCount = 1;
      let clientId: string | undefined = undefined;
      let habitacionCuentaId: string | undefined = undefined;

      try {
        const decoded = JSON.parse(atob(rawPayload));
        customerNameFromSidebar = (decoded?.customerName || '').trim();
        guestCount = parseInt(String(decoded?.guestCount || '1'));
        clientId = decoded?.clientId || undefined;
        habitacionCuentaId = decoded?.habitacionCuentaId || undefined;
      } catch {
        const parts = action.split(':');
        customerNameFromSidebar = parts[1]?.trim();
        guestCount = parseInt(parts[2] || '1');
        clientId = parts[3] || undefined;
        habitacionCuentaId = parts[4] || undefined;
      }
      const comandaId = crypto.randomUUID();

      const finalCliente = customerNameFromSidebar || 'Consumidor Final';
      const finalClientId = customerNameFromSidebar ? (clientId || undefined) : '99999999999';
      try {
        const rxDb = await getVerticalRxDb();
        const allComandas = await rxDb.comandas.find({
          selector: { organization_id: orgId }
        }).exec();
        const nextFolio = allComandas.reduce((max, comanda) => {
          const folio = Number((comanda as any)?.folio || 0);
          return folio > max ? folio : max;
        }, 0) + 1;

        await createRxComanda({
          id: comandaId,
          folio: nextFolio,
          mesa_id: mesa.id,
          mesa_nombre: mesa.nombre,
          mesero: 'Mesero Genérico',
          cliente: finalCliente,
          cliente_id: finalClientId,
          habitacion_cuenta_id: habitacionCuentaId,
          sincronizado: habitacionCuentaId ? false : undefined,
          estado: 'pendiente',
          personas: guestCount,
          organization_id: orgId,
        });

        const inserted = await rxDb.comandas.findOne(comandaId).exec();
        if (!inserted) {
          throw new Error('La comanda no se guardó en RxDB');
        }

        await updateRxMesa(mesa.id, {
          estado: 'ocupada',
          capacidad: guestCount,
        });

        onComplete?.('productos');
        setTimeout(() => {
          sileo.success({
            title: `${mesa.nombre} abierta`,
            description: `Servicio iniciado for ${guestCount} personas.`,
          });
        }, 50);
      } catch (error) {
        console.error('Error al abrir mesa:', error);
        sileo.error({
          title: 'No se pudo abrir la mesa',
          description: error instanceof Error ? error.message : 'Revisa la consola.'
        });
      }
    } else if (action === 'cuenta') {
      const activeComanda = (await findMesaComandas(mesa.id))[0];

      if (activeComanda) {
        await updateRxComanda(activeComanda.id, {
          estado: 'cuenta',
          confirmada: true,
        });
      }
      sileo.success({
        title: `Cuenta solicitada`,
        description: `Se ha marcado la ${mesa.nombre} para pago.`,
      });
    } else if (action === 'reabrir') {
      const comandaCuenta = (await findMesaComandas(mesa.id, 'cuenta'))[0];

      if (comandaCuenta) {
        await updateRxComanda(comandaCuenta.id, {
          estado: 'pendiente',
        });
      }
    } else if (action === 'cobrar') {
      openConfirm(
        'Cerrar comanda',
        '¿Cerrar comanda e imprimir precuenta? Este cierre es operativo y la factura se emite en el sistema contable.',
        async () => {
          const activeComanda = (await findMesaComandas(mesa.id))[0];

          if (!activeComanda) {
            sileo.error({ title: 'No hay comanda activa para cerrar' });
            return;
          }

          sileo.success({
            title: 'Precuenta enviada',
            description: `Imprimiendo precuenta de ${mesa.nombre}...`
          });

          await updateRxComanda(activeComanda.id, {
            estado: 'cerrado',
            mesa_nombre: activeComanda.mesa_nombre || mesa.nombre,
          });

          await updateRxMesa(mesa.id, { estado: 'libre' });

          if (setCheckoutView) setCheckoutView(false);
          onComplete?.('mapa');
          setTimeout(() => {
            sileo.success({
              title: 'Cierre operativo completado',
              description: `${mesa.nombre} quedó lista para conciliación en Órdenes.`
            });
          }, 50);
        }
      );
    } else if (action === 'cancelar') {
      const activeComandas = await findMesaComandas(mesa.id);

      if (activeComandas.length === 0) {
        onComplete?.('mapa');
        sileo.success({
          title: `Mesa liberada`,
          description: `La ${mesa.nombre} ha sido liberada (no tenía comanda activa).`,
        });
        return;
      }

      openPrompt({
        title: 'Anular Mesa',
        label: 'Motivo de la anulación',
        placeholder: 'Escriba el motivo aquí (ej: error en pedido, cliente se retiró...)',
        onConfirm: async (motivo) => {
          for (const comanda of activeComandas) {
            await updateRxComanda((comanda as any).id, {
              estado: 'anulada',
              mesa_nombre: (comanda as any).mesa_nombre || mesa.nombre,
              motivo_anulacion: motivo,
            });
          }
          await updateRxMesa(mesa.id, { estado: 'libre' });
          onComplete?.('mapa');

          sileo.error({
            title: `Mesa anulada`,
            description: `La ${mesa.nombre} ha sido liberada y la orden marcada como anulada.`,
          });
        }
      });
    }
  };

  return { handleTableAction };
}

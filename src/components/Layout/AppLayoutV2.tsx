import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

import { MainSidebarV2 } from './MainSidebarV2';
import { MobileNavbar } from './MobileNavbar';
import { TableSidebar } from '../Mesas/TableSidebar';
import {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerHandle,
} from '@/components/ui/drawer';
import { useUI } from '../../context/UIContext';
import { useTableActions } from '../../hooks/useTableActions';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useIvaActivo } from '../../hooks/useIvaActivo';
import { useRxMenuCatalog } from '../../hooks/useRxMenuCatalog';
import { calcularTotalesComanda } from '../../lib/taxUtils';
import { initVerticalRxDb, subscribeSyncStatus, pingSyncStatus, forceSyncAll, type SyncStatus } from '../../db/rxdb';
import { SyncStatusModal } from '../Common/SyncStatusModal';
import { GlobalModals } from '../Common/GlobalModals';
import OrdenesV2 from '../../pages/OrdenesV2';
import MesasV2 from '../../pages/MesasV2';
import MenuV2 from '../../pages/MenuV2';
import ReservasV2 from '../../pages/ReservasV2';
import ClientesV2 from '../../pages/ClientesV2';
import AjustesV2 from '../../pages/AjustesV2';
import MetricasV2 from '../../pages/MetricasV2';
import CentroVentasV2 from '../../pages/CentroVentasV2';

export function AppLayoutV2() {
  const location = useLocation();
  const {
    isPinned,
    selectedMesaId, setSelectedMesaId,
    configView, setConfigView,
    selectedConfigPiso, setSelectedConfigPiso,
    mesaView, setMesaView,
    setCheckoutView, setViewingComandaId, menuView, setMenuView,
    setSelectedMenuProductId,
    reservaView, setReservaView, setSelectedReservaId,
    reservaProductosComandaId,
    selectedMesaEsHabitacion,
  } = useUI();

  const isMobile = useIsMobile();

  const { handleTableAction } = useTableActions();

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    online: navigator.onLine,
    supabaseOk: null,
    hasError: false,
    errorCollections: [],
    activePushQueue: 0,
    collections: {},
  });
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const unsub = subscribeSyncStatus(setSyncStatus);
    pingSyncStatus();
    return unsub;
  }, []);

  const handleForceSync = useCallback(async () => {
    setSyncing(true);
    await forceSyncAll();
    await pingSyncStatus();
    setTimeout(() => setSyncing(false), 1200);
  }, []);

  const isMesasPage = location.pathname.includes('/mesas');
  const currentPath = location.pathname === '/' ? '/v2/mesas' : location.pathname;
  const [selectedMesa, setSelectedMesa] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      if (!(isMesasPage || selectedMesaId)) {
        if (alive) setSelectedMesa(null);
        return;
      }
      const rxDb = await initVerticalRxDb();
      if (!selectedMesaId) {
        if (alive) setSelectedMesa(null);
        return;
      }
      sub = rxDb.mesas.findOne(selectedMesaId).$.subscribe((doc: any) => {
        if (!alive) return;
        setSelectedMesa(doc ? doc.toJSON() : null);
      });
    })().catch(() => {});
    return () => {
      alive = false;
      sub?.unsubscribe();
    };
  }, [isMesasPage, selectedMesaId]);

  // Comanda activa de la mesa seleccionada, usada para el carrito flotante en mobile
  // mientras el mesero está agregando productos (mesaView === 'productos').
  const [cartComanda, setCartComanda] = useState<any | null>(null);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const { menuItems: cartMenuItems } = useRxMenuCatalog();
  const { porcentaje: cartIvaPorcentaje, preciosConIva: cartPreciosConIva } = useIvaActivo();

  useEffect(() => {
    let alive = true;
    let subs: Array<{ unsubscribe: () => void }> = [];
    (async () => {
      if (!isMobile || mesaView !== 'productos' || !selectedMesaId) {
        if (alive) {
          setCartComanda(null);
          setCartItems([]);
        }
        return;
      }
      const rxDb = await initVerticalRxDb();
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      subs.push(
        rxDb.comandas
          .find({
            selector: {
              mesa_id: selectedMesaId,
              organization_id: orgId,
              estado: { $nin: ['cerrado', 'facturado', 'anulada'] },
            },
            sort: [{ updated_at: 'desc' }],
          })
          .$.subscribe((docs: any[]) => {
            if (!alive) return;
            const comanda = docs[0] ? docs[0].toJSON() : null;
            setCartComanda(comanda);
          })
      );
    })().catch(() => {});
    return () => {
      alive = false;
      subs.forEach((s) => s.unsubscribe());
    };
  }, [isMobile, mesaView, selectedMesaId]);

  useEffect(() => {
    let alive = true;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      if (!cartComanda?.id) {
        if (alive) setCartItems([]);
        return;
      }
      const rxDb = await initVerticalRxDb();
      sub = rxDb.comanda_items
        .find({ selector: { comanda_id: cartComanda.id, _deleted: { $ne: true } } })
        .$.subscribe((docs: any[]) => {
          if (!alive) return;
          setCartItems(docs.map((d: any) => d.toJSON()));
        });
    })().catch(() => {});
    return () => {
      alive = false;
      sub?.unsubscribe();
    };
  }, [cartComanda?.id]);

  const cartInfo = useMemo(() => {
    if (!cartComanda || cartItems.length === 0 || !selectedMesa) return null;
    const totales = calcularTotalesComanda(cartItems, cartMenuItems, cartIvaPorcentaje, cartPreciosConIva);
    const itemCount = cartItems.reduce((acc, it) => acc + (it.cantidad || 0), 0);
    return {
      mesaNombre: selectedMesa.nombre,
      itemCount,
      total: totales.total,
    };
  }, [cartComanda, cartItems, selectedMesa, cartMenuItems, cartIvaPorcentaje, cartPreciosConIva]);

  const isSidebarVisible = !isMobile && (
    isPinned ||
    selectedMesaId !== null ||
    configView !== 'none' ||
    reservaView !== 'none' ||
    menuView !== 'none'
  );

  const isMobileSheetOpen = useMemo(
    () =>
      (selectedMesaId !== null && mesaView !== 'productos') ||
      configView !== 'none' ||
      menuView === 'producto' ||
      (reservaView !== 'none' && !reservaProductosComandaId),
    [selectedMesaId, mesaView, configView, menuView, reservaView, reservaProductosComandaId]
  );

  const closeMobileSheet = useCallback(() => {
    setSelectedMesaId(null);
    setConfigView('none');
    setViewingComandaId(null);
    setReservaView('none');
    setSelectedReservaId(null);
    setMenuView('none');
    setSelectedMenuProductId(null);
  }, [setSelectedMesaId, setConfigView, setViewingComandaId, setReservaView, setSelectedReservaId, setMenuView, setSelectedMenuProductId]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground select-none">
      {/* Sidebar V2 en desktop */}
      {!isMobile && <MainSidebarV2 />}

      {/* ÁREA PRINCIPAL V2 + nav móvil */}
      <div className="flex-1 h-full min-w-0 flex flex-col overflow-hidden">
        <main
          className="flex-1 min-w-0 overflow-hidden relative transition-[padding] duration-200"
          style={!isMobile && isSidebarVisible ? { paddingRight: 420 } : undefined}
        >
          <div className="h-full w-full min-w-0 overflow-hidden relative">
            {(currentPath === '/ordenes' || currentPath.includes('/ordenes')) && <div className="h-full"><OrdenesV2 /></div>}
            {(currentPath === '/mesas' || currentPath.includes('/mesas')) && <div className="h-full"><MesasV2 /></div>}
            {(currentPath === '/reservas' || currentPath.includes('/reservas')) && <div className="h-full"><ReservasV2 /></div>}
            {(currentPath === '/menu' || currentPath.includes('/menu')) && <div className="h-full"><MenuV2 /></div>}
            {(currentPath === '/clientes' || currentPath.includes('/clientes')) && <div className="h-full"><ClientesV2 /></div>}
            {(currentPath === '/ajustes' || currentPath.includes('/ajustes')) && <div className="h-full"><AjustesV2 /></div>}
            {(currentPath === '/metricas' || currentPath.includes('/metricas')) && <div className="h-full"><MetricasV2 /></div>}
            {(currentPath === '/centro-ventas' || currentPath.includes('/centro-ventas')) && <div className="h-full overflow-y-auto"><CentroVentasV2 /></div>}
          </div>
        </main>
        {isMobile && (
          <MobileNavbar
            syncStatus={syncStatus}
            syncing={syncing}
            onOpenSync={() => setSyncModalOpen(true)}
            cart={cartInfo}
            onOpenCart={() => setMesaView('mapa')}
          />
        )}
      </div>

      {isMobile && (
        <SyncStatusModal
          opened={syncModalOpen}
          onClose={() => setSyncModalOpen(false)}
          status={syncStatus}
          onForceSync={handleForceSync}
          syncing={syncing}
        />
      )}

      {/* SIDEBAR DERECHO GLOBAL (Desktop, Shadcn UI Drawer) */}
      {!isMobile && (
        <Drawer
          open={isSidebarVisible}
          direction="right"
          onOpenChange={(open) => {
            if (!open) {
              setSelectedMesaId(null);
              setViewingComandaId(null);
              setReservaView('none');
              setSelectedReservaId(null);
            }
          }}
        >
          <DrawerPortal>
            <DrawerOverlay />
            <DrawerContent className="fixed top-0 right-0 bottom-0 w-[420px] max-w-[90vw] bg-card shadow-xl z-50 flex flex-col overflow-hidden p-0 border-0 before:hidden rounded-none">
              <DrawerTitle className="sr-only">Panel de mesa</DrawerTitle>
              <DrawerDescription className="sr-only">
                Acciones y detalles de la mesa seleccionada
              </DrawerDescription>
              <TableSidebar
                selectedMesa={selectedMesa}
                onClose={() => {
                  setSelectedMesaId(null);
                  setViewingComandaId(null);
                  setReservaView('none');
                  setSelectedReservaId(null);
                }}
                onAction={(mesa, action) => handleTableAction(mesa, action, (res) => {
                  if (res === 'productos') {
                    setMesaView('productos');
                  } else if (res === 'mapa') {
                    setSelectedMesaId(null);
                    setViewingComandaId(null);
                    setMesaView('mapa');
                  }
                }, setCheckoutView)}
                configView={configView}
                setConfigView={setConfigView}
                selectedConfigPiso={selectedConfigPiso}
                setSelectedConfigPiso={setSelectedConfigPiso}
                mesaEsDeHabitaciones={selectedMesaEsHabitacion}
              />
            </DrawerContent>
          </DrawerPortal>
        </Drawer>
      )}

      {/* SIDEBAR MÓVIL (Shadcn UI Drawer) */}
      {isMobile && (
        <Drawer
          open={isMobileSheetOpen}
          dismissible
          handleOnly
          onOpenChange={(open) => {
            if (!open && !reservaProductosComandaId) {
              closeMobileSheet();
            }
          }}
        >
          <DrawerPortal>
            <DrawerOverlay />
            <DrawerContent className="fixed bottom-0 left-0 right-0 h-[95vh] max-h-[95vh] bg-card rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.25)] z-50 flex flex-col overflow-hidden p-0 border-0 before:hidden">
              <DrawerTitle className="sr-only">Panel de mesa</DrawerTitle>
              <DrawerDescription className="sr-only">
                Acciones y detalles de la mesa seleccionada
              </DrawerDescription>
              {/* El header interno de SidebarDetails tiene su propio color de estado
                  (verde/naranja); el handle flota sobre él en blanco translúcido
                  para que combine en vez de dejar una franja de fondo neutro. */}
              <DrawerHandle className="!bg-white/50" />
              <div className="flex-1 overflow-hidden">
                {isMobileSheetOpen && (
                  <TableSidebar
                    selectedMesa={selectedMesa}
                    onClose={closeMobileSheet}
                    onAction={(mesa, action) => handleTableAction(mesa, action, (res) => {
                      if (res === 'productos') {
                        setMesaView('productos');
                      } else if (res === 'mapa') {
                        setSelectedMesaId(null);
                        setConfigView('none');
                        setViewingComandaId(null);
                        setMesaView('mapa');
                      }
                    }, setCheckoutView)}
                    configView={configView}
                    setConfigView={setConfigView}
                    selectedConfigPiso={selectedConfigPiso}
                    setSelectedConfigPiso={setSelectedConfigPiso}
                    mesaEsDeHabitaciones={selectedMesaEsHabitacion}
                  />
                )}
              </div>
            </DrawerContent>
          </DrawerPortal>
        </Drawer>
      )}
      
      <GlobalModals />
    </div>
  );
}

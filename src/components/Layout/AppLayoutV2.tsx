import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { MainSidebarV2 } from './MainSidebarV2';
import { MobileNavbar, MenuCapaMovil } from './MobileNavbar';
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
import { cn } from '@/lib/utils';
import { useFolioVersion } from '../../lib/folio';
import { crearEstabilizador } from '../../lib/estabilizarDocs';
import { MENU_EN_CAPAS, setMenuMovilAbierto, useMenuMovilAbierto } from '../../lib/menuMovil';
import { setSheetMovilListo } from '../../lib/sheetMovil';
import { useUI } from '../../context/UIContext';
import { useTableActions } from '../../hooks/useTableActions';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useKeyboardCloseReset, useOtherDialogOpen } from '../../hooks/useKeyboardCloseReset';
import { useIvaActivo } from '../../hooks/useIvaActivo';
import { useRxMenuCatalog } from '../../hooks/useRxMenuCatalog';
import { calcularTotalesComanda } from '../../lib/taxUtils';
import { isOperativeComanda, pickComandaActiva } from '../../db/comandaState';
import { initVerticalRxDb, subscribeSyncStatus, pingSyncStatus, forceSyncAll, type SyncStatus } from '../../db/rxdb';
import { SyncStatusModal } from '../Common/SyncStatusModal';
import { GlobalModals } from '../Common/GlobalModals';
import { AvisoCambioIvaModal } from '../Common/AvisoCambioIvaModal';
import { ActividadDrawer } from '../Common/ActividadDrawer';
import MesasV2 from '../../pages/MesasV2';

// Mesas es la pantalla de arranque y se carga con la app. El resto va en trozos
// aparte (gráficos, calendario, ajustes…): el celular analiza menos JavaScript
// al abrir. El service worker los precachea, así que siguen funcionando offline.
const importOrdenes = () => import('../../pages/OrdenesV2');
const importMenu = () => import('../../pages/MenuV2');
const importReservas = () => import('../../pages/ReservasV2');
const importClientes = () => import('../../pages/ClientesV2');
const importAjustes = () => import('../../pages/AjustesV2');
const importMetricas = () => import('../../pages/MetricasV2');
const importCentroVentas = () => import('../../pages/CentroVentasV2');
const OrdenesV2 = lazy(importOrdenes);
const MenuV2 = lazy(importMenu);
const ReservasV2 = lazy(importReservas);
const ClientesV2 = lazy(importClientes);
const AjustesV2 = lazy(importAjustes);
const MetricasV2 = lazy(importMetricas);
const CentroVentasV2 = lazy(importCentroVentas);

// Con la app ya lista y el celular libre, calienta los trozos restantes para que
// cambiar de pantalla sea instantáneo (salen del precaché, sin red).
const esMovil = () => typeof window !== 'undefined' && window.innerWidth < 768;

function precargarPantallas() {
  const pantallas = [importOrdenes, importReservas, importMenu, importClientes, importMetricas, importAjustes];
  // Centro de Ventas solo se usa en PC: no se precarga en el celular.
  if (!esMovil()) pantallas.splice(1, 0, importCentroVentas);
  pantallas.forEach((cargar, i) => setTimeout(() => { cargar().catch(() => { }); }, i * 400));
}

function PantallaCargando() {
  return <div className="h-full w-full bg-background" aria-hidden="true" />;
}

// Mientras el sheet móvil sube: silueta estable del panel (cabecera + filas) en
// lugar de ver el contenido real llenarse a mitad de la animación.
function SheetSkeleton() {
  return (
    <div className="absolute inset-0 flex flex-col animate-pulse" aria-hidden="true">
      <div className="h-24 bg-muted flex items-center gap-3 px-4 pt-4">
        <div className="size-12 rounded-xl bg-card/70" />
        <div className="flex flex-col gap-2">
          <div className="h-4 w-36 rounded-full bg-card/70" />
          <div className="h-3 w-24 rounded-full bg-card/50" />
        </div>
      </div>
      <div className="flex flex-col gap-4 p-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-muted" />
            <div className="h-4 flex-1 rounded-full bg-muted" />
            <div className="h-4 w-14 rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AppLayoutV2() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isPinned,
    selectedMesaId, setSelectedMesaId,
    configView, setConfigView,
    selectedConfigPiso, setSelectedConfigPiso,
    mesaView, setMesaView,
    activeSubcomandaId,
    setCheckoutView, setViewingComandaId, menuView, setMenuView,
    setSelectedMenuProductId,
    reservaView, setReservaView, setSelectedReservaId,
    reservaProductosComandaId,
    selectedMesaEsHabitacion,
  } = useUI();

  const isMobile = useIsMobile();
  // Restablece sheet y scroll cuando el teclado móvil se cierra y la vista queda "pegada".
  useKeyboardCloseReset(isMobile);
  // Con un diálogo abierto encima del sheet, el sheet no debe reaccionar al teclado.
  const otroDialogAbierto = useOtherDialogOpen(isMobile);
  // En Android el navegador ya redimensiona la pantalla al abrir el teclado
  // (interactive-widget=resizes-content en index.html) y la restablece solo. Si
  // vaul además reposiciona el sheet, mide un viewport que ya se achicó y le
  // suma estilos en línea propios: doble ajuste, y el sheet se queda pegado al
  // cerrar el teclado. En iOS sí hace falta su reposicionamiento.
  const esAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

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
    })().catch(() => { });
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
            // Mesa Múltiple: el carrito sigue a la subcomanda activa (la misma
            // que usa el selector de productos), no a la última actualizada.
            const operativas = docs
              .map((d: any) => d.toJSON())
              .filter((c: any) => isOperativeComanda(c))
              .sort((a: any, b: any) => a.folio - b.folio);
            setCartComanda(pickComandaActiva(operativas, activeSubcomandaId) ?? null);
          })
      );
    })().catch(() => { });
    return () => {
      alive = false;
      subs.forEach((s) => s.unsubscribe());
    };
  }, [isMobile, mesaView, selectedMesaId, activeSubcomandaId]);

  useEffect(() => {
    let alive = true;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      if (!cartComanda?.id) {
        if (alive) setCartItems([]);
        return;
      }
      const rxDb = await initVerticalRxDb();
      const estabilizar = crearEstabilizador<any>();
      sub = rxDb.comanda_items
        .find({ selector: { comanda_id: cartComanda.id, _deleted: { $ne: true } } })
        .$.subscribe((docs: any[]) => {
          if (!alive) return;
          setCartItems(estabilizar(docs.map((d: any) => d.toJSON())));
        });
    })().catch(() => { });
    return () => {
      alive = false;
      sub?.unsubscribe();
    };
  }, [cartComanda?.id]);

  const cartInfo = useMemo(() => {
    if (!cartComanda || !selectedMesa) return null;
    const esSub = !!cartComanda.subcomanda_nombre;
    if (cartItems.length === 0 && !esSub) return null;
    const totales = calcularTotalesComanda(cartItems, cartMenuItems, cartIvaPorcentaje, cartPreciosConIva);
    const itemCount = cartItems.reduce((acc, it) => acc + (it.cantidad || 0), 0);
    return {
      mesaNombre: esSub ? `${selectedMesa.nombre} · ${cartComanda.subcomanda_nombre}` : selectedMesa.nombre,
      itemCount,
      total: totales.total,
      mantenerVacio: esSub,
    };
  }, [cartComanda, cartItems, selectedMesa, cartMenuItems, cartIvaPorcentaje, cartPreciosConIva]);

  // Centro de Ventas es solo de PC: si se llega por URL en el celular, vuelve a Mesas.
  useEffect(() => {
    if (isMobile && currentPath.includes('/centro-ventas')) navigate('/v2/mesas', { replace: true });
  }, [isMobile, currentPath, navigate]);

  // Precarga de pantallas cuando el celular ya está libre (no compite con el arranque).
  useEffect(() => {
    const idle = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => number);
    if (idle) {
      const id = idle(precargarPantallas, { timeout: 8000 });
      return () => (window as any).cancelIdleCallback?.(id);
    }
    const t = setTimeout(precargarPantallas, 4000);
    return () => clearTimeout(t);
  }, []);

  const isSidebarVisible = !isMobile && (
    isPinned ||
    selectedMesaId !== null ||
    configView !== 'none' ||
    reservaView !== 'none'
    // El editor de producto no entra aquí: en escritorio es un panel flotante
    // (Sheet en MenuV2) que no mueve el contenido de la pantalla.
  );

  const isMobileSheetOpen = useMemo(
    () =>
      (selectedMesaId !== null && mesaView !== 'productos') ||
      configView !== 'none' ||
      menuView === 'producto' ||
      (reservaView !== 'none' && !reservaProductosComandaId),
    [selectedMesaId, mesaView, configView, menuView, reservaView, reservaProductosComandaId]
  );

  // Solo los paneles que cargan datos (mesa con cuenta, detalle de reserva) se
  // ocultan tras el esqueleto mientras suben. Los formularios (abrir mesa libre,
  // configuración, nueva reserva, producto) no cargan nada: salen directo.
  const sheetConCarga =
    reservaView === 'detalle' ||
    (selectedMesaId !== null && configView === 'none' && reservaView === 'none' && menuView !== 'producto' &&
      !!selectedMesa && selectedMesa.estado !== 'libre');

  // Mantiene el contenido montado mientras el sheet móvil termina de deslizarse
  // al cerrar. Desmontar al instante hacía que el panel se vaciara/colapsara
  // a mitad de la animación (brusco, sobre todo en gama baja).
  // Al cerrar, el estado (mesa/configView) ya se limpió: se re-renderiza el
  // último contenido abierto, congelado, para que no cambie mientras sale.
  const [sheetContentMounted, setSheetContentMounted] = useState(false);
  // El contenido se monta al abrir (para que cargue sus datos mientras el sheet
  // sube) pero queda oculto tras un esqueleto hasta que termina de subir: así no
  // se ve "armarse" a mitad de la animación (lista vacía, totales llenándose).
  const [sheetListo, setSheetListo] = useState(false);
  // El panel pesado se monta recién cuando la animación ya arrancó (2 cuadros):
  // montarlo en el mismo instante que se abre el sheet atrasa el inicio del deslizamiento.
  const [sheetMontarPanel, setSheetMontarPanel] = useState(false);
  // true SOLO cuando vaul avisa que terminó de subir (sin el respaldo por tiempo de sheetListo).
  const [sheetSubio, setSheetSubio] = useState(false);
  const lastSheetContent = useRef<ReactNode>(null);
  useEffect(() => {
    if (isMobileSheetOpen) {
      setSheetContentMounted(true);
      let r2 = 0;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setSheetMontarPanel(true)); });
      // Respaldo por si onAnimationEnd de vaul no llega (p. ej. gama baja).
      const reveal = setTimeout(() => setSheetListo(true), 380);
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); clearTimeout(reveal); };
    }
    const t = setTimeout(() => { setSheetContentMounted(false); setSheetListo(false); setSheetMontarPanel(false); setSheetSubio(false); }, 450);
    return () => clearTimeout(t);
  }, [isMobileSheetOpen]);

  // Avisa a MesasV2 cuándo el sheet ya está arriba (para cambiar el fondo sin que se vea).
  useEffect(() => {
    setSheetMovilListo(isMobile && isMobileSheetOpen && sheetSubio);
  }, [isMobile, isMobileSheetOpen, sheetSubio]);

  const closeMobileSheet = useCallback(() => {
    setSelectedMesaId(null);
    setConfigView('none');
    setViewingComandaId(null);
    setReservaView('none');
    setSelectedReservaId(null);
    setMenuView('none');
    setSelectedMenuProductId(null);
  }, [setSelectedMesaId, setConfigView, setViewingComandaId, setReservaView, setSelectedReservaId, setMenuView, setSelectedMenuProductId]);

  const mobileSidebarContent = (
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
  );
  // La copia congelada se guarda en un efecto (no durante el render) para poder
  // re-renderizar el último contenido mientras el sheet se desliza al cerrar.
  useEffect(() => {
    if (isMobileSheetOpen) lastSheetContent.current = mobileSidebarContent;
  });

  // Re-renderiza el layout cuando cambian las etiquetas de comandas repetidas (397-1).
  useFolioVersion();
 // Menú móvil en capas (experimento): la página baja y deja ver las tarjetas de módulos.
 const menuAbierto = useMenuMovilAbierto();
 const menuEnCapas = isMobile && MENU_EN_CAPAS;
 useEffect(() => { setMenuMovilAbierto(false); }, [currentPath]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground select-none">
      {/* Sidebar V2 en desktop */}
      {!isMobile && <MainSidebarV2 />}

      {/* ÁREA PRINCIPAL V2 + nav móvil */}
      <div className={cn("flex-1 h-full min-w-0 flex flex-col overflow-hidden relative", menuEnCapas && "bg-nav")}>
        {menuEnCapas && <MenuCapaMovil />}
        <main
          // El contenido se encoge con la misma duración y curva que el panel de
          // vaul (0.5s, cubic-bezier(0.32, 0.72, 0, 1)): así no queda ninguna franja
          // descubierta mientras el panel se desliza.
          className={cn(
            "flex-1 min-w-0 overflow-hidden relative transition-[padding] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
            menuEnCapas && "z-10 bg-nav transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform",
            // Con el menú abierto la página SUBE y deja al descubierto, abajo y al alcance del pulgar, las tarjetas del menú.
            menuEnCapas && menuAbierto && "-translate-y-[min(calc(29.5rem_+_env(safe-area-inset-bottom)),78dvh)] rounded-b-3xl"
          )}
          style={!isMobile && isSidebarVisible ? { paddingRight: 462 } : undefined}
        >
          {/* Con el menú abierto la página queda como "asomada": tocarla lo cierra. */}
          {menuEnCapas && menuAbierto && (
            <button type="button" aria-label="Cerrar menú" onClick={() => setMenuMovilAbierto(false)}
              className="absolute inset-0 z-30 cursor-pointer" />
          )}
          <div className="h-full w-full min-w-0 overflow-hidden relative">
            <Suspense fallback={<PantallaCargando />}>
              {(currentPath === '/ordenes' || currentPath.includes('/ordenes')) && <div className="h-full"><OrdenesV2 /></div>}
              {(currentPath === '/mesas' || currentPath.includes('/mesas')) && <div className="h-full"><MesasV2 /></div>}
              {(currentPath === '/reservas' || currentPath.includes('/reservas')) && <div className="h-full"><ReservasV2 /></div>}
              {(currentPath === '/menu' || currentPath.includes('/menu')) && <div className="h-full"><MenuV2 /></div>}
              {(currentPath === '/clientes' || currentPath.includes('/clientes')) && <div className="h-full"><ClientesV2 /></div>}
              {(currentPath === '/ajustes' || currentPath.includes('/ajustes')) && <div className="h-full"><AjustesV2 /></div>}
              {(currentPath === '/metricas' || currentPath.includes('/metricas')) && <div className="h-full"><MetricasV2 /></div>}
              {!isMobile && (currentPath === '/centro-ventas' || currentPath.includes('/centro-ventas')) && <div className="h-full overflow-y-auto"><CentroVentasV2 /></div>}
            </Suspense>
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
            <DrawerContent className="fixed top-0 right-0 bottom-0 w-[462px] max-w-[90vw] bg-card shadow-xl z-50 flex flex-col overflow-hidden p-0 border-0 before:hidden rounded-none">
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
          repositionInputs={!otroDialogAbierto && !esAndroid}
          dismissible
          handleOnly
          onAnimationEnd={(open) => { if (open) { setSheetListo(true); setSheetSubio(true); } }}
          onOpenChange={(open) => {
            if (!open && !reservaProductosComandaId) {
              closeMobileSheet();
            }
          }}
        >
          <DrawerPortal>
            <DrawerOverlay />
            <DrawerContent className="fixed bottom-0 left-0 right-0 h-[99dvh] max-h-[99dvh] pt-[env(safe-area-inset-top)] bg-card rounded-t-3xl shadow-[0_-4px_12px_rgba(0,0,0,0.18)] z-50 flex flex-col overflow-hidden p-0 border-0 before:hidden">
              <DrawerTitle className="sr-only">Panel de mesa</DrawerTitle>
              <DrawerDescription className="sr-only">
                Acciones y detalles de la mesa seleccionada
              </DrawerDescription>
              {/* En móvil el header del panel es neutro: la manija va en gris visible. */}
              <DrawerHandle />
              <div className="relative flex-1 overflow-hidden">
                <div className={cn("h-full transition-opacity duration-150", sheetListo || !sheetConCarga ? "opacity-100" : "opacity-0 pointer-events-none")}>
                  {isMobileSheetOpen
                    ? (sheetMontarPanel || !sheetConCarga ? mobileSidebarContent : null)
                    : sheetContentMounted ? lastSheetContent.current : null}
                </div>
                {!sheetListo && isMobileSheetOpen && sheetConCarga && <SheetSkeleton />}
              </div>
            </DrawerContent>
          </DrawerPortal>
        </Drawer>
      )}

      <GlobalModals />
      <AvisoCambioIvaModal />
      <ActividadDrawer />
    </div>
  );
}

import { AguacateEgg } from '../Common/AguacateEgg';
import { useUI } from '../../context/UIContext';
import { useEffect, useState } from'react';
import { NavLink, useNavigate, useLocation } from'react-router-dom';
import {
 Drawer,
 DrawerPortal,
 DrawerOverlay,
 DrawerContent,
 DrawerTitle,
 DrawerDescription,
 DrawerHandle,
 DrawerClose,
} from'@/components/ui/drawer';
import { Button } from'@/components/ui/button';
import { NAV_ACCENT } from'../../lib/navAccent';
import { usePermisos, rutaPermitida, ROL_LABELS } from'../../hooks/usePermisos';
import { MENU_EN_CAPAS, toggleMenuMovil, setMenuMovilAbierto, useMenuMovilAbierto } from'../../lib/menuMovil';
import {
 Pulse,
 List,
 SquaresFour,
 Receipt,
 ForkKnife,
 ShoppingCart,
 Gear,
 Users,
 CurrencyCircleDollar,
 ArrowsClockwise,
 UserGear,
 SignOut,
 X,
 Bed,
 CaretDown,
} from'@phosphor-icons/react';
import { cn } from'@/lib/utils';
import { useAuth } from'../../context/AuthContext';
import type { SyncStatus } from'../../db/rxdb';
import { getPrintServerStatus } from'../../lib/printServerClient';
import { setZonasAbiertas, useZonaEtiqueta } from'../../lib/zonasMovil';

export interface MobileCartInfo {
 mesaNombre: string;
 itemCount: number;
 total: number;
 // Mesa Múltiple: mantiene el estado carrito (con los slots de Volver/
 // Categorías/Buscar) aunque la subcomanda activa aún no tenga ítems.
 mantenerVacio?: boolean;
}

// La pista «Toca aquí para cambiar de zona» deja de salir cuando la persona ya abrió las zonas este número de veces.
const CLAVE_USOS_ZONAS = 'pos_pista_zonas_usos';
const USOS_PARA_APRENDER = 3;
const pistaAgotada = () => {
 try { return Number(localStorage.getItem(CLAVE_USOS_ZONAS) || 0) >= USOS_PARA_APRENDER; } catch { return false; }
};
const anotarUsoZonas = () => {
 try { localStorage.setItem(CLAVE_USOS_ZONAS, String(Number(localStorage.getItem(CLAVE_USOS_ZONAS) || 0) + 1)); } catch { /* sin almacenamiento: la pista seguirá saliendo */ }
};

const navItemsMobile = [
 { label:'Mesas', to:'/v2/mesas', icon: SquaresFour },
 { label:'Órdenes', to:'/v2/ordenes', icon: Receipt },
 { label:'Reservas', to:'/v2/reservas', icon: ForkKnife },
 { label:'Hotel', to:'/v2/hotel', icon: Bed },
 // Centro de Ventas se usa en PC: en el celular queda visible pero inactivo.
 { label:'Ventas', to:'/v2/centro-ventas', icon: CurrencyCircleDollar, soloPc: true },
 { label:'Clientes', to:'/v2/clientes', icon: Users },
 { label:'Productos', to:'/v2/menu', icon: ShoppingCart },
 { label:'Ajustes', to:'/v2/ajustes', icon: Gear },
];

function initials(name: string) {
 return name
 .split('')
 .filter(Boolean)
 .slice(0, 2)
 .map((s) => s[0]?.toUpperCase())
 .join('');
}

export function MobileNavbar({ syncStatus, syncing, onOpenSync, cart, onOpenCart }: {
 syncStatus: SyncStatus;
 syncing: boolean;
 onOpenSync: () => void;
 cart?: MobileCartInfo | null;
 onOpenCart?: () => void;
}) {
 const syncPendiente = !syncStatus.online || syncStatus.hasError || syncStatus.activePushQueue > 0;
 const location = useLocation();
 const navigate = useNavigate();
 const { currentMesero, adminUser, logoutMesero, logoutAdmin } = useAuth();
 const [menuOpen, setMenuOpen] = useState(false);
 const menuCapasAbierto = useMenuMovilAbierto();
 const [printServerOk, setPrintServerOk] = useState(false);
 const orgNombre = localStorage.getItem('pos_org_name_cached') ||'Organización';

 // Estado del servidor de impresión: solo se consulta con el menú abierto.
 useEffect(() => {
 if (!menuOpen) return;
 let alive = true;
 getPrintServerStatus()
 .then((status) => { if (alive) setPrintServerOk(status.ok); })
 .catch(() => { if (alive) setPrintServerOk(false); });
 return () => { alive = false; };
 }, [menuOpen]);

 const userName = currentMesero?.nombre || adminUser?.email ||'Usuario';
 const permisos = usePermisos();
 const userRole = ROL_LABELS[permisos.rol];

 const handleLogout = () => {
 setMenuOpen(false);
 if (currentMesero) {
 logoutMesero();
 } else {
 logoutAdmin();
 }
 };

 // Se oculta al bajar el scroll (no tapa paginación ni el final de las listas) y
 // reaparece al subir. No aplica con el carrito abierto: ahí aloja controles.
 const [oculto, setOculto] = useState(false);
 const carritoActivo = !!cart && (cart.itemCount > 0 || !!cart.mantenerVacio);
 useEffect(() => { setOculto(false); }, [location.pathname]);
 useEffect(() => {
 if (carritoActivo) { setOculto(false); return; }
 const ultimo = new WeakMap<EventTarget, number>();
 let raf = 0;
 const onScroll = (e: Event) => {
 const el = e.target as HTMLElement | Document;
 if (!(el instanceof HTMLElement)) return;
 // El scroll dentro de paneles/diálogos no cuenta.
 if (el.closest('[data-vaul-drawer], [role="dialog"]')) return;
 const top = el.scrollTop;
 const prev = ultimo.get(el) ?? top;
 ultimo.set(el, top);
 const delta = top - prev;
 if (raf) return;
 raf = requestAnimationFrame(() => {
 raf = 0;
 if (top < 16 || delta < -6) setOculto(false);
 else if (delta > 8) setOculto(true);
 });
 };
 document.addEventListener('scroll', onScroll, { capture: true, passive: true });
 return () => { document.removeEventListener('scroll', onScroll, true); if (raf) cancelAnimationFrame(raf); };
 }, [carritoActivo]);

 const isMesasActive = location.pathname ==='/v2/mesas'|| location.pathname.startsWith('/v2/mesas');
 // En Mesas, el botón central muestra la zona actual y abre la hoja de zonas; en el resto de pantallas lleva a Mesas.
 const zonaActual = useZonaEtiqueta();
 const abreZonas = isMesasActive && !!zonaActual;

 // Pista sutil sobre el botón de zonas: los meseros nuevos no saben que ahí se tocan las zonas. Sale unos segundos al entrar a Mesas y
 // deja de salir cuando ya abrieron las zonas varias veces (o al tocarlo). Los temporizadores evitan cambiar estado en el propio efecto.
 const [pistaZonas, setPistaZonas] = useState(false);
 useEffect(() => {
 if (!abreZonas || pistaAgotada()) return;
 const mostrar = setTimeout(() => setPistaZonas(true), 900);
 const ocultar = setTimeout(() => setPistaZonas(false), 7000);
 return () => { clearTimeout(mostrar); clearTimeout(ocultar); setPistaZonas(false); };
 }, [abreZonas]);

 return (
 <>
 <div id="mobile-navbar-root"className={cn("fixed bottom-0 left-0 right-0 z-40 flex flex-col items-center px-4 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-2 pointer-events-none transition-transform duration-300 ease-out", oculto && !carritoActivo && "translate-y-full")}>
 {/* Degradado oscuro suave desde el borde inferior: da contraste a la barra. Va dentro del contenedor, así se oculta con él al bajar el scroll. */}
 <div aria-hidden className={cn("absolute inset-x-0 bottom-0 -z-10 h-32 pointer-events-none bg-linear-to-t from-black/25 via-black/10 to-transparent transition-opacity duration-300", menuCapasAbierto && "opacity-0")} />
 <nav className={cn("flex items-center w-full max-w-md", menuCapasAbierto ? "pointer-events-none" : "pointer-events-auto")}>
 {cart && (cart.itemCount > 0 || cart.mantenerVacio) ? (
 /* Estado carrito: Layout de 3 piezas idéntico al normal */
 <div className="flex items-center justify-between w-full gap-3 h-[52px]">
 
 {/* IZQUIERDA: Slot para Categorías/Volver */}
 <div id="mobile-navbar-cart-action-slot"onClick={e => e.stopPropagation()} className="shrink-0 flex items-center justify-center w-[52px] h-[52px]"></div>
 
 {/* CENTRO: Info de comanda */}
 <Button
 type="button" variant="warning" onClick={onOpenCart}
 className="flex-col gap-0 flex-1 h-[52px] px-4 rounded-full active:scale-[0.96] min-w-0">
 <span className="t-cuerpo-fuerte truncate w-full text-center leading-tight">
 {cart.mesaNombre}
 </span>
 <span className="t-meta text-primary-foreground/90 truncate w-full text-center mt-0.5">
 {cart.itemCount === 0 ? 'Agrega productos' : `${cart.itemCount} ${cart.itemCount === 1 ?'item':'items'} · $${cart.total.toFixed(2)}`}
 </span>
 </Button>

 {/* DERECHA: Slot para Buscar */}
 <div id="mobile-navbar-cart-search-slot" onClick={e => e.stopPropagation()} className="shrink-0 flex items-center justify-center w-[52px] h-[52px]"></div>
 </div>
 ) : (
 /* Estado normal: Sync (izquierda), Mesas y Menú (derecha) como 3 botones independientes */
 <div className="relative flex items-center justify-between w-full gap-3">
 {abreZonas && (
 <div
 aria-hidden role="presentation"
 className={cn("absolute bottom-full left-1/2 -translate-x-1/2 mb-3 pointer-events-none transition-all duration-300", pistaZonas && !menuCapasAbierto ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1")}>
 <div className="relative px-3 py-1.5 rounded-xl bg-foreground text-background t-meta whitespace-nowrap shadow-lg">
 Toca aquí para cambiar de zona
 <span className="absolute left-1/2 top-full -translate-x-1/2 -mt-1 size-2.5 rotate-45 bg-foreground" />
 </div>
 </div>
 )}
 {/* Punto verde = todo sincronizado. Rojo (y el botón late) = algo pendiente (sin
 conexión, error o cola de envío), para que el usuario se detenga a revisarlo. */}
 <Button
 type="button" onClick={onOpenSync} tabIndex={menuCapasAbierto ? -1 : 0} aria-hidden={menuCapasAbierto}
 title="Estado de Sincronización" aria-label="Estado de sincronización"
 className={cn("relative size-[52px] rounded-full shrink-0 drop-shadow-lg active:scale-95 transition-transform duration-300 ease-out", syncPendiente && "animate-pulse", menuCapasAbierto && "translate-y-28 pointer-events-none")}
 style={{ transitionDelay: menuCapasAbierto ? '0ms' : '90ms' }}>
 <ArrowsClockwise size={22} weight="bold" className={syncing ?'animate-spin':''} />
 <span className={cn("absolute top-3 right-3 size-2.5 rounded-full border-2 border-primary", syncPendiente ? "bg-destructive" : "bg-success")} />
 </Button>

 <Button
 type="button" onClick={() => { if (abreZonas) { anotarUsoZonas(); setPistaZonas(false); setZonasAbiertas(true); } else navigate('/v2/mesas'); }} tabIndex={menuCapasAbierto ? -1 : 0} aria-hidden={menuCapasAbierto}
 title={abreZonas ? 'Zonas' : 'Mesas'} aria-haspopup={abreZonas ? 'dialog' : undefined}
 className={cn("flex-1 h-[52px] min-w-0 rounded-full gap-2 t-cuerpo-fuerte drop-shadow-lg active:scale-[0.98] transition-transform duration-300 ease-out", menuCapasAbierto && "translate-y-28 pointer-events-none")}
 style={{ transitionDelay: menuCapasAbierto ? '90ms' : '0ms' }}
 >
 <SquaresFour size={20} weight={isMesasActive ?'fill':'regular'} className="shrink-0" />
 <span className="truncate">{abreZonas ? zonaActual : 'Mesas'}</span>
 {abreZonas && <CaretDown size={16} weight="bold" className="shrink-0" />}
 </Button>

 <Button
 type="button" onClick={() => (MENU_EN_CAPAS ? toggleMenuMovil() : setMenuOpen(true))}
 title="Secciones" aria-label="Secciones"
 // Abierto: el botón cambia de tono (oscuro, del color del marco) para leerse como "cerrar".
 className={cn("size-[52px] rounded-full shrink-0 pointer-events-auto drop-shadow-lg active:scale-95", menuCapasAbierto && "bg-nav-foreground border-transparent text-nav hover:bg-nav-foreground/90")}>
 {menuCapasAbierto ? <X size={22} weight="bold" /> : <List size={22} />}
 </Button>
 </div>
 )}
 </nav>
 </div>

 <Drawer open={menuOpen} onOpenChange={setMenuOpen} dismissible handleOnly>
 <DrawerPortal>
 <DrawerOverlay />
 <DrawerContent className="fixed bottom-0 left-0 right-0 h-[95dvh] max-h-[95dvh] bg-nav text-nav-foreground rounded-t-marco shadow-[0_-8px_30px_rgba(0,0,0,0.35)] z-50 flex flex-col overflow-hidden p-0 border-0 before:hidden">
 <DrawerDescription className="sr-only">Navegación entre secciones de la app</DrawerDescription>
 <DrawerHandle className="!bg-nav-foreground/40" />
 <DrawerTitle className="sr-only">Menú principal</DrawerTitle>

 {/* Header: igual que la cabecera del sidebar de PC (icono de la app) + organización y estado de impresión */}
 <div className="shrink-0 flex items-center justify-between gap-3 px-5 pt-8 pb-4">
 <div className="flex items-center gap-3 min-w-0">
 <AguacateEgg className="w-9 h-9" />
 <div className="flex flex-col min-w-0">
 <span className="t-titulo text-nav-foreground leading-tight truncate">{orgNombre}</span>
 <span className="flex items-center gap-1.5 t-dato text-nav-foreground/70 leading-tight">
 <span className={cn("w-2 h-2 rounded-full shrink-0", printServerOk ? 'bg-success' : 'bg-destructive')} />
 {printServerOk ? 'Impresión conectada' : 'Impresión sin conexión'}
 </span>
 </div>
 </div>
 <DrawerClose asChild>
 <button type="button" aria-label="Cerrar" className="size-10 rounded-2xl bg-nav-foreground/10 text-nav-foreground flex items-center justify-center shrink-0 cursor-pointer">
 <X size={18} weight="bold" />
 </button>
 </DrawerClose>
 </div>

 {/* Secciones: mismos colores de activo y barra izquierda que el sidebar de PC (aquí con la etiqueta siempre visible) */}
 <nav className="flex-1 overflow-y-auto pb-2 flex flex-col">
 {navItemsMobile.filter(item => rutaPermitida(permisos, item.to)).map((item) => {
 const Icon = item.icon;
 if ('soloPc' in item && item.soloPc) {
 return (
 <div
 key={item.to}
 aria-disabled="true"
 className="flex items-center gap-4 px-5 h-14 border-l-[3px] border-transparent text-nav-foreground/40 select-none"
 >
 <Icon size={22} weight="regular" className="shrink-0" />
 <span className="flex flex-col leading-tight t-cuerpo-fuerte">
 {item.label}
 <span className="t-dato">Solo disponible en PC</span>
 </span>
 </div>
 );
 }
 return (
 <NavLink
 key={item.to}
 to={item.to}
 onClick={() => setMenuOpen(false)}
 style={{ '--mod': NAV_ACCENT[item.to] } as React.CSSProperties}
 className={({ isActive }) =>
 cn('flex items-center gap-4 px-5 h-14 border-l-[3px] t-cuerpo-fuerte transition-colors',
 isActive ? 'border-(--mod) text-(--mod)' : 'border-transparent text-nav-foreground/90 active:text-nav-foreground')
 }
 >
 {({ isActive }) => (
 <>
 <Icon size={22} weight={isActive ? 'fill' : 'regular'} className="shrink-0" />
 <span>{item.label}</span>
 </>
 )}
 </NavLink>
 );
 })}
 </nav>

 {/* Usuario + cierre de sesión (en el sidebar de PC es el menú de la cuenta) */}
 <div className="shrink-0 border-t border-nav-foreground/10 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] flex flex-col gap-3">
 <div className="flex items-center gap-3">
 <span aria-hidden="true" className="size-11 rounded-full bg-nav-foreground/15 text-nav-foreground flex items-center justify-center t-cuerpo-fuerte shrink-0">
 {initials(userName)}
 </span>
 <div className="flex flex-col min-w-0 flex-1">
 <span className="t-cuerpo-fuerte text-nav-foreground truncate">{userName}</span>
 <span className="t-dato text-nav-foreground/70">{userRole}</span>
 </div>
 <button
 type="button" title="Configuración de cuenta" aria-label="Configuración de cuenta"
 className="size-11 rounded-2xl bg-nav-foreground/10 text-nav-foreground flex items-center justify-center shrink-0 cursor-pointer"
 onClick={() => { setMenuOpen(false); navigate('/ajustes'); }}
 >
 <UserGear size={18} weight="bold" />
 </button>
 </div>

 <button type="button" onClick={handleLogout}
 className="w-full h-11 rounded-2xl text-red-300 t-cuerpo flex items-center justify-center gap-2 hover:bg-nav-foreground/10 cursor-pointer">
 <SignOut size={16} weight="bold" /> Cerrar sesión
 </button>
 </div>
 </DrawerContent>
 </DrawerPortal>
 </Drawer>
 </>
 );
}

// Capa del menú en capas: vive detrás de la página (que baja al abrirlo). Mismas
// tarjetas/colores de módulo que el sidebar de PC, sobre el fondo oscuro del marco.
export function MenuCapaMovil() {
  const location = useLocation();
  const { currentMesero, adminUser, logoutMesero, logoutAdmin } = useAuth();
  const [printServerOk, setPrintServerOk] = useState(false);
  const abierto = useMenuMovilAbierto();
  const { setActividadOpen, openConfirm } = useUI();
  const orgNombre = localStorage.getItem('pos_org_name_cached') || 'Organización';
  const userName = currentMesero?.nombre || adminUser?.user_metadata?.full_name || adminUser?.email?.split('@')[0] || 'Usuario';
  const permisos = usePermisos();
  const userRole = ROL_LABELS[permisos.rol];

  // Estado de la impresora: solo se consulta con el menú abierto.
  useEffect(() => {
    if (!abierto) return;
    let alive = true;
    getPrintServerStatus()
      .then((status) => { if (alive) setPrintServerOk(status.ok); })
      .catch(() => { if (alive) setPrintServerOk(false); });
    return () => { alive = false; };
  }, [abierto]);

  const cerrar = () => setMenuMovilAbierto(false);
  const logout = () => { cerrar(); if (currentMesero) logoutMesero(); else logoutAdmin(); };

  return (
    <div aria-hidden={!abierto} className="absolute inset-0 z-0 bg-nav text-nav-foreground flex flex-col justify-end px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
      <div className="flex items-center gap-3 pb-4 min-w-0">
        <AguacateEgg className="w-9 h-9" />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="t-titulo text-nav-foreground leading-tight truncate">{orgNombre}</span>
          <span className="flex items-center gap-1.5 t-dato text-nav-foreground/70 leading-tight">
            <span className={cn('w-2 h-2 rounded-full shrink-0', printServerOk ? 'bg-success' : 'bg-destructive')} />
            {printServerOk ? 'Impresión conectada' : 'Impresión sin conexión'}
          </span>
        </div>
        <button type="button" title="Actividad del día" aria-label="Actividad del día" tabIndex={abierto ? 0 : -1}
          // El panel entra primero y cubre la pantalla; el menú se cierra detrás, ya sin verse.
          onClick={() => { setActividadOpen(true); setTimeout(cerrar, 350); }}
          className="size-11 rounded-full text-nav-foreground flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-transform">
          <Pulse size={22} weight="bold" />
        </button>
      </div>

      <nav aria-label="Secciones" className="grid grid-cols-2 auto-rows-[4rem] gap-3">
        {navItemsMobile.filter(item => rutaPermitida(permisos, item.to)).map((item) => {
          const Icon = item.icon;
          if ('soloPc' in item && item.soloPc) {
            return (
              <div key={item.to} aria-disabled="true"
                className="rounded-2xl bg-nav-foreground/5 px-4 flex items-center gap-3 text-nav-foreground/40 select-none">
                <Icon size={22} className="shrink-0" />
                <span className="flex flex-col leading-tight t-cuerpo-fuerte">{item.label}<span className="t-dato">Solo en PC</span></span>
              </div>
            );
          }
          const activo = location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to} to={item.to} onClick={cerrar} tabIndex={abierto ? 0 : -1}
              className={cn('rounded-2xl px-4 flex items-center gap-3 t-cuerpo-fuerte transition-all active:scale-[0.97]',
                activo ? 'bg-nav-foreground/20 text-nav-foreground ring-1 ring-nav-foreground/50' : 'bg-nav-foreground/10 text-nav-foreground')}
            >
              <span className="shrink-0"><Icon size={22} weight={activo ? 'fill' : 'regular'} /></span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Fila inferior, a la altura del botón de cerrar el menú (que vive en la barra fija).
          El botón de salir pide confirmación para evitar toques por error. */}
      <div className="absolute left-4 right-[5rem] bottom-[calc(env(safe-area-inset-bottom)+28px)] h-[52px] flex items-center gap-3">
        <button type="button" tabIndex={abierto ? 0 : -1} title="Cerrar sesión" aria-label={`Cerrar sesión de ${userName}`}
          onClick={() => openConfirm('Cerrar sesión', '¿Seguro que deseas cerrar la sesión en este dispositivo?', logout)}
          className="size-12 rounded-full bg-red-400/15 text-red-300 hover:bg-red-400/25 hover:text-red-200 flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-transform">
          <SignOut size={22} weight="bold" />
        </button>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="t-cuerpo-fuerte text-nav-foreground leading-tight truncate">{userName}</span>
          <span className="t-dato text-nav-foreground/70 leading-tight truncate">{userRole}</span>
        </div>
      </div>
    </div>
  );
}

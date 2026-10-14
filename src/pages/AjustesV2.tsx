import { useState, useEffect } from'react';
import { useLocation } from'react-router-dom';
import { Buildings, CalendarStar, CreditCard, Percent, Printer } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import AjustesOrganizacion from './Ajustes/AjustesOrganizacion';
import AjustesImpresion from './Ajustes/AjustesImpresion';
import AjustesMetodosPago from './Ajustes/AjustesMetodosPago';
import AjustesIva from './Ajustes/AjustesIva';
import AjustesPlanificador from './Ajustes/AjustesPlanificador';
import { usePermisos, puedeVerSeccion, ROL_LABELS } from '../hooks/usePermisos';
import { useAuth } from'../context/AuthContext';
import { PageFrame, PageHeader, PageContent, PageToolbar, toolbarChipClass } from'../components/Common/PageHeader';

const SECTION_KEYS = ['organizacion', 'metodos-pago', 'impresion', 'iva', 'planificador'] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const SECTIONS = [
  { value: 'organizacion', label: 'Organización', icon: Buildings },
  { value: 'metodos-pago', label: 'Métodos de Pago', icon: CreditCard },
  { value: 'impresion', label: 'Impresión', icon: Printer },
  { value: 'iva', label: 'IVA', icon: Percent },
  { value: 'planificador', label: 'Planificador', icon: CalendarStar },
] as const;

const sectionFromPath = (path: string): SectionKey | null => {
  const seg = path.split('/').filter(Boolean).pop() as SectionKey | undefined;
  return seg && (SECTION_KEYS as readonly string[]).includes(seg) ? seg : null;
};

function iniciales(nombre: string) {
  return nombre.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || 'U';
}

export default function AjustesV2() {
  const location = useLocation();
  const { currentMesero, adminUser } = useAuth();
  // Usuario conectado, visible en el header (también sirve para saber con qué cuenta se cambian los ajustes).
  const nombreUsuario = currentMesero?.nombre
    || adminUser?.user_metadata?.full_name
    || adminUser?.email?.split('@')[0]
    || 'Usuario';
  const permisos = usePermisos();
  const rolUsuario = ROL_LABELS[permisos.rol];
  // Secciones que el rol puede ver (el cajero, solo Impresión).
  const secciones = SECTIONS.filter((sec) => puedeVerSeccion(permisos, sec.value));
  const permitida = (sec: SectionKey | null): sec is SectionKey => !!sec && puedeVerSeccion(permisos, sec);
  const [activeSection, setActiveSection] = useState<SectionKey>(() => {
    const desdeUrl = sectionFromPath(window.location.pathname);
    return permitida(desdeUrl) ? desdeUrl : (secciones[0]?.value ?? 'organizacion');
  });

  // Enlaces directos (p. ej. el aviso de IVA → /v2/ajustes/iva) cambian de sección.
  useEffect(() => {
    const next = sectionFromPath(location.pathname);
    if (permitida(next)) setActiveSection(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const goToSection = (section: SectionKey) => {
    setActiveSection(section);
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState(null, '', `/v2/ajustes/${section}`);
    }
  };

  return (
    <PageFrame>
      <PageHeader
        title="Ajustes"
        subtitle={SECTIONS.find(s => s.value === activeSection)?.label}
        actions={
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="hidden sm:flex flex-col items-end min-w-0">
              <span className="t-cuerpo-fuerte text-nav-foreground leading-tight truncate max-w-[200px]">{nombreUsuario}</span>
              <span className="t-dato text-nav-foreground/70 leading-tight">{rolUsuario}</span>
            </div>
            <span aria-hidden="true" className="w-9 h-9 rounded-lg bg-nav-foreground/15 text-nav-foreground flex items-center justify-center t-dato shrink-0">
              {iniciales(nombreUsuario)}
            </span>
          </div>
        }
      />

      <PageContent>
        {/* Celular: chips arriba. PC/iPad: columna de secciones a la izquierda. */}
        <PageToolbar className="md:hidden">
          {secciones.map((sec) => (
            <button key={sec.value} type="button" onClick={() => goToSection(sec.value)} className={toolbarChipClass(activeSection === sec.value)}>
              {sec.label}
            </button>
          ))}
        </PageToolbar>

        <div className="flex-1 min-h-0 flex">
          <nav aria-label="Secciones de ajustes" className="hidden md:flex w-64 shrink-0 flex-col gap-1 border-r border-border p-3 overflow-y-auto">
            {secciones.map(({ value, label, icon: Icono }) => {
              const activa = activeSection === value;
              return (
                <button key={value} type="button" onClick={() => goToSection(value)} aria-current={activa ? 'page' : undefined}
                  className={cn('flex items-center gap-3 h-11 px-3 rounded-2xl text-left cursor-pointer transition-colors touch-manipulation',
                    activa ? 't-cuerpo-fuerte bg-muted text-foreground' : 't-cuerpo text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>
                  <Icono size={18} weight={activa ? 'fill' : 'regular'} className="shrink-0" />
                  {label}
                </button>
              );
            })}
          </nav>

          <main className="flex-1 min-w-0 overflow-y-auto px-3 py-4 sm:px-6 sm:py-8">
            <div className="max-w-3xl w-full mx-auto">
              {permitida(activeSection) && (
                <>
                  {activeSection === 'organizacion' && <AjustesOrganizacion />}
                  {activeSection === 'metodos-pago' && <AjustesMetodosPago />}
                  {activeSection === 'impresion' && <AjustesImpresion />}
                  {activeSection === 'iva' && <AjustesIva />}
                  {activeSection === 'planificador' && <AjustesPlanificador />}
                </>
              )}
            </div>
          </main>
        </div>
      </PageContent>
    </PageFrame>
  );
}

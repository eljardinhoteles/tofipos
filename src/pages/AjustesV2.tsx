import { useState, useEffect } from'react';
import { useLocation } from'react-router-dom';
import AjustesOrganizacion from './Ajustes/AjustesOrganizacion';
import AjustesImpresion from './Ajustes/AjustesImpresion';
import AjustesMetodosPago from './Ajustes/AjustesMetodosPago';
import AjustesIva from './Ajustes/AjustesIva';
import { useAuth } from'../context/AuthContext';
import { PageFrame, PageHeader, PageContent, PageToolbar, toolbarChipClass } from'../components/Common/PageHeader';

const SECTION_KEYS = ['organizacion', 'metodos-pago', 'impresion', 'iva'] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const SECTIONS = [
  { value: 'organizacion', label: 'Organización' },
  { value: 'metodos-pago', label: 'Métodos de Pago' },
  { value: 'impresion', label: 'Impresión' },
  { value: 'iva', label: 'IVA' },
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
  const rolUsuario = currentMesero ? ((currentMesero as any).rol === 'admin' ? 'Administrador' : 'Mesero') : 'Administrador';
  const [activeSection, setActiveSection] = useState<SectionKey>(() => sectionFromPath(window.location.pathname) ?? 'organizacion');

  // Enlaces directos (p. ej. el aviso de IVA → /v2/ajustes/iva) cambian de sección.
  useEffect(() => {
    const next = sectionFromPath(location.pathname);
    if (next) setActiveSection(next);
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
              <span className="text-sm font-extrabold text-nav-foreground leading-tight truncate max-w-[200px]">{nombreUsuario}</span>
              <span className="text-[11px] font-semibold text-nav-foreground/70 leading-tight">{rolUsuario}</span>
            </div>
            <span aria-hidden="true" className="w-9 h-9 rounded-xl bg-nav-foreground/15 text-nav-foreground flex items-center justify-center text-xs font-black shrink-0">
              {iniciales(nombreUsuario)}
            </span>
          </div>
        }
      />

      <PageContent>
        <PageToolbar>
          {SECTIONS.map((sec) => (
            <button key={sec.value} type="button" onClick={() => goToSection(sec.value)} className={toolbarChipClass(activeSection === sec.value)}>
              {sec.label}
            </button>
          ))}
        </PageToolbar>

        <main className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto">
          {activeSection === 'organizacion' && <AjustesOrganizacion />}
          {activeSection === 'metodos-pago' && <AjustesMetodosPago />}
          {activeSection === 'impresion' && <AjustesImpresion />}
          {activeSection === 'iva' && <AjustesIva />}
        </main>
      </PageContent>
    </PageFrame>
  );
}

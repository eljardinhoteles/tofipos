import { useEffect, useRef, useState } from 'react';
import { FloppyDisk, UploadSimple, Trash } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '@/lib/toast';
import { setOrgCache } from '../../lib/orgCache';
import { subirImagenPublica } from '../../lib/comprobantes';
import { Input } from '@/components/ui/input';
import { EstadoBadge } from '../../components/Common/EstadoBadge';
import { Campo, Fila, Grupo, Seccion, Vacio } from '../../components/Ajustes/AjustesUI';
import { Button } from '@/components/ui/button';
import AjustesUsuarios from './AjustesUsuarios';

type OrgForm = {
  nombre: string;
  ruc: string;
  telefono: string;
  direccion: string;
  email: string;
  logo_url: string;
};

const EMPTY_FORM: OrgForm = {
  nombre: '',
  ruc: '',
  telefono: '',
  direccion: '',
  email: '',
  logo_url: '',
};

export default function AjustesOrganizacion() {
  const { currentMesero, adminUser } = useAuth();
  const orgId = currentMesero?.organization_id || localStorage.getItem('pos_active_org_id') || '';
  const connectedUser = currentMesero || (adminUser ? {
    nombre: adminUser.email?.split('@')[0] || adminUser.email || 'Usuario',
    rol: 'admin',
    email: adminUser.email || '',
  } : null);
  const [form, setForm] = useState<OrgForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    if (!orgId) return;

    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('organizaciones')
          .select('*')
          .eq('id', orgId)
          .maybeSingle();
        if (error) throw error;
        if (!alive) return;
        setForm({
          nombre: data?.nombre || '',
          ruc: data?.ruc || '',
          telefono: data?.telefono || '',
          direccion: data?.direccion || '',
          email: data?.email || '',
          logo_url: data?.logo_url || '',
        });
        setOrgCache(data || {});
      } catch (error) {
        console.error('Error cargando organización:', error);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [orgId]);

  const handleSave = async () => {
    if (!orgId) {
      showToast.warning('No hay organización activa', 'Vincula o crea una organización primero.');
      return;
    }
    if (!form.nombre.trim()) {
      showToast.warning('Escribe el nombre de la organización');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        ruc: form.ruc.trim() || null,
        telefono: form.telefono.trim() || null,
        direccion: form.direccion.trim() || null,
        email: form.email.trim() || null,
        logo_url: form.logo_url.trim() || null,
        _modified: new Date().toISOString(),
      };

      const { error } = await supabase.from('organizaciones').update(payload).eq('id', orgId);
      if (error) throw error;

      setOrgCache({
        nombre: form.nombre.trim(),
        ruc: form.ruc.trim(),
        telefono: form.telefono.trim(),
        direccion: form.direccion.trim(),
      });
      showToast.success('Organización actualizada');
    } catch (error) {
      console.error('Error al guardar organización:', error);
      showToast.error('No se pudo guardar la organización', 'Intenta de nuevo o avisa al administrador.');
    } finally {
      setSaving(false);
    }
  };

  // Logo de los correos: solo PNG o JPG (WebP y SVG no los muestran todos los clientes de correo), hasta 2 MB.
  const subirLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) { showToast.warning('Usa una imagen PNG o JPG'); return; }
    if (file.size > 2 * 1024 * 1024) { showToast.warning('La imagen pesa más de 2 MB', 'Reduce su tamaño e inténtalo de nuevo.'); return; }
    setSubiendoLogo(true);
    try {
      const url = await subirImagenPublica(file, orgId, 'logo');
      setForm((prev) => ({ ...prev, logo_url: url }));
      showToast.success('Logo subido', 'Pulsa «Guardar cambios» para aplicarlo.');
    } catch (error) {
      showToast.fallo('subir el logo', error);
    } finally {
      setSubiendoLogo(false);
      if (logoInput.current) logoInput.current.value = '';
    }
  };

  const campo = (clave: keyof OrgForm) => ({
    value: form[clave],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [clave]: e.target.value })),
    className: 'h-12 text-base',
  });

  return (
    <div className="flex flex-col gap-6">
      <Seccion titulo="Organización" descripcion="Datos del establecimiento: salen en los tickets, comprobantes y correos a los huéspedes.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Campo etiqueta="Nombre *" htmlFor="org-nombre"><Input id="org-nombre" type="text" required placeholder="Ej. Hotel Valle de Guadalupe" {...campo('nombre')} /></Campo>
          <Campo etiqueta="RUC" htmlFor="org-ruc"><Input id="org-ruc" type="text" placeholder="Ej. 1790012345001" {...campo('ruc')} /></Campo>
          <Campo etiqueta="Teléfono" htmlFor="org-tel"><Input id="org-tel" type="text" placeholder="Ej. +593 99 123 4567" {...campo('telefono')} /></Campo>
          <Campo etiqueta="Dirección" htmlFor="org-dir"><Input id="org-dir" type="text" placeholder="Ej. Av. Principal 123 y Calle 4" {...campo('direccion')} /></Campo>
          <Campo etiqueta="Correo de contacto" htmlFor="org-email"><Input id="org-email" type="email" placeholder="Ej. reservas@tuhotel.com" {...campo('email')} /></Campo>
          <Campo etiqueta="Logo para correos" htmlFor="org-logo">
            <div className="flex items-center gap-3">
              {form.logo_url && <img src={form.logo_url} alt="Logo" className="h-12 max-w-40 object-contain rounded border border-border bg-white p-1" />}
              <input ref={logoInput} id="org-logo" type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => void subirLogo(e.target.files?.[0])} />
              <Button type="button" variant="outline" disabled={subiendoLogo || !orgId} onClick={() => logoInput.current?.click()} className="h-12 gap-2">
                <UploadSimple size={18} weight="bold" /> {subiendoLogo ? 'Subiendo…' : form.logo_url ? 'Cambiar logo' : 'Subir logo'}
              </Button>
              {form.logo_url && (
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar el logo" onClick={() => setForm((prev) => ({ ...prev, logo_url: '' }))} className="h-12 w-12"><Trash size={18} /></Button>
              )}
            </div>
          </Campo>
        </div>
        <div className="flex justify-end">
          <Button disabled={saving || loading || !orgId} onClick={handleSave} className="h-12 gap-2 px-6">
            <FloppyDisk size={18} weight="bold" /> Guardar cambios
          </Button>
        </div>
      </Seccion>

      <Seccion titulo="Usuario conectado" descripcion="Sesión activa en este dispositivo.">
        {connectedUser ? (
          <Grupo>
            <Fila titulo={connectedUser.nombre} ayuda={connectedUser.email || 'Sin correo'}>
              <EstadoBadge tono="info" className="capitalize">{connectedUser.rol}</EstadoBadge>
            </Fila>
          </Grupo>
        ) : (
          <Grupo><Vacio>No hay una sesión activa todavía.</Vacio></Grupo>
        )}
      </Seccion>

      <AjustesUsuarios />
    </div>
  );
}

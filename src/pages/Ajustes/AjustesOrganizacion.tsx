import { useEffect, useState } from 'react';
import { FloppyDisk } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '@/lib/toast';
import { setOrgCache } from '../../lib/orgCache';
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
};

const EMPTY_FORM: OrgForm = {
  nombre: '',
  ruc: '',
  telefono: '',
  direccion: '',
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

  useEffect(() => {
    let alive = true;
    if (!orgId) return;

    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('organizaciones')
          .select('nombre, ruc, telefono, direccion')
          .eq('id', orgId)
          .maybeSingle();
        if (error) throw error;
        if (!alive) return;
        setForm({
          nombre: data?.nombre || '',
          ruc: data?.ruc || '',
          telefono: data?.telefono || '',
          direccion: data?.direccion || '',
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

  const campo = (clave: keyof OrgForm) => ({
    value: form[clave],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [clave]: e.target.value })),
    className: 'h-12 text-base',
  });

  return (
    <div className="flex flex-col gap-6">
      <Seccion titulo="Organización" descripcion="Datos del establecimiento: salen en los tickets y comprobantes.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Campo etiqueta="Nombre *" htmlFor="org-nombre"><Input id="org-nombre" type="text" required placeholder="Ej. Hotel Valle de Guadalupe" {...campo('nombre')} /></Campo>
          <Campo etiqueta="RUC" htmlFor="org-ruc"><Input id="org-ruc" type="text" placeholder="Ej. 1790012345001" {...campo('ruc')} /></Campo>
          <Campo etiqueta="Teléfono" htmlFor="org-tel"><Input id="org-tel" type="text" placeholder="Ej. +593 99 123 4567" {...campo('telefono')} /></Campo>
          <Campo etiqueta="Dirección" htmlFor="org-dir"><Input id="org-dir" type="text" placeholder="Ej. Av. Principal 123 y Calle 4" {...campo('direccion')} /></Campo>
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

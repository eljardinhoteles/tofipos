import { useEffect, useState } from 'react';
import { Building, FloppyDisk } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '@/lib/toast';
import { setOrgCache } from '../../lib/orgCache';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const persistedAdminEmail = localStorage.getItem('pos_admin_email') || '';
  const connectedUser = currentMesero || (adminUser ? {
    nombre: adminUser.email?.split('@')[0] || adminUser.email || 'Usuario',
    rol: 'admin',
    email: adminUser.email || '',
  } : (persistedAdminEmail ? {
    nombre: persistedAdminEmail.split('@')[0] || persistedAdminEmail,
    rol: 'admin',
    email: persistedAdminEmail,
  } : null));
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
      showToast.error('Sin organización', 'Primero vincula o crea una organización.');
      return;
    }
    if (!form.nombre.trim()) {
      showToast.error('Nombre requerido');
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
      showToast.error('Error al guardar', 'Revisa que la tabla organizaciones tenga ruc, telefono y direccion.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Building size={22} weight="fill" />
            </div>
            <div className="flex flex-col">
              <h3 className="font-extrabold text-base text-foreground">Organización</h3>
              <p className="text-xs text-muted-foreground">Datos del establecimiento y administración del local.</p>
            </div>
          </div>

          <Button size="sm" disabled={saving || loading || !orgId} onClick={handleSave}>
            <FloppyDisk size={16} weight="bold" /> Guardar
          </Button>
        </div>

        <div className="w-full h-[1px] bg-border" />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
            <Label className="text-xs font-bold">Nombre de Organización *</Label>
            <Input
              type="text"
              required
              placeholder="Ej. Hotel Valle de Guadalupe"
              value={form.nombre}
              onChange={(e) => setForm(prev => ({ ...prev, nombre: e.target.value }))}
              className="h-9 text-xs font-semibold"
            />
          </div>

          <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
            <Label className="text-xs font-bold">RUC</Label>
            <Input
              type="text"
              placeholder="Ej. 1790012345001"
              value={form.ruc}
              onChange={(e) => setForm(prev => ({ ...prev, ruc: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>

          <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
            <Label className="text-xs font-bold">Teléfono</Label>
            <Input
              type="text"
              placeholder="Ej. +593 99 123 4567"
              value={form.telefono}
              onChange={(e) => setForm(prev => ({ ...prev, telefono: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>

          <div className="flex flex-col gap-1 col-span-2">
            <Label className="text-xs font-bold">Dirección</Label>
            <Input
              type="text"
              placeholder="Ej. Av. Principal 123 y Calle 4"
              value={form.direccion}
              onChange={(e) => setForm(prev => ({ ...prev, direccion: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h3 className="font-extrabold text-base text-foreground">Usuario conectado</h3>
            <p className="text-xs text-muted-foreground">Sesión activa en este dispositivo.</p>
          </div>
          {connectedUser && (
            <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground font-extrabold text-xs uppercase">
              {connectedUser.rol}
            </span>
          )}
        </div>

        <div className="w-full h-[1px] bg-border" />

        {connectedUser ? (
          <div className="flex flex-col gap-1 text-xs">
            <span className="font-extrabold text-foreground text-sm">{connectedUser.nombre}</span>
            <span className="text-muted-foreground font-semibold">Rol: {connectedUser.rol}</span>
            <span className="text-muted-foreground font-semibold">Correo: {connectedUser.email || 'N/A'}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground font-semibold">No hay una sesión activa todavía.</span>
        )}
      </div>

      <AjustesUsuarios />
    </div>
  );
}

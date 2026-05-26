import { useEffect, useState } from 'react';
import { Badge, Box, Button, Divider, Grid, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { Building, FloppyDisk } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { sileo } from 'sileo';
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
      sileo.error({ title: 'Sin organización', description: 'Primero vincula o crea una organización.' });
      return;
    }
    if (!form.nombre.trim()) {
      sileo.error({ title: 'Nombre requerido' });
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

      localStorage.setItem('pos_org_name_cached', form.nombre.trim());
      sileo.success({ title: 'Organización actualizada' });
    } catch (error) {
      console.error('Error al guardar organización:', error);
      sileo.error({ title: 'Error al guardar', description: 'Revisa que la tabla organizaciones tenga ruc, telefono y direccion.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="lg" py="xl">
      <Paper withBorder p="xl" radius="lg" style={{ backgroundColor: 'var(--pos-surface)' }}>
        <Group justify="space-between" align="center">
          <Group gap="md">
            <Box p={10} style={{ borderRadius: 12, backgroundColor: 'var(--ui-primary-soft)' }}>
              <Building size={22} color="var(--ui-primary)" weight="fill" />
            </Box>
            <Box>
              <Text fw={900} size="lg">Organización</Text>
              <Text size="sm" c="dimmed">
                Datos del establecimiento y administración de usuarios en un mismo lugar.
              </Text>
            </Box>
          </Group>
          <Button
            leftSection={<FloppyDisk size={18} weight="bold" />}
            color="myColor"
            radius="md"
            onClick={handleSave}
            loading={saving}
            disabled={loading || !orgId}
          >
            Guardar
          </Button>
        </Group>

        <Divider my="md" />

        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Nombre de Organización"
              value={form.nombre}
              onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
              placeholder="Ej. Hotel Valle de Guadalupe"
              radius="md"
              size="md"
              required
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="RUC"
              value={form.ruc}
              onChange={(e) => setForm((prev) => ({ ...prev, ruc: e.target.value }))}
              placeholder="Ej. 1790012345001"
              radius="md"
              size="md"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Teléfono"
              value={form.telefono}
              onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))}
              placeholder="Ej. +593 99 123 4567"
              radius="md"
              size="md"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12 }}>
            <TextInput
              label="Dirección"
              value={form.direccion}
              onChange={(e) => setForm((prev) => ({ ...prev, direccion: e.target.value }))}
              placeholder="Ej. Av. Principal 123 y Calle 4"
              radius="md"
              size="md"
            />
          </Grid.Col>
        </Grid>
      </Paper>

      {!orgId && (
        <Paper withBorder p="md" radius="md" bg="gray.0">
          <Text fw={700}>Sin organización activa</Text>
          <Text size="sm" c="dimmed">Vincula un hotel antes de editar los datos del comercio.</Text>
        </Paper>
      )}

      <Paper withBorder p="xl" radius="lg" style={{ backgroundColor: 'var(--pos-surface)' }}>
        <Group justify="space-between" align="center" mb="md">
          <Box>
            <Text fw={900} size="lg">Usuario conectado</Text>
            <Text size="sm" c="dimmed">
              Sesión activa en este dispositivo.
            </Text>
          </Box>
          {connectedUser ? (
            <Badge color="myColor" variant="filled">
              {connectedUser.rol}
            </Badge>
          ) : (
            <Badge color="gray" variant="light">
              Sin sesión
            </Badge>
          )}
        </Group>

        <Divider my="md" />

        {connectedUser ? (
          <Stack gap={4}>
            <Text fw={800} size="md">{connectedUser.nombre}</Text>
            <Text size="sm" c="dimmed">Rol: {connectedUser.rol}</Text>
            <Text size="sm" c="dimmed">Correo: {connectedUser.email || 'N/A'}</Text>
            {adminUser?.email && (
              <Text size="sm" c="dimmed">Administrador Supabase: {adminUser.email}</Text>
            )}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            No hay una sesión activa todavía.
          </Text>
        )}
      </Paper>

      <AjustesUsuarios />
    </Stack>
  );
}

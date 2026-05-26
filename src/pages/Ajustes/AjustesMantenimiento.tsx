import { useState } from 'react';
import { Badge, Box, Button, Divider, Group, Paper, Stack, Text } from '@mantine/core';
import { Trash, Database } from '@phosphor-icons/react';
import { useAuth } from '../../context/AuthContext';
import { sileo } from 'sileo';

export default function AjustesMantenimiento() {
  const { activeOrganizationId, desvincularDispositivo } = useAuth();
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!activeOrganizationId) {
      sileo.error({ title: 'Sin organización activa', description: 'Vincula un hotel antes de ejecutar el reset.' });
      return;
    }

    const ok = window.confirm(
      'Esto borrará TODOS los datos de la organización activa primero en Supabase y luego en el dispositivo. ¿Deseas continuar?'
    );
    if (!ok) return;

    setResetting(true);
    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/maintenance-reset`;
      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ organization_id: activeOrganizationId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo limpiar el remoto.');
      }

      await desvincularDispositivo();
      sileo.success({ title: 'Base limpia', description: 'Se reinició el remoto y el dispositivo local.' });
    } catch (error) {
      console.error('Error reseteando mantenimiento:', error);
      sileo.error({ title: 'Error al limpiar', description: error instanceof Error ? error.message : 'No se pudo completar el reset.' });
    } finally {
      setResetting(false);
    }
  };

  return (
    <Stack gap="lg" py="xl">
      <Paper withBorder p="xl" radius="lg" style={{ backgroundColor: 'var(--pos-surface)' }}>
        <Stack gap="md">
          <Box>
            <Badge color="red" variant="light" mb="sm">Peligroso</Badge>
            <Text fw={900} size="lg">Mantenimiento</Text>
            <Text size="sm" c="dimmed">
              Reinicia los datos de la organización activa en remoto y limpia este dispositivo para empezar pruebas desde cero.
            </Text>
          </Box>

          <Divider />

          <Button
            leftSection={<Trash size={18} weight="bold" />}
            color="red"
            radius="md"
            onClick={handleReset}
            loading={resetting}
            disabled={!activeOrganizationId}
          >
            Reiniciar base de pruebas
          </Button>

          {!activeOrganizationId && (
            <Text size="sm" c="dimmed">
              Vincula un hotel para habilitar el reset.
            </Text>
          )}

          <Group gap="xs">
            <Database size={16} />
            <Text size="sm" c="dimmed">
              Orden: remoto primero, local después.
            </Text>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}

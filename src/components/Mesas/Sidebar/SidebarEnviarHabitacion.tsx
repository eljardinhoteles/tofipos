// @ts-nocheck
import { useEffect, useState } from 'react';
import {
  Box, Stack, Group, Text, Title, Button, ActionIcon,
  ScrollArea, Paper, ThemeIcon, Center, Badge, Loader
} from '@mantine/core';
import { ArrowLeft, Door, Check } from '@phosphor-icons/react';
import type { Comanda } from '../../../db/database';
import { sileo } from 'sileo';

import { useIvaActivo } from '../../../hooks/useIvaActivo';
import { calcularTotalesComanda } from '../../../lib/taxUtils';
import { initVerticalRxDb, updateRxComanda, updateRxMesa } from '../../../db/rxdb';

interface SidebarEnviarHabitacionProps {
  activeComanda: Comanda;
  onBack: () => void;
  onSuccess: () => void;
}

export function SidebarEnviarHabitacion({ activeComanda, onBack, onSuccess }: SidebarEnviarHabitacionProps) {
  const [selectedCuentaId, setSelectedCuentaId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [cuentasActivas, setCuentasActivas] = useState<any[]>([]);
  const [mesasHabitacion, setMesasHabitacion] = useState<any[]>([]);
  const [comandaItems, setComandaItems] = useState<any[]>([]);

  const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();

  useEffect(() => {
    let alive = true;
    let unsubs: Array<(() => void) | null> = [];

    const run = async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;

      const loadMenu = async () => {
        const docs = await rxDb.menu_items.find({ selector: { _deleted: false } }).exec();
        if (alive) setMenuItems(docs.map((doc: any) => doc.toJSON()));
      };
      const loadCuentas = async () => {
        const docs = await rxDb.habitacion_cuentas.find({ selector: { estado: 'activa', _deleted: false } }).exec();
        if (alive) setCuentasActivas(docs.map((doc: any) => doc.toJSON()));
      };
      const loadMesas = async () => {
        const ids = cuentasActivas.map((c: any) => c.mesa_id);
        if (!ids.length) {
          if (alive) setMesasHabitacion([]);
          return;
        }
        const docs = await rxDb.mesas.find({ selector: { id: { $in: ids }, _deleted: false } }).exec();
        if (alive) setMesasHabitacion(docs.map((doc: any) => doc.toJSON()));
      };
      const loadItems = async () => {
        const docs = await rxDb.comanda_items.find({ selector: { comanda_id: activeComanda.id, _deleted: false } }).exec();
        if (alive) setComandaItems(docs.map((doc: any) => doc.toJSON()));
      };

      await Promise.all([loadMenu(), loadCuentas(), loadItems()]);
      await loadMesas();

      unsubs = [
        rxDb.menu_items.find({ selector: { _deleted: false } }).$.subscribe((docs: any[]) => {
          setMenuItems(docs.map((doc: any) => doc.toJSON()));
        }) as any,
        rxDb.habitacion_cuentas.find({ selector: { estado: 'activa', _deleted: false } }).$.subscribe((docs: any[]) => {
          setCuentasActivas(docs.map((doc: any) => doc.toJSON()));
        }) as any,
        rxDb.comanda_items.find({ selector: { comanda_id: activeComanda.id, _deleted: false } }).$.subscribe((docs: any[]) => {
          setComandaItems(docs.map((doc: any) => doc.toJSON()));
        }) as any
      ];
    };

    run().catch(console.error);

    return () => {
      alive = false;
      unsubs.forEach((unsub) => unsub?.());
    };
  }, [activeComanda.id]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!cuentasActivas.length) {
        if (alive) setMesasHabitacion([]);
        return;
      }
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const ids = cuentasActivas.map((c: any) => c.mesa_id);
      const docs = await rxDb.mesas.find({ selector: { id: { $in: ids }, _deleted: false } }).exec();
      if (alive) setMesasHabitacion(docs.map((doc: any) => doc.toJSON()));
    };
    run().catch(console.error);
    return () => {
      alive = false;
    };
  }, [cuentasActivas]);

  const getMesaNombre = (mesaId: string) => mesasHabitacion.find(m => m.id === mesaId)?.nombre || mesaId;

  // Cálculos financieros centralizados por item
  const totales = calcularTotalesComanda(comandaItems, menuItems, ivaPorcentaje, preciosConIva);

  const total = totales.total;

  const handleEnviar = async () => {
    if (!selectedCuentaId) return;
    setIsProcessing(true);
    try {
      const cuenta = cuentasActivas.find(c => c.id === selectedCuentaId);
      if (!cuenta) throw new Error('Cuenta no encontrada');

      await updateRxComanda(activeComanda.id, {
        habitacion_cuenta_id: selectedCuentaId,
        confirmada: true,
        sincronizado: true,
      });

      await updateRxMesa(activeComanda.mesa_id, { estado: 'libre' });

      sileo.success({
        title: 'Cargo enviado a habitación',
        description: `Comanda #${activeComanda.folio} cargada a ${getMesaNombre(cuenta?.mesa_id || '')} — ${cuenta?.huesped}`,
      });

      onSuccess();
    } catch {
      sileo.error({ title: 'Error al enviar cargo' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
      <Box p="lg" style={{ borderBottom: '1px solid var(--pos-border)' }}>
        <Group gap="sm">
          <ActionIcon variant="subtle" color="gray" onClick={onBack}>
            <ArrowLeft size={20} />
          </ActionIcon>
          <Stack gap={0}>
            <Title order={4} fw={900}>Enviar a Habitación</Title>
            <Text size="xs" c="dimmed">Comanda #{activeComanda.folio}</Text>
          </Stack>
        </Group>
      </Box>

      <ScrollArea flex={1} p="lg">
        {cuentasActivas.length === 0 ? (
          <Center py={60}>
            <Stack align="center" gap="md">
              <ThemeIcon size={64} radius="xl" variant="light" color="gray">
                <Door size={28} />
              </ThemeIcon>
              <Stack align="center" gap={4}>
                <Text fw={700} c="var(--pos-text)">Sin cuentas activas</Text>
                <Text size="sm" c="dimmed" ta="center">
                  No hay habitaciones con cuenta abierta. Abre una cuenta desde el piso "Habitaciones".
                </Text>
              </Stack>
            </Stack>
          </Center>
        ) : (
          <Stack gap="sm">
            <Paper p="md" radius="md" withBorder style={{ backgroundColor: 'var(--mantine-color-myColor-0)', borderColor: 'var(--mantine-color-myColor-2)' }}>
              <Group justify="space-between" align="center">
                <Text size="sm" fw={700} c="myColor.8">Total a cargar</Text>
                <Text size="28px" fw={900} c="myColor.9">${total.toFixed(2)}</Text>
              </Group>
            </Paper>
            <Text size="sm" fw={600} c="dimmed">
              Seleccione una habitación para aplicar el cargo:
            </Text>

            {cuentasActivas.map((cuenta) => {
              const isSelected = selectedCuentaId === cuenta.id;
              return (
                <Paper
                  key={cuenta.id}
                  p="md"
                  radius="md"
                  withBorder
                  onClick={() => setSelectedCuentaId(cuenta.id)}
                  style={{
                    cursor: 'pointer',
                    border: isSelected ? '2px solid var(--mantine-color-myColor-6)' : '1px solid var(--pos-border)',
                    backgroundColor: isSelected ? 'var(--mantine-color-myColor-0)' : 'white',
                    transition: 'all 0.15s',
                    boxShadow: 'none',
                  }}
                >
                  <Group justify="space-between">
                    <Group gap="sm">
                      <ThemeIcon size={40} radius="xl" color={isSelected ? 'blue' : 'gray'} variant={isSelected ? 'filled' : 'light'}>
                        <Door size={20} />
                      </ThemeIcon>
                      <Stack gap={2}>
                        <Text fw={800} size="sm">{getMesaNombre(cuenta.mesa_id)}</Text>
                        <Text size="xs" c="dimmed">{cuenta.huesped}</Text>
                      </Stack>
                    </Group>
                    <Stack gap={4} align="flex-end">
                      <Badge size="xs" color="green" variant="light">Activa</Badge>
                      <Text size="xs" c="dimmed">
                        Desde {new Date(cuenta.check_in).toLocaleDateString()}
                      </Text>
                    </Stack>
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        )}
      </ScrollArea>

      <Box p="lg" style={{ borderTop: '1px solid var(--pos-border)' }}>
        <Button
          size="xl"
          radius="md"
          fullWidth
          color="myColor"
          leftSection={isProcessing ? <Loader size={20} color="white" /> : <Check size={24} />}
          disabled={!selectedCuentaId || isProcessing}
          onClick={handleEnviar}
          h={70}
          style={{ fontSize: '18px', fontWeight: 900 }}
        >
          Confirmar Cargo
        </Button>
      </Box>
    </Box>
  );
}

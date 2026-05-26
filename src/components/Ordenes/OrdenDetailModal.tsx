// @ts-nocheck
import {
  Modal, Box, Stack, Group, Text, Title, Button, ActionIcon,
  Badge, ScrollArea, Divider, Paper, Flex
} from '@mantine/core';
import { X, Receipt, MapPin, User, Printer, Trash, Coins } from '@phosphor-icons/react';
import { type Mesa } from '../../db/database';
import { useIvaActivo } from '../../hooks/useIvaActivo';
import { initVerticalRxDb, updateRxComanda, updateRxMesa } from '../../db/rxdb';
import { useEffect, useState } from 'react';

interface OrdenDetailModalProps {
  comandaId: string | null;
  onClose: () => void;
  onAction: (mesa: Mesa, action: string) => void;
}

export function OrdenDetailModal({ comandaId, onClose, onAction }: OrdenDetailModalProps) {
  const [comanda, setComanda] = useState<any | null>(null);
  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [activeReserva, setActiveReserva] = useState<any | null>(null);
  const { valor: ivaValor, porcentaje: ivaPorcentaje } = useIvaActivo();

  useEffect(() => {
    let alive = true;
    let subs: Array<{ unsubscribe: () => void }> = [];
    (async () => {
      if (!comandaId) {
        if (alive) {
          setComanda(null); setMesa(null); setItems([]); setActiveReserva(null);
        }
        return;
      }
      const rxDb = await initVerticalRxDb();
      const load = async () => {
        const c = await rxDb.comandas.findOne(comandaId).exec();
        const cJson = c ? c.toJSON() : null;
        if (!alive) return;
        setComanda(cJson);
        if (cJson?.mesa_id) {
          const m = await rxDb.mesas.findOne(cJson.mesa_id).exec();
          setMesa(m ? m.toJSON() : null);
          const its = await rxDb.comanda_items.find({ selector: { comanda_id: cJson.mesa_id ? comandaId : '', _deleted: { $ne: true } } }).exec();
          setItems(its.map((d: any) => d.toJSON()));
          const r = cJson?.id ? await rxDb.reservas.find({ selector: { comanda_id: cJson.id, _deleted: { $ne: true } } }).exec() : [];
          setActiveReserva(r[0] ? r[0].toJSON() : null);
        }
      };
      await load();
      if (!comandaId) return;
      subs.push(rxDb.comandas.findOne(comandaId).$.subscribe(() => load()));
    })().catch(() => {});
    return () => {
      alive = false;
      subs.forEach(s => s.unsubscribe());
    };
  }, [comandaId]);

  const subtotal = items.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
  const iva = subtotal * ivaValor;
  const total = subtotal + iva;
  const abono = activeReserva?.abono || 0;
  const saldoRestante = Math.max(0, total - abono);

  const handleDeleteItem = async (itemId: string) => {
    const rxDb = await initVerticalRxDb();
    const doc = await rxDb.comanda_items.findOne(itemId).exec();
    if (doc) await doc.remove();
  };

  if (!comanda || !mesa) return null;
  const isAccount = mesa.estado === 'cuenta';

  return (
    <Modal opened={!!comandaId} onClose={onClose} size="80vw" radius="32px" padding={0} withCloseButton={false} centered>
      <Group px="32px" py="24px" justify="space-between" style={{ borderBottom: '1px solid var(--pos-border)', backgroundColor: 'white' }}>
        <Group gap="xl">
          <Box p="md" style={{ backgroundColor: 'var(--ui-primary-soft)', borderRadius: '16px' }}>
            <MapPin size={24} color="var(--ui-primary)" weight="fill" />
          </Box>
          <Stack gap={0}>
            <Title order={2} fw={900}>Mesa {mesa.nombre}</Title>
            <Group gap="xs">
              <Badge color="myColor" variant="light" size="lg" radius="md">#{comanda.folio}</Badge>
              {comanda.cliente && <Group gap={4}><User size={16} /><Text size="md" fw={700}>{comanda.cliente}</Text></Group>}
            </Group>
          </Stack>
        </Group>
        <ActionIcon size="xl" variant="subtle" color="gray" radius="xl" onClick={onClose}><X size={24} /></ActionIcon>
      </Group>

      <Flex flex={1} style={{ overflow: 'hidden' }}>
        <Box w="60%" p="32px" style={{ borderRight: '1px solid var(--pos-border)', display: 'flex', flexDirection: 'column' }}>
          <Text fw={900} size="xl" mb="xl" tt="uppercase">Detalle del Pedido</Text>
          <ScrollArea flex={1} pr="md">
            <Stack gap="md">
              {items.map(item => (
                <Paper key={item.id} radius="xl" p="lg" withBorder>
                  <Group justify="space-between">
                    <Stack gap={2} style={{ flex: 1 }}>
                      <Text fw={800} size="lg"><Text span c="var(--ui-primary)" mr={8}>{item.cantidad}x</Text>{item.nombre}</Text>
                      <Text size="sm" c="dimmed" fw={700}>${(item.precio * item.cantidad).toFixed(2)}</Text>
                    </Stack>
                    <ActionIcon variant="subtle" color="red" size="lg" onClick={() => handleDeleteItem(item.id)}><Trash size={20} /></ActionIcon>
                  </Group>
                </Paper>
              ))}
            </Stack>
          </ScrollArea>
        </Box>
        <Box w="40%" p="32px" bg="var(--pos-bg)" style={{ display: 'flex', flexDirection: 'column' }}>
          <Stack gap="xl" flex={1}>
            <Box>
              <Text fw={900} size="xl" mb="xl" tt="uppercase">Resumen de Cuenta</Text>
              <Stack gap="md">
                <Group justify="space-between"><Text size="lg" c="dimmed" fw={600}>Subtotal</Text><Text size="lg" fw={800}>${subtotal.toFixed(2)}</Text></Group>
                <Group justify="space-between"><Text size="lg" c="dimmed" fw={600}>IVA ({ivaPorcentaje}%)</Text><Text size="lg" fw={800}>${iva.toFixed(2)}</Text></Group>
                <Divider my="md" />
                <Group justify="space-between"><Text fw={900} size="24px">TOTAL</Text><Text fw={900} size="32px" c="myColor">${total.toFixed(2)}</Text></Group>
                {abono > 0 && <Paper p="md" radius="lg" bg="orange.0"><Text fw={900}>SALDO RESTANTE ${saldoRestante.toFixed(2)}</Text></Paper>}
              </Stack>
            </Box>
            <Stack gap="md" mt="auto">
              {isAccount ? (
                <Button size="xl" radius="xl" color="green" leftSection={<Coins size={24} />} onClick={() => onAction(mesa, 'cobrar')}>Proceder al Cobro</Button>
              ) : (
                <>
                  <Button size="xl" radius="xl" color="orange" leftSection={<Receipt size={24} />} onClick={() => onAction(mesa, 'cuenta')}>Pedir la Cuenta</Button>
                  <Button size="lg" radius="xl" variant="light" color="myColor" leftSection={<Printer size={20} />} onClick={() => onAction(mesa, 'imprimir_cocina')}>Enviar a Cocina</Button>
                </>
              )}
            </Stack>
          </Stack>
        </Box>
      </Flex>
    </Modal>
  );
}

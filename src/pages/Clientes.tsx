// @ts-nocheck
import { useState, useMemo, useEffect } from 'react';
import {
  Flex, Box, Stack, Group, Text, Anchor,
  ActionIcon, TextInput, Tooltip, Table, Pagination, Badge,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { type Cliente } from '../db/database';
import {
  Users, Plus, Trash, PencilSimple, MagnifyingGlass,
  TrendUp, ClockCounterClockwise
} from '@phosphor-icons/react';
import { sileo } from 'sileo';
import { useUI } from '../context/UIContext';
import { ClienteFormModal } from '../components/Clientes/ClienteFormModal';
import { PageHeader } from '../components/Common/PageHeader';
import { useRxClientes } from '../hooks/useRxClientes';
import { initVerticalRxDb } from '../db/rxdb';

export default function Clientes() {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [newOpened, { open: openNew, close: closeNew }] = useDisclosure(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const { openConfirm } = useUI();
  const itemsPerPage = 8;

  const { clientes } = useRxClientes();
  const [comandas, setComandas] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const rxDb = await initVerticalRxDb();
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      const query = rxDb.comandas.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } }
      });
      const sub = query.$.subscribe((docs: any[]) => {
        if (!alive) return;
        setComandas(docs.map((doc: any) => doc.toJSON()));
      });
      return () => sub.unsubscribe();
    })().catch(() => {});
    return () => { alive = false; };
  }, []);

  const filteredClientes = useMemo(() => {
    return clientes.filter(c => 
      c.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.telefono?.includes(searchQuery) ||
      c.dni?.includes(searchQuery)
    );
  }, [clientes, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredClientes.length / itemsPerPage));

  const paginatedClientes = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredClientes.slice(start, start + itemsPerPage);
  }, [filteredClientes, page]);

  // Stats
  const stats = useMemo(() => {
    const total = clientes.length;
    const thisMonth = clientes.filter(c => {
      const date = new Date(c.created_at);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;
    
    // Clientes frecuentes (más de 3 comandas)
    const frequent = clientes.filter(c => {
      const count = comandas.filter(com => com.cliente === c.nombre).length;
      return count >= 3;
    }).length;

    return { total, thisMonth, frequent };
  }, [clientes, comandas]);

  const handleOpenEdit = (cliente: Cliente) => {
    if (cliente.id === '99999999999') {
      sileo.error({ title: 'Acción no permitida', description: 'El cliente Consumidor Final no puede ser editado.' });
      return;
    }
    setEditingCliente(cliente);
    openNew();
  };

  const handleCloseModal = () => {
    setEditingCliente(null);
    closeNew();
  };

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
  };

  const handleDelete = (id: string) => {
    if (id === '99999999999') {
      sileo.error({ title: 'Acción no permitida', description: 'El cliente Consumidor Final no puede ser eliminado.' });
      return;
    }
    openConfirm(
      '¿Eliminar Cliente?',
      '¿Estás seguro de eliminar este cliente de la base de datos? Esta acción no se puede deshacer.',
      async () => {
        const rxDb = await initVerticalRxDb();
        const doc = await rxDb.clientes.findOne(id).exec();
        if (doc) await doc.remove();
        sileo.error({ title: 'Cliente eliminado' });
      }
    );
  };

  const getWhatsAppLink = (telefono: string) => {
    const cleanNumber = telefono.replace(/\D/g, '');
    return cleanNumber ? `https://wa.me/${cleanNumber}` : null;
  };

  const renderClienteActions = (cliente: Cliente) => {
    const isSystemCliente = cliente.id === '99999999999';
    return (
      <Group gap="xs" wrap="nowrap">
        {!isSystemCliente ? (
          <ActionIcon variant="light" color="myColor" radius="md" size="lg" onClick={() => handleOpenEdit(cliente)}>
            <PencilSimple size={20} />
          </ActionIcon>
        ) : (
          <Tooltip label="Cliente del sistema (No editable)" withArrow radius="md">
            <ActionIcon variant="light" color="gray" radius="md" size="lg" disabled style={{ opacity: 0.4 }}>
              <PencilSimple size={20} />
            </ActionIcon>
          </Tooltip>
        )}
        {!isSystemCliente ? (
          <ActionIcon variant="light" color="red" radius="md" size="lg" onClick={() => handleDelete(cliente.id)}>
            <Trash size={20} />
          </ActionIcon>
        ) : (
          <Tooltip label="Cliente del sistema (No eliminable)" withArrow radius="md">
            <ActionIcon variant="light" color="gray" radius="md" size="lg" disabled style={{ opacity: 0.4 }}>
              <Trash size={20} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    );
  };

  return (
    <Flex h="100%" w="100%" direction="column" bg="var(--pos-bg)">
      {/* ── HEADER PRINCIPAL (56px) ─────────────────────────────── */}
      <PageHeader>
        <Group justify="flex-start" align="center" wrap="nowrap" w="100%" gap="md" style={{ minWidth: 'max-content' }}>
          {/* Botón Nuevo al inicio para consistencia */}
          <Tooltip label="Nuevo Cliente" withArrow radius="md">
            <ActionIcon
              variant="filled"
              color="myColor"
              radius="md"
              size={36}
              onClick={openNew}
              style={{
                flexShrink: 0
              }}
            >
              <Plus size={18} weight="bold" />
            </ActionIcon>
          </Tooltip>

          <Box style={{ width: 1, height: 24, backgroundColor: 'var(--pos-border)', flexShrink: 0 }} />

          <TextInput
            placeholder="Buscar por nombre, teléfono o DNI..."
            leftSection={<MagnifyingGlass size={16} color="var(--ui-primary)" />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            radius="md"
            style={{ width: 300, flexShrink: 0 }}
            styles={{ 
              input: { 
                backgroundColor: 'var(--pos-bg)',
                border: '1px solid var(--pos-border)',
                height: 36,
                minHeight: 36
              } 
            }}
          />

          <Box style={{ width: 1, height: 24, backgroundColor: 'var(--pos-border)', flexShrink: 0 }} />

          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 'max-content' }}>
            <Group gap={8} wrap="nowrap" px="xs" style={{ flexShrink: 0 }}>
              <Group gap={4}>
                <Users size={14} weight="bold" color="var(--ui-primary)" />
                <Text size="xs" fw={700}>{stats.total} Total</Text>
              </Group>
              <Box style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: 'var(--pos-border)' }} />
              <Group gap={4}>
                <TrendUp size={14} weight="bold" color="var(--mantine-color-green-6)" />
                <Text size="xs" fw={700}>{stats.thisMonth} Nuevos</Text>
              </Group>
              <Box style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: 'var(--pos-border)' }} />
              <Group gap={4}>
                <ClockCounterClockwise size={14} weight="bold" color="var(--mantine-color-orange-6)" />
                <Text size="xs" fw={700}>{stats.frequent} Frecuentes</Text>
              </Group>
            </Group>
          </Group>

        </Group>
      </PageHeader>

      {/* Content */}
      <Box flex={1} style={{ overflowY: 'auto' }}>
        {filteredClientes.length === 0 ? (
          <Stack align="center" justify="center" h={300} opacity={1} py="xl">
            <Box style={{ width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/Clients.webp" alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </Box>
            <Text fw={700} size="xl">No se encontraron clientes</Text>
            <Text size="sm">Intenta cambiar el criterio de búsqueda o registra uno nuevo.</Text>
          </Stack>
        ) : (
          <>
            <Box
              style={{
                backgroundColor: 'white',
                borderBottom: '1px solid var(--pos-border)',
              }}
            >
              <Table verticalSpacing="sm" horizontalSpacing="xl" withTableBorder={false} highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Cliente</Table.Th>
                    <Table.Th>Contacto</Table.Th>
                    <Table.Th>Documento</Table.Th>
                    <Table.Th>Notas</Table.Th>
                    <Table.Th ta="right">Acciones</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {paginatedClientes.map(cliente => (
                  <Table.Tr key={cliente.id}>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text fw={800}>{cliente.nombre}</Text>
                          <Text size="xs" c="dimmed">
                            Registrado {new Date(cliente.created_at).toLocaleDateString()}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          {cliente.telefono ? (
                            <Anchor
                              href={getWhatsAppLink(cliente.telefono) || '#'}
                              target="_blank"
                              rel="noreferrer"
                              size="sm"
                              fw={600}
                              c="green"
                            >
                              {cliente.telefono}
                            </Anchor>
                          ) : (
                            <Text size="sm" c="dimmed">Sin teléfono</Text>
                          )}
                          {cliente.email ? (
                            <Text size="xs" c="dimmed" lineClamp={1}>{cliente.email}</Text>
                          ) : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={cliente.dni ? 'blue' : 'gray'}>
                          {cliente.dni || 'Sin documento'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {cliente.notas ? (
                          <Text size="sm" lineClamp={2}>{cliente.notas}</Text>
                        ) : (
                          <Text size="sm" c="dimmed">Sin notas</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group justify="flex-end" w="100%">
                          {renderClienteActions(cliente)}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>

            <Group justify="space-between" align="center" mt="lg" px="xl" pb="xl">
              <Text size="sm" c="dimmed" fw={600}>
                Mostrando {Math.min((page - 1) * itemsPerPage + 1, filteredClientes.length)}-
                {Math.min(page * itemsPerPage, filteredClientes.length)} de {filteredClientes.length}
              </Text>
              <Pagination value={page} onChange={handlePageChange} total={totalPages} />
            </Group>
          </>
        )}
      </Box>

      {/* Modal Cliente — componente reutilizable */}
      <ClienteFormModal
        opened={newOpened}
        onClose={handleCloseModal}
        editingCliente={editingCliente}
      />
    </Flex>
  );
}

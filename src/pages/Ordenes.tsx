import { useState, useMemo, useEffect, useRef } from 'react';
import { Text, Box, Flex, Stack, Group, Badge, Button, UnstyledButton, ActionIcon, Modal, TextInput, Textarea, Table, Pagination, Tooltip, ScrollArea, Paper } from '@mantine/core';
import { MagnifyingGlass, User, Clock, BedIcon, ForkKnifeIcon, Calendar } from '@phosphor-icons/react';
import { DatePicker } from '@mantine/dates';
import { type Comanda, type Mesa, type ComandaItem, type HabitacionCuenta, type Reserva } from '../db/database';
import { useUI } from '../context/UIContext';
import { sileo } from 'sileo';
import dayjs from 'dayjs';
import { PageHeader } from '../components/Common/PageHeader';
import { initVerticalRxDb, updateRxComanda, updateRxPago } from '../db/rxdb';

import { FacturadasList } from '../components/Ordenes/FacturadasList';
import { useIvaActivo } from '../hooks/useIvaActivo';
import { useRxMenuCatalog } from '../hooks/useRxMenuCatalog';
import { calcularTotalesComanda } from '../lib/taxUtils';

const ITEMS_PER_PAGE = 10;

export default function Ordenes() {
  const [status, setStatus] = useState('activas');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chipsRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const activeChip = chipsRefs.current[status];
    if (activeChip && scrollContainerRef.current) {
      activeChip.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [status]);

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diffX = touchStartX.current - touchEndX.current;
    if (Math.abs(diffX) > 80) { // Umbral de 80px
      const statuses = ['activas', 'cargadas', 'cobradas', 'conciliadas', 'anuladas'];
      const currentIndex = statuses.indexOf(status);
      if (currentIndex !== -1) {
        if (diffX > 0) {
          // Swipe izquierdo -> Siguiente estado (derecha)
          const nextIndex = Math.min(statuses.length - 1, currentIndex + 1);
          if (nextIndex !== currentIndex) {
            setStatus(statuses[nextIndex]);
          }
        } else {
          // Swipe derecho -> Anterior estado (izquierda)
          const prevIndex = Math.max(0, currentIndex - 1);
          if (prevIndex !== currentIndex) {
            setStatus(statuses[prevIndex]);
          }
        }
      }
    }
  };

  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  // @ts-ignore
  const [invoicingComandaId, setInvoicingComandaId] = useState<string | null>(null);
  const [invoiceNro, setInvoiceNro] = useState('');
  const [invoiceNota, setInvoiceNota] = useState('');
  const {
    setSelectedMesaId,
    setViewingComandaId,
    setCheckoutView,
    setConfigView,
    setReservaView,
    setSelectedReservaId,
  } = useUI();

  const { porcentaje: ivaPorcentaje, preciosConIva } = useIvaActivo();
  const { menuItems } = useRxMenuCatalog();

  // Para los números de factura y notas de cada pago en el modal de Ordenes:
  const [pagosParaConciliar, setPagosParaConciliar] = useState<{ id: string, monto: number, metodo_pago: string, tipo_division?: string, factura_nro: string, factura_nota: string }[]>([]);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [comandaItems, setComandaItems] = useState<ComandaItem[]>([]);
  const [habitacionCuentas, setHabitacionCuentas] = useState<HabitacionCuenta[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);

  useEffect(() => {
    let alive = true;
    if (invoicingComandaId) {
      initVerticalRxDb().then(async rxDb => {
        const pagos = await rxDb.pagos.find({ selector: { comanda_id: invoicingComandaId } }).exec();
        if (!alive) return;
        setPagosParaConciliar(pagos.map((p: any) => p.toJSON()));
      });
    } else {
      setPagosParaConciliar([]);
    }
    return () => {
      alive = false;
    };
  }, [invoicingComandaId]);

  useEffect(() => {
    let active = true;
    let mesasSub: { unsubscribe: () => void } | null = null;
    let comandasSub: { unsubscribe: () => void } | null = null;
    let itemsSub: { unsubscribe: () => void } | null = null;
    let cuentasSub: { unsubscribe: () => void } | null = null;
    let reservasSub: { unsubscribe: () => void } | null = null;

    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!active) return;
      const orgId = localStorage.getItem('pos_active_org_id') || '';

      mesasSub = rxDb.mesas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
        if (!active) return;
        setMesas(docs.map((doc: any) => doc.toJSON()));
      });
      comandasSub = rxDb.comandas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
        if (!active) return;
        setComandas(docs.map((doc: any) => doc.toJSON()));
      });
      itemsSub = rxDb.comanda_items.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
        if (!active) return;
        setComandaItems(docs.map((doc: any) => doc.toJSON()));
      });
      cuentasSub = rxDb.habitacion_cuentas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
        if (!active) return;
        setHabitacionCuentas(docs.map((doc: any) => doc.toJSON()));
      });
      reservasSub = rxDb.reservas.find({ selector: { organization_id: orgId, _deleted: { $ne: true } } }).$.subscribe((docs: any[]) => {
        if (!active) return;
        setReservas(docs.map((doc: any) => doc.toJSON()));
      });
    })().catch(err => console.warn('Error cargando RxDB para Ordenes:', err));

    return () => {
      active = false;
      mesasSub?.unsubscribe();
      comandasSub?.unsubscribe();
      itemsSub?.unsubscribe();
      cuentasSub?.unsubscribe();
      reservasSub?.unsubscribe();
    };
  }, []);

  const safeComandas = comandas;
  const safeMesas = mesas;
  const safeComandaItems = comandaItems;
  const safeHabitacionCuentas = habitacionCuentas;
  const safeReservas = reservas;

  const anuladasItems = useMemo(() => {
    const comandaAnuladas = safeComandas
      .filter(c => c.estado === 'anulada' || Boolean(c.motivo_anulacion))
      .map(c => ({
        kind: 'comanda' as const,
        id: c.id,
        title: `Comanda #${c.folio}`,
        mesa_id: c.mesa_id,
        mesa_nombre: c.mesa_nombre || c.mesa_id,
        cliente: c.cliente || null,
        total: safeComandaItems.filter(i => i.comanda_id === c.id).reduce((acc, i) => acc + i.precio * i.cantidad, 0),
        created_at: c.created_at,
        updated_at: c.updated_at,
        note: c.motivo_anulacion || null,
        statusLabel: 'Anulada',
      }))

    const reservasCanceladas = safeReservas
      .filter(r => r.estado === 'cancelada' || Boolean(r.nota))
      .map(r => ({
        kind: 'reserva' as const,
        id: r.id,
        title: `Reserva ${r.nombre}`,
        mesa_id: r.mesa_id || '',
        mesa_nombre: r.mesa_id || r.zona_id || 'Sin mesa',
        cliente: r.nombre,
        total: r.abono || 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
        note: r.nota || 'Reserva cancelada',
        statusLabel: 'Cancelada',
      }))

    return [...comandaAnuladas, ...reservasCanceladas].sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
  }, [safeComandas, safeComandaItems, safeReservas])

  const openReadOnlyComanda = (comanda: Comanda) => {
    if (!comanda.mesa_id) {
      sileo.warning({
        title: 'No se puede abrir la orden',
        description: `La comanda #${comanda.folio} no tiene mesa asociada.`,
      });
      return;
    }
    setCheckoutView(false);
    setConfigView('none');
    setReservaView('none');
    setSelectedReservaId(null);
    setSelectedMesaId(comanda.mesa_id);
    setViewingComandaId(comanda.id);
  };

  const filteredComandas = useMemo(() => {
    const [start, end] = dateRange;

    return safeComandas.filter(comanda => {
      if (comanda.mesa_id?.startsWith('reserva_')) return false;

      // Determinar si la comanda está activa "en habitación" (cargada a una cuenta de habitación activa)
      let esComandaEnHabitacionActiva = false;
      if (comanda.habitacion_cuenta_id) {
        const cuenta = safeHabitacionCuentas.find(h => h.id === comanda.habitacion_cuenta_id);
        if (cuenta && cuenta.estado !== 'cerrada') {
          esComandaEnHabitacionActiva = true;
        }
      }

      // Aplicación del filtro por pestaña de estado
      if (status === 'cargadas') {
        if (!esComandaEnHabitacionActiva) return false;
        if (comanda.estado === 'anulada') return false;
      } else if (status === 'activas') {
        if (esComandaEnHabitacionActiva) return false;
        if (comanda.estado === 'cerrado' || comanda.estado === 'facturado' || comanda.estado === 'anulada') return false;
      } else if (status === 'cobradas') {
        if (esComandaEnHabitacionActiva) return false;
        if (comanda.estado !== 'cerrado') return false;
      } else if (status === 'conciliadas') {
        if (esComandaEnHabitacionActiva) return false;
        if (comanda.estado !== 'facturado') return false;
      } else if (status === 'anuladas') {
        if (comanda.estado !== 'anulada') return false;
      }

      if (start) {
        const fecha = new Date(comanda.created_at);
        const startLimit = new Date(start);
        startLimit.setHours(0, 0, 0, 0);

        const endLimit = new Date(end || start);
        endLimit.setHours(23, 59, 59, 999);

        if (fecha < startLimit || fecha > endLimit) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mesa = safeMesas.find(m => m.id === comanda.mesa_id);
        const mesaNombre = mesa?.nombre || comanda.mesa_nombre || comanda.mesa_id;

        let roomName = '';
        let roomHuesped = '';
        if (comanda.habitacion_cuenta_id) {
          const cuenta = safeHabitacionCuentas.find(hc => hc.id === comanda.habitacion_cuenta_id);
          const roomMesa = cuenta ? safeMesas.find(m => m.id === cuenta.mesa_id) : null;
          roomName = roomMesa?.nombre || comanda.mesa_nombre || 'Habitación';
          roomHuesped = cuenta?.huesped || '';
        }

        const items = safeComandaItems.filter(i => i.comanda_id === comanda.id);
        const hasMatchingProduct = items.some(item => item.nombre.toLowerCase().includes(q));

        if (
          !String(comanda.folio).includes(q) &&
          !(comanda.cliente?.toLowerCase().includes(q)) &&
          !(mesaNombre.toLowerCase().includes(q)) &&
          !(roomName.toLowerCase().includes(q)) &&
          !(roomHuesped.toLowerCase().includes(q)) &&
          !hasMatchingProduct
        ) return false;
      }

      return true;
    }).sort((a, b) => {
      const pidiendoA = a.estado === 'cuenta' ? 1 : 0;
      const pidiendoB = b.estado === 'cuenta' ? 1 : 0;
      if (pidiendoA !== pidiendoB) return pidiendoB - pidiendoA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [safeComandas, safeMesas, safeHabitacionCuentas, status, searchQuery, dateRange]);


  const totalPages = Math.max(1, Math.ceil(filteredComandas.length / ITEMS_PER_PAGE));
  const totalAnuladasPages = Math.max(1, Math.ceil(anuladasItems.length / ITEMS_PER_PAGE));

  const paginatedComandas = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredComandas.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredComandas, page]);

  const paginatedAnuladas = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return anuladasItems.slice(start, start + ITEMS_PER_PAGE);
  }, [anuladasItems, page]);

  useEffect(() => { setPage(1); }, [status, searchQuery, dateRange]);
  useEffect(() => {
    const maxPages = status === 'anuladas' ? totalAnuladasPages : totalPages;
    if (page > maxPages) setPage(maxPages);
  }, [page, totalPages, totalAnuladasPages, status]);

  return (
    <Flex h="100%" w="100%" direction="column" bg="var(--pos-bg)">
      {/* HEADER 56PX */}
      <PageHeader>
        <Group justify="space-between" align="center" wrap="nowrap" w="100%" style={{ minWidth: 'max-content' }}>
          <Group
            justify="flex-start"
            align="center"
            wrap="nowrap"
            gap="md"
            style={{ flexGrow: 1, minWidth: 'max-content' }}
          >
            <Tooltip label="Filtrar por rango de fechas" withArrow radius="md">
              <ActionIcon
                variant="filled"
                color="myColor"
                size={36}
                radius="md"
                style={{ flexShrink: 0 }}
                onClick={() => setCalendarModalOpen(true)}
              >
                <Calendar size={18} />
              </ActionIcon>
            </Tooltip>

            {/* Badge del rango seleccionado */}
            {dateRange[0] && (
              <Badge
                variant="light"
                color="myColor"
                size="lg"
                radius="md"
                style={{ paddingRight: 4, height: 36, fontSize: '13px', border: '1px solid var(--ui-primary-soft)', flexShrink: 0 }}
              >
                {dayjs(dateRange[0]).format('DD/MM')}
                {dateRange[1] && ` - ${dayjs(dateRange[1]).format('DD/MM')}`}
              </Badge>
            )}

            <Box style={{ width: 1, height: 24, backgroundColor: 'var(--pos-border)', flexShrink: 0 }} />

            {/* Buscador de texto simple */}
            <TextInput
              placeholder="Buscar en órdenes..."
              leftSection={<MagnifyingGlass size={16} color="var(--ui-primary)" />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              radius="md"
              style={{ width: 280, flexShrink: 0 }}
              styles={{
                input: {
                  backgroundColor: 'var(--pos-bg)',
                  border: '1px solid var(--pos-border)',
                  height: 36,
                  minHeight: 36
                }
              }}
            />
          </Group>
        </Group>
      </PageHeader>

      {/* SUBHEADER: Filtros de estado (Chips) */}
      <Box
        ref={scrollContainerRef}
        py="sm"
        px="md"
        style={{
          backgroundColor: 'var(--pos-surface)',
          borderBottom: '1px solid var(--pos-border)',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Group gap="xs" wrap="nowrap">
          {([
            { value: 'activas', label: 'Activas', activeColor: 'var(--ui-primary)' },
            { value: 'cargadas', label: 'Cargadas', activeColor: 'var(--mantine-color-teal-6)' },
            { value: 'cobradas', label: 'Cobradas', activeColor: 'var(--status-active)' },
            { value: 'conciliadas', label: 'Conciliadas', activeColor: 'var(--status-reserved)' },
            { value: 'anuladas', label: 'Anuladas', activeColor: 'var(--mantine-color-red-6)' },
          ] as const).map(({ value, label, activeColor }) => {
            const active = status === value;
            return (
              <UnstyledButton
                key={value}
                ref={(el) => { chipsRefs.current[value] = el as HTMLButtonElement; }}
                onClick={() => setStatus(value)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--mantine-radius-xl)',
                  backgroundColor: active ? activeColor : 'var(--pos-bg)',
                  color: active ? 'white' : 'var(--pos-text-sub)',
                  fontWeight: active ? 700 : 600,
                  fontSize: 'var(--mantine-font-size-sm)',
                  whiteSpace: 'nowrap',
                  border: `1px solid ${active ? activeColor : 'var(--pos-border)'}`,
                  transition: 'all var(--ease-fast)',
                }}
              >
                {label}
              </UnstyledButton>
            );
          })}
        </Group>
      </Box>

      {/* Contenido */}
      <Box
        flex={1}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'relative',
          overflow: 'hidden',
          touchAction: 'pan-y',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Box style={{ flex: 1, overflowY: 'auto' }}>
        {status === 'anuladas'
          ? (
            paginatedAnuladas.length === 0 ? (
              <Stack align="center" justify="center" h={300} opacity={1} py="xl">
                <Box style={{ width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img
                    src={searchQuery.trim() ? '/no_resultado.webp' : '/ordenes.webp'}
                    alt=""
                    aria-hidden="true"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </Box>
                <Text fw={700} size="xl">
                  {searchQuery.trim() ? 'Sin resultados' : 'No hay anulaciones'}
                </Text>
                <Text size="sm">
                  {searchQuery.trim()
                    ? 'Cambia la búsqueda o limpia los filtros.'
                    : 'Todavía no hay documentos anulados o cancelados.'}
                </Text>
              </Stack>
            ) : (
              <Box
                style={{
                  backgroundColor: 'white',
                  borderBottom: '1px solid var(--pos-border)',
                }}
              >
                <Table verticalSpacing="sm" horizontalSpacing="xl" withTableBorder={false} highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Documento</Table.Th>
                      <Table.Th visibleFrom="md">Detalle</Table.Th>
                      <Table.Th>Total / Abono</Table.Th>
                      <Table.Th visibleFrom="xs">Fecha</Table.Th>
                      <Table.Th>Estado</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {paginatedAnuladas.map(item => (
                      <Table.Tr
                        key={`${item.kind}-${item.id}`}
                        style={{ cursor: item.kind === 'comanda' ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (item.kind === 'comanda') {
                            const original = safeComandas.find(c => c.id === item.id);
                            if (original) openReadOnlyComanda(original);
                          }
                        }}
                      >
                        <Table.Td>
                          <Stack gap={2}>
                            <Text fw={800} size="sm">{item.title}</Text>
                            <Text fw={500} c="dimmed" size="xs">
                              {item.kind === 'comanda' ? `Mesa ${item.mesa_nombre}` : 'Reserva cancelada'}
                            </Text>
                            {item.note && (
                              <Text size="xs" c="red.7" fw={700} style={{ fontStyle: 'italic' }}>
                                Nota: {item.note}
                              </Text>
                            )}
                          </Stack>
                        </Table.Td>
                        <Table.Td visibleFrom="md">
                          <Text size="sm" c="dimmed">
                            {item.kind === 'comanda'
                              ? item.cliente || 'Sin cliente'
                              : `Reserva de ${item.cliente || 'sin nombre'}`}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ whiteSpace: 'nowrap' }}>
                          <Text fw={800}>
                            {item.kind === 'comanda' ? `$${item.total.toFixed(2)}` : item.total > 0 ? `$${item.total.toFixed(2)}` : '-'}
                          </Text>
                        </Table.Td>
                        <Table.Td visibleFrom="xs" style={{ whiteSpace: 'nowrap' }}>
                          <Stack gap={2}>
                            <Text size="sm" fw={600}>{new Date(item.updated_at).toLocaleDateString()}</Text>
                            <Text size="xs" c="dimmed">{new Date(item.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Badge color="red" variant="light" size="sm">
                            {item.statusLabel}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                <Group justify="space-between" align="center" mt="lg" px="xl" pb={{ base: 140, sm: 'xl' }}>
                  <Text size="sm" c="dimmed" fw={600}>
                    Mostrando {Math.min((page - 1) * ITEMS_PER_PAGE + 1, anuladasItems.length)}-
                    {Math.min(page * ITEMS_PER_PAGE, anuladasItems.length)} de {anuladasItems.length}
                  </Text>
                  <Pagination value={page} onChange={setPage} total={totalAnuladasPages} />
                </Group>
              </Box>
            )
          )
          : filteredComandas.length === 0 ? (
          <Stack align="center" justify="center" h={300} opacity={1} py="xl">
            <Box style={{ width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={searchQuery.trim() ? '/no_resultado.webp' : '/ordenes.webp'}
                alt=""
                aria-hidden="true"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </Box>
            <Text fw={700} size="xl">
              {searchQuery.trim() ? 'Sin resultados' : `No hay órdenes ${status}`}
            </Text>
            <Text size="sm">
              {searchQuery.trim()
                ? 'Cambia la búsqueda o limpia los filtros.'
                : 'Cambia el filtro o registra una nueva orden.'}
            </Text>
          </Stack>
        ) : status === 'conciliadas' ? (
          <FacturadasList
            comandas={filteredComandas}
            mesas={safeMesas}
            comandaItems={safeComandaItems}
            onViewInvoice={openReadOnlyComanda}
          />
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
                    <Table.Th>Mesa / Folio</Table.Th>
                    <Table.Th visibleFrom="md">Items</Table.Th>
                    <Table.Th>Total</Table.Th>
                    <Table.Th visibleFrom="xs">Fecha</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {paginatedComandas.map(comanda => {
                    const mesa = safeMesas.find(m => m.id === comanda.mesa_id);
                    const items = safeComandaItems.filter(i => i.comanda_id === comanda.id);
                    const timeAgo = Math.floor((Date.now() - new Date(comanda.created_at).getTime()) / 60000);
                    const totales = calcularTotalesComanda(items, menuItems, ivaPorcentaje, preciosConIva);
                    const total = totales.total;
                    const isPedirCuenta = comanda.estado === 'cuenta';

                    return (
                      <Table.Tr
                        key={comanda.id}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: isPedirCuenta ? 'rgba(250, 82, 82, 0.05)' : undefined,
                          transition: 'background-color 0.2s ease',
                        }}
                        onClick={() => openReadOnlyComanda(comanda)}
                      >
                        <Table.Td
                          style={{
                            borderLeft: isPedirCuenta ? '4px solid var(--ui-danger)' : '4px solid transparent',
                            paddingLeft: isPedirCuenta ? 20 : 24, // Ajustado para alinearse con horizontalSpacing="xl" (24px)
                            transition: 'border-color 0.2s ease, padding-left 0.2s ease',
                          }}
                        >
                          <Stack gap={2}>
                            {/* Nivel 1: Cliente */}
                            <Group gap={4} wrap="nowrap">
                              <User size={14} color="var(--ui-primary)" style={{ flexShrink: 0 }} />
                              <Text fw={800} size="sm" style={{ whiteSpace: 'nowrap' }}>
                                {(() => {
                                  if (comanda.habitacion_cuenta_id) {
                                    const cuenta = safeHabitacionCuentas.find(hc => hc.id === comanda.habitacion_cuenta_id);
                                    if (cuenta) {
                                      return comanda.cliente || cuenta.huesped || 'Sin cliente';
                                    }
                                  }
                                  return comanda.cliente || 'Sin cliente';
                                })()}
                              </Text>
                            </Group>

                            {/* Nivel 2: Comanda Folio */}
                            <Text fw={500} c="dimmed" size="xs" style={{ paddingLeft: 18 }}>
                              Comanda #{comanda.folio}
                            </Text>

                            {/* Nivel 3: Mesa/Habitación */}
                            <Group gap={4} wrap="nowrap" style={{ paddingLeft: 18 }}>
                              {comanda.habitacion_cuenta_id
                                ? <BedIcon size={14} color="var(--pos-text-muted)" style={{ flexShrink: 0 }} />
                                : <ForkKnifeIcon size={14} color="var(--pos-text-muted)" style={{ flexShrink: 0 }} />
                              }
                              <Text size="sm" fw={800} c="var(--pos-text-sub)">
                                {(() => {
                                  if (comanda.habitacion_cuenta_id) {
                                    const cuenta = safeHabitacionCuentas.find(hc => hc.id === comanda.habitacion_cuenta_id);
                                    const roomMesa = cuenta ? safeMesas.find(m => m.id === cuenta.mesa_id) : null;
                                    const roomName = roomMesa?.nombre || comanda.mesa_nombre || 'Habitación';
                                    const prefix = roomName.toLowerCase().startsWith('hab') || roomName.toLowerCase().startsWith('cuart') || roomName.toLowerCase().startsWith('room') ? '' : 'Habitación ';
                                    return `${prefix}${roomName}`;
                                  }
                                  const name = mesa?.nombre || comanda.mesa_nombre || 'Desconocida';
                                  const prefix = name.toLowerCase().startsWith('mesa') || name.toLowerCase().startsWith('hab') ? '' : 'Mesa ';
                                  return `${prefix}${name}`;
                                })()}
                              </Text>
                            </Group>

                            {/* Motivo de anulación si aplica */}
                            {comanda.estado === 'anulada' && comanda.motivo_anulacion && (
                              <Text size="xs" c="red.7" fw={700} style={{ paddingLeft: 18, fontStyle: 'italic' }}>
                                Motivo: {comanda.motivo_anulacion}
                              </Text>
                            )}
                          </Stack>
                        </Table.Td>
                        <Table.Td visibleFrom="md">
                          <Stack gap={2}>
                            {items.slice(0, 2).map(item => (
                              <Text key={item.id} size="sm" lineClamp={1}>
                                <Text span fw={700} mr={4}>{item.cantidad}x</Text>
                                {item.nombre}
                              </Text>
                            ))}
                            {items.length > 2 && (
                              <Text size="xs" c="dimmed">+{items.length - 2} más</Text>
                            )}
                            {items.length === 0 && (
                              <Text size="sm" c="dimmed">Sin items</Text>
                            )}
                          </Stack>
                        </Table.Td>
                        <Table.Td style={{ whiteSpace: 'nowrap' }}>
                          <Text fw={800}>${total.toFixed(2)}</Text>
                        </Table.Td>
                        <Table.Td visibleFrom="xs" style={{ whiteSpace: 'nowrap' }}>
                          <Stack gap={2}>
                            <Text size="sm" fw={600}>
                              {new Date(comanda.created_at).toLocaleDateString()}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {new Date(comanda.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          {(() => {
                            if (comanda.habitacion_cuenta_id) {
                              const cuenta = safeHabitacionCuentas.find(h => h.id === comanda.habitacion_cuenta_id);
                              if (cuenta && cuenta.estado !== 'cerrada') {
                                return <Badge color="teal" variant="light" size="sm">En habitación</Badge>;
                              }
                            }
                            if (comanda.estado === 'cerrado') {
                              return <Badge color="green" variant="light" size="sm">Cobrada</Badge>;
                            }
                            if (comanda.estado === 'anulada') {
                              return <Badge color="red" variant="light" size="sm">Anulada</Badge>;
                            }
                            if (comanda.estado === 'cuenta') {
                              return <Badge color="orange" variant="light" size="sm">Cuenta</Badge>;
                            }
                            return (
                              <Group gap={4} wrap="nowrap">
                                <Clock size={12} color="var(--ui-primary)" weight="bold" style={{ flexShrink: 0 }} />
                                <Text size="xs" fw={700} c="var(--ui-primary)">{timeAgo}m</Text>
                              </Group>
                            );
                          })()}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Box>

            <Group justify="space-between" align="center" mt="lg" px="xl" pb="xl">
              <Text size="sm" c="dimmed" fw={600}>
                Mostrando {Math.min((page - 1) * ITEMS_PER_PAGE + 1, filteredComandas.length)}-
                {Math.min(page * ITEMS_PER_PAGE, filteredComandas.length)} de {filteredComandas.length}
              </Text>
              <Pagination value={page} onChange={setPage} total={totalPages} />
            </Group>
          </>
        )}
        </Box>
      </Box>

      {/* Modal de Conciliación */}
      <Modal
        opened={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
        title={<Text fw={900} size="lg">Conciliar Orden con Factura</Text>}
        centered
        radius="lg"
        size={pagosParaConciliar.length > 1 ? "lg" : "md"}
        padding="xl"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {pagosParaConciliar.length > 0
              ? "Esta comanda cuenta con los siguientes pagos registrados. Asigna la factura correspondiente a cada pago para completar la conciliación."
              : "Ingresa los datos de la factura emitida en el sistema contable externo para conciliar esta orden."
            }
          </Text>

          {pagosParaConciliar.length > 0 ? (
            <ScrollArea.Autosize mah={400} type="hover">
              <Stack gap="md">
                {pagosParaConciliar.map((pago, index) => (
                  <Paper key={pago.id} withBorder p="md" radius="md" style={{ borderColor: 'var(--pos-border)' }}>
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Text fw={800} size="sm">
                          {pago.tipo_division
                            ? pago.tipo_division.replace('Directo - ', '').replace('Dividido - ', '')
                            : `Pago #${index + 1}`}
                        </Text>
                        <Badge color="green" variant="light" size="md" fw={700}>
                          ${pago.monto.toFixed(2)} ({pago.metodo_pago})
                        </Badge>
                      </Group>
                      <Group grow gap="sm">
                        <TextInput
                          label="Número de Factura"
                          placeholder="Ej: 001-002-00000123"
                          radius="md"
                          value={pago.factura_nro}
                          onChange={(e) => {
                            const val = e.currentTarget.value;
                            setPagosParaConciliar(prev => prev.map(item => item.id === pago.id ? { ...item, factura_nro: val } : item));
                          }}
                        />
                        <TextInput
                          label="Notas de Conciliación"
                          placeholder="Observaciones de este pago..."
                          radius="md"
                          value={pago.factura_nota}
                          onChange={(e) => {
                            const val = e.currentTarget.value;
                            setPagosParaConciliar(prev => prev.map(item => item.id === pago.id ? { ...item, factura_nota: val } : item));
                          }}
                        />
                      </Group>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          ) : (
            <>
              <TextInput
                label="Número de Factura"
                placeholder="Ej: 001-002-00000123"
                size="md"
                radius="md"
                value={invoiceNro}
                onChange={(e) => setInvoiceNro(e.currentTarget.value)}
              />

              <Textarea
                label="Notas de Conciliación"
                placeholder="Observaciones de la conciliación contable..."
                size="md"
                radius="md"
                minRows={3}
                value={invoiceNota}
                onChange={(e) => setInvoiceNota(e.currentTarget.value)}
              />
            </>
          )}

          <Group grow mt="lg">
            <Button variant="light" color="gray" radius="md" size="lg" onClick={() => setInvoiceModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              color="myColor"
              radius="md"
              size="lg"
              disabled={
                pagosParaConciliar.length > 0
                  ? pagosParaConciliar.some(p => !p.factura_nro)
                  : !invoiceNro
              }
              onClick={async () => {
                if (invoicingComandaId) {
                  if (pagosParaConciliar.length > 0) {
                    const allNros = pagosParaConciliar.map(p => p.factura_nro).filter(Boolean);
                    const allNotas = pagosParaConciliar.map(p => p.factura_nota).filter(Boolean);
                    for (const pago of pagosParaConciliar) {
                      await updateRxPago(pago.id, {
                        factura_nro: pago.factura_nro,
                        factura_nota: pago.factura_nota
                      });
                    }
                    await updateRxComanda(invoicingComandaId, {
                      estado: 'facturado',
                      factura_nro: allNros.join(', '),
                      factura_nota: allNotas.join(' | ')
                    });
                  } else {
                    await updateRxComanda(invoicingComandaId, {
                      estado: 'facturado',
                      factura_nro: invoiceNro,
                      factura_nota: invoiceNota
                    });
                  }

                  sileo.success({
                    title: 'Conciliación Exitosa',
                    description: 'La conciliación quedó guardada en la nube.'
                  });
                  setInvoiceModalOpen(false);
                }
              }}
            >
              Confirmar Conciliación
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal de Filtro por Fecha */}
      <Modal
        opened={calendarModalOpen}
        onClose={() => setCalendarModalOpen(false)}
        title={<Text fw={900} size="lg">Filtrar por Rango de Fechas</Text>}
        centered
        radius="lg"
        size="auto"
        zIndex={2000}
      >
        <Stack align="center" gap="md">
          <DatePicker
            type="range"
            locale="es"
            value={dateRange}
            onChange={(val: any) => setDateRange(val)}
          />
          <Group w="100%" justify="space-between" mt="sm">
            <Button
              variant="subtle"
              color="red"
              onClick={() => {
                setDateRange([null, null]);
                setCalendarModalOpen(false);
              }}
            >
              Limpiar Filtro
            </Button>
            <Button
              color="myColor"
              onClick={() => setCalendarModalOpen(false)}
            >
              Aplicar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Flex>
  );
}

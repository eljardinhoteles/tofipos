import { useState, useEffect } from 'react';
import { Flex, Box, Text, Button, Modal, Select, Group, Stack } from '@mantine/core';
import { type Reserva } from '../db/database';
import { Clock, Users, CheckCircle } from '@phosphor-icons/react';
import { useUI } from '../context/UIContext';
import { sileo } from 'sileo';

// Components
import { CalendarToolbar } from '../components/Reservas/CalendarToolbar';
import { CalendarGrid } from '../components/Reservas/CalendarGrid';
import { ProductSelector } from '../components/Mesas/ProductSelector';
import { updateRxComanda, updateRxMesa, updateRxReserva, initVerticalRxDb } from '../db/rxdb';
import { useRxReservas } from '../hooks/useRxReservas';

export default function Reservas() {
  const { 
    openConfirm, 
    setReservaView, 
    setSelectedReservaId, 
    setNuevaReservaPreset,
    reservaProductosComandaId,
    setReservaProductosComandaId,
    registerAssignModal,
  } = useUI();

  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [calendarAnimating, setCalendarAnimating] = useState(false);
  const [, setSlideDir] = useState<-1 | 0 | 1>(0);
  
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [reservaToAssign, setReservaToAssign] = useState<Reserva | null>(null);
  const [mesaSeleccionada, setMesaSeleccionada] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  const { reservas } = useRxReservas();
  const [zonas, setZonas] = useState<any[]>([]);
  const [mesas, setMesas] = useState<any[]>([]);
  const mesasLibres = mesas.filter(m => m.estado === 'libre');

  useEffect(() => {
    let alive = true;
    let zonasSub: { unsubscribe: () => void } | null = null;
    let mesasSub: { unsubscribe: () => void } | null = null;

    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const orgId = localStorage.getItem('pos_active_org_id') || '';
      const zonasQuery = rxDb.pisos.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } },
        sort: [{ orden: 'asc' }, { nombre: 'asc' }]
      });
      zonasSub = zonasQuery.$.subscribe((docs: any[]) => {
        if (!alive) return;
        setZonas(docs.map((doc: any) => doc.toJSON()));
      });
      const mesasQuery = rxDb.mesas.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } },
        sort: [{ piso: 'asc' }, { nombre: 'asc' }]
      });
      mesasSub = mesasQuery.$.subscribe((docs: any[]) => {
        if (!alive) return;
        setMesas(docs.map((doc: any) => doc.toJSON()));
      });
    })().catch(() => {});

    return () => {
      alive = false;
      zonasSub?.unsubscribe();
      mesasSub?.unsubscribe();
    };
  }, []);

  const runCalendarTransition = (direction: -1 | 0 | 1, updater: () => void) => {
    setSlideDir(direction);
    setCalendarAnimating(true);
    requestAnimationFrame(() => {
      updater();
      setTimeout(() => {
        setCalendarAnimating(false);
        setSlideDir(0);
      }, 170);
    });
  };

  const shiftDays = (n: number) => {
    runCalendarTransition(n > 0 ? 1 : -1, () => {
      setStartDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + n); return d; });
    });
  };

  const goToday = () => {
    runCalendarTransition(0, () => {
      const d = new Date(); d.setHours(0, 0, 0, 0); setStartDate(d);
    });
  };

  const visibleDates: Date[] = Array.from({ length: 9 }, (_, i) => {
    const d = new Date(startDate); d.setDate(d.getDate() + i); return d;
  });

  const openDetail = (id: string) => { 
    setSelectedReservaId(id); 
    setReservaView('detalle'); 
  };
  
  const handleOpenAssign = (r: Reserva) => { 
    setReservaToAssign(r); 
    setMesaSeleccionada(null); 
    setAssignModalOpen(true); 
  };

  // Registrar el handler para que SidebarReservaDetail pueda dispararlo
  useEffect(() => {
    registerAssignModal((reservaId: string) => {
      const r = reservas.find(x => x.id === reservaId);
      if (r) handleOpenAssign(r);
    });
  }, [reservas]);

  const handleAssignSubmit = async () => {
    if (!reservaToAssign || !mesaSeleccionada || !reservaToAssign.comanda_id) return;
    setIsAssigning(true);
    try {
      const mesa = mesas.find(m => m.id === mesaSeleccionada);
      await updateRxComanda(reservaToAssign.comanda_id, { 
        mesa_id: mesaSeleccionada,
        mesa_nombre: mesa?.nombre || mesaSeleccionada,
        personas: reservaToAssign.personas,
      });
      await updateRxMesa(mesaSeleccionada, { estado: 'ocupada' });
      await updateRxReserva(reservaToAssign.id, {
        estado: 'completada',
        mesa_id: mesaSeleccionada,
      });
      sileo.success({ title: 'Servicio iniciado', description: 'Reserva asignada a la mesa.' });
      setAssignModalOpen(false);
    } catch (e) {
      console.error(e);
      sileo.error({ title: 'Error', description: 'No se pudo asignar la mesa.' });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleResultClick = (r: Reserva) => {
    const fechaReserva = new Date(r.fecha + 'T12:00:00');
    fechaReserva.setHours(0, 0, 0, 0);
    runCalendarTransition(0, () => setStartDate(fechaReserva));
    setHighlightedId(r.id);
    setTimeout(() => setHighlightedId(null), 3000);
    setSearch('');
    setSearchOpen(false);
  };

  // Filtrar zonas (ejemplo: quitar '1st Floor' si es necesario, o usar todas)
  const zonasRows = zonas.filter(z => z.nombre.toLowerCase() !== 'habitaciones');
  if (!zonasRows.find(z => z.id === 'sin_zona')) {
    zonasRows.push({ id: 'sin_zona', nombre: 'Sin Zona', orden: 999 } as any);
  }

  return (
    <Flex h="100%" w="100%" direction="column" style={{ backgroundColor: 'var(--pos-bg)', position: 'relative' }}>

      <>
      <CalendarToolbar
        startDate={startDate}
        setStartDate={setStartDate}
        shiftDays={shiftDays}
        goToday={goToday}
        visibleDates={visibleDates}
        search={search}
        setSearch={setSearch}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        reservas={reservas}
        onResultClick={handleResultClick}
        onNewReserva={() => { setSelectedReservaId(null); setNuevaReservaPreset(null); setReservaView('nueva'); }}
      />

      <Box
        style={{
          flex: 1,
          transform: 'translateX(0px)',
          opacity: calendarAnimating ? 0.9 : 1,
          transition: 'opacity 170ms ease',
          willChange: 'opacity',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {reservaProductosComandaId ? (
          <ReservaProductSelectorWrapper
            comandaId={reservaProductosComandaId}
            onBack={() => setReservaProductosComandaId(null)}
          />
        ) : (
          <CalendarGrid
            visibleDates={visibleDates}
            reservas={reservas}
            zonasRows={zonasRows}
            mesas={mesas}
            search={search}
            highlightedId={highlightedId}
            onCellClick={(date, zonaId) => {
              setSelectedReservaId(null);
              setNuevaReservaPreset({ fecha: date, zonaId });
              setReservaView('nueva');
            }}
            onCardClick={openDetail}
            onAssign={handleOpenAssign}
            onCancel={(id) => {
              openConfirm(
                'CANCELAR RESERVA',
                '¿Estás seguro de que deseas cancelar esta reserva? Podrás verla más tarde en el historial de canceladas.',
                async () => {
                  await updateRxReserva(id, { estado: 'cancelada' });
                  sileo.success({ title: 'Reserva cancelada' });
                }
              );
            }}
          />
        )}
      </Box>

      {/* Modal asignar mesa */}
      <Modal
        opened={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={<Text fw={900} size="md">Asignar Mesa</Text>}
        centered radius="lg" size="sm"
      >
        {reservaToAssign && (
          <Stack gap="md">
            <Box p="sm" style={{ borderRadius: 10, backgroundColor: 'var(--pos-bg)', border: '1px solid var(--pos-border)' }}>
              <Text size="sm" fw={800} mb={4}>{reservaToAssign.nombre}</Text>
              <Group gap={6}>
                <Clock size={13} color="var(--pos-text-muted)" />
                <Text size="xs" c="dimmed" fw={600}>{reservaToAssign.hora}</Text>
                <Text size="xs" c="dimmed">·</Text>
                <Users size={13} color="var(--pos-text-muted)" />
                <Text size="xs" c="dimmed" fw={600}>{reservaToAssign.personas} personas</Text>
              </Group>
            </Box>
            {(() => {
              const clientZoneName = zonas.find(z => z.id === reservaToAssign.zona_id)?.nombre;
              
              const groupedData = zonasRows.map(zona => ({
                group: zona.nombre,
                items: mesasLibres
                  .filter(m => (zona.id === 'sin_zona' ? !m.piso : m.piso === zona.nombre))
                  .map(m => ({ value: m.id, label: m.nombre }))
              })).filter(g => g.items.length > 0);

              // Priorizar la zona del cliente poniéndola al principio
              if (clientZoneName) {
                groupedData.sort((a, b) => {
                  if (a.group === clientZoneName) return -1;
                  if (b.group === clientZoneName) return 1;
                  return 0;
                });
              }

              return (
                <>
                  {clientZoneName && (
                    <Text size="xs" fw={700} c="myColor.7" mb={-8}>
                      Preferencia: {clientZoneName}
                    </Text>
                  )}
                  <Select
                    label="Mesa disponible"
                    placeholder="Seleccionar mesa..."
                    data={groupedData}
                    searchable
                    clearable
                    value={mesaSeleccionada}
                    onChange={setMesaSeleccionada}
                    radius="md" size="md"
                  />
                </>
              );
            })()}
            <Button fullWidth color="green" radius="md" size="md"
              leftSection={<CheckCircle size={18} weight="bold" />}
              disabled={!mesaSeleccionada} loading={isAssigning}
              onClick={handleAssignSubmit}
            >
              Iniciar Servicio
            </Button>
          </Stack>
        )}
      </Modal>

      </>
    </Flex>
  );
}

function ReservaProductSelectorWrapper({ comandaId, onBack }: { comandaId: string; onBack: () => void }) {
  const [comanda, setComanda] = useState<any | null>(null);
  useEffect(() => {
    let alive = true
    ;(async () => {
      const rxDb = await initVerticalRxDb()
      const doc = await rxDb.comandas.findOne(comandaId).exec()
      if (alive) setComanda(doc ? doc.toJSON() : null)
    })().catch(() => {})
    return () => { alive = false }
  }, [comandaId])
  const reservaComanda = comanda ?? {
    id: comandaId, mesa_id: '', mesero: '', folio: 0,
    estado: 'pendiente' as const, confirmada: false, total: 0,
    sincronizado: false, created_at: '', updated_at: '',
  };
  return <ProductSelector activeComanda={reservaComanda as any} onBack={onBack} />;
}

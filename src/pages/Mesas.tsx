import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDrag } from '@use-gesture/react';
import {
  Button,
  Stack,
  Text,
  Box,
  Flex,
  Group,
  UnstyledButton,
  ActionIcon,
  Tooltip,
  ScrollArea,
  Modal,
  Drawer,
  Checkbox,
  ThemeIcon,
} from '@mantine/core';
import { type Comanda, type Piso, type HabitacionCuenta } from '../db/database';
import { isOperativeComanda } from '../db/comandaState';
import { TableNode } from '../components/Mesas/TableNode';
import { MesasControls } from '../components/Mesas/MesasControls';
import { ProductSelector } from '../components/Mesas/ProductSelector';
import { initVerticalRxDb } from '../db/rxdb';
import { Plus, Basket, Bed, ClipboardText, Printer, FileText } from '@phosphor-icons/react';
import { useUI } from '../context/UIContext';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/Common/PageHeader';
import { sileo } from 'sileo';
import { SidebarKitchenReport } from '../components/Mesas/Sidebar/SidebarKitchenReport';

export default function Mesas() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedPiso, setSelectedPiso] = useState<string>('');
  const {
    selectedMesaId, setSelectedMesaId,
    configView, setConfigView,
    mesaView, setMesaView,
    setViewingComandaId,
    setSelectedMesaEsHabitacion,
  } = useUI();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chipsRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const activeChip = chipsRefs.current[selectedPiso];
    if (activeChip && scrollContainerRef.current) {
      activeChip.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [selectedPiso]);

  const handleOpenConfig = useCallback(() => {
    setConfigView('pisos');
  }, [setConfigView]);

  // Efecto para abrir configuración desde Ajustes
  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      handleOpenConfig();
      searchParams.delete('edit');
      setSearchParams(searchParams);
    }
  }, [handleOpenConfig, searchParams, setSearchParams]);

  const [dbPisos, setDbPisos] = useState<Piso[]>([]);
  const [allMesas, setAllMesas] = useState<Array<{ id: string; nombre: string; estado: 'libre' | 'ocupada' | 'cuenta'; piso: string; capacidad?: number }>>([]);
  const [allComandas, setAllComandas] = useState<Comanda[]>([]);
  const [allCuentas, setAllCuentas] = useState<HabitacionCuenta[]>([]);
  const [reportSidebarOpen, setReportSidebarOpen] = useState(false);




  // Lista de nombres de pisos disponibles
  const availablePisos = dbPisos.reduce<string[]>((pisos, piso) => (
    pisos.includes(piso.nombre) ? pisos : [...pisos, piso.nombre]
  ), []);

  // Lista ordenada de pisos para navegación por gestos (Hotel/Habitaciones siempre al inicio)
  const allSelectablePisos = useMemo(() => {
    const list = dbPisos.map(p => p.nombre);
    const hasHotel = list.some(p => p.toLowerCase() === 'habitaciones');
    const filtered = list.filter(p => p.toLowerCase() !== 'habitaciones');
    if (hasHotel) {
      const hotelPisoName = list.find(p => p.toLowerCase() === 'habitaciones')!;
      return [hotelPisoName, ...filtered];
    }
    return filtered;
  }, [dbPisos]);

  // Gesto swipe horizontal
  const bindSwipe = useDrag(({ swipe: [swipeX], active }) => {
    if (!active && swipeX !== 0) {
      const currentIndex = allSelectablePisos.findIndex(
        p => p.toLowerCase() === selectedPiso.toLowerCase()
      );
      if (currentIndex !== -1) {
        if (swipeX === -1) {
          // Swipe izquierdo -> Siguiente piso (derecha)
          const nextIndex = Math.min(allSelectablePisos.length - 1, currentIndex + 1);
          if (nextIndex !== currentIndex) {
            setSelectedPiso(allSelectablePisos[nextIndex]);
          }
        } else if (swipeX === 1) {
          // Swipe derecho -> Anterior piso (izquierda)
          const prevIndex = Math.max(0, currentIndex - 1);
          if (prevIndex !== currentIndex) {
            setSelectedPiso(allSelectablePisos[prevIndex]);
          }
        }
      }
    }
  }, {
    swipe: {
      distance: 50,
      velocity: 0.5,
    },
    axis: 'x',
  });

  useEffect(() => {
    let active = true;
    let mesasSub: { unsubscribe: () => void } | null = null;
    let comandasSub: { unsubscribe: () => void } | null = null;
    let pisosSub: { unsubscribe: () => void } | null = null;
    let cuentasSub: { unsubscribe: () => void } | null = null;

    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!active) return;
      const orgId = localStorage.getItem('pos_active_org_id') || '';

      const pisosQuery = rxDb.pisos.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } },
        sort: [{ orden: 'asc' }, { nombre: 'asc' }]
      });
      const mesasQuery = rxDb.mesas.find({
        selector: {
          organization_id: orgId,
          _deleted: { $ne: true }
        }
      });
      const comandasQuery = rxDb.comandas.find({
        selector: {
          organization_id: orgId,
          _deleted: { $ne: true }
        }
      });
      const cuentasQuery = rxDb.habitacion_cuentas.find({
        selector: {
          organization_id: orgId,
          estado: 'activa',
          _deleted: { $ne: true }
        }
      });

      pisosSub = pisosQuery.$.subscribe((docs: any[]) => {
        if (!active) return;
        setDbPisos(docs.map((doc: any) => doc.toJSON()));
      });
      mesasSub = mesasQuery.$.subscribe((docs: any[]) => {
        if (!active) return;
        setAllMesas(docs.map((doc: any) => doc.toJSON()));
      });

      comandasSub = comandasQuery.$.subscribe((docs: any[]) => {
        if (!active) return;
        setAllComandas(docs.map((doc: any) => doc.toJSON()));
      });
      cuentasSub = cuentasQuery.$.subscribe((docs: any[]) => {
        if (!active) return;
        setAllCuentas(docs.map((doc: any) => doc.toJSON()));
      });
    })().catch(err => console.warn('Error cargando RxDB para Mesas:', err));

    return () => {
      active = false;
      pisosSub?.unsubscribe();
      mesasSub?.unsubscribe();
      comandasSub?.unsubscribe();
      cuentasSub?.unsubscribe();
    };
  }, []);

  const mesasToShow = allMesas
    .filter(m => m.piso === selectedPiso)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity: 'base' }));

  useEffect(() => {
    if (dbPisos.length === 0) return;
    if (selectedPiso && dbPisos.some(p => p.nombre === selectedPiso)) return;
    const firstNonHotel = dbPisos
      .map(p => p.nombre)
      .find(p => p.toLowerCase() !== 'habitaciones');
    setSelectedPiso(firstNonHotel ?? dbPisos[0].nombre);
  }, [dbPisos, selectedPiso]);

  return (
    <Flex h="100%" w="100%" style={{ position: 'relative' }}>

      {/* ÁREA PRINCIPAL */}
      <Box flex={1} style={{ overflow: 'hidden', position: 'relative', minWidth: 0, display: 'flex', flexDirection: 'column' }}>

        {mesaView === 'mapa' && (
          <Box style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <PageHeader height={56}>
              <Group justify="space-between" align="center" style={{ width: '100%' }}>
                <Text fw={850} size="md" c="var(--pos-text)" truncate style={{ flex: 1, maxWidth: '240px' }}>
                  {localStorage.getItem('pos_org_name_cached') || 'POS'}
                </Text>
                <Group gap="md" style={{ flexShrink: 0 }}>
                  <Tooltip label="Ver Productos" withArrow radius="md">
                    <ActionIcon
                      variant="filled"
                      color="orange"
                      radius="md"
                      size={36}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMesaView('productos');
                      }}
                      style={{
                        flexShrink: 0
                      }}
                    >
                      <Basket size={18} weight="bold" />
                    </ActionIcon>
                  </Tooltip>

                  <Tooltip label="Reporte Consolidado Cocina" withArrow radius="md">
                    <ActionIcon
                      variant="light"
                      color="blue"
                      radius="md"
                      size={36}
                      onClick={(e) => {
                        e.stopPropagation();
                        setReportSidebarOpen(true);
                      }}
                      style={{
                        flexShrink: 0
                      }}
                      visibleFrom="sm"
                    >
                      <ClipboardText size={18} weight="bold" />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </PageHeader>

            <Box
              ref={scrollContainerRef}
              px="xl"
              style={{
                height: 52,
                backgroundColor: 'transparent',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                zIndex: 9,
                overflowX: 'auto',
              }}
              className="hide-scrollbar"
            >
              <Group wrap="nowrap" gap="md" style={{ minWidth: 'max-content', width: '100%' }}>
                <Button
                  ref={(el) => { chipsRefs.current['Habitaciones'] = el as unknown as HTMLButtonElement; }}
                  variant="subtle"
                  color="gray"
                  h={34}
                  radius="md"
                  leftSection={<Bed size={20} />}
                  onClick={() => {
                    const habitacionesPiso = availablePisos.find(p => p.toLowerCase() === 'habitaciones');
                    if (habitacionesPiso) {
                      setSelectedPiso(habitacionesPiso);
                    } else {
                      initVerticalRxDb().then(rxDb =>
                        rxDb.pisos.insert({
                          id: crypto.randomUUID(),
                          nombre: 'Habitaciones',
                          orden: dbPisos.length,
                          organization_id: localStorage.getItem('pos_active_org_id') || '',
                          _deleted: false,
                          _modified: new Date().toISOString(),
                        })
                      ).then(() => setSelectedPiso('Habitaciones'))
                        .catch(err => console.warn('Error creando Habitaciones:', err));
                    }
                  }}
                  style={{
                    flexShrink: 0,
                    backgroundColor: selectedPiso.toLowerCase() === 'habitaciones' ? 'var(--ui-primary-soft)' : 'transparent',
                    color: selectedPiso.toLowerCase() === 'habitaciones' ? 'var(--ui-primary)' : 'var(--pos-text-sub)'
                  }}
                >
                  Hotel
                </Button>

                <Box style={{ width: 1, height: 24, backgroundColor: 'var(--pos-border)', flexShrink: 0 }} />

                <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 'max-content' }}>
                  {availablePisos.filter(p => p.toLowerCase() !== 'habitaciones').map(piso => {
                    const active = piso === selectedPiso;
                    return (
                      <UnstyledButton
                        key={piso}
                        ref={(el) => { chipsRefs.current[piso] = el as HTMLButtonElement; }}
                        onClick={() => setSelectedPiso(piso)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 'var(--mantine-radius-xl)',
                          backgroundColor: active ? 'var(--ui-primary)' : 'var(--pos-bg)',
                          color: active ? 'white' : 'var(--pos-text-sub)',
                          fontWeight: active ? 700 : 600,
                          fontSize: '13px',
                          whiteSpace: 'nowrap',
                          border: `1px solid ${active ? 'var(--ui-primary)' : 'var(--pos-border)'}`,
                          transition: 'all var(--ease-fast)',
                        }}
                      >
                        {piso}
                      </UnstyledButton>
                    );
                  })}
                  <UnstyledButton
                    onClick={() => setConfigView('pisos')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--mantine-radius-xl)',
                      backgroundColor: 'transparent',
                      color: configView !== 'none' ? 'var(--ui-primary)' : 'var(--pos-text-muted)',
                      fontWeight: 700,
                      fontSize: '13px',
                      whiteSpace: 'nowrap',
                      border: `1px dashed ${configView !== 'none' ? 'var(--ui-primary)' : 'var(--pos-border)'}`,
                      transition: 'all var(--ease-fast)',
                    }}
                  >
                    Añadir
                  </UnstyledButton>
                </Group>
              </Group>
            </Box>
          </Box>
        )}

        <Box
          flex={1}
          {...(mesaView !== 'productos' ? bindSwipe() : {})}
          style={{
            position: 'relative',
            overflow: 'hidden',
            touchAction: mesaView !== 'productos' ? 'pan-y' : 'auto'
          }}
        >
          {mesaView === 'productos' ? (
            <ProductSelectorWrapper
              mesaId={selectedMesaId}
              onBack={() => setMesaView('mapa')}
            />
          ) : (
            <ScrollArea h="100%" offsetScrollbars className="pos-grid-bg">
              <Box p={20} pb={100}>

                <MesasControls
                  availablePisos={availablePisos}
                  selectedPiso={selectedPiso}
                  onPisoChange={setSelectedPiso}
                  onOpenManage={() => setConfigView('pisos')}
                  onOpenAddTable={() => setConfigView('nueva_mesa')}
                  isEditMode={configView !== 'none'}
                  onToggleEditMode={() => setConfigView(configView === 'none' ? 'nueva_mesa' : 'none')}
                  hideChips={true}
                />

                {availablePisos.length === 0 ? (
                  <Stack align="center" justify="center" py={80} gap="xl">
                    <Stack align="center" gap="xs">
                      <Box style={{ opacity: 1, width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={selectedPiso.toLowerCase() === 'habitaciones' ? '/hotel.webp' : '/Mesas.webp'} alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </Box>
                      <Text c="var(--pos-text)" fw={800} size="xl">
                        No hay zonas creadas
                      </Text>
                      <Text c="dimmed" size="sm" style={{ maxWidth: 320, textAlign: 'center' }}>
                        Crea tu primera zona o piso para empezar a agregar mesas.
                      </Text>
                    </Stack>
                    <Button
                      variant="light" color="myColor" radius="md" size="md"
                      leftSection={<Plus size={18} weight="bold" />}
                      onClick={(e) => { e.stopPropagation(); handleOpenConfig(); }}
                    >
                      Crear primera zona
                    </Button>
                  </Stack>
                ) : mesasToShow.length === 0 ? (
                  <Stack align="center" justify="center" py={80} gap="xl">
                    <Stack align="center" gap="xs">
                      <Box style={{ opacity: 1, width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={selectedPiso.toLowerCase() === 'habitaciones' ? '/hotel.webp' : '/Mesas.webp'} alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </Box>
                      <Text c="var(--pos-text)" fw={800} size="xl">
                        {selectedPiso.toLowerCase() === 'habitaciones' ? 'No hay habitaciones' : `No hay mesas en ${selectedPiso}`}
                      </Text>
                      <Text c="dimmed" size="sm" style={{ maxWidth: 300, textAlign: 'center' }}>
                        {selectedPiso.toLowerCase() === 'habitaciones'
                          ? 'Añade las habitaciones del hotel para empezar a gestionar cuentas.'
                          : 'Comienza configurando el plano de esta zona añadiendo tu primera mesa.'}
                      </Text>
                    </Stack>
                    <Button
                      variant="light" color="myColor" radius="md" size="md"
                      leftSection={<Plus size={18} weight="bold" />}
                      onClick={(e) => { e.stopPropagation(); handleOpenConfig(); }}
                    >
                      {selectedPiso.toLowerCase() === 'habitaciones' ? 'Añadir Habitación' : 'Añadir Primera Mesa'}
                    </Button>
                  </Stack>
                ) : (
                  <Box className="pos-tables-grid">
                    {mesasToShow.map((mesa) => {
                      const mesaComanda = allComandas.find(c => c.mesa_id === mesa.id && isOperativeComanda(c));
                      const mesaCuenta = allCuentas.find(c => c.mesa_id === mesa.id);
                      const clienteNombre = mesaCuenta ? mesaCuenta.huesped : mesaComanda?.cliente;
                      const isHabitacion = selectedPiso.toLowerCase() === 'habitaciones';
                      const estadoVisual = isHabitacion
                        ? (mesaCuenta ? 'ocupada' : 'libre')
                        : (mesaComanda ? (mesaComanda.estado === 'cuenta' ? 'cuenta' : 'ocupada') : 'libre');

                      let habitacionAsociada = '';
                      if (!isHabitacion && mesaComanda?.habitacion_cuenta_id) {
                        const cuenta = allCuentas.find(c => c.id === mesaComanda.habitacion_cuenta_id);
                        if (cuenta) {
                          const roomMesa = allMesas.find(m => m.id === cuenta.mesa_id);
                          if (roomMesa) {
                            habitacionAsociada = roomMesa.nombre;
                          }
                        }
                      }

                      return (
                        <Box key={mesa.id} style={{ overflow: 'visible' }}>
                          <TableNode
                            mesa={{ ...mesa, estado: estadoVisual } as any}
                            isSelected={selectedMesaId === mesa.id}
                            cliente={clienteNombre}
                            isHabitacion={isHabitacion}
                            activeComanda={mesaComanda}
                            roomBadge={habitacionAsociada}
                            onSelect={(m) => {
                              setSelectedMesaEsHabitacion(selectedPiso.toLowerCase() === 'habitaciones');
                              setSelectedMesaId(m.id);
                              setViewingComandaId(null);
                              setConfigView('none');
                            }}
                          />
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            </ScrollArea>
          )}


        </Box>
      </Box>

      {/* Sidebar for Reporte Consolidado */}
      <SidebarKitchenReport
        opened={reportSidebarOpen}
        onClose={() => setReportSidebarOpen(false)}
        allMesas={allMesas}
        allComandas={allComandas}
        allCuentas={allCuentas}
      />

      {/* El sidebar ahora se renderiza globalmente en AppLayout */}
    </Flex>
  );
}

function ProductSelectorWrapper({ mesaId, onBack }: { mesaId: string | null; onBack: () => void }) {
  const [activeComanda, setActiveComanda] = useState<Comanda | null>(null);

  useEffect(() => {
    let active = true;
    let sub: { unsubscribe: () => void } | null = null;

    (async () => {
      if (!mesaId) {
        if (active) setActiveComanda(null);
        return;
      }

      const rxDb = await initVerticalRxDb();
      if (!active) return;

      const query = rxDb.comandas.find({
        selector: {
          mesa_id: mesaId,
          organization_id: localStorage.getItem('pos_active_org_id') || ''
        }
      });

      sub = query.$.subscribe((docs: any[]) => {
        if (!active) return;
        const operative = docs
          .map((doc: any) => doc.toJSON())
          .filter((c: Comanda) => isOperativeComanda(c))[0] ?? null;
        setActiveComanda(operative);
      });
    })().catch(err => console.warn('Error cargando comanda activa para selector:', err));

    return () => {
      active = false;
      sub?.unsubscribe();
    };
  }, [mesaId]);

  return <ProductSelector activeComanda={activeComanda} onBack={onBack} />;
}

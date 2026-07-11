import { useState, useEffect } from 'react';
import { Box, Center, Loader } from '@mantine/core';
import { type Mesa, type Piso } from '../../db/database';

// Importar sub-componentes refactorizados
import { SidebarWelcome } from './Sidebar/SidebarWelcome';
import { SidebarDetails } from './Sidebar/SidebarDetails';
import { SidebarReceiptViewer } from './Sidebar/SidebarReceiptViewer';
import { SidebarOpenTable } from './Sidebar/SidebarOpenTable';
import { SidebarConfigPisos } from './Sidebar/SidebarConfigPisos';
import { useUI } from '../../context/UIContext';
import { SidebarConfigMesas } from './Sidebar/SidebarConfigMesas';
import { SidebarAddTable } from './Sidebar/SidebarAddTable';
import { SidebarCheckout } from './Sidebar/SidebarCheckout';
import { SidebarSplit } from './Sidebar/SidebarSplit';
import { SidebarReservaNew } from './Sidebar/SidebarReservaNew';
import { SidebarReservaDetail } from './Sidebar/SidebarReservaDetail';
import { SidebarMenuProduct } from '../Menu/SidebarMenuProduct';
import { SidebarHabitacionCuenta } from './Sidebar/SidebarHabitacionCuenta';
import { getMesaEstadoEfectivo, isOperativeComanda } from '../../db/comandaState';
import { initVerticalRxDb, updateRxMesa, createRxPiso, updateRxPiso } from '../../db/rxdb';
import { useRxClientes } from '../../hooks/useRxClientes';

interface TableSidebarProps {
  selectedMesa: Mesa | null;
  onClose: () => void;
  onAction: (mesa: Mesa, action: string) => void;
  configView: 'none' | 'pisos' | 'mesas' | 'nueva_mesa';
  setConfigView: (view: 'none' | 'pisos' | 'mesas' | 'nueva_mesa') => void;
  selectedConfigPiso: string | null;
  setSelectedConfigPiso: (piso: string | null) => void;
  mesaEsDeHabitaciones?: boolean;
}

export function TableSidebar({
  selectedMesa,
  onClose,
  onAction,
  configView,
  setConfigView,
  selectedConfigPiso,
  setSelectedConfigPiso,
  mesaEsDeHabitaciones = false,
}: TableSidebarProps) {
  // Estados para apertura de mesa
  const [customerName, setCustomerName] = useState('');
  const [guestCount, setGuestCount] = useState(0);
  const { checkoutView, setCheckoutView, viewingComandaId, reservaView, setReservaView, selectedReservaId, setSelectedReservaId, menuView } = useUI();
  const [checkoutType, setCheckoutType] = useState<'directo' | 'dividido'>('directo');
  const [checkoutMode, setCheckoutMode] = useState<'cobro' | 'enviar_habitacion'>('cobro');
  const [openLinkMode, setOpenLinkMode] = useState<'manual' | 'habitacion'>('manual');

  // Estados para gestión de pisos (Config)
  const [newPisoName, setNewPisoName] = useState('');
  const [editingPisoId, setEditingPisoId] = useState<string | null>(null);
  const [editingPisoName, setEditingPisoName] = useState('');

  // Consultas Live
  const [allMesas, setAllMesas] = useState<Mesa[]>([]);
  const [dbPisos, setDbPisos] = useState<Piso[]>([]);
  const [activeMesaIds, setActiveMesaIds] = useState<Set<string>>(new Set());

  const { clientes: allClientes } = useRxClientes();
  
  const [historicalComanda, setHistoricalComanda] = useState<any | null>(null);
  const [activeComandaLive, setActiveComandaLive] = useState<any | null>(null);
  const [liveComandaItems, setLiveComandaItems] = useState<any[]>([]);
  const [activeCuentaHabitacion, setActiveCuentaHabitacion] = useState<any | null>(null);

  // Suscripciones globales de la organización (mesas, pisos, comandas activas):
  // dependen solo de orgId, no de qué mesa esté seleccionada. Antes vivían en el
  // mismo efecto que la mesa seleccionada y se recreaban en cada tap de mesa,
  // relanzando consultas sobre TODA la organización y retrasando la apertura
  // del sheet. Ahora corren una sola vez al montar el sidebar.
  useEffect(() => {
    let alive = true;
    let mesasSub: { unsubscribe: () => void } | null = null;
    let pisosSub: { unsubscribe: () => void } | null = null;
    let allComandasSub: { unsubscribe: () => void } | null = null;

    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;

      const orgId = localStorage.getItem('pos_active_org_id') || '';
      const mesasQuery = rxDb.mesas.find({
        selector: { organization_id: orgId, _deleted: { $ne: true } },
        sort: [{ piso: 'asc' }, { nombre: 'asc' }]
      });
      const pisosQuery = rxDb.pisos.find({
        selector: {
          organization_id: orgId,
          _deleted: { $ne: true }
        },
        sort: [{ orden: 'asc' }, { nombre: 'asc' }]
      });
      mesasSub = mesasQuery.$.subscribe((docs: any[]) => {
        if (!alive) return;
        setAllMesas(docs.map((doc: any) => doc.toJSON()));
      });
      pisosSub = pisosQuery.$.subscribe((docs: any[]) => {
        if (!alive) return;
        setDbPisos(docs.map((doc: any) => doc.toJSON()));
      });
      allComandasSub = rxDb.comandas.find({
        selector: {
          organization_id: orgId,
          estado: { $nin: ['cerrado', 'facturado', 'anulada'] },
          _deleted: { $ne: true },
        }
      }).$.subscribe((docs: any[]) => {
        if (!alive) return;
        const ids = new Set(
          docs
            .map((d: any) => d.toJSON())
            .filter((c: any) => isOperativeComanda(c))
            .map((c: any) => c.mesa_id)
            .filter(Boolean)
        );
        setActiveMesaIds(ids);
      });
    })().catch(err => console.warn('Error cargando datos globales RxDB del sidebar:', err));

    return () => {
      alive = false;
      mesasSub?.unsubscribe();
      pisosSub?.unsubscribe();
      allComandasSub?.unsubscribe();
    };
  }, []);

  // Suscripciones específicas de la mesa/comanda seleccionada: este es el único
  // trabajo que debe repetirse en cada tap de mesa.
  useEffect(() => {
    let alive = true;
    let comandasSub: { unsubscribe: () => void } | null = null;
    let cuentaSub: { unsubscribe: () => void } | null = null;

    (async () => {
      const rxDb = await initVerticalRxDb();
      if (!alive) return;

      const orgId = localStorage.getItem('pos_active_org_id') || '';

      if (viewingComandaId) {
        const doc = await rxDb.comandas.findOne(viewingComandaId).exec();
        if (alive) setHistoricalComanda(doc ? doc.toJSON() : null);
      } else {
        setHistoricalComanda(null);
      }

      if (selectedMesa) {
        const query = rxDb.comandas.find({
          selector: {
            mesa_id: selectedMesa.id,
            organization_id: orgId,
            estado: { $nin: ['cerrado', 'facturado', 'anulada'] },
          },
          sort: [{ updated_at: 'desc' }, { id: 'desc' }]
        });

        const currentDocs = await query.exec();
        if (alive) {
          const currentDoc = currentDocs.find(d => isOperativeComanda(d.toJSON ? d.toJSON() : d)) || null;
          setActiveComandaLive(currentDoc ? currentDoc.toJSON() : null);
        }

        comandasSub = query.$.subscribe((docs: any[]) => {
          if (!alive) return;
          const doc = docs.find(d => isOperativeComanda(d.toJSON ? d.toJSON() : d)) || null;
          setActiveComandaLive(doc ? doc.toJSON() : null);
        });

        const cuentaQuery = rxDb.habitacion_cuentas.find({
          selector: { mesa_id: selectedMesa.id, estado: 'activa', organization_id: orgId, _deleted: { $ne: true } }
        });
        const cuentaDocs = await cuentaQuery.exec();
        if (alive) setActiveCuentaHabitacion(cuentaDocs[0] ? cuentaDocs[0].toJSON() : null);
        cuentaSub = cuentaQuery.$.subscribe((docs: any[]) => {
          if (!alive) return;
          setActiveCuentaHabitacion(docs[0] ? docs[0].toJSON() : null);
        });
      } else {
        setActiveCuentaHabitacion(null);
      }
    })().catch(err => console.warn('Error cargando comanda RxDB del sidebar:', err));

    return () => {
      alive = false;
      comandasSub?.unsubscribe();
      cuentaSub?.unsubscribe();
    };
  }, [selectedMesa?.id, selectedMesa?.estado, viewingComandaId]);

  const activeComanda = viewingComandaId ? historicalComanda : activeComandaLive;
  const selectedMesaForView: Mesa | null = selectedMesa || (
    viewingComandaId && historicalComanda
      ? {
          id: historicalComanda.mesa_id,
          nombre: historicalComanda.mesa_nombre || historicalComanda.mesa_id || 'Mesa eliminada',
          estado: 'libre',
          piso: '',
          capacidad: historicalComanda.personas || 0,
          organization_id: localStorage.getItem('pos_active_org_id') || '',
          _deleted: false,
          _modified: new Date().toISOString(),
        } as Mesa
      : null
  );
  const selectedMesaEffective: Mesa | null = selectedMesaForView
    ? getMesaEstadoEfectivo(selectedMesaForView, activeComanda)
    : null;
  const isHabitacion = mesaEsDeHabitaciones || selectedMesaForView?.piso?.toLowerCase() === 'habitaciones' || !!activeCuentaHabitacion;
  
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!activeComanda?.id) {
        if (alive) setLiveComandaItems([]);
        return;
      }
      const rxDb = await initVerticalRxDb();
      if (!alive) return;
      const query = rxDb.comanda_items.find({
        selector: { comanda_id: activeComanda.id, _deleted: { $ne: true } }
      });
      const sub = query.$.subscribe((docs: any[]) => {
        if (!alive) return;
        setLiveComandaItems(docs.map((doc: any) => doc.toJSON()));
      });
      return () => sub.unsubscribe();
    })().catch(err => console.warn('Error cargando items RxDB del sidebar:', err));

    return () => {
      alive = false;
    };
  }, [activeComanda?.id]);

  const comandaItems = liveComandaItems;

  const [editingMesaId, setEditingMesaId] = useState<string | null>(null);
  const [tableFormValues, setTableFormValues] = useState({ numero: 1, nombre: '', capacidad: 0 });
  const [selectedHabitacionId, setSelectedHabitacionId] = useState<string | null>(null);

  // Resetear estados al cambiar de mesa
  useEffect(() => {
    if (selectedMesa) {
      setCustomerName('');
      setGuestCount(selectedMesa.capacidad || 2); // Pre-llena la capacidad de la mesa o 2 por defecto
      setCheckoutView(false);
      setSelectedHabitacionId(null);
      setOpenLinkMode('manual');
    }
  }, [selectedMesa]);

  // Handlers de Configuración
  const handleAddPiso = async (name: string) => {
    if (!name.trim()) return;
    await createRxPiso({
      id: crypto.randomUUID(),
      nombre: name.trim(),
      orden: dbPisos.length,
      organization_id: localStorage.getItem('pos_active_org_id') || '',
    });
    setNewPisoName('');
  };

  const handleUpdatePiso = async (id: string, name: string) => {
    if (!name.trim()) return;
    const original = dbPisos.find(p => p.id === id);
    if (original) {
      await updateRxPiso(id, { nombre: name.trim() });
      const rxDb = await initVerticalRxDb();
      const mesas = await rxDb.mesas.find({
        selector: {
          piso: original.nombre,
          organization_id: localStorage.getItem('pos_active_org_id') || ''
        }
      }).exec();
      for (const mesa of mesas) {
        await updateRxMesa((mesa as any).id, { piso: name.trim() });
      }
    }
    setEditingPisoId(null);
  };

  const handleDeletePiso = async (id: string, nombre: string) => {
    if (allMesas.some(m => m.piso === nombre)) {
      alert('No puedes borrar un piso con mesas');
      return;
    }
    await updateRxPiso(id, { _deleted: true });
  };

  const handleReorderPiso = async (id: string, direction: 'up' | 'down') => {
    const currentIndex = dbPisos.findIndex(p => p.id === id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= dbPisos.length) return;

    const currentPiso = dbPisos[currentIndex];
    const targetPiso = dbPisos[targetIndex];

    // Intercambiar órdenes
    await updateRxPiso(currentPiso.id, { orden: targetPiso.orden });
    await updateRxPiso(targetPiso.id, { orden: currentPiso.orden });
  };

  const isHabitacionPiso = selectedConfigPiso?.toLowerCase() === 'habitaciones';

  const handleAddTable = async (values: any) => {
    if (selectedConfigPiso) {
      const prefix = isHabitacionPiso ? 'Hab.' : 'Mesa';
      const pattern = isHabitacionPiso ? /Hab\. (\d+)/ : /Mesa (\d+)/;

      const exists = allMesas.some(m => {
        if (editingMesaId && m.id === editingMesaId) return false;
        const mNum = parseInt(m.nombre.match(pattern)?.[1] || '0');
        return mNum === values.numero;
      });

      if (exists) {
        alert(isHabitacionPiso ? 'Este número de habitación ya existe' : 'Este número de mesa ya existe');
        return;
      }

      const finalNombre = isHabitacionPiso && values.nombre
        ? `${prefix} ${values.numero} (${values.nombre})`
        : `${prefix} ${values.numero}`;

      if (editingMesaId) {
        await updateRxMesa(editingMesaId, {
          nombre: finalNombre,
          capacidad: isHabitacionPiso ? 0 : values.capacidad,
        });
      } else {
        const mesaId = crypto.randomUUID();
        const rxDb = await initVerticalRxDb();
        await rxDb.mesas.insert({
          id: mesaId,
          nombre: finalNombre,
          estado: 'libre',
          piso: selectedConfigPiso,
          capacidad: isHabitacionPiso ? 0 : values.capacidad,
          organization_id: localStorage.getItem('pos_active_org_id') || '',
          _deleted: false,
          _modified: new Date().toISOString(),
        });
      }
      setConfigView('mesas');
      setEditingMesaId(null);
    }
  };

  const handleOpenEdit = (mesa: any) => {
    const pattern = isHabitacionPiso ? /Hab\. (\d+)/ : /Mesa (\d+)/;
    const num = parseInt(mesa.nombre.match(pattern)?.[1] || '0');
    const nom = mesa.nombre.match(/\(([^)]+)\)/)?.[1] || '';

    setEditingMesaId(mesa.id);
    setTableFormValues({
      numero: num,
      nombre: nom,
      capacidad: mesa.capacidad || 2
    });
    setConfigView('nueva_mesa');
  };

  const handleOpenAdd = () => {
    const maxNum = allMesas.reduce((max, m) => {
      const mNum = parseInt(m.nombre.match(/Mesa (\d+)/)?.[1] || '0');
      return mNum > max ? mNum : max;
    }, 0);
    
    setEditingMesaId(null);
    setTableFormValues({
      numero: maxNum + 1,
      nombre: '',
      capacidad: 0
    });
    setCheckoutView(false);
    setConfigView('nueva_mesa');
  };

  const handleActionOverride = (mesa: Mesa, action: string) => {
    if (action === 'enviar_habitacion') {
      setCheckoutType('directo');
      setCheckoutMode('enviar_habitacion');
      setCheckoutView(true);
    } else if (action === 'dividido') {
      setCheckoutType('dividido');
      setCheckoutMode('cobro');
      setCheckoutView(true);
    } else {
      onAction(mesa, action);
    }
  };

  // ── LÓGICA DE RENDERING (ROUTER) ──────────────────────────────────────────

  return (
    <Box h="100%">
      {(() => {
        // 0. Vistas de Menú
        if (menuView === 'producto') {
          return <SidebarMenuProduct />;
        }

        // 0. Vistas de Reserva
        if (reservaView === 'nueva') {
          return (
            <SidebarReservaNew
              onBack={() => setReservaView('none')}
              onSuccess={(id) => {
                setSelectedReservaId(id);
                setReservaView('detalle');
              }}
            />
          );
        }

        if (reservaView === 'detalle' && selectedReservaId) {
          return (
            <SidebarReservaDetail
              reservaId={selectedReservaId}
              onBack={() => setReservaView('none')}
              onClose={() => {
                setReservaView('none');
                setSelectedReservaId(null);
              }}
            />
          );
        }

        // 1. Vista de Añadir/Editar Mesa (Jerarquía 3)
        if (configView === 'nueva_mesa' && selectedConfigPiso) {
          return (
            <SidebarAddTable
              editingMesaId={editingMesaId}
              initialValues={tableFormValues}
              selectedConfigPiso={selectedConfigPiso}
              isHabitacion={isHabitacionPiso}
              onBack={() => setConfigView('mesas')}
              onSubmit={handleAddTable}
            />
          );
        }

        // 2. Vista de Configuración de Mesas (Jerarquía 2)
        if (configView === 'mesas' && selectedConfigPiso) {
          return (
            <SidebarConfigMesas
              selectedConfigPiso={selectedConfigPiso}
              mesasDelPiso={allMesas.filter(m => m.piso === selectedConfigPiso)}
              activeMesaIds={activeMesaIds}
              isHabitacion={isHabitacionPiso}
              onBack={() => setConfigView('pisos')}
              onOpenAddTable={handleOpenAdd}
              onEditMesa={handleOpenEdit}
              onDeleteMesa={async (id) => {
                await updateRxMesa(id, { _deleted: true });
              }}
            />
          );
        }

        // 2. Vista de Configuración de Pisos (Jerarquía 1)
        if (configView === 'pisos') {
          return (
            <SidebarConfigPisos 
              dbPisos={dbPisos}
              allMesas={allMesas}
              onBack={() => setConfigView('none')}
              onAddPiso={handleAddPiso}
              onUpdatePiso={handleUpdatePiso}
              onDeletePiso={handleDeletePiso}
              onReorderPiso={handleReorderPiso}
              onSelectPiso={(name) => { setSelectedConfigPiso(name); setConfigView('mesas'); }}
              newPisoName={newPisoName}
              setNewPisoName={setNewPisoName}
              editingPisoId={editingPisoId}
              setEditingPisoId={setEditingPisoId}
              editingPisoName={editingPisoName}
              setEditingPisoName={setEditingPisoName}
            />
          );
        }

        // Si se está cargando una comanda histórica, evitar caer a bienvenida/formulario.
        if (viewingComandaId && activeComanda === undefined) {
          return (
            <Center style={{ height: '100%' }}>
              <Loader color="orange" size="lg" type="dots" />
            </Center>
          );
        }

        // 3. Si no hay mesa seleccionada -> Bienvenida
        if (!selectedMesaEffective) {
          return (
            <SidebarWelcome 
              onOpenConfig={() => setConfigView('pisos')} 
            />
          );
        }

        // 3a. Las habitaciones siempre usan su vista especializada (a menos que estemos viendo una comanda específica).
        // Si tienen comandas vinculadas, se muestran como cargos dentro de la cuenta.
        if (isHabitacion && !viewingComandaId) {
          return (
            <SidebarHabitacionCuenta
              selectedMesa={selectedMesaEffective}
              onClose={onClose}
            />
          );
        }

        // 4. Vista de Cobro (Checkout Directo o Dividido)
        if (checkoutView && activeComanda) {
          if (checkoutType === 'dividido') {
            return (
            <SidebarSplit 
                selectedMesa={selectedMesaEffective}
                activeComanda={activeComanda}
                comandaItems={comandaItems}
                onBack={() => setCheckoutView(false)}
                onSuccess={() => {
                  setCheckoutView(false);
                  onClose();
                }}
              />
            );
          }

          return (
            <SidebarCheckout 
              selectedMesa={selectedMesaEffective}
              activeComanda={activeComanda}
              comandaItems={comandaItems}
              initialType={checkoutType}
              startInEnviarHabitacion={checkoutMode === 'enviar_habitacion'}
              onBack={() => setCheckoutView(false)}
              onSuccess={() => {
                setCheckoutView(false);
                onClose();
              }}
            />
          );
        }

        // Si se está cargando la comanda de la base de datos, evitar flasheo de mesa libre
        if (activeComanda === undefined) {
          return (
            <Center style={{ height: '100%' }}>
              <Loader color="orange" size="lg" type="dots" />
            </Center>
          );
        }

        // 4. Si hay una comanda activa o estamos viendo una histórica -> Detalles o Visor de Recibo
        if (activeComanda) {
          const isReadOnly = activeComanda.estado === 'cerrado' ||
                             activeComanda.estado === 'facturado' ||
                             activeComanda.estado === 'anulada' ||
                             (!!activeComanda.habitacion_cuenta_id && activeComanda.sincronizado !== false);
          if (isReadOnly) {
            return (
            <SidebarReceiptViewer
                selectedMesa={selectedMesaEffective}
                activeComanda={activeComanda}
                comandaItems={comandaItems}
                onClose={onClose}
                onAction={handleActionOverride}
              />
            );
          }

          return (
            <SidebarDetails 
              selectedMesa={selectedMesaEffective}
              activeComanda={activeComanda}
              comandaItems={comandaItems}
              onClose={onClose}
              onAddProduct={() => onAction(selectedMesaEffective, 'add_product')}
              onAction={handleActionOverride}
            />
          );
        }

        // 5. Si la mesa está libre -> Formulario de Apertura
        return (
          <SidebarOpenTable 
            selectedMesa={selectedMesaEffective}
            customerName={customerName}
            setCustomerName={setCustomerName}
            guestCount={guestCount}
            setGuestCount={setGuestCount}
            openLinkMode={openLinkMode}
            setOpenLinkMode={setOpenLinkMode}
            selectedHabitacionId={selectedHabitacionId}
            setSelectedHabitacionId={setSelectedHabitacionId}
            onClose={onClose}
            onOpenTable={() => {
              const matchedClient = allClientes.find(c => c.nombre.trim().toLowerCase() === customerName.trim().toLowerCase());
              const resolvedId = matchedClient ? matchedClient.id : '';
              // Protocolo: abrir:<base64-json> o formato legado abrir:nombre:comensales:clienteId:habitacionCuentaId
              const habitacionCuentaId = openLinkMode === 'habitacion' ? (selectedHabitacionId || '') : '';
              const payload = btoa(JSON.stringify({
                customerName,
                guestCount,
                clientId: resolvedId,
                habitacionCuentaId,
              }));
              onAction(selectedMesaEffective, `abrir:${payload}`);
            }}
          />
        );
      })()}

      {/* El modal ha sido eliminado y reemplazado por la vista interna del sidebar */}
    </Box>
  );
}

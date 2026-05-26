// @ts-nocheck
import { useState, useEffect } from 'react';
import {
  AppShell, Box, Modal, Stack, Text, Group, Button, useMantineTheme, TextInput
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useLocation } from 'react-router-dom';

import { MainSidebar } from './MainSidebar';
import { MobileSidebar } from './MobileSidebar';
import { TableSidebar } from '../Mesas/TableSidebar';
import { Drawer as VaulDrawer } from 'vaul';
import { useUI } from '../../context/UIContext';
import { useTableActions } from '../../hooks/useTableActions';
import { initVerticalRxDb } from '../../db/rxdb';
import Ordenes from '../../pages/Ordenes';
import Mesas from '../../pages/Mesas';
import Menu from '../../pages/Menu';
import Reservas from '../../pages/Reservas';
import Clientes from '../../pages/Clientes';
import Ajustes from '../../pages/Ajustes';

export function AppLayout() {
  const theme = useMantineTheme();
  const sidebarBg = (theme.other as any).sidebarBg as string;
  const isMobile = useMediaQuery('(max-width: 768px)');
  const location = useLocation();
  const {
    isPinned, setIsPinned,
    selectedMesaId, setSelectedMesaId,
    configView, setConfigView,
    selectedConfigPiso, setSelectedConfigPiso,
    mesaView, setMesaView,
    confirmModal, closeConfirm,
    promptModal, closePrompt,
    setCheckoutView, setViewingComandaId, menuView, setMenuView,
    setSelectedMenuProductId,
    reservaView, setReservaView, setSelectedReservaId,
    reservaProductosComandaId,
    selectedMesaEsHabitacion,
  } = useUI();
  const { handleTableAction } = useTableActions();
  const [promptValue, setPromptValue] = useState('');

  useEffect(() => {
    if (promptModal.opened) {
      setPromptValue(promptModal.defaultValue || '');
    }
  }, [promptModal.opened, promptModal.defaultValue]);

  const isMesasPage = location.pathname === '/mesas';
  const currentPath = location.pathname === '/' ? '/ordenes' : location.pathname;
  const [selectedMesa, setSelectedMesa] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      if (!(isMesasPage || selectedMesaId)) {
        if (alive) setSelectedMesa(null);
        return;
      }
      const rxDb = await initVerticalRxDb();
      if (!selectedMesaId) {
        if (alive) setSelectedMesa(null);
        return;
      }
      sub = rxDb.mesas.findOne(selectedMesaId).$.subscribe((doc: any) => {
        if (!alive) return;
        setSelectedMesa(doc ? doc.toJSON() : null);
      });
    })().catch(() => {});
    return () => {
      alive = false;
      sub?.unsubscribe();
    };
  }, [isMesasPage, selectedMesaId]);

  const isSidebarVisible = !isMobile && (
    isPinned ||
    selectedMesaId !== null ||
    configView !== 'none' ||
    reservaView !== 'none' ||
    menuView !== 'none'
  );

  return (
    <AppShell
      layout="alt"
      header={{ height: 0 }}
      navbar={{
        width: 80, // Optimizado de 90 a 80 para maximizar espacio horizontal
        breakpoint: 'sm',
        collapsed: { mobile: true }
      }}
      aside={{
        width: 400, // Reducido un 5% adicional (de 420 a 400) para optimizar tablets
        breakpoint: 'sm',
        collapsed: { mobile: true, desktop: !isSidebarVisible }
      }}
      padding={0}
      style={{
        padding: 'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)',
        height: '100dvh',
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}
    >
      {/* Sidebar en desktop */}
      {!isMobile && (
        <AppShell.Navbar style={{ border: 'none', backgroundColor: sidebarBg, color: '#ffffff' }}>
          <MainSidebar />
        </AppShell.Navbar>
      )}

      {/* Barra de navegación inferior móvil */}
      {isMobile && <MobileSidebar />}

      <AppShell.Main bg="var(--pos-bg)" style={{ height: '100%' }}>
        <Box style={{ height: '100%', overflow: 'hidden', position: 'relative' }}>
          <Box style={{ display: currentPath === '/ordenes' ? 'block' : 'none', height: '100%' }}><Ordenes /></Box>
          <Box style={{ display: currentPath === '/mesas' ? 'block' : 'none', height: '100%' }}><Mesas /></Box>
          <Box style={{ display: currentPath === '/reservas' ? 'block' : 'none', height: '100%' }}><Reservas /></Box>
          <Box style={{ display: currentPath === '/menu' ? 'block' : 'none', height: '100%' }}><Menu /></Box>
          <Box style={{ display: currentPath === '/clientes' ? 'block' : 'none', height: '100%' }}><Clientes /></Box>
          <Box style={{ display: currentPath.startsWith('/ajustes') ? 'block' : 'none', height: '100%' }}><Ajustes /></Box>

        </Box>
      </AppShell.Main>

      {/* SIDEBAR DERECHO GLOBAL (Desktop) */}
      {!isMobile && (
        <AppShell.Aside
          style={{
            border: 'none',
            borderLeft: '1px solid var(--pos-border)',
            boxShadow: '-12px 0 40px rgba(0, 0, 0, 0.1), -4px 0 12px rgba(0, 0, 0, 0.05)',
            backgroundColor: 'white',
            overflow: 'visible',
          }}
        >
          {isSidebarVisible && (
            <TableSidebar
              selectedMesa={selectedMesa}
              onClose={() => {
                setSelectedMesaId(null);
                setViewingComandaId(null);
                setReservaView('none');
                setSelectedReservaId(null);
              }}
              onAction={(mesa, action) => handleTableAction(mesa, action, (res) => {
                if (res === 'productos') {
                  setMesaView('productos');
                } else if (res === 'mapa') {
                  setSelectedMesaId(null);
                  setViewingComandaId(null);
                  setMesaView('mapa');
                }
              }, setCheckoutView)}
              configView={configView}
              setConfigView={setConfigView}
              selectedConfigPiso={selectedConfigPiso}
              setSelectedConfigPiso={setSelectedConfigPiso}
              mesaEsDeHabitaciones={selectedMesaEsHabitacion}
            />
          )}
        </AppShell.Aside>
      )}

      {/* Modal de Confirmación Global */}
      <Modal
        opened={confirmModal.opened}
        onClose={closeConfirm}
        title={confirmModal.title}
        centered
        radius="lg"
        overlayProps={{ backgroundOpacity: 0.4, blur: 0 }}
        zIndex={10000}
      >
        <Stack gap="xl">
          <Text size="sm" fw={500} ta="center" mt="md">
            {confirmModal.message}
          </Text>
          <Group grow>
            <Button variant="light" color="gray" radius="md" onClick={closeConfirm}>
              Cancelar
            </Button>
            <Button color="red" radius="md" onClick={() => {
              confirmModal.onConfirm();
              closeConfirm();
            }}>
              Confirmar
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal de Entrada de Texto (Prompt) Global */}
      <Modal
        opened={promptModal.opened}
        onClose={closePrompt}
        title={<Text fw={900} size="lg">{promptModal.title}</Text>}
        centered
        radius="lg"
        overlayProps={{ backgroundOpacity: 0.4, blur: 0 }}
        zIndex={10000}
      >
        <form onSubmit={(e) => {
          e.preventDefault();
          if (promptValue.trim()) {
            promptModal.onConfirm(promptValue.trim());
            closePrompt();
          }
        }}>
          <Stack gap="md">
            <TextInput
              label={promptModal.label}
              placeholder={promptModal.placeholder}
              value={promptValue}
              onChange={(e) => setPromptValue(e.currentTarget.value)}
              radius="md"
              size="md"
              data-autofocus
            />
            <Group grow mt="xs">
              <Button variant="light" color="gray" radius="md" onClick={closePrompt}>
                Cancelar
              </Button>
              <Button color="red" radius="md" type="submit" disabled={!promptValue.trim()}>
                Confirmar
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* SIDEBAR MÓVIL (Vaul Drawer / Bottom Sheet) */}
      {isMobile && (
        <VaulDrawer.Root
          open={(selectedMesaId !== null && mesaView !== 'productos') || configView !== 'none' || menuView === 'producto' || (reservaView !== 'none' && !reservaProductosComandaId)}
          onOpenChange={(open) => {
            if (!open && !reservaProductosComandaId) {
              setSelectedMesaId(null);
              setConfigView('none');
              setViewingComandaId(null);
              setReservaView('none');
              setSelectedReservaId(null);
              setMenuView('none');
              setSelectedMenuProductId(null);
            }
          }}
        >
          <VaulDrawer.Portal>
            <VaulDrawer.Content className="vaul-content" style={{ backgroundColor: 'white' }}>
              <VaulDrawer.Title className="sr-only">Panel de mesa</VaulDrawer.Title>
              <VaulDrawer.Description className="sr-only">
                Acciones y detalles de la mesa seleccionada
              </VaulDrawer.Description>
              <div className="vaul-handle" />
              <div className="vaul-body" data-vaul-no-drag>
                <TableSidebar
                  selectedMesa={selectedMesa}
                  onClose={() => {
                    setSelectedMesaId(null);
                    setConfigView('none');
                    setViewingComandaId(null);
                    setReservaView('none');
                    setSelectedReservaId(null);
                    setMenuView('none');
                    setSelectedMenuProductId(null);
                  }}
                  onAction={(mesa, action) => handleTableAction(mesa, action, (res) => {
                    if (res === 'productos') {
                      setMesaView('productos');
                    } else if (res === 'mapa') {
                      setSelectedMesaId(null);
                      setConfigView('none');
                      setViewingComandaId(null);
                      setMesaView('mapa');
                    }
                  }, setCheckoutView)}
                  configView={configView}
                  setConfigView={setConfigView}
                  selectedConfigPiso={selectedConfigPiso}
                  setSelectedConfigPiso={setSelectedConfigPiso}
                  mesaEsDeHabitaciones={selectedMesaEsHabitacion}
                />
              </div>
            </VaulDrawer.Content>
          </VaulDrawer.Portal>
        </VaulDrawer.Root>
      )}

    </AppShell>
  );
}

import React, { createContext, useContext, useState, useEffect } from 'react';

interface UIContextType {
  isPinned: boolean;
  setIsPinned: (val: boolean) => void;
  selectedMesaId: string | null;
  setSelectedMesaId: (id: string | null) => void;
  configView: 'none' | 'pisos' | 'mesas' | 'nueva_mesa';
  setConfigView: (view: 'none' | 'pisos' | 'mesas' | 'nueva_mesa') => void;
  selectedConfigPiso: string | null;
  setSelectedConfigPiso: (piso: string | null) => void;
  mesaView: 'mapa' | 'productos';
  setMesaView: (view: 'mapa' | 'productos') => void;
  confirmModal: {
    opened: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  };
  openConfirm: (title: string, message: string, onConfirm: () => void) => void;
  closeConfirm: () => void;
  promptModal: {
    opened: boolean;
    title: string;
    label: string;
    placeholder: string;
    defaultValue?: string;
    required?: boolean;
    onConfirm: (value: string) => void;
  };
  openPrompt: (options: { title: string; label: string; placeholder: string; defaultValue?: string; required?: boolean; onConfirm: (val: string) => void }) => void;
  closePrompt: () => void;
  checkoutView: boolean;
  setCheckoutView: (val: boolean) => void;
  viewingComandaId: string | null;
  setViewingComandaId: (id: string | null) => void;
  reservaView: 'none' | 'nueva' | 'detalle';
  setReservaView: (view: 'none' | 'nueva' | 'detalle') => void;
  selectedReservaId: string | null;
  setSelectedReservaId: (id: string | null) => void;
  reservaProductosComandaId: string | null;
  setReservaProductosComandaId: (id: string | null) => void;
  nuevaReservaPreset: { fecha?: Date; zonaId?: string } | null;
  setNuevaReservaPreset: (preset: { fecha?: Date; zonaId?: string } | null) => void;
  openAssignModal: (reservaId: string) => void;
  registerAssignModal: (fn: (reservaId: string) => void) => void;
  menuView: 'none' | 'producto';
  setMenuView: (view: 'none' | 'producto') => void;
  selectedMenuProductId: string | null;
  setSelectedMenuProductId: (id: string | null) => void;
  selectedMesaEsHabitacion: boolean;
  setSelectedMesaEsHabitacion: (val: boolean) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [isPinned, setIsPinned] = useState(() => {
    return localStorage.getItem('pos_sidebar_pinned') === 'true';
  });
  const [selectedMesaId, setSelectedMesaId] = useState<string | null>(null);
  const [configView, setConfigView] = useState<'none' | 'pisos' | 'mesas' | 'nueva_mesa'>('none');
  const [selectedConfigPiso, setSelectedConfigPiso] = useState<string | null>(null);
  const [mesaView, setMesaView] = useState<'mapa' | 'productos'>('mapa');
  const [checkoutView, setCheckoutView] = useState(false);
  const [viewingComandaId, setViewingComandaId] = useState<string | null>(null);
  const [reservaView, setReservaView] = useState<'none' | 'nueva' | 'detalle'>('none');
  const [selectedReservaId, setSelectedReservaId] = useState<string | null>(null);
  const [reservaProductosComandaId, setReservaProductosComandaId] = useState<string | null>(null);
  const [nuevaReservaPreset, setNuevaReservaPreset] = useState<{ fecha?: Date; zonaId?: string } | null>(null);
  const [menuView, setMenuView] = useState<'none' | 'producto'>('none');
  const [selectedMenuProductId, setSelectedMenuProductId] = useState<string | null>(null);
  const [selectedMesaEsHabitacion, setSelectedMesaEsHabitacion] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    opened: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });

  const [promptModal, setPromptModal] = useState<{ opened: boolean; title: string; label: string; placeholder: string; defaultValue?: string; required?: boolean; onConfirm: (val: string) => void }>({
    opened: false,
    title: '',
    label: '',
    placeholder: '',
    onConfirm: () => { }
  });

  const openConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ opened: true, title, message, onConfirm });
  };

  const closeConfirm = () => {
    setConfirmModal(prev => ({ ...prev, opened: false }));
  };

  const openPrompt = (options: { title: string; label: string; placeholder: string; defaultValue?: string; required?: boolean; onConfirm: (val: string) => void }) => {
    setPromptModal({
      opened: true,
      title: options.title,
      label: options.label,
      placeholder: options.placeholder,
      defaultValue: options.defaultValue || '',
      onConfirm: options.onConfirm
    });
  };

  const closePrompt = () => {
    setPromptModal(prev => ({ ...prev, opened: false }));
  };

  const assignModalRef = React.useRef<((reservaId: string) => void) | null>(null);
  const registerAssignModal = (fn: (reservaId: string) => void) => { assignModalRef.current = fn; };
  const openAssignModal = (reservaId: string) => { assignModalRef.current?.(reservaId); };

  useEffect(() => {
    localStorage.setItem('pos_sidebar_pinned', isPinned.toString());
  }, [isPinned]);

  const contextValue = React.useMemo(() => ({
      isPinned,
      setIsPinned,
      selectedMesaId,
      setSelectedMesaId,
      configView,
      setConfigView,
      selectedConfigPiso,
      setSelectedConfigPiso,
      mesaView,
      setMesaView,
      confirmModal,
      openConfirm,
      closeConfirm,
      promptModal,
      openPrompt,
      closePrompt,
      checkoutView,
      setCheckoutView,
      viewingComandaId,
      setViewingComandaId,
      reservaView,
      setReservaView,
      selectedReservaId,
      setSelectedReservaId,
      reservaProductosComandaId,
      setReservaProductosComandaId,
      nuevaReservaPreset,
      setNuevaReservaPreset,
      openAssignModal,
      registerAssignModal,
      menuView,
      setMenuView,
      selectedMenuProductId,
      setSelectedMenuProductId,
      selectedMesaEsHabitacion,
      setSelectedMesaEsHabitacion,
  }), [
      isPinned, selectedMesaId, configView, selectedConfigPiso, mesaView, confirmModal,
      promptModal, checkoutView, viewingComandaId, reservaView, selectedReservaId,
      reservaProductosComandaId, nuevaReservaPreset, menuView, selectedMenuProductId,
      selectedMesaEsHabitacion
  ]);

  return (
    <UIContext.Provider value={contextValue}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}

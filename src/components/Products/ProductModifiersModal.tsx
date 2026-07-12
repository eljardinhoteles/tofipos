import { useState, useEffect } from 'react';
import { Modal, Stack, Text, Group, Button, Badge, rem, ScrollArea } from '@mantine/core';
import { ArrowLeftIcon, CheckIcon } from '@phosphor-icons/react';
import { useMediaQuery } from '@mantine/hooks';

interface ProductModifiersModalProps {
  opened: boolean;
  onClose: () => void;
  product: any;
  onConfirm: (selectedOptions: string[]) => void;
}

export function ProductModifiersModal({
  opened,
  onClose,
  product,
  onConfirm
}: ProductModifiersModalProps) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [selections, setSelections] = useState<{ [groupId: string]: string[] }>({});
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (opened && product) {
      const initial: { [groupId: string]: string[] } = {};
      product.modificadores?.forEach((group: any) => {
        initial[group.nombre] = [];
      });
      setSelections(initial);
      setCurrentStep(0);
    }
  }, [opened, product]);

  if (!product) return null;

  const modificadores = product.modificadores || [];
  if (modificadores.length === 0) return null;

  const currentGroup = modificadores[currentStep];
  const selectedOpts = selections[currentGroup.nombre] || [];
  const isLastStep = currentStep === modificadores.length - 1;
  const canProceed = !currentGroup.obligatorio || selectedOpts.length > 0;

  const toggle = (option: string) => {
    setSelections(prev => {
      const current = prev[currentGroup.nombre] || [];
      if (currentGroup.multi) {
        return {
          ...prev,
          [currentGroup.nombre]: current.includes(option)
            ? current.filter(o => o !== option)
            : [...current, option]
        };
      }
      return { ...prev, [currentGroup.nombre]: [option] };
    });
  };

  const handleNext = () => {
    if (!canProceed) return;
    if (!isLastStep) {
      setCurrentStep(s => s + 1);
    } else {
      const all: string[] = [];
      Object.values(selections).forEach(opts => all.push(...opts));
      onConfirm(all);
      onClose();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs" wrap="nowrap">
          <Text fw={800} size="md" truncate>{product.nombre}</Text>
          {modificadores.length > 1 && (
            <Text size="sm" c="dimmed" fw={600} style={{ flexShrink: 0 }}>
              {currentStep + 1}/{modificadores.length}
            </Text>
          )}
        </Group>
      }
      centered
      radius="xl"
      size={isMobile ? '100%' : 'sm'}
      zIndex={2000}
      styles={{
        header: { borderBottom: '1px solid var(--pos-border)', paddingBottom: rem(12) },
        body: { 
          padding: rem(16),
          ...(isMobile ? {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
          } : {}),
        },
        content: { 
          overflow: 'hidden',
          backgroundColor: 'var(--pos-bg)',
          border: '1px solid var(--pos-border)',
          ...(isMobile ? {
            height: 'calc(100dvh - 32px)',
            width: 'calc(100vw - 32px)',
            margin: '16px',
            display: 'flex',
            flexDirection: 'column',
          } : {}),
        }
      }}
    >
      <Stack gap="md" style={isMobile ? { flex: 1, minHeight: 0 } : undefined}>
        {/* Group label */}
        <Group justify="space-between" align="center" style={{ flexShrink: 0 }}>
          <Text fw={700} size="lg">{currentGroup.nombre}</Text>
          <Badge
            color={currentGroup.obligatorio ? 'red' : 'gray'}
            variant="light"
            size="sm"
            radius="sm"
          >
            {currentGroup.obligatorio ? 'Requerido' : 'Opcional'}
          </Badge>
        </Group>

        {/* Options — large tap targets */}
        <ScrollArea
          offsetScrollbars
          style={isMobile ? { flex: 1, minHeight: 0 } : { maxHeight: 300 }}
        >
          <Stack gap="xs" pb="xs">
            {currentGroup.opciones.map((option: string) => {
              const selected = selectedOpts.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggle(option)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    borderRadius: 14,
                    border: `2px solid ${selected ? 'var(--mantine-color-myColor-5)' : 'var(--pos-border)'}`,
                    backgroundColor: selected ? 'var(--mantine-color-myColor-0)' : 'white',
                    cursor: 'pointer',
                    width: '100%',
                    transition: 'border-color 0.15s, background-color 0.15s',
                    WebkitTapHighlightColor: 'transparent',
                    userSelect: 'none',
                  }}
                >
                  <Text size="md" fw={selected ? 700 : 500} c={selected ? 'blue' : 'var(--pos-text)'}>
                    {option}
                  </Text>
                  {selected && <CheckIcon size={18} weight="bold" color="var(--mantine-color-myColor-5)" />}
                </button>
              );
            })}
          </Stack>
        </ScrollArea>

        {/* Footer */}
        <Group justify="space-between" pt="xs" style={{ borderTop: '1px solid var(--pos-border)', flexShrink: 0 }}>
          <Button
            variant="subtle"
            color="gray"
            size="md"
            disabled={currentStep === 0}
            onClick={() => setCurrentStep(s => s - 1)}
            leftSection={<ArrowLeftIcon size={16} weight="bold" />}
          >
            Atrás
          </Button>

          <Button
            color={isLastStep ? 'teal' : 'blue'}
            size="md"
            fw={700}
            disabled={!canProceed}
            onClick={handleNext}
            rightSection={isLastStep ? <CheckIcon size={16} weight="bold" /> : undefined}
          >
            {isLastStep ? 'Agregar' : 'Siguiente'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

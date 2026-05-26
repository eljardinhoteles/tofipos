import React from 'react';
import toast, { Toaster as HotToaster } from 'react-hot-toast';
import { Info, Warning } from '@phosphor-icons/react';

interface ToastOptions {
  title: string;
  description?: string;
  [key: string]: any;
}

function cleanText(text?: string): string | undefined {
  if (!text) return undefined;
  // Elimina iconos al inicio y espacios sobrantes
  return text.replace(/^[✓✕✔✖ℹ⚠️]\s*/, '').trim();
}

export const sileo = {
  success: ({ title, description }: ToastOptions) => {
    const cleanTitle = cleanText(title);
    const cleanDesc = cleanText(description);
    toast.success(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
        <strong style={{ fontWeight: 600, fontSize: '13.5px' }}>{cleanTitle}</strong>
        {cleanDesc && <span style={{ fontSize: '11.5px', opacity: 0.8 }}>{cleanDesc}</span>}
      </div>
    );
  },
  error: ({ title, description }: ToastOptions) => {
    const cleanTitle = cleanText(title);
    const cleanDesc = cleanText(description);
    toast.error(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
        <strong style={{ fontWeight: 600, fontSize: '13.5px' }}>{cleanTitle}</strong>
        {cleanDesc && <span style={{ fontSize: '11.5px', opacity: 0.8 }}>{cleanDesc}</span>}
      </div>
    );
  },
  info: ({ title, description }: ToastOptions) => {
    const cleanTitle = cleanText(title);
    const cleanDesc = cleanText(description);
    toast(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
        <strong style={{ fontWeight: 600, fontSize: '13.5px' }}>{cleanTitle}</strong>
        {cleanDesc && <span style={{ fontSize: '11.5px', opacity: 0.8 }}>{cleanDesc}</span>}
      </div>,
      {
        icon: <Info size={20} weight="fill" color="#339af0" />,
      }
    );
  },
  warning: ({ title, description }: ToastOptions) => {
    const cleanTitle = cleanText(title);
    const cleanDesc = cleanText(description);
    toast(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
        <strong style={{ fontWeight: 600, fontSize: '13.5px' }}>{cleanTitle}</strong>
        {cleanDesc && <span style={{ fontSize: '11.5px', opacity: 0.8 }}>{cleanDesc}</span>}
      </div>,
      {
        icon: <Warning size={20} weight="fill" color="#fab005" />,
      }
    );
  },
};

export function Toaster({
  position,
  offset,
  options
}: {
  position?: any;
  offset?: number | { bottom: number; left: number };
  options?: any;
  theme?: string;
}) {
  const containerStyle: React.CSSProperties = {
    zIndex: 999999,
  };
  if (offset) {
    if (typeof offset === 'number') {
      containerStyle.top = offset;
      containerStyle.bottom = offset;
    } else {
      if (offset.bottom !== undefined) containerStyle.bottom = offset.bottom;
      if (offset.left !== undefined) containerStyle.left = offset.left;
    }
  }

  const bg = options?.fill || '#1a1f16';

  return (
    <HotToaster
      position={position || 'bottom-left'}
      containerStyle={containerStyle}
      toastOptions={{
        duration: 4000,
        style: {
          background: bg,
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '10px 14px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
          fontSize: '14px',
          maxWidth: '350px',
        },
        success: {
          iconTheme: {
            primary: '#51cf66',
            secondary: bg,
          },
        },
        error: {
          iconTheme: {
            primary: '#ff6b6b',
            secondary: bg,
          },
        },
      }}
    />
  );
}

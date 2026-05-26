if (typeof window !== 'undefined') {
  if (!window.crypto) {
    (window as any).crypto = {} as any;
  }
  if (!window.crypto.subtle) {
    const sha256Buffer = (buffer: ArrayBuffer): ArrayBuffer => {
      const uint8 = new Uint8Array(buffer);
      const h = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
      ];
      const k = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
      ];

      const len = uint8.length;
      const wordCount = ((len + 8) >> 6) + 1 << 4;
      const words = new Int32Array(wordCount);

      for (let i = 0; i < len; i++) {
        words[i >> 2] |= uint8[i] << (24 - (i & 3) * 8);
      }
      words[len >> 2] |= 0x80 << (24 - (len & 3) * 8);
      words[wordCount - 1] = len * 8;

      const w = new Int32Array(64);

      for (let i = 0; i < wordCount; i += 16) {
        let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], _h = h[7];

        for (let j = 0; j < 64; j++) {
          if (j < 16) {
            w[j] = words[i + j];
          } else {
            const s0 = (w[j - 15] >>> 7 | w[j - 15] << 25) ^ (w[j - 15] >>> 18 | w[j - 15] << 14) ^ (w[j - 15] >>> 3);
            const s1 = (w[j - 2] >>> 17 | w[j - 2] << 15) ^ (w[j - 2] >>> 19 | w[j - 2] << 13) ^ (w[j - 2] >>> 10);
            w[j] = w[j - 16] + s0 + w[j - 7] + s1 | 0;
          }

          const s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
          const maj = (a & b) ^ (a & c) ^ (b & c);
          const t2 = s0 + maj | 0;
          const s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
          const ch = (e & f) ^ (~e & g);
          const t1 = _h + s1 + ch + k[j] + w[j] | 0;

          _h = g;
          g = f;
          f = e;
          e = d + t1 | 0;
          d = c;
          c = b;
          b = a;
          a = t1 + t2 | 0;
        }

        h[0] = h[0] + a | 0;
        h[1] = h[1] + b | 0;
        h[2] = h[2] + c | 0;
        h[3] = h[3] + d | 0;
        h[4] = h[4] + e | 0;
        h[5] = h[5] + f | 0;
        h[6] = h[6] + g | 0;
        h[7] = h[7] + _h | 0;
      }

      const result = new Uint8Array(32);
      for (let i = 0; i < 8; i++) {
        result[i * 4] = h[i] >>> 24;
        result[i * 4 + 1] = h[i] >>> 16 & 0xff;
        result[i * 4 + 2] = h[i] >>> 8 & 0xff;
        result[i * 4 + 3] = h[i] & 0xff;
      }
      return result.buffer;
    };

    (window.crypto as any).subtle = {
      digest: async function (algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer> {
        if (algorithm === 'SHA-256') {
          return sha256Buffer(data);
        }
        throw new Error('Algorithm not supported by polyfill: ' + algorithm);
      }
    };
    console.warn('Web Crypto API (crypto.subtle) ha sido polifilleado para contextos no seguros.');
  }
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme, rem, type MantineColorsTuple } from '@mantine/core';
import App from './App';
import { UIProvider } from './context/UIContext';
import { AuthProvider } from './context/AuthContext';
import './index.css';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import { diagnoseSyncState } from './db/rxdb';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

(window as any).__diagnosSync = diagnoseSyncState;

// =============================================================
// TEMA POS — Verde Follaje (sobrio / natural) + Sidebar Oscuro
// =============================================================

// ── Color principal: verde follaje ───────────────────────────
// Escala desaturada hacia el oliva. El shade 6 es el principal.
// La clave se mantiene como 'myColor' a propósito, para que todos
// los componentes existentes (color="myColor") sigan funcionando.
const myColor: MantineColorsTuple = [
  '#f4f6ef', //  0 — fondos muy claros, cards
  '#e7ebdf', //  1 — fondos alternos, hover sutil
  '#ced7bf', //  2 — bordes, divisores
  '#b3c19c', //  3 — elementos deshabilitados
  '#9cae80', //  4 — acentos claros, badges
  '#8ba06c', //  5 — paso antes del principal
  '#7e955d', //  6 — PRINCIPAL (light)
  '#6b8049', //  7 — PRINCIPAL (dark) / hover
  '#586a3c', //  8 — active / pressed
  '#3b4729', //  9 — verde muy oscuro: texto, sidebar
];

// ── Neutro cálido complementario ─────────────────────────────
// Grises con matiz tierra para que no choquen con el verde.
const tierra: MantineColorsTuple = [
  '#f7f6f3', //  0
  '#eceae5', //  1
  '#d8d4cb', //  2
  '#c2bcae', //  3
  '#aea693', //  4
  '#9c9381', //  5
  '#8a8170', //  6
  '#6f6759', //  7
  '#544e44', //  8
  '#33302a', //  9
];

const posTheme = createTheme({
  // ── Tipografía Nativa (Máximo rendimiento) ──────────────────
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
  headings: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontWeight: '800',
    sizes: {
      h1: { fontSize: rem(26), lineHeight: '1.2' },
      h2: { fontSize: rem(20), lineHeight: '1.3' },
      h3: { fontSize: rem(17), lineHeight: '1.4' },
    },
  },
  fontSizes: {
    xs: rem(12),
    sm: rem(14),
    md: rem(15),
    lg: rem(17),
    xl: rem(20),
  },

  // ── Paleta brand ──────────────────────────────────────────
  colors: { myColor, tierra },
  primaryColor: 'myColor',
  primaryShade: { light: 6, dark: 7 },
  black: '#080a06',
  white: '#fbfaf7',

  // Colores del sistema de estados + tokens de superficie.
  // Todo lo aquí definido se expone como variable CSS más abajo.
  other: {
    // Estados de mesa / orden
    statusFree: '#94a3b8',
    statusReserved: '#ca8a04',
    statusActive: '#15803d',
    statusClosed: '#b91c1c',
    // Sidebar
    sidebarBg: myColor[9],
    sidebarItem: myColor[8],
    // Superficie general
    posBg: '#f4f6ef',
    posSurface: '#ffffff',
    posBorder: '#e7ebdf',
    posText: '#33302a',
  },

  // ── Radios ────────────────────────────────────────────────
  defaultRadius: 'md',
  radius: {
    xs: rem(4),
    sm: rem(8),
    md: rem(10),
    lg: rem(14),
    xl: rem(20),
  },

  // ── Espaciado ─────────────────────────────────────────────
  spacing: {
    xs: rem(8),
    sm: rem(12),
    md: rem(16),
    lg: rem(24),
    xl: rem(32),
  },

  // ==========================================================
  // COMPONENTES — Reglas táctiles aplicadas globalmente
  // ==========================================================
  components: {

    // ── Button ────────────────────────────────────────────────
    Button: {
      defaultProps: {
        size: 'md',
        radius: 'md',
        variant: 'filled',
      },
      vars: (_theme: any, props: any) => {
        const sizes: Record<string, Record<string, string>> = {
          sm: { '--button-height': rem(40), '--button-padding-x': rem(16), '--button-fz': rem(14) },
          md: { '--button-height': rem(48), '--button-padding-x': rem(22), '--button-fz': rem(15) },
          lg: { '--button-height': rem(56), '--button-padding-x': rem(28), '--button-fz': rem(16) },
          xl: { '--button-height': rem(64), '--button-padding-x': rem(36), '--button-fz': rem(17) },
        };
        return { root: sizes[props.size ?? 'md'] ?? sizes.md };
      },
      styles: {
        root: { fontWeight: '700' },
      },
    },

    // ── ActionIcon ────────────────────────────────────────────
    ActionIcon: {
      defaultProps: { size: 'xl', radius: 'md', variant: 'subtle' },
      vars: (_theme: any, props: any) => ({
        root: {
          '--ai-size': props.size === 'xl' ? rem(48)
            : props.size === 'lg' ? rem(42)
              : rem(36),
        },
      }),
    },

    // ── TextInput ─────────────────────────────────────────────
    TextInput: {
      defaultProps: { size: 'md', radius: 'md' },
      vars: () => ({
        root: { '--input-height': rem(52), '--input-fz': rem(15) },
      }),
      styles: {
        label: { fontWeight: '600', fontSize: rem(13), marginBottom: rem(6), color: 'var(--ui-text-muted)' },
        input: {
          border: '1.5px solid var(--ui-border)',
          backgroundColor: 'var(--ui-surface)',
          color: 'var(--ui-text)',
          fontWeight: '500',
          '&::placeholder': { color: 'var(--ui-text-subtle)' },
          '&:focus': { borderColor: 'var(--ui-primary)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--ui-primary), transparent 88%)' },
        },
      },
    },

    // ── NumberInput ───────────────────────────────────────────
    NumberInput: {
      defaultProps: { size: 'md', radius: 'md' },
      vars: () => ({
        root: { '--input-height': rem(52), '--input-fz': rem(15) },
      }),
      styles: {
        label: { fontWeight: '600', fontSize: rem(13), marginBottom: rem(6), color: 'var(--ui-text-muted)' },
        input: {
          border: '1.5px solid var(--ui-border)',
          backgroundColor: 'var(--ui-surface)',
          color: 'var(--ui-text)',
          fontWeight: '500',
          '&:focus': { borderColor: 'var(--ui-primary)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--ui-primary), transparent 88%)' },
        },
        control: { '&:hover': { background: 'var(--ui-surface-muted)' } },
      },
    },

    // ── Select ────────────────────────────────────────────────
    Select: {
      defaultProps: { size: 'md', radius: 'md' },
      vars: () => ({
        root: { '--input-height': rem(52), '--input-fz': rem(15) },
      }),
      styles: {
        label: { fontWeight: '600', fontSize: rem(13), marginBottom: rem(6), color: 'var(--ui-text-muted)' },
        input: {
          border: '1.5px solid var(--ui-border)',
          backgroundColor: 'var(--ui-surface)',
          color: 'var(--ui-text)',
          fontWeight: '500',
          '&:focus': { borderColor: 'var(--ui-primary)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--ui-primary), transparent 88%)' },
        },
        option: { padding: `${rem(12)} ${rem(14)}`, fontSize: rem(14), minHeight: rem(44) },
        dropdown: { border: '1px solid var(--ui-border)', boxShadow: 'var(--ui-shadow-md)' },
      },
    },

    // ── Autocomplete ──────────────────────────────────────────
    Autocomplete: {
      defaultProps: { size: 'md', radius: 'md' },
      vars: () => ({
        root: { '--input-height': rem(52), '--input-fz': rem(15) },
      }),
      styles: {
        label: { fontWeight: '600', fontSize: rem(13), marginBottom: rem(6), color: 'var(--ui-text-muted)' },
        input: {
          border: '1.5px solid var(--ui-border)',
          backgroundColor: 'var(--ui-surface)',
          color: 'var(--ui-text)',
          fontWeight: '500',
          '&::placeholder': { color: 'var(--ui-text-subtle)' },
          '&:focus': { borderColor: 'var(--ui-primary)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--ui-primary), transparent 88%)' },
        },
        option: { padding: `${rem(12)} ${rem(14)}`, fontSize: rem(14), minHeight: rem(44) },
        dropdown: { border: '1px solid var(--ui-border)', boxShadow: 'var(--ui-shadow-md)' },
      },
    },

    // ── Textarea ──────────────────────────────────────────────
    Textarea: {
      defaultProps: { size: 'md', radius: 'md', minRows: 3 },
      vars: () => ({ root: { '--input-fz': rem(15) } }),
      styles: {
        label: { fontWeight: '600', fontSize: rem(13), marginBottom: rem(6), color: 'var(--ui-text-muted)' },
        input: {
          border: '1.5px solid var(--ui-border)',
          backgroundColor: 'var(--ui-surface)',
          color: 'var(--ui-text)',
          fontWeight: '500',
          '&::placeholder': { color: 'var(--ui-text-subtle)' },
          '&:focus': { borderColor: 'var(--ui-primary)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--ui-primary), transparent 88%)' },
        },
      },
    },

    // ── Badge ─────────────────────────────────────────────────
    Badge: {
      defaultProps: { size: 'lg', radius: 'sm', variant: 'light' },
      styles: {
        root: { fontWeight: '700', letterSpacing: rem(0.2) },
        label: { fontSize: rem(12) },
      },
    },

    // ── Card ──────────────────────────────────────────────────
    Card: {
      defaultProps: { padding: 'lg', radius: 'lg', withBorder: true },
      styles: {
        root: {
          backgroundColor: 'var(--pos-surface)',
          borderColor: 'var(--ui-border)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        },
      },
    },

    // ── AppShell ──────────────────────────────────────────────
    AppShell: {
      styles: {
        main: {
          backgroundColor: 'var(--pos-bg)',
        },
        header: {
          backgroundColor: 'var(--pos-surface)',
          borderBottom: '1.5px solid var(--pos-border)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        },
        navbar: {
          backgroundColor: 'var(--sidebar-bg)',
          borderRight: 'none',
        },
      },
    },

    // ── Paper / Card ──────────────────────────────────────────
    Paper: {
      defaultProps: {
        radius: 'md',
        shadow: 'xs',
      },
    },

    // ── Title ─────────────────────────────────────────────────
    Title: {
      styles: {
        root: {
          color: 'var(--pos-text)',
        },
      },
    },

    // ── Table ─────────────────────────────────────────────────
    Table: {
      defaultProps: {
        verticalSpacing: 'md',
        horizontalSpacing: 'lg',
        highlightOnHover: true,
      },
      styles: {
        th: {
          fontSize: rem(11),
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: rem(0.7),
          color: '#9ca3af',
          paddingTop: rem(14),
          paddingBottom: rem(14),
          borderBottom: '2px solid #f3f4f6',
          whiteSpace: 'nowrap',
        },
        td: {
          fontSize: rem(14),
          paddingTop: rem(15),
          paddingBottom: rem(15),
          color: '#374151',
          borderBottom: '1px solid #f9fafb',
        },
      },
    },

    // ── Menu ──────────────────────────────────────────────────
    Menu: {
      defaultProps: { shadow: 'xl', radius: 'lg', offset: 8 },
      styles: {
        dropdown: {
          border: '1px solid #e2e8f0',
          boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
        },
        item: {
          fontSize: rem(14),
          fontWeight: '500',
          padding: `${rem(11)} ${rem(14)}`,
          minHeight: rem(46),
          color: '#374151',
        },
        label: {
          fontSize: rem(11),
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: rem(0.8),
          color: '#9ca3af',
        },
      },
    },

    // ── Modal ─────────────────────────────────────────────────
    Modal: {
      defaultProps: { radius: 'xl', centered: true, overlayProps: { color: '#000000', backgroundOpacity: 0.6 } },
      styles: {
        title: { fontWeight: '800', fontSize: rem(18) },
        header: { borderBottom: '1px solid #f3f4f6', paddingBottom: rem(16) },
        body: { paddingTop: rem(20) },
      },
    },

    // ── Tabs ──────────────────────────────────────────────────
    Tabs: {
      defaultProps: { variant: 'default' },
      styles: {
        tab: {
          fontSize: rem(14),
          fontWeight: '600',
          paddingTop: rem(14),
          paddingBottom: rem(14),
          paddingLeft: rem(20),
          paddingRight: rem(20),
          minHeight: rem(50),
          color: '#6b7280',
          // Antes: azul #2563eb. Ahora usa el verde de marca.
          '&[data-active]': { color: 'var(--ui-primary)', fontWeight: '700' },
        },
        list: { borderBottom: '2px solid #f3f4f6' },
      },
    },

    // ── SegmentedControl ──────────────────────────────────────
    SegmentedControl: {
      defaultProps: { radius: 'md', size: 'md' },
      vars: () => ({ root: { '--sc-height': rem(44) } }),
      styles: {
        label: { fontSize: rem(13), fontWeight: '600', padding: `${rem(10)} ${rem(18)}` },
      },
    },

    // ── Checkbox ──────────────────────────────────────────────
    Checkbox: {
      defaultProps: { size: 'md', radius: 'sm' },
      styles: {
        body: { alignItems: 'center' },
        label: { fontSize: rem(14), fontWeight: '500', paddingLeft: rem(10), cursor: 'pointer' },
        inner: { width: rem(20), height: rem(20) },
      },
    },

    // ── Switch ────────────────────────────────────────────────
    Switch: {
      defaultProps: { size: 'lg' },
      styles: {
        label: { fontSize: rem(14), fontWeight: '500' },
      },
    },

    // ── Tooltip ───────────────────────────────────────────────
    Tooltip: {
      defaultProps: { withArrow: true, arrowSize: 6 },
      styles: {
        tooltip: {
          fontSize: rem(12),
          fontWeight: '600',
          padding: `${rem(6)} ${rem(10)}`,
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <MantineProvider
        theme={posTheme}
        defaultColorScheme="light"
        cssVariablesResolver={(theme) => {
          const o = theme.other as any;
          return {
            variables: {
              // Sidebar
              '--sidebar-bg': o.sidebarBg,
              '--sidebar-item': o.sidebarItem,
              '--pos-sidebar-bg': o.sidebarBg,
              '--pos-sidebar-item': o.sidebarItem,
              '--pos-sidebar-txt': 'rgba(255, 255, 255, 0.78)',
              '--pos-sidebar-atxt': '#ffffff',

              // Superficie POS (usadas por AppShell, Title, Card)
              '--pos-bg': o.posBg,
              '--pos-surface': o.posSurface,
              '--pos-border': o.posBorder,
              '--pos-text': o.posText,

              // Tokens UI (usados por inputs, Tabs, etc.)
              '--ui-primary': theme.colors.myColor[6],
              '--ui-border': o.posBorder,
              '--ui-surface': o.posSurface,
              '--ui-surface-muted': theme.colors.myColor[0],
              '--ui-text': o.posText,
              '--ui-text-muted': theme.colors.tierra[7],
              '--ui-text-subtle': theme.colors.tierra[5],
              '--ui-shadow-md': '0 4px 16px rgba(0,0,0,0.08)',

              // Estados de mesa / orden
              '--status-free': o.statusFree,
              '--status-reserved': o.statusReserved,
              '--status-active': o.statusActive,
              '--status-closed': o.statusClosed,
            },
            light: {},
            dark: {},
          };
        }}
      >
        <UIProvider>
          <App />
        </UIProvider>
      </MantineProvider>
    </AuthProvider>
  </React.StrictMode>,
);

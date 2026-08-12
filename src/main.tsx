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
  }
}

if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  (crypto as any).randomUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { UIProvider } from './context/UIContext';
import { AuthProvider } from './context/AuthContext';
import './index.css';
import { diagnoseSyncState } from './db/rxdb';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

(window as any).__diagnosSync = diagnoseSyncState;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <UIProvider>
        <App />
      </UIProvider>
    </AuthProvider>
  </React.StrictMode>,
);

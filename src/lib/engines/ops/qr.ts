/**
 * QR engine — `qr-code-generator`.
 *
 * Its own chunk, so the encoder is only downloaded by visitors who open the QR
 * tool. `QRCode.toDataURL` draws into a buffer internally and returns a PNG data
 * URL, so it needs neither a canvas element nor a network.
 *
 * The data URL is turned into a Blob by decoding the Base64 by hand. `fetch` on
 * a `data:` URL would work in most browsers, but it is a network-shaped call for
 * something that never leaves the tab, and it is not available everywhere a Blob
 * constructor is.
 */

import * as QRCode from 'qrcode';

import { formatBytes, formatNumber } from '@/lib/format';

import type { ControlValues, Diagnostic, TextResult } from '../types';

function controlText(values: ControlValues, id: string, fallback: string): string {
  const value = values[id];
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function controlNumber(values: ControlValues, id: string, fallback: number): number {
  const value = values[id];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function controlBool(values: ControlValues, id: string, fallback: boolean): boolean {
  const value = values[id];
  if (typeof value === 'boolean') return value;
  if (value === 'yes' || value === 'true') return true;
  if (value === 'no' || value === 'false') return false;
  return fallback;
}

const ERROR_LEVELS: Record<string, { level: 'L' | 'M' | 'Q' | 'H'; label: string; recovery: string }> = {
  L: { level: 'L', label: 'Low — 7%', recovery: 'Smallest code, and the least tolerant of damage. Fine for a screen, poor for a sticker.' },
  M: { level: 'M', label: 'Medium — 15%', recovery: 'The usual choice. A quarter of the symbol can be obscured and it still reads.' },
  Q: { level: 'Q', label: 'Quartile — 25%', recovery: 'Good for printing on something that may get scuffed.' },
  H: { level: 'H', label: 'High — 30%', recovery: 'A logo in the middle, or a code that has to survive a trip through a postbox.' },
};

/**
 * The same four levels spelled out. Both spellings are accepted, so a control
 * offering “high” and one offering “H” drive the same thing rather than the
 * second silently falling back to the default.
 */
const ERROR_LEVEL_BY_NAME: Record<string, keyof typeof ERROR_LEVELS> = {
  low: 'L',
  medium: 'M',
  quartile: 'Q',
  high: 'H',
};

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return new Blob([dataUrl], { type: 'image/png' });
  const header = dataUrl.slice(5, comma);
  const type = header.split(';')[0] || 'image/png';
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Rough capacity figures in characters, for the byte-mode payload. */
function capacityNote(levels: 'L' | 'M' | 'Q' | 'H', characters: number): string {
  const ceilings: Record<'L' | 'M' | 'Q' | 'H', number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };
  const ceiling = ceilings[levels];
  if (characters <= ceiling) {
    const used = Math.round((characters / ceiling) * 100);
    return `Byte mode, ${used}% of the ${formatNumber(ceiling)}-character ceiling for this correction level.`;
  }
  return `That is ${formatNumber(characters)} characters, over the ${formatNumber(ceiling)}-character ceiling for this correction level, so a higher version was needed. Past about 2,900 characters even level L needs a version 40 symbol, which is a very dense square.`;
}

async function qrCodeGenerator(input: string, values: ControlValues): Promise<TextResult> {
  const source = input.trim();
  if (source === '') {
    return {
      output: '',
      diagnostics: [
        {
          level: 'warn',
          message: 'Nothing to encode yet. Type or paste a link, a Wi-Fi detail, a vCard or any text — the code is drawn in this tab and never sent anywhere.',
        },
      ],
    };
  }

  const size = Math.max(96, Math.min(2048, Math.round(controlNumber(values, 'size', 320))));
  const margin = Math.max(0, Math.min(16, Math.round(controlNumber(values, 'margin', 2))));
  // The quiet zone can be switched off entirely, and the error level is accepted
  // either as a letter or as a word, so both spellings of the control work.
  const marginSwitch = values.includeMargin;
  const quietZone = marginSwitch === undefined || controlBool(values, 'includeMargin', true) ? margin : 0;
  const requested = controlText(values, 'errorLevel', 'M');
  const chosen = ERROR_LEVELS[requested] ?? ERROR_LEVELS[ERROR_LEVEL_BY_NAME[requested.toLowerCase()]] ?? ERROR_LEVELS.M;
  const dark = controlText(values, 'dark', '#0F172A');
  const light = controlText(values, 'light', '#FFFFFF');

  let dataUrl: string;
  try {
    dataUrl = await QRCode.toDataURL(source, {
      errorCorrectionLevel: chosen.level,
      margin: quietZone,
      width: size,
      color: { dark, light },
      type: 'image/png',
    });
  } catch (error) {
    return {
      output: '',
      diagnostics: [
        {
          level: 'error',
          message: `The QR code could not be generated: ${error instanceof Error ? error.message : String(error)}. A very long payload, or characters the encoder cannot represent, is the usual cause.`,
        },
      ],
    };
  }

  const blob = dataUrlToBlob(dataUrl);
  const diagnostics: Diagnostic[] = [
    { level: 'ok', message: `Drawn in this tab by the qrcode library. The encoded text was not transmitted, cached or logged, and it is not sent anywhere when you download the PNG.` },
    { level: 'ok', message: chosen.recovery },
  ];

  if (quietZone < 2) {
    diagnostics.push({
      level: 'warn',
      message:
        quietZone === 0
          ? 'The quiet zone is switched off. The specification asks for four modules of clear space around the code, and many scanners refuse a code with none, so turn it back on unless something else is adding the border.'
          : 'The quiet zone is smaller than two modules. The specification asks for four, and many scanners refuse a code with less, so leave it at the default unless you know the reader is a fixed camera.',
    });
  }
  if (/^#[0-9a-f]{6}$/i.test(dark) && /^#[0-9a-f]{6}$/i.test(light)) {
    const contrast = contrastBetween(dark, light);
    if (contrast < 4) {
      diagnostics.push({
        level: 'warn',
        message: `The dark and light colours have a contrast ratio of about ${contrast.toFixed(1)}:1. Scanners need a strong difference, and most fail below about 3:1.`,
      });
    }
  }
  if (source.startsWith('http://')) {
    diagnostics.push({ level: 'warn', message: 'This is an http:// link, not https://. Many phone cameras still refuse to open it, because the page it opens would not be secure.' });
  }
  if (new TextEncoder().encode(source).length > 2953) {
    diagnostics.push({ level: 'warn', message: 'That is a long payload. A dense code needs a large, high-contrast print to be reliable, and a phone has to be close enough to fill the frame with it.' });
  }

  return {
    output: dataUrl,
    meta: [
      { label: 'Image', value: `${size} × ${size} px, PNG, ${formatBytes(blob.size)}` },
      { label: 'Error correction', value: chosen.label },
      { label: 'Quiet zone', value: `${quietZone} module${quietZone === 1 ? '' : 's'}` },
      { label: 'Encoded', value: `${formatNumber(source.length)} characters / ${formatNumber(new TextEncoder().encode(source).length)} bytes` },
      { label: 'Capacity', value: capacityNote(chosen.level, source.length) },
    ],
    diagnostics,
    download: { name: 'furtu-qr-code.png', blob },
  };
}

function contrastBetween(hexA: string, hexB: string): number {
  const luminance = (hex: string): number => {
    const digits = hex.slice(1);
    const channel = (value: number): number => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * channel(Number.parseInt(digits.slice(0, 2), 16)) +
      0.7152 * channel(Number.parseInt(digits.slice(2, 4), 16)) +
      0.0722 * channel(Number.parseInt(digits.slice(4, 6), 16))
    );
  };
  const a = luminance(hexA);
  const b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

import type { EngineChunk, TextOpMap } from '../types';

const text: TextOpMap = {
  'qr-code-generator': qrCodeGenerator,
};

export default { text } satisfies EngineChunk;

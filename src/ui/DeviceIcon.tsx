import type { ReactNode } from 'react';
import type { GamepadFamily, InputDeviceInfo } from '../game/input';

type DeviceGlyph = 'keyboard' | GamepadFamily;

/** Color de marca aclarado para que se lea sobre el fondo oscuro. */
const GLYPH_COLOR: Record<DeviceGlyph, string> = {
  keyboard: '#7ac74c',
  xbox: '#7ac74c',
  playstation: '#5c9dff',
  nintendo: '#ff5f63',
  generic: '#93a4ba'
};

const GLYPHS: Record<DeviceGlyph, ReactNode> = {
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.6" />
      <path d="M6.2 10h.01M9.4 10h.01M12.6 10h.01M15.8 10h.01M19 10h.01M6.2 13.8h11.6" />
    </>
  ),
  xbox: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M6.4 6.5C9.2 8.4 14.8 15.6 17.6 17.5" />
      <path d="M17.6 6.5C14.8 8.4 9.2 15.6 6.4 17.5" />
    </>
  ),
  playstation: (
    <>
      <path d="M12 4.6 14.5 8.9h-5Z" />
      <rect x="4.5" y="10.6" width="3.8" height="3.8" rx="0.5" />
      <circle cx="17.5" cy="12.5" r="2" />
      <path d="M10 16.4 14 20.4M14 16.4 10 20.4" />
    </>
  ),
  nintendo: (
    <>
      <rect x="2.6" y="3.8" width="8.4" height="16.4" rx="4.2" />
      <rect x="13" y="3.8" width="8.4" height="16.4" rx="4.2" />
      <circle cx="6.8" cy="9" r="1.45" />
      <circle cx="17.2" cy="9" r="1.45" />
    </>
  ),
  generic: (
    <>
      <rect x="2.2" y="6.8" width="19.6" height="10.4" rx="5.2" />
      <path d="M7 9.9v3.1M5.45 11.45h3.1" />
      <circle cx="16.1" cy="10.6" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="17.9" cy="13.2" r="0.85" fill="currentColor" stroke="none" />
    </>
  )
};

interface DeviceIconProps {
  kind: InputDeviceInfo['kind'];
  family?: GamepadFamily | null;
  className?: string;
}

/** Icono del dispositivo: tecla para el teclado y marca del mando para el resto. */
export function DeviceIcon({ kind, family, className = 'size-4' }: DeviceIconProps) {
  const glyph: DeviceGlyph = kind === 'keyboard' ? 'keyboard' : (family ?? 'generic');

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={{ color: GLYPH_COLOR[glyph] }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[glyph]}
    </svg>
  );
}

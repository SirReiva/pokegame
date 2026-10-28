import { CONFIG } from './config';

/** Acción de interfaz (menús) emitida por un dispositivo concreto. */
export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel';

export interface InputDeviceInfo {
  /** Identidad estable del dispositivo: `kbd` o `pad-<index>`. */
  id: string;
  kind: 'keyboard' | 'gamepad';
  label: string;
  /** Índice del Gamepad API cuando es un mando. */
  index: number | null;
}

export interface DeviceInputSnapshot {
  moveX: number;
  moveY: number;
  cameraX: number;
  zoom: number;
  wheel: number;
  run: boolean;
  pointerYaw: number;
  gamepad: boolean;
  startPressed: boolean;
  /** Pulsaciones de borde, no estados mantenidos. */
  confirm: boolean;
  cancel: boolean;
  navX: -1 | 0 | 1;
  navY: -1 | 0 | 1;
}

export interface MenuInputEvent {
  deviceId: string;
  action: MenuAction;
}

export interface InputFrame {
  devices: InputDeviceInfo[];
  changed: boolean;
  snapshots: Map<string, DeviceInputSnapshot>;
  actions: MenuInputEvent[];
}

const KEYBOARD_ID = 'kbd';
const DEADZONE = 0.18;
const NAV_DEADZONE = 0.55;

const NAV_KEYS = {
  up: ['w', 'arrowup'],
  down: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright']
} as const;

function applyDeadzone(value: number, deadzone = DEADZONE): number {
  const magnitude = Math.abs(value);
  if (magnitude < deadzone) return 0;
  return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
}

interface PadNavState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

interface PadState {
  buttons: boolean[];
  nav: PadNavState;
}

/**
 * Entrada local para 1-8 jugadores: un teclado y varios mandos estándar.
 *
 * Cada dispositivo conserva su propia identidad y snapshot. Los menús reciben
 * acciones de borde (`confirm`, `cancel`, `up`...) para que un jugador pueda
 * unirse, elegir equipo y elegir Pokémon sin que React tenga que leer el mando
 * en cada frame.
 */
export class Input {
  private readonly canvas: HTMLCanvasElement | null;
  private readonly keys = new Set<string>();
  /** Teclas pulsadas desde el último poll (captura toques entre frames). */
  private readonly keyTaps = new Set<string>();
  private previousKeys = new Set<string>();

  private pointerYaw = 0;
  private wheel = 0;
  private dragging = false;
  private lastPointerX = 0;
  private pointerId: number | null = null;

  private readonly padStates = new Map<number, PadState>();
  private lastDeviceIds = '';

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (this.isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (
      ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'enter'].includes(key)
    ) {
      event.preventDefault();
    }
    this.keys.add(key);
    if (!event.repeat) this.keyTaps.add(key);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.key.toLowerCase());
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.dragging = true;
    this.lastPointerX = event.clientX;
    this.pointerId = event.pointerId;
    this.canvas?.setPointerCapture?.(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.dragging) return;
    if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
    const delta = event.clientX - this.lastPointerX;
    this.lastPointerX = event.clientX;
    this.pointerYaw -= delta * CONFIG.camera.pointerSensitivity;
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
    this.canvas?.releasePointerCapture?.(event.pointerId);
  };

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.wheel += event.deltaY < 0 ? 1 : -1;
  };

  private readonly onBlur = () => {
    this.keys.clear();
    this.keyTaps.clear();
    this.dragging = false;
  };

  /**
   * Sin canvas es una fuente de entrada solo para menús: teclado y mandos
   * siguen funcionando, pero se omiten los eventos de puntero y rueda.
   */
  constructor(canvas?: HTMLCanvasElement | null) {
    this.canvas = canvas ?? null;
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.canvas?.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.canvas?.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;
    const tag = element.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || element.isContentEditable === true;
  }

  private collectDevices(): { devices: InputDeviceInfo[]; pads: Map<number, Gamepad> } {
    const devices: InputDeviceInfo[] = [
      { id: KEYBOARD_ID, kind: 'keyboard', label: 'Teclado', index: null }
    ];
    const pads = new Map<number, Gamepad>();

    if (navigator.getGamepads) {
      for (const pad of navigator.getGamepads()) {
        if (!pad || !pad.connected) continue;
        pads.set(pad.index, pad);
        devices.push({
          id: `pad-${pad.index}`,
          kind: 'gamepad',
          label: `Mando ${pad.index + 1}`,
          index: pad.index
        });
      }
    }

    for (const index of this.padStates.keys()) {
      if (!pads.has(index)) this.padStates.delete(index);
    }

    return { devices, pads };
  }

  private keyboardSnapshot(): { snapshot: DeviceInputSnapshot; action: MenuAction | null } {
    const has = (key: string) => this.keys.has(key);
    const tapped = (key: string) => this.keyTaps.has(key);
    const heldNav = (keys: ReadonlyArray<string>) => keys.some(has);
    const tappedNav = (keys: ReadonlyArray<string>) => keys.some(tapped);
    const edgeNav = (keys: ReadonlyArray<string>) =>
      tappedNav(keys) ||
      (heldNav(keys) && !keys.some((key) => this.previousKeys.has(key)));

    let moveX = 0;
    let moveY = 0;
    if (has('a') || has('arrowleft')) moveX -= 1;
    if (has('d') || has('arrowright')) moveX += 1;
    if (has('w') || has('arrowup')) moveY += 1;
    if (has('s') || has('arrowdown')) moveY -= 1;

    const length = Math.hypot(moveX, moveY);
    if (length > 1) {
      moveX /= length;
      moveY /= length;
    }

    const up = edgeNav(NAV_KEYS.up);
    const down = edgeNav(NAV_KEYS.down);
    const left = edgeNav(NAV_KEYS.left);
    const right = edgeNav(NAV_KEYS.right);
    const confirm = tapped(' ') || tapped('enter');
    const cancel = tapped('escape') || tapped('backspace');

    let action: MenuAction | null = null;
    if (confirm) action = 'confirm';
    else if (cancel) action = 'cancel';
    else if (up) action = 'up';
    else if (down) action = 'down';
    else if (left) action = 'left';
    else if (right) action = 'right';

    const snapshot: DeviceInputSnapshot = {
      moveX,
      moveY,
      cameraX: (has('e') ? 1 : 0) - (has('q') ? 1 : 0),
      zoom: 0,
      wheel: this.wheel,
      run: has('shift'),
      pointerYaw: this.pointerYaw,
      gamepad: false,
      startPressed: false,
      confirm,
      cancel,
      navX: left ? -1 : right ? 1 : 0,
      navY: up ? 1 : down ? -1 : 0
    };
    return { snapshot, action };
  }

  private padSnapshot(pad: Gamepad): { snapshot: DeviceInputSnapshot; action: MenuAction | null } {
    const state = this.padStates.get(pad.index) ?? {
      buttons: [],
      nav: { up: false, down: false, left: false, right: false }
    };
    this.padStates.set(pad.index, state);

    const pressed = (index: number) => pad.buttons[index]?.pressed ?? false;
    const edge = (index: number) => pressed(index) && !state.buttons[index];

    const axes = pad.axes;
    const leftX = applyDeadzone(axes[0] ?? 0);
    const leftY = applyDeadzone(axes[1] ?? 0);

    let moveX = leftX;
    let moveY = -leftY;
    if (pressed(14)) moveX -= 1;
    if (pressed(15)) moveX += 1;
    if (pressed(12)) moveY += 1;
    if (pressed(13)) moveY -= 1;
    const moveLength = Math.hypot(moveX, moveY);
    if (moveLength > 1) {
      moveX /= moveLength;
      moveY /= moveLength;
    }

    const stickUp = (axes[1] ?? 0) < -NAV_DEADZONE;
    const stickDown = (axes[1] ?? 0) > NAV_DEADZONE;
    const stickLeft = (axes[0] ?? 0) < -NAV_DEADZONE;
    const stickRight = (axes[0] ?? 0) > NAV_DEADZONE;

    const navNow: PadNavState = {
      up: pressed(12) || stickUp,
      down: pressed(13) || stickDown,
      left: pressed(14) || stickLeft,
      right: pressed(15) || stickRight
    };
    const up = navNow.up && !state.nav.up;
    const down = navNow.down && !state.nav.down;
    const left = navNow.left && !state.nav.left;
    const right = navNow.right && !state.nav.right;

    const confirm = edge(0);
    const cancel = edge(1);
    const startPressed = edge(9);

    state.buttons = pad.buttons.map((button) => button.pressed);
    state.nav = navNow;

    let action: MenuAction | null = null;
    if (confirm) action = 'confirm';
    else if (cancel) action = 'cancel';
    else if (up) action = 'up';
    else if (down) action = 'down';
    else if (left) action = 'left';
    else if (right) action = 'right';

    const zoom =
      -applyDeadzone(axes[3] ?? 0) +
      (pad.buttons[7]?.value ?? 0) * 0.75 -
      (pad.buttons[6]?.value ?? 0) * 0.75;

    const snapshot: DeviceInputSnapshot = {
      moveX,
      moveY,
      cameraX: applyDeadzone(axes[2] ?? 0),
      zoom,
      wheel: 0,
      run: pressed(10) || pressed(5),
      pointerYaw: 0,
      gamepad: true,
      startPressed,
      confirm,
      cancel,
      navX: left ? -1 : right ? 1 : 0,
      navY: up ? 1 : down ? -1 : 0
    };

    return { snapshot, action };
  }

  /**
   * Debe llamarse una sola vez por frame. Devuelve los dispositivos presentes,
   * si la lista cambió y un snapshot/acciones por dispositivo.
   */
  poll(): InputFrame {
    const { devices, pads } = this.collectDevices();
    const snapshots = new Map<string, DeviceInputSnapshot>();
    const actions: MenuInputEvent[] = [];

    const keyboard = this.keyboardSnapshot();
    snapshots.set(KEYBOARD_ID, keyboard.snapshot);
    if (keyboard.action) actions.push({ deviceId: KEYBOARD_ID, action: keyboard.action });

    for (const [index, pad] of pads) {
      const result = this.padSnapshot(pad);
      snapshots.set(`pad-${index}`, result.snapshot);
      if (result.action) actions.push({ deviceId: `pad-${index}`, action: result.action });
    }

    const ids = devices.map((device) => device.id).join('|');
    const changed = ids !== this.lastDeviceIds;
    this.lastDeviceIds = ids;

    this.keyTaps.clear();
    this.pointerYaw = 0;
    this.wheel = 0;
    this.previousKeys = new Set(this.keys);

    return { devices, changed, snapshots, actions };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas?.removeEventListener('wheel', this.onWheel);
  }
}

export const IDLE_INPUT: DeviceInputSnapshot = {
  moveX: 0,
  moveY: 0,
  cameraX: 0,
  zoom: 0,
  wheel: 0,
  run: false,
  pointerYaw: 0,
  gamepad: false,
  startPressed: false,
  confirm: false,
  cancel: false,
  navX: 0,
  navY: 0
};

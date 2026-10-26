import { CONFIG } from './config';

export interface InputSnapshot {
  moveX: number;
  moveY: number;
  cameraX: number;
  zoom: number;
  wheel: number;
  run: boolean;
  pointerYaw: number;
  gamepad: boolean;
  startPressed: boolean;
}

const DEADZONE = 0.18;

function applyDeadzone(value: number, deadzone = DEADZONE): number {
  const magnitude = Math.abs(value);
  if (magnitude < deadzone) return 0;
  return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
}

/** Teclado + ratón + mando (Gamepad API), con el mando como entrada principal. */
export class Input {
  private readonly canvas: HTMLCanvasElement;
  private readonly keys = new Set<string>();

  private pointerYaw = 0;
  private wheel = 0;
  private dragging = false;
  private lastPointerX = 0;
  private pointerId: number | null = null;

  private startPressed = false;
  private startHeld = false;
  private gamepadIndex: number | null = null;
  private gamepadConnected = false;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (this.isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (
      ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'q', 'e'].includes(key)
    ) {
      event.preventDefault();
    }
    this.keys.add(key);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.key.toLowerCase());
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.dragging = true;
    this.lastPointerX = event.clientX;
    this.pointerId = event.pointerId;
    this.canvas.setPointerCapture?.(event.pointerId);
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
    this.canvas.releasePointerCapture?.(event.pointerId);
  };

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.wheel += event.deltaY < 0 ? 1 : -1;
  };

  private readonly onBlur = () => {
    this.keys.clear();
    this.dragging = false;
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    this.scanGamepads();
  }

  private readonly onGamepadConnected = (event: Event) => {
    const gamepadEvent = event as GamepadEvent;
    this.gamepadIndex = gamepadEvent.gamepad.index;
    this.gamepadConnected = true;
  };

  private readonly onGamepadDisconnected = (event: Event) => {
    const gamepadEvent = event as GamepadEvent;
    if (this.gamepadIndex === gamepadEvent.gamepad.index) {
      this.gamepadIndex = null;
      this.gamepadConnected = false;
    }
  };

  private scanGamepads(): Gamepad | null {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this.gamepadIndex !== null) {
      const pad = pads[this.gamepadIndex];
      if (pad && pad.connected) {
        this.gamepadConnected = true;
        return pad;
      }
      this.gamepadIndex = null;
      this.gamepadConnected = false;
    }
    for (const pad of pads) {
      if (pad && pad.connected) {
        this.gamepadIndex = pad.index;
        this.gamepadConnected = true;
        return pad;
      }
    }
    return null;
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;
    const tag = element.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || element.isContentEditable === true;
  }

  get hasGamepad(): boolean {
    return this.gamepadConnected;
  }

  sample(): InputSnapshot {
    const pad = this.scanGamepads();
    const buttons = pad?.buttons ?? [];
    const axes = pad?.axes ?? [];

    let moveX = 0;
    let moveY = 0;
    let cameraX = 0;
    let zoom = 0;
    let run = false;

    if (pad) {
      const lx = applyDeadzone(axes[0] ?? 0);
      const ly = applyDeadzone(axes[1] ?? 0);
      moveX += lx;
      moveY += -ly;

      cameraX += applyDeadzone(axes[2] ?? 0);
      zoom += -applyDeadzone(axes[3] ?? 0);

      const rightTrigger = buttons[7]?.value ?? 0;
      const leftTrigger = buttons[6]?.value ?? 0;
      zoom += rightTrigger * 0.75 - leftTrigger * 0.75;

      const dpadLeft = buttons[14]?.pressed ?? false;
      const dpadRight = buttons[15]?.pressed ?? false;
      const dpadUp = buttons[12]?.pressed ?? false;
      const dpadDown = buttons[13]?.pressed ?? false;
      if (dpadLeft) moveX -= 1;
      if (dpadRight) moveX += 1;
      if (dpadUp) moveY += 1;
      if (dpadDown) moveY -= 1;

      if (buttons[10]?.pressed) run = true;

      const start = buttons[9]?.pressed ?? false;
      if (start && !this.startHeld) this.startPressed = true;
      this.startHeld = start;
    }

    if (this.keys.has('a') || this.keys.has('arrowleft')) moveX -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) moveX += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) moveY += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) moveY -= 1;
    if (this.keys.has('q')) cameraX -= 1;
    if (this.keys.has('e')) cameraX += 1;
    if (this.keys.has('shift')) run = true;

    // Longitud máxima 1 en el movimiento.
    const length = Math.hypot(moveX, moveY);
    if (length > 1) {
      moveX /= length;
      moveY /= length;
    }
    cameraX = Math.max(-1, Math.min(1, cameraX));

    const snapshot: InputSnapshot = {
      moveX,
      moveY,
      cameraX,
      zoom,
      wheel: this.wheel,
      run,
      pointerYaw: this.pointerYaw,
      gamepad: this.gamepadConnected,
      startPressed: this.startPressed
    };

    this.pointerYaw = 0;
    this.wheel = 0;
    this.startPressed = false;

    return snapshot;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
  }
}

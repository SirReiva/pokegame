import { useEffect, useRef, useState } from 'react';

/** Gatillo derecho (RT / R2 / ZR) en el mapeo estándar de la Gamepad API. */
const CLICK_BUTTON = 7;
/** Umbrales del gatillo analógico: el de soltar es menor para evitar rebotes. */
const CLICK_PRESS = 0.35;
const CLICK_RELEASE = 0.18;

/** Zona muerta del stick derecho. */
const STICK_DEADZONE = 0.2;
/** Velocidad del cursor en píxeles por segundo con el stick a tope. */
const CURSOR_SPEED = 1150;
/** Margen para que el puntero nunca quede pegado al borde de la ventana. */
const SCREEN_MARGIN = 4;

/** Distancia al borde del contenedor que activa el autodesplazamiento. */
const SCROLL_EDGE = 56;
/** Zona de la ventana donde se busca un contenedor con scroll. */
const SCROLL_ZONE = 96;
const SCROLL_SPEED = 900;

/** Un color por mando para distinguir los punteros de un vistazo. */
const CURSOR_COLORS = [
  '#7ac74c',
  '#4b9cff',
  '#ff6b6b',
  '#ffd479',
  '#c792ff',
  '#5ce1e6',
  '#ff9f5a',
  '#ff8fd8'
] as const;

interface CursorRuntime {
  x: number;
  y: number;
  visible: boolean;
  /** El gatillo ya estaba pulsado al detectar el mando: no cuenta como clic. */
  initialized: boolean;
  held: boolean;
  /** Slider que se está arrastrando mientras se mantiene el gatillo. */
  drag: HTMLInputElement | null;
  hovered: Element | null;
  /** Contenedor con scroll bajo el puntero, cacheado entre frames. */
  scrollTarget: HTMLElement | null;
  scrolling: boolean;
  node: HTMLDivElement | null;
}

const rangeValueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value'
)?.set;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyDeadzone(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude < STICK_DEADZONE) return 0;
  return Math.sign(value) * ((magnitude - STICK_DEADZONE) / (1 - STICK_DEADZONE));
}

function cursorColor(index: number): string {
  return CURSOR_COLORS[index % CURSOR_COLORS.length];
}

function mouseInit(x: number, y: number, buttons: number) {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: 0,
    buttons,
    detail: 1
  } satisfies MouseEventInit;
}

/**
 * Encuentra el control enfocable más cercano. El clic se lanza sobre el
 * elemento real (para que burbujee a las tarjetas con `onClick`), pero el foco
 * se aplica al control para que el teclado siga funcionando después.
 */
function findFocusable(target: Element): HTMLElement | null {
  return target.closest<HTMLElement>(
    'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
}

function isDisabled(target: Element): boolean {
  const control = target.closest<HTMLButtonElement>('button, input, select, textarea');
  return control?.disabled === true;
}

/**
 * Los sliders nativos no reaccionan a eventos sintéticos, así que se les fija
 * el valor a mano y se avisa a React con un `input` normal.
 */
function setRangeValue(input: HTMLInputElement, clientX: number): void {
  const rect = input.getBoundingClientRect();
  if (rect.width <= 0) return;

  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const step = Number(input.step) || 1;
  const raw = min + (max - min) * ratio;
  const value = clamp(min + Math.round((raw - min) / step) * step, min, max);

  rangeValueSetter?.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Dispara un clic completo (puntero + ratón) en las coordenadas indicadas. */
function clickAt(x: number, y: number): HTMLInputElement | null {
  const target = document.elementFromPoint(x, y);
  if (!target || isDisabled(target)) return null;

  findFocusable(target)?.focus({ preventScroll: true });

  const range = target.closest<HTMLInputElement>('input[type="range"]');
  if (range) setRangeValue(range, x);

  const pointer = {
    ...mouseInit(x, y, 1),
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    pressure: 0.5,
    width: 1,
    height: 1
  };
  target.dispatchEvent(new PointerEvent('pointerdown', pointer));
  target.dispatchEvent(new MouseEvent('mousedown', mouseInit(x, y, 1)));
  target.dispatchEvent(
    new PointerEvent('pointerup', { ...pointer, buttons: 0, pressure: 0 })
  );
  target.dispatchEvent(new MouseEvent('mouseup', mouseInit(x, y, 0)));
  target.dispatchEvent(new MouseEvent('click', mouseInit(x, y, 0)));

  return range;
}

/** Propaga el hover para que los `onMouseEnter` de React se comporten igual. */
function changeHover(runtime: CursorRuntime): void {
  const next = runtime.visible
    ? document.elementFromPoint(runtime.x, runtime.y)
    : null;
  if (next === runtime.hovered) return;

  const previous = runtime.hovered;
  runtime.hovered = next;
  const init = mouseInit(runtime.x, runtime.y, 0);

  if (previous) {
    previous.dispatchEvent(
      new MouseEvent('mouseout', { ...init, relatedTarget: next })
    );
    previous.dispatchEvent(
      new PointerEvent('pointerout', {
        ...init,
        pointerId: 1,
        pointerType: 'mouse',
        relatedTarget: next
      })
    );
  }
  if (next) {
    next.dispatchEvent(
      new MouseEvent('mouseover', { ...init, relatedTarget: previous })
    );
    next.dispatchEvent(
      new PointerEvent('pointerover', {
        ...init,
        pointerId: 1,
        pointerType: 'mouse',
        relatedTarget: previous
      })
    );
  }
}

function clearHover(runtime: CursorRuntime): void {
  const previous = runtime.hovered;
  runtime.hovered = null;
  if (!previous) return;
  const init = mouseInit(runtime.x, runtime.y, 0);
  previous.dispatchEvent(new MouseEvent('mouseout', { ...init, relatedTarget: null }));
  previous.dispatchEvent(
    new PointerEvent('pointerout', {
      ...init,
      pointerId: 1,
      pointerType: 'mouse',
      relatedTarget: null
    })
  );
}

function findScrollable(x: number, y: number): HTMLElement | null {
  let element = document.elementFromPoint(x, y) as HTMLElement | null;
  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      element.scrollHeight > element.clientHeight + 1
    ) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

/** Desplaza la pantalla al acercar el puntero a un borde con contenido oculto. */
function autoScroll(runtime: CursorRuntime, dt: number, moved: boolean): void {
  const { x, y } = runtime;
  // Solo se busca contenedor cerca de los bordes o mientras ya se desplaza:
  // recorrer el DOM en cada frame para todos los mandos sería muy caro.
  const inZone = y < SCROLL_ZONE || y > window.innerHeight - SCROLL_ZONE;
  if (!moved && !runtime.scrolling) return;
  if (!inZone && !runtime.scrolling) return;

  let container = runtime.scrollTarget;
  const cachedRect = container?.getBoundingClientRect();
  const cachedContainsPoint =
    cachedRect !== undefined &&
    x >= cachedRect.left &&
    x <= cachedRect.right &&
    y >= cachedRect.top &&
    y <= cachedRect.bottom;

  if (!container?.isConnected || !cachedContainsPoint) {
    container = findScrollable(x, y);
    runtime.scrollTarget = container;
  }
  if (!container) {
    runtime.scrolling = false;
    return;
  }

  const rect = container.getBoundingClientRect();
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, window.innerHeight);
  const direction = y < top + SCROLL_EDGE ? -1 : y > bottom - SCROLL_EDGE ? 1 : 0;
  if (direction === 0) {
    runtime.scrolling = false;
    return;
  }

  const before = container.scrollTop;
  container.scrollTop = before + direction * SCROLL_SPEED * dt;
  runtime.scrolling = container.scrollTop !== before;
}

function applyCursor(runtime: CursorRuntime): void {
  const node = runtime.node;
  if (!node) return;
  node.style.transform = `translate3d(${runtime.x}px, ${runtime.y}px, 0)`;
  node.style.opacity = runtime.visible ? '1' : '0';
}

function createRuntime(): CursorRuntime {
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    visible: false,
    initialized: false,
    held: false,
    drag: null,
    hovered: null,
    scrollTarget: null,
    scrolling: false,
    node: null
  };
}

function updatePad(runtime: CursorRuntime, pad: Gamepad, dt: number): void {
  const stickX = applyDeadzone(pad.axes[2] ?? 0);
  const stickY = applyDeadzone(pad.axes[3] ?? 0);
  const moved = stickX !== 0 || stickY !== 0;

  if (moved) {
    runtime.x = clamp(
      runtime.x + stickX * CURSOR_SPEED * dt,
      SCREEN_MARGIN,
      window.innerWidth - SCREEN_MARGIN
    );
    runtime.y = clamp(
      runtime.y + stickY * CURSOR_SPEED * dt,
      SCREEN_MARGIN,
      window.innerHeight - SCREEN_MARGIN
    );
    runtime.visible = true;
  }

  if (runtime.visible) {
    autoScroll(runtime, dt, moved);
    changeHover(runtime);
  }

  const trigger = pad.buttons[CLICK_BUTTON]?.value ?? 0;
  if (!runtime.initialized) {
    runtime.initialized = true;
    runtime.held = trigger >= CLICK_PRESS;
  } else if (!runtime.held && trigger >= CLICK_PRESS) {
    runtime.held = true;
    if (runtime.visible) runtime.drag = clickAt(runtime.x, runtime.y);
  } else if (runtime.held && trigger <= CLICK_RELEASE) {
    runtime.held = false;
    runtime.drag = null;
  }

  if (runtime.held && runtime.drag) {
    if (!runtime.drag.isConnected) runtime.drag = null;
    else if (runtime.visible) setRangeValue(runtime.drag, runtime.x);
  }

  applyCursor(runtime);
}

/**
 * Puntero virtual por mando para las pantallas HTML (menús, lobby, roster...).
 *
 * El stick derecho mueve un cursor propio de cada mando y el gatillo derecho
 * hace clic sobre el elemento que haya debajo. Se desactiva en la partida,
 * donde el stick y el gatillo ya controlan la cámara y el instinto, pero se
 * puede reactivar sobre la pausa, los diálogos y las pantallas de carga.
 */
export function VirtualMouseLayer({ enabled = true }: { enabled?: boolean }) {
  const [padIndexes, setPadIndexes] = useState<number[]>([]);
  const runtimes = useRef(new Map<number, CursorRuntime>());

  useEffect(() => {
    if (!enabled) return;

    const active = runtimes.current;
    let frame = 0;
    let last = performance.now();
    let lastIds = '';

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;

      const gamepads = navigator.getGamepads?.() ?? [];
      const connected: number[] = [];

      for (const pad of gamepads) {
        if (!pad?.connected) continue;
        connected.push(pad.index);
        let runtime = active.get(pad.index);
        if (!runtime) {
          runtime = createRuntime();
          active.set(pad.index, runtime);
        }
        updatePad(runtime, pad, dt);
      }

      for (const [index, runtime] of active) {
        if (!connected.includes(index)) {
          clearHover(runtime);
          active.delete(index);
        }
      }

      connected.sort((a, b) => a - b);
      const ids = connected.join(',');
      if (ids !== lastIds) {
        lastIds = ids;
        setPadIndexes(connected);
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      for (const runtime of active.values()) clearHover(runtime);
      active.clear();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-9999 overflow-hidden select-none"
    >
      {padIndexes.map((index) => {
        const color = cursorColor(index);
        return (
          <div
            key={index}
            ref={(node) => {
              const runtime = runtimes.current.get(index);
              if (!runtime) return;
              runtime.node = node;
              applyCursor(runtime);
            }}
            className="pointer-events-none absolute top-0 left-0 opacity-0 transition-opacity duration-150 will-change-transform"
            style={{ color }}
          >
            <svg
              width="23"
              height="28"
              viewBox="0 0 23 28"
              aria-hidden="true"
              className="drop-shadow-[0_2px_4px_rgb(0_0_0/0.55)]"
            >
              <path
                d="M3 2.2 20.4 13.6l-7.6 1.5-3.4 8.7Z"
                fill="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
                className="stroke-night-900"
              />
            </svg>
            <span
              className="absolute top-4 left-3 grid size-4.5 place-items-center rounded-full border border-night-950/80 font-mono text-10.24 font-bold text-ink-dark-strong"
              style={{ backgroundColor: color }}
            >
              {index + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

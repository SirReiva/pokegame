/**
 * Presentación de áreas compuestas por varios círculos.
 *
 * El motor resuelve la unión de círculos en `aoeGeometry.ts`; aquí se crea un
 * efecto y una telegrafía por círculo y se agrupan en un solo handle. Así el
 * área puede moverse y girar como una unidad: el patrón vuelve a calcular sus
 * centros a partir del centro y la dirección actuales, igual que hace el daño.
 *
 * Los círculos se dibujan a su radio exacto, sin el padding del mayor hurtbox:
 * sumarlo fundiría los lóbulos en una sola mancha y ocultaría la geometría del
 * patrón. El golpe solo añade el hurtbox del objetivo concreto.
 */

import type { AoeAbilityDef, AoeStyle } from './abilities';
import type {
  AoeFxHandle,
  CombatFxPort,
  TelegraphHandle,
  TelegraphOwner
} from './core/ports/fx';
import type { AoeCircle } from './aoeGeometry';
import { aoeCirclesFrom } from './aoeGeometry';

type Color = readonly [number, number, number];

/** Radio que cubre todo el patrón desde su centro de colocación. */
export function aoeGroupRadius(
  def: AoeAbilityDef,
  x: number,
  z: number,
  dirX: number,
  dirZ: number
): number {
  let radius = 0;
  for (const circle of aoeCirclesFrom(def, x, z, dirX, dirZ)) {
    radius = Math.max(
      radius,
      Math.hypot(circle.x - x, circle.z - z) + circle.radius
    );
  }
  return Math.max(0.1, radius);
}

/** Área visual formada por un efecto por círculo. */
export function spawnGroupedAoe(
  fx: CombatFxPort,
  def: AoeAbilityDef,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  color: Color,
  style: AoeStyle,
  duration: number
): AoeFxHandle {
  // Los estilos caros (el huracán de Ciclón) se dibujan una sola vez sobre el
  // conjunto; los anillos de la telegrafía siguen marcando cada círculo.
  if (def.aoeCircleFx === 'grouped') {
    const handle = fx.spawnAoe(
      x,
      z,
      aoeGroupRadius(def, x, z, dirX, dirZ),
      color,
      style,
      duration
    );
    return {
      setCenter(nextX, nextZ) {
        handle.setCenter(nextX, nextZ);
      },
      destroy() {
        handle.destroy();
      }
    };
  }
  const handles = aoeCirclesFrom(def, x, z, dirX, dirZ).map((circle) =>
    fx.spawnAoe(circle.x, circle.z, circle.radius, color, style, duration)
  );
  let centerX = x;
  let centerZ = z;
  let currentDirX = dirX;
  let currentDirZ = dirZ;
  let appliedX = Number.NaN;
  let appliedZ = Number.NaN;
  let appliedDirX = Number.NaN;
  let appliedDirZ = Number.NaN;
  const reposition = () => {
    // `moveVisual` llama primero a `setCenter` y después a `setDirection`; el
    // guard evita recolocar dos veces por frame cuando nada cambió.
    if (
      centerX === appliedX &&
      centerZ === appliedZ &&
      currentDirX === appliedDirX &&
      currentDirZ === appliedDirZ
    ) {
      return;
    }
    appliedX = centerX;
    appliedZ = centerZ;
    appliedDirX = currentDirX;
    appliedDirZ = currentDirZ;
    const circles = aoeCirclesFrom(
      def,
      centerX,
      centerZ,
      currentDirX,
      currentDirZ
    );
    for (let index = 0; index < handles.length; index++) {
      const circle = circles[index];
      if (circle) handles[index].setCenter(circle.x, circle.z);
    }
  };
  return {
    setCenter(nextX, nextZ) {
      centerX = nextX;
      centerZ = nextZ;
      reposition();
    },
    setDirection(nextDirX, nextDirZ) {
      currentDirX = nextDirX;
      currentDirZ = nextDirZ;
      reposition();
    },
    destroy() {
      for (const handle of handles) handle.destroy();
    }
  };
}

/** Telegrafía formada por una marca por círculo. */
export function spawnGroupedAoeTelegraph(
  fx: CombatFxPort,
  def: AoeAbilityDef,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  color: Color,
  duration: number,
  effectDuration = 0,
  owner?: TelegraphOwner
): TelegraphHandle {
  const handles = aoeCirclesFrom(def, x, z, dirX, dirZ).map((circle) =>
    fx.spawnAoeTelegraph(
      circle.x,
      circle.z,
      circle.radius,
      color,
      duration,
      effectDuration,
      owner
    )
  );
  let centerX = x;
  let centerZ = z;
  let currentDirX = dirX;
  let currentDirZ = dirZ;
  let currentColor = color;
  let appliedX = Number.NaN;
  let appliedZ = Number.NaN;
  let appliedDirX = Number.NaN;
  let appliedDirZ = Number.NaN;
  const reposition = () => {
    if (
      centerX === appliedX &&
      centerZ === appliedZ &&
      currentDirX === appliedDirX &&
      currentDirZ === appliedDirZ
    ) {
      return;
    }
    appliedX = centerX;
    appliedZ = centerZ;
    appliedDirX = currentDirX;
    appliedDirZ = currentDirZ;
    const circles = aoeCirclesFrom(
      def,
      centerX,
      centerZ,
      currentDirX,
      currentDirZ
    );
    for (let index = 0; index < handles.length; index++) {
      const circle: AoeCircle | undefined = circles[index];
      if (circle) handles[index].setCenter?.(circle.x, circle.z);
    }
  };
  return {
    destroy() {
      for (const handle of handles) handle.destroy();
    },
    setCenter(nextX, nextZ) {
      centerX = nextX;
      centerZ = nextZ;
      reposition();
    },
    setDirection(nextDirX, nextDirZ) {
      currentDirX = nextDirX;
      currentDirZ = nextDirZ;
      reposition();
    },
    setColor(nextColor) {
      currentColor = nextColor;
      for (const handle of handles) handle.setColor?.(currentColor);
    }
  };
}

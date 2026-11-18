import type { FxRuntime } from './fxRuntime';
import { AOE_CONE_FACTORIES, AOE_FACTORIES, BEAM_FACTORIES, IMPACT_FACTORIES, PROJECTILE_FACTORIES } from './factories';
import type { AoeStyle, BeamStyle, ImpactStyle, ProjectileStyle } from '../../abilities';
import { CONFIG, DEG } from '../../config';
import { attachProjectileHitbox } from '../../hitboxDebug';
import type { AoeFxHandle, EffectHandle } from '../../core/ports/fx';
import type { FxAnchors, ProjectileVisual } from './fxGeometry';
import { areaAnchors, coneAnchors } from './fxGeometry';

/** Bola luminosa que avanza con un proyectil. */
export function spawnProjectile(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    style: ProjectileStyle,
    dirX: number,
    dirZ: number): EffectHandle {
const factory =
      PROJECTILE_FACTORIES[style] ?? PROJECTILE_FACTORIES.orb;
    // Las fábricas registran su `ProjectileVisual`; se compara el conjunto para
    // recuperar el nodo recién creado sin cambiar la firma de cada una.
    const known = new Set(ctx.projectiles);
    const handle = factory(ctx, x, z, color, radius, dirX, dirZ);
    let visual: ProjectileVisual | undefined;
    for (const candidate of ctx.projectiles) {
      if (!known.has(candidate)) {
        visual = candidate;
        break;
      }
    }
    if (!visual) return handle;

    if (CONFIG.debug.showHitboxes) {
      const cleanup = attachProjectileHitbox(ctx.app, visual.entity, radius);
      const destroy = handle.destroy;
      let disposed = false;
      handle.destroy = () => {
        if (!disposed) {
          disposed = true;
          cleanup();
        }
        destroy();
      };
    }

    ctx.applyVisibility(visual.entity, [[x, z]], true);

    // Capas recalculadas en cada paso: así el proyectil se oculta en cuanto un
    // separador corta la línea de visión, sin esperar a recorrer 0,4 u. La
    // ocultación por terreno (hierba alta) sí se ignora a propósito.
    const setPosition = handle.setPosition;
    handle.setPosition = (nextX, nextZ) => {
      setPosition(nextX, nextZ);
      ctx.applyVisibility(visual.entity, [[nextX, nextZ]], true);
    };
    return handle;
}

/** Elige la fábrica de impacto según el estilo de la habilidad. */
export function spawnImpact(ctx: FxRuntime, x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number,
    style: ImpactStyle = 'hit'): void {
const effect = IMPACT_FACTORIES[style] ?? IMPACT_FACTORIES.hit;
    ctx.withAnchors([[x, z]] as FxAnchors, () =>
      effect(ctx, x, z, color, effectiveness)
    );
}

/**
   * Haz instantáneo: dos rayos zigzagueantes que giran en sentidos opuestos,
   * cruzándose mientras el haz se extiende desde el lanzador hacia delante.
   */
export function spawnBeam(ctx: FxRuntime, x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number,
    style: BeamStyle = 'electric'): void {
const factory = BEAM_FACTORIES[style] ?? BEAM_FACTORIES.electric;
    // Origen y destino: el haz se ve si cualquiera de los dos extremos (o su
    // punto medio) cae dentro de la visión del observador.
    ctx.withAnchors(
      [
        [x1, z1],
        [(x1 + x2) / 2, (z1 + z2) / 2],
        [x2, z2]
      ],
      () => factory(ctx, x1, z1, x2, z2, color, width)
    );
}

/** Anillo de área en el suelo, centrado delante del lanzador. */
export function spawnAoe(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    style: AoeStyle = 'ring',
    duration = 0.65): AoeFxHandle {
const life = Math.max(0.2, duration);
    const factory = AOE_FACTORIES[style] ?? AOE_FACTORIES.ring;
    // Las fábricas crean una o varias entidades en coordenadas de mundo. Se
    // recuerdan para poder desplazar el conjunto cuando el área se mueva sin
    // reiniciar sus animaciones.
    const firstEffect = ctx.effects.length;
    ctx.withAnchors(areaAnchors(x, z, radius), () =>
      factory(ctx, x, z, radius, color, life)
    );
    const created = ctx.effects.slice(firstEffect);
    const bases = created.map((effect) => {
      const position = effect.entity.getPosition();
      return { effect, x: position.x, z: position.z };
    });
    return {
      setCenter: (nextX, nextZ) => {
        const dx = nextX - x;
        const dz = nextZ - z;
        for (const base of bases) {
          const position = base.effect.entity.getPosition();
          base.effect.entity.setPosition(base.x + dx, position.y, base.z + dz);
          // La visibilidad se decide por las anclas del área: si el centro se
          // mueve a otra vista, el efecto debe aparecer ahí.
          base.effect.anchors = areaAnchors(nextX, nextZ, radius);
        }
      },
      destroy: () => {
        for (const effect of created) ctx.disposeEffect(effect);
      }
    };
}

/**
   * Área con forma de cono: conserva el efecto 3D propio del estilo, colocado
   * en el interior del abanico, mientras el aro/telegraph dibuja la geometría
   * exacta. `x/z` es el vértice, `length` la longitud y `halfAngleDeg` la
   * apertura.
   */
export function spawnAoeCone(ctx: FxRuntime, x: number,
    z: number,
    dirX: number,
    dirZ: number,
    length: number,
    halfAngleDeg: number,
    color: readonly [number, number, number],
    style: AoeStyle = 'ring',
    duration = 0.65): AoeFxHandle {
const life = Math.max(0.2, duration);
    const rawLength = Math.hypot(dirX, dirZ);
    const nx = rawLength > 0.0001 ? dirX / rawLength : 0;
    const nz = rawLength > 0.0001 ? dirZ / rawLength : 1;
    const half = Math.max(8, Math.min(89, halfAngleDeg)) * DEG;
    const reach = Math.max(0.1, length);
    // Los estilos con un efecto propio de cono (p. ej. Fuego Sagrado) no usan
    // el disco inscrito: registran su fábrica en `aoeConeFactories`.
    const coneFactory = AOE_CONE_FACTORIES[style];
    if (coneFactory) {
      return coneFactory(ctx, x, z, nx, nz, reach, halfAngleDeg, color, life);
    }
    // El efecto del estilo se centra en la mitad del cono con un radio que
    // cabe dentro del abanico; la telegrafía sigue marcando el borde real.
    const effectCenterX = x + nx * reach * 0.5;
    const effectCenterZ = z + nz * reach * 0.5;
    // Radio del círculo inscrito en el cono a media longitud: el efecto del
    // estilo se queda dentro del abanico sin tapar la telegrafía.
    const effectRadius = Math.max(
      0.35,
      reach * 0.5 * Math.tan(Math.min(half, Math.PI / 4))
    );
    const anchors = coneAnchors(x, z, nx, nz, reach, half);
    const factory = AOE_FACTORIES[style] ?? AOE_FACTORIES.ring;
    const firstEffect = ctx.effects.length;
    ctx.withAnchors(anchors, () =>
      factory(ctx, effectCenterX, effectCenterZ, effectRadius, color, life)
    );
    const created = ctx.effects.slice(firstEffect);
    const bases = created.map((effect) => {
      const position = effect.entity.getPosition();
      return {
        effect,
        x: position.x,
        z: position.z,
        yaw: effect.entity.getEulerAngles().y * DEG
      };
    });
    let vertexX = x;
    let vertexZ = z;
    let currentDirX = nx;
    let currentDirZ = nz;
    // Coloca el conjunto relativo al vértice actual. `setCenter` mueve y
    // `setDirection` gira; ambas operaciones comparten el mismo cálculo para no
    // desincronizar las posiciones de los efectos con la dirección del cono.
    const place = (): void => {
      const delta = Math.atan2(currentDirX, currentDirZ) - Math.atan2(nx, nz);
      const cos = Math.cos(delta);
      const sin = Math.sin(delta);
      for (const base of bases) {
        const offsetX = base.x - x;
        const offsetZ = base.z - z;
        const position = base.effect.entity.getPosition();
        base.effect.entity.setPosition(
          vertexX + offsetX * cos + offsetZ * sin,
          position.y,
          vertexZ + offsetZ * cos - offsetX * sin
        );
        base.effect.entity.setEulerAngles(0, (base.yaw + delta) / DEG, 0);
        base.effect.anchors = coneAnchors(
          vertexX,
          vertexZ,
          currentDirX,
          currentDirZ,
          reach,
          half
        );
      }
    };
    return {
      setCenter: (nextX, nextZ) => {
        vertexX = nextX;
        vertexZ = nextZ;
        place();
      },
      setDirection: (nextDirX, nextDirZ) => {
        const length = Math.hypot(nextDirX, nextDirZ);
        if (length < 0.0001) return;
        currentDirX = nextDirX / length;
        currentDirZ = nextDirZ / length;
        place();
      },
      destroy: () => {
        for (const effect of created) ctx.disposeEffect(effect);
      }
    };
}

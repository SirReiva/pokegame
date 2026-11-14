/**
 * Sistema de proyectiles.
 *
 * Avanza cada proyectil, resuelve el primer obstáculo del tramo y reparte los
 * impactos en orden de entrada. El host aporta el estado mutable y las acciones
 * de combate; este módulo solo contiene la geometría y el orden de resolución.
 */

import type { AbilityDamageOptions } from '../abilityExecutors';
import type { CombatFxPort } from '../core/ports/fx';
import type { MatchPlayerState, Projectile } from '../matchState';
import type { World } from '../world';
import {
  closestPointOnSegment,
  pointSegmentDistance,
  raycastColliderDistance,
  segmentBlockedByColliders
} from '../combat';

export interface ProjectileSystemHost {
  readonly projectiles: Projectile[];
  readonly matchPlayers: readonly MatchPlayerState[];
  readonly world: World;
  readonly combatFx: CombatFxPort;
  isMatchOver(): boolean;
  canHit(attacker: MatchPlayerState, target: MatchPlayerState): boolean;
  applyAbilityDamage(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: Projectile['def'],
    options?: AbilityDamageOptions
  ): boolean;
  removeProjectile(projectile: Projectile): void;
  playImpactSound(): void;
}

export function stepProjectiles(host: ProjectileSystemHost, dt: number): void {
  // Un KO en un paso anterior del frame cancela los proyectiles restantes.
  if (host.isMatchOver()) return;
  // Se recorre en orden de creación, no del más nuevo al más antiguo: si dos
  // proyectiles alcanzan al mismo objetivo en el mismo frame, el KO se atribuye
  // al más antiguo y el recién creado no puede robarlo. Se usa una copia porque
  // los proyectiles se retiran durante el recorrido.
  for (const projectile of host.projectiles.slice()) {
    // Un impacto de este mismo frame pudo cerrar la partida.
    if (host.isMatchOver()) return;
    const previousX = projectile.x;
    const previousZ = projectile.z;
    // El último tramo se recorta al alcance restante para que el proyectil
    // termine siempre exactamente en `range`. Sin este recorte, a 20 FPS la
    // muestra final podía saltar de 8 a 9 u, no comprobar ese tramo y
    // desaparecer: el alcance efectivo dependía del framerate.
    const advance = Math.hypot(projectile.vx, projectile.vz) * dt;
    const remaining = Math.max(0, projectile.def.range - projectile.traveled);
    const step = Math.min(advance, remaining);
    const exhausted = step >= remaining;
    const reach = advance > 0 ? step / advance : 0;
    projectile.x += projectile.vx * dt * reach;
    projectile.z += projectile.vz * dt * reach;
    projectile.traveled += step;
    projectile.visual.setPosition(projectile.x, projectile.z);
    projectile.visual.update(dt);
    const bounds = host.world.bounds;
    const padding = Math.max(0.05, projectile.def.radius);
    // Se comprueba todo el tramo recorrido, no solo la posición final: a 20 FPS
    // (dt 0,05) el shuriken de Greninja avanza 1 u por frame y podía atravesar
    // un árbol de ~0,22 u de radio sin que el punto final tocara nada. El
    // padding es el radio del proyectil, igual que antes.
    const blocked = segmentBlockedByColliders(
      previousX,
      previousZ,
      projectile.x,
      projectile.z,
      host.world.colliders,
      padding
    );
    const travelX = projectile.x - previousX;
    const travelZ = projectile.z - previousZ;
    const travelLength = Math.hypot(travelX, travelZ);

    // Punto de estallido del obstáculo. Se calcula aparte de los objetivos
    // porque el impacto se resuelve por el primer evento del tramo.
    let obstacleImpactX = projectile.x;
    let obstacleImpactZ = projectile.z;
    if (blocked) {
      // La piedra, el orbe o el shuriken también deben estallar al chocar con
      // un separador, muro, roca o árbol. Se busca el primer punto de contacto
      // dentro del tramo, pero se retrasa un poco hacia el lanzador: así el
      // estallido queda fuera del radio de ocultación de la cordillera y se ve,
      // en vez de desaparecer dentro de la niebla del separador.
      const impactPadding = padding + 0.6;
      const contact = raycastColliderDistance(
        previousX,
        previousZ,
        travelX,
        travelZ,
        travelLength,
        host.world.colliders,
        impactPadding
      );
      const ratio = travelLength > 0.000001 ? contact / travelLength : 0;
      obstacleImpactX = previousX + travelX * ratio;
      obstacleImpactZ = previousZ + travelZ * ratio;
    }

    if (
      !blocked &&
      (Math.abs(projectile.x) > bounds.x ||
        Math.abs(projectile.z) > bounds.z)
    ) {
      host.removeProjectile(projectile);
      continue;
    }

    const hits: Array<{
      target: MatchPlayerState;
      distance: number;
      impactX: number;
      impactZ: number;
    }> = [];
    for (const target of host.matchPlayers) {
      if (!host.canHit(projectile.owner, target)) continue;
      if (projectile.hit.has(target)) continue;
      const hitRadius = target.hitRadius + projectile.def.radius;
      // La distancia se mide contra todo el tramo recorrido, no solo contra la
      // posición final: con pasos largos un roce lateral podía caer entre dos
      // muestras y perderse.
      if (
        pointSegmentDistance(
          target.x,
          target.z,
          previousX,
          previousZ,
          projectile.x,
          projectile.z
        ) > hitRadius
      ) {
        continue;
      }
      // La línea desde el punto de contacto hasta el objetivo tampoco puede
      // cruzar un obstáculo: un impacto justo al otro lado de un muro no cuenta.
      const contact = closestPointOnSegment(
        target.x,
        target.z,
        previousX,
        previousZ,
        projectile.x,
        projectile.z
      );
      if (
        segmentBlockedByColliders(
          contact.x,
          contact.z,
          target.x,
          target.z,
          host.world.colliders
        )
      ) {
        continue;
      }

      // El estallido se dibuja en la superficie de entrada del proyectil, no en
      // el centro del objetivo. Cerca de un separador, ese centro puede caer
      // dentro de su radio de niebla y el impacto desaparecía. La misma
      // distancia de entrada ordena los objetivos dentro del tramo.
      let entryDistance = 0;
      let impactX = target.x;
      let impactZ = target.z;
      if (travelLength > 0.0001) {
        const unitX = travelX / travelLength;
        const unitZ = travelZ / travelLength;
        const toTargetX = target.x - previousX;
        const toTargetZ = target.z - previousZ;
        const along = toTargetX * unitX + toTargetZ * unitZ;
        const perpendicular = Math.abs(
          toTargetX * unitZ - toTargetZ * unitX
        );
        const entryOffset = Math.sqrt(
          Math.max(0, hitRadius * hitRadius - perpendicular * perpendicular)
        );
        entryDistance = Math.min(
          travelLength,
          Math.max(0, along - entryOffset)
        );
        impactX = previousX + unitX * entryDistance;
        impactZ = previousZ + unitZ * entryDistance;
      }
      // Si hay un collider entre el inicio del tramo y la superficie de entrada
      // del objetivo, el obstáculo es anterior: no se puede golpear primero al
      // rival que queda detrás.
      if (
        blocked &&
        segmentBlockedByColliders(
          previousX,
          previousZ,
          impactX,
          impactZ,
          host.world.colliders,
          padding
        )
      ) {
        continue;
      }
      hits.push({
        target,
        distance: entryDistance,
        impactX,
        impactZ
      });
    }
    hits.sort((a, b) => a.distance - b.distance);

    let removed = false;
    for (const hit of hits) {
      if (host.isMatchOver()) break;
      projectile.hit.add(hit.target);
      host.applyAbilityDamage(projectile.owner, hit.target, projectile.def, {
        healToken: projectile.healToken,
        impactX: hit.impactX,
        impactZ: hit.impactZ,
        // El empuje nace donde entra el proyectil, no donde esté ahora el
        // tirador: si se movió durante el vuelo, la dirección no cambia.
        sourceX: hit.impactX,
        sourceZ: hit.impactZ
      });
      if (projectile.pierce > 0) {
        projectile.pierce -= 1;
      } else {
        host.removeProjectile(projectile);
        removed = true;
        break;
      }
    }
    if (removed || host.isMatchOver()) continue;

    if (blocked) {
      host.combatFx.spawnImpact(
        obstacleImpactX,
        obstacleImpactZ,
        projectile.def.color,
        1,
        projectile.def.impactStyle
      );
      // Un proyectil que choca contra un muro también debe oírse.
      host.playImpactSound();
      host.removeProjectile(projectile);
      continue;
    }

    // El alcance se agota después de revisar el tramo final, no antes.
    if (exhausted) host.removeProjectile(projectile);
  }
}

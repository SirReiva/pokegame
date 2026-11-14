import type { FxRuntime } from './fxRuntime';
import * as pc from 'playcanvas';
import type { BeamStyle } from '../../abilities';
import { DEG } from '../../config';
import type { TelegraphHandle, TelegraphOwner } from '../../core/ports/fx';
import type { FxAnchors, GroundTelegraph } from './fxGeometry';
import { TELEGRAPH_WALL_HEIGHT, TELEGRAPH_WALL_OPACITY, areaAnchors, coneAnchors, createArcBandMesh, createArcMesh, createWallMesh } from './fxGeometry';

/**
   * Marca de área para las habilidades con retardo. El aro del borde (color
   * del equipo) es la parte persistente: se mantiene desde el inicio de la
   * preparación hasta que termina el efecto o se cancela el lanzamiento. El
   * relleno, el disco de carga y el destello final solo acompañan al `windup`
   * y desaparecen al impactar. Con `windup` 0 (áreas instantáneas) la marca
   * nace directamente como aro.
   */
export function spawnAoeTelegraph(ctx: FxRuntime, x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number,
    effectDuration = 0,
    owner?: TelegraphOwner): TelegraphHandle {
const root = new pc.Entity('aoe-telegraph');
    root.setPosition(x, 0.08, z);
    ctx.app.root.addChild(root);

    const ringMaterial = ctx.createMaterial(color, 0.5);
    const hot: [number, number, number] = [
      Math.round(color[0] + (255 - color[0]) * 0.62),
      Math.round(color[1] + (255 - color[1]) * 0.62),
      Math.round(color[2] + (255 - color[2]) * 0.62)
    ];
    const dashMaterial = ctx.createMaterial(hot, 0.85);
    const fillMaterial = ctx.createMaterial(color, 0.08);
    const sweepMaterial = ctx.createMaterial(hot, 0.4);
    const wallMaterial = ctx.createTelegraphWallMaterial(color);
    const materials = [
      ringMaterial,
      dashMaterial,
      fillMaterial,
      sweepMaterial,
      wallMaterial
    ];

    const ring = ctx.createEntity(ctx.torusMesh, [ringMaterial], root);
    ring.setLocalScale(radius * 2, 1, radius * 2);

    const dash = ctx.createEntity(ctx.dashRingMesh, [dashMaterial], root);
    dash.setLocalScale(radius * 2, 1, radius * 2);

    const fill = ctx.createEntity(ctx.discMesh, [fillMaterial], root);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    const sweep = ctx.createEntity(ctx.discMesh, [sweepMaterial], root);
    sweep.setLocalScale(0.01, 1, 0.01);

    // Pared vertical en el borde del área: convierte el aro plano en un aviso
    // con volumen, legible desde cualquier ángulo de cámara.
    const wall = ctx.createEntity(
      ctx.cachedMesh('telegraph-wall-circle', () => {
        const points: Array<readonly [number, number]> = [];
        const segments = 64;
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          points.push([Math.sin(angle), Math.cos(angle)]);
        }
        return createWallMesh(ctx.device, points, true);
      }),
      [wallMaterial],
      root
    );
    wall.setLocalScale(radius, TELEGRAPH_WALL_HEIGHT, radius);

    const charge = Math.max(0, duration);
    const effect = Math.max(0, effectDuration);
    const total = Math.max(0.05, charge + effect);

    const record: GroundTelegraph = {
      entity: root,
      materials,
      elapsed: 0,
      duration: total,
      active: true,
      anchors: areaAnchors(x, z, radius),
      owner,
      update: (_progress, elapsed) => {
        const pulse = 0.5 + Math.sin(elapsed * 14) * 0.18;
        // El aro se apaga en el último tramo del efecto, a la vez que el
        // residuo visual del área, para que no desaparezca de golpe.
        const fade = Math.max(0, Math.min(1, (total - elapsed) / 0.3));
        ringMaterial.opacity = (0.3 + pulse * 0.35) * fade;
        dashMaterial.opacity = (0.55 + pulse * 0.35) * fade;
        wallMaterial.opacity = TELEGRAPH_WALL_OPACITY * fade;
        wall.enabled = fade > 0.001;
        dash.setLocalEulerAngles(0, -elapsed * 32, 0);

        const chargeProgress =
          charge > 0 ? Math.min(1, elapsed / charge) : 1;
        if (charge > 0 && elapsed < charge) {
          fillMaterial.opacity = (0.06 + pulse * 0.05) * fade;
          // Durante la preparación el disco crece hasta el radio real.
          const sweepScale = Math.max(0.01, radius * 2 * chargeProgress);
          sweep.setLocalScale(sweepScale, 1, sweepScale);
          sweepMaterial.opacity = 0.34 * (1 - chargeProgress * 0.55);

          // Destello final: avisa del impacto inminente.
          if (chargeProgress > 0.82) {
            const flash = (chargeProgress - 0.82) / 0.18;
            ringMaterial.opacity += flash * 0.45 * fade;
            dashMaterial.opacity += flash * 0.35 * fade;
            sweepMaterial.opacity += flash * 0.3;
          }
        } else {
          // Ya impactó: el aro queda solo como límite del área mientras dura
          // el efecto, sin relleno de carga ni destello. El efecto del área
          // (por ejemplo, el charco de Bomba Lodo) rellena el interior, así
          // que este disco no debe sumarse encima.
          fillMaterial.opacity = 0;
          sweep.setLocalScale(0.01, 1, 0.01);
          sweepMaterial.opacity = 0;
        }
      }
    };

    ctx.applyVisibility(root, areaAnchors(x, z, radius), false, owner);
    ctx.telegraphs.add(record);
    return {
      destroy: () => ctx.disposeTelegraph(record),
      setCenter: (nextX, nextZ) => {
        record.entity.setPosition(
          nextX,
          record.entity.getPosition().y,
          nextZ
        );
        record.anchors = areaAnchors(nextX, nextZ, radius);
      },
      setColor: (nextColor) => {
        const nextHot: [number, number, number] = [
          Math.round(nextColor[0] + (255 - nextColor[0]) * 0.62),
          Math.round(nextColor[1] + (255 - nextColor[1]) * 0.62),
          Math.round(nextColor[2] + (255 - nextColor[2]) * 0.62)
        ];
        ctx.setMaterialColor(ringMaterial, nextColor);
        ctx.setMaterialColor(dashMaterial, nextHot);
        ctx.setMaterialColor(fillMaterial, nextColor);
        ctx.setMaterialColor(sweepMaterial, nextHot);
        ctx.setMaterialColor(wallMaterial, nextColor);
      }
    };
}

/**
   * Marca de área en forma de cono. Funciona como la circular: el borde del
   * equipo se ve desde el inicio de la preparación y un relleno crece hasta el
   * borde durante el `windup`; después queda solo el contorno mientras dura el
   * efecto. El vértice está en `x/z` y el abanico apunta a `dirX/dirZ`.
   */
export function spawnAoeConeTelegraph(ctx: FxRuntime, x: number,
    z: number,
    dirX: number,
    dirZ: number,
    length: number,
    halfAngleDeg: number,
    color: readonly [number, number, number],
    duration: number,
    effectDuration = 0,
    owner?: TelegraphOwner): TelegraphHandle {
const rawLength = Math.hypot(dirX, dirZ);
    const nx = rawLength > 0.0001 ? dirX / rawLength : 0;
    const nz = rawLength > 0.0001 ? dirZ / rawLength : 1;
    const half = Math.max(8, Math.min(89, halfAngleDeg)) * DEG;
    const reach = Math.max(0.1, length);
    const yaw = Math.atan2(nx, nz);

    const root = new pc.Entity('aoe-cone-telegraph');
    root.setPosition(x, 0.08, z);
    root.setEulerAngles(0, yaw / DEG, 0);
    ctx.app.root.addChild(root);

    const hot: [number, number, number] = [
      Math.round(color[0] + (255 - color[0]) * 0.62),
      Math.round(color[1] + (255 - color[1]) * 0.62),
      Math.round(color[2] + (255 - color[2]) * 0.62)
    ];
    const bandMaterial = ctx.createMaterial(color, 0.5);
    const edgeMaterial = ctx.createMaterial(hot, 0.85);
    const fillMaterial = ctx.createMaterial(color, 0.08);
    const sweepMaterial = ctx.createMaterial(hot, 0.4);
    const wallMaterial = ctx.createTelegraphWallMaterial(color);
    const materials = [
      bandMaterial,
      edgeMaterial,
      fillMaterial,
      sweepMaterial,
      wallMaterial
    ];

    const angleKey = Math.round(halfAngleDeg * 10);
    const wedgeMesh = ctx.cachedMesh(`aoe-cone-fill-${angleKey}`, () =>
      createArcMesh(ctx.device, 1, half, 32)
    );
    const bandMesh = ctx.cachedMesh(`aoe-cone-band-${angleKey}`, () =>
      createArcBandMesh(ctx.device, 0.955, 1, half, 32).mesh
    );

    const fill = ctx.createEntity(wedgeMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.002, 0);
    fill.setLocalScale(reach, 1, reach);

    const band = ctx.createEntity(bandMesh, [bandMaterial], root);
    band.setLocalPosition(0, 0.006, 0);
    band.setLocalScale(reach, 1, reach);

    const sweep = ctx.createEntity(wedgeMesh, [sweepMaterial], root);
    sweep.setLocalPosition(0, 0.004, 0);
    sweep.setLocalScale(0.01, 1, 0.01);

    // Raíles laterales: marcan las dos aristas del cono desde el primer frame.
    for (const side of [-1, 1]) {
      const angle = side * half;
      const rail = ctx.createEntity(ctx.boxMesh, [edgeMaterial], root);
      rail.setLocalEulerAngles(0, angle / DEG, 0);
      rail.setLocalPosition(
        Math.sin(angle) * reach * 0.5,
        0.008,
        Math.cos(angle) * reach * 0.5
      );
      rail.setLocalScale(0.035, 0.012, reach);
    }

    // Pared que recorre el borde del cono (las dos aristas y el arco exterior)
    // para que el abanico también tenga volumen.
    const wall = ctx.createEntity(
      ctx.cachedMesh(`telegraph-wall-cone-${angleKey}`, () => {
        const points: Array<readonly [number, number]> = [[0, 0]];
        const segments = 32;
        for (let i = 0; i <= segments; i++) {
          const angle = -half + (2 * half * i) / segments;
          points.push([Math.sin(angle), Math.cos(angle)]);
        }
        points.push([0, 0]);
        return createWallMesh(ctx.device, points, false);
      }),
      [wallMaterial],
      root
    );
    wall.setLocalScale(reach, TELEGRAPH_WALL_HEIGHT, reach);

    const charge = Math.max(0, duration);
    const effect = Math.max(0, effectDuration);
    const total = Math.max(0.05, charge + effect);

    const record: GroundTelegraph = {
      entity: root,
      materials,
      elapsed: 0,
      duration: total,
      active: true,
      anchors: coneAnchors(x, z, nx, nz, reach, half),
      owner,
      update: (_progress, elapsed) => {
        const pulse = 0.5 + Math.sin(elapsed * 14) * 0.18;
        const fade = Math.max(0, Math.min(1, (total - elapsed) / 0.3));
        bandMaterial.opacity = (0.3 + pulse * 0.35) * fade;
        edgeMaterial.opacity = (0.55 + pulse * 0.35) * fade;
        wallMaterial.opacity = TELEGRAPH_WALL_OPACITY * fade;
        wall.enabled = fade > 0.001;

        const chargeProgress = charge > 0 ? Math.min(1, elapsed / charge) : 1;
        if (charge > 0 && elapsed < charge) {
          fillMaterial.opacity = (0.06 + pulse * 0.05) * fade;
          // El relleno crece desde el vértice hasta el borde, igual que el
          // disco de la marca circular.
          const sweepLength = Math.max(0.01, reach * chargeProgress);
          sweep.setLocalScale(sweepLength, 1, sweepLength);
          sweepMaterial.opacity = 0.34 * (1 - chargeProgress * 0.55);

          if (chargeProgress > 0.82) {
            const flash = (chargeProgress - 0.82) / 0.18;
            bandMaterial.opacity += flash * 0.45 * fade;
            edgeMaterial.opacity += flash * 0.35 * fade;
            sweepMaterial.opacity += flash * 0.3;
          }
        } else {
          // Ya impactó: queda solo el contorno. El relleno propio del efecto
          // ocupa el abanico y no debe sumarse con este.
          fillMaterial.opacity = 0;
          sweep.setLocalScale(0.01, 1, 0.01);
          sweepMaterial.opacity = 0;
        }
      }
    };

    const anchors = coneAnchors(x, z, nx, nz, reach, half);
    ctx.applyVisibility(root, anchors, false, owner);
    ctx.telegraphs.add(record);
    return {
      destroy: () => ctx.disposeTelegraph(record),
      setCenter: (nextX, nextZ) => {
        record.entity.setPosition(
          nextX,
          record.entity.getPosition().y,
          nextZ
        );
        record.anchors = coneAnchors(nextX, nextZ, nx, nz, reach, half);
      }
    };
}

/**
   * Carril de un haz en el suelo. Los raíles muestran el ancho real de impacto
   * desde el primer frame del `windup`; el relleno crece desde el lanzador y se
   * completa al disparar. Después permanece encendido hasta que termina el
   * efecto visual del haz, de modo que el aviso y el golpe se solapan.
   */
export function spawnBeamLane(ctx: FxRuntime, x1: number,
    z1: number,
    x2: number,
    z2: number,
    halfWidth: number,
    color: readonly [number, number, number],
    windup: number,
    style: BeamStyle,
    owner?: TelegraphOwner): TelegraphHandle {
const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const width = Math.max(0.12, halfWidth * 2);
    const beamDuration = ctx.beamDurations[style] ?? 0.5;
    const total = Math.max(0.05, windup) + beamDuration;

    const root = new pc.Entity('beam-lane');
    // Mismo plano que la marca de área para no pelearse con el terreno.
    root.setPosition(x1, 0.07, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    ctx.app.root.addChild(root);

    const hot: [number, number, number] = [
      Math.round(color[0] + (255 - color[0]) * 0.62),
      Math.round(color[1] + (255 - color[1]) * 0.62),
      Math.round(color[2] + (255 - color[2]) * 0.62)
    ];
    const fillMaterial = ctx.createMaterial(color, 0.08);
    const railMaterial = ctx.createMaterial(color, 0.45);
    const edgeMaterial = ctx.createMaterial(hot, 0.8);
    const wallMaterial = ctx.createTelegraphWallMaterial(color);
    const materials = [fillMaterial, railMaterial, edgeMaterial, wallMaterial];

    // Relleno que avanza desde el lanzador: marca el carril y su dirección.
    const fill = ctx.createEntity(ctx.boxMesh, [fillMaterial], root);
    fill.setLocalScale(width, 0.01, 0.01);
    fill.setLocalPosition(0, 0.002, 0.005);

    // Raíles completos desde el primer frame: el rival ve el ancho real.
    const railWidth = Math.max(0.04, width * 0.06);
    const railOffset = Math.max(0, width / 2 - railWidth / 2);
    for (const side of [-1, 1]) {
      const rail = ctx.createEntity(ctx.boxMesh, [railMaterial], root);
      rail.setLocalScale(railWidth, 0.012, length);
      rail.setLocalPosition(side * railOffset, 0.006, length / 2);
    }

    // Remate del extremo para leer hasta dónde llega el haz.
    const cap = ctx.createEntity(ctx.boxMesh, [edgeMaterial], root);
    cap.setLocalScale(width, 0.014, Math.max(0.05, railWidth * 1.4));
    cap.setLocalPosition(0, 0.008, length);

    // Paredes verticales en los dos costados y en el extremo del carril. La
    // forma es una U abierta por el lado del lanzador para no taparlo.
    const wall = ctx.createEntity(
      ctx.cachedMesh('telegraph-wall-beam', () => {
        const points: Array<readonly [number, number]> = [
          [-0.5, 0],
          [-0.5, 1],
          [0.5, 1],
          [0.5, 0]
        ];
        return createWallMesh(ctx.device, points, false);
      }),
      [wallMaterial],
      root
    );
    wall.setLocalScale(width, TELEGRAPH_WALL_HEIGHT, length);

    const perpX = -dz / length;
    const perpZ = dx / length;
    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    const anchors: FxAnchors = [
      [x1, z1],
      [midX + perpX * halfWidth, midZ + perpZ * halfWidth],
      [midX, midZ],
      [midX - perpX * halfWidth, midZ - perpZ * halfWidth],
      [x2, z2]
    ];

    const record: GroundTelegraph = {
      entity: root,
      materials,
      elapsed: 0,
      duration: total,
      active: true,
      anchors,
      owner,
      update: (_progress, elapsed) => {
        const firing = elapsed >= windup;
        const sinceFire = firing ? elapsed - windup : 0;
        const charge = Math.min(1, elapsed / Math.max(0.001, windup));
        const visibleLength = Math.max(0.02, length * (firing ? 1 : charge));
        fill.setLocalScale(width, 0.01, visibleLength);
        fill.setLocalPosition(0, 0.002, visibleLength / 2);

        const pulse = 0.5 + Math.sin(elapsed * 14) * 0.2;
        // Destello al disparar y permanencia hasta el final del haz.
        const flash = firing ? Math.max(0, 1 - sinceFire / 0.14) : 0;
        const fadeStart = beamDuration * 0.5;
        const fade = firing
          ? 1 -
            Math.max(
              0,
              Math.min(1, (sinceFire - fadeStart) / (beamDuration - fadeStart))
            )
          : 1;
        fillMaterial.opacity =
          (firing ? 0.2 + flash * 0.18 : 0.06 + charge * 0.1) * fade;
        railMaterial.opacity = (0.35 + pulse * 0.2 + flash * 0.4) * fade;
        edgeMaterial.opacity = (0.6 + pulse * 0.22 + flash * 0.4) * fade;
        wallMaterial.opacity = TELEGRAPH_WALL_OPACITY * fade;
        wall.enabled = fade > 0.001;
      }
    };

    ctx.applyVisibility(root, anchors, false, owner);
    ctx.telegraphs.add(record);
    return { destroy: () => ctx.disposeTelegraph(record) };
}

import * as pc from 'playcanvas';

/**
 * Poda de curvas de animación que no cambian la pose.
 *
 * Los GLB de los Pokémon traen tres canales por hueso (translation, rotation y
 * scale), pero la mayoría son constantes e iguales al bind: en el catálogo son
 * el ~78 % de los canales, y el ~60 % se puede quitar sin tocar ninguna pose.
 * `AnimEvaluator` recorre todas las curvas activas en cada copia del modelo, así
 * que eliminarlas es una de las optimizaciones más baratas para el frame.
 *
 * La poda se hace una vez por modelo, con el grafo recién instanciado (pose de
 * bind). Se conserva una curva solo si su ruta no es podable; las pistas que no
 * cambian se devuelven tal cual.
 */

/** Tolerancia al comparar valores de la pista con el bind (float32). */
const BIND_EPSILON = 1e-5;

/** Propiedad de grafo que puede animar una curva. */
const TRANSFORM_PROPERTIES = new Set([
  'localPosition',
  'localRotation',
  'localScale'
]);

interface CurvePathLike {
  entityPath: string[];
  component: string;
  propertyPath: string[];
}

function pathKey(path: CurvePathLike): string {
  return `${path.component}\u0001${path.entityPath.join('\u0001')}\u0001${path.propertyPath.join('\u0001')}`;
}

/** Resuelve la ruta de una curva igual que `DefaultAnimBinder`. */
function resolveCurveNode(
  root: pc.GraphNode,
  path: CurvePathLike
): pc.GraphNode | null {
  if (
    path.component !== 'graph' ||
    path.propertyPath.length !== 1 ||
    !TRANSFORM_PROPERTIES.has(path.propertyPath[0])
  ) {
    return null;
  }
  return (
    root.findByPath(path.entityPath) ??
    (path.entityPath.length > 1
      ? root.findByPath(path.entityPath.slice(1))
      : null)
  );
}

function bindComponents(node: pc.GraphNode, property: string): number[] {
  if (property === 'localPosition') {
    const position = node.getLocalPosition();
    return [position.x, position.y, position.z];
  }
  if (property === 'localRotation') {
    const rotation = node.getLocalRotation();
    return [rotation.x, rotation.y, rotation.z, rotation.w];
  }
  const scale = node.getLocalScale();
  return [scale.x, scale.y, scale.z];
}

/**
 * `true` si la curva es constante y su valor coincide con el transform de bind
 * del nodo. En rotaciones, `q` y `-q` representan la misma pose.
 */
function isBindConstantCurve(
  track: pc.AnimTrack,
  curve: pc.AnimCurve,
  root: pc.GraphNode
): boolean {
  if (curve.paths.length === 0) return false;
  const property = curve.paths[0].propertyPath[0];
  const output = track.outputs[curve.output];
  const data = output.data;
  const components = output.components;
  if (data.length === 0 || components === 0) return false;
  const count = data.length / components;

  // Todos los keyframes tienen que valer lo mismo.
  for (let keyframe = 1; keyframe < count; keyframe++) {
    for (let component = 0; component < components; component++) {
      if (
        Math.abs(
          data[keyframe * components + component] - data[component]
        ) > BIND_EPSILON
      ) {
        return false;
      }
    }
  }

  // Cada target de la curva tiene que coincidir con su propio bind.
  for (const path of curve.paths) {
    const node = resolveCurveNode(root, path);
    if (!node) return false;
    const bind = bindComponents(node, path.propertyPath[0]);
    if (bind.length !== components) return false;

    let equal = true;
    for (let component = 0; component < components; component++) {
      if (Math.abs(data[component] - bind[component]) > BIND_EPSILON) {
        equal = false;
        break;
      }
    }
    if (!equal && property === 'localRotation') {
      equal = true;
      for (let component = 0; component < components; component++) {
        if (Math.abs(data[component] + bind[component]) > BIND_EPSILON) {
          equal = false;
          break;
        }
      }
    }
    if (!equal) return false;
  }
  return true;
}

function curveIsPrunable(
  curve: pc.AnimCurve,
  prunablePaths: ReadonlySet<string>
): boolean {
  return (
    curve.paths.length > 0 &&
    curve.paths.every((path) => prunablePaths.has(pathKey(path)))
  );
}

/**
 * Reconstruye una pista sin las curvas podadas. Se reutilizan los `AnimData`
 * de entrada y salida y se remapean los índices de las curvas que quedan.
 */
function rebuildTrack(
  track: pc.AnimTrack,
  prunablePaths: ReadonlySet<string>
): pc.AnimTrack {
  const curves = track.curves.filter(
    (curve) => !curveIsPrunable(curve, prunablePaths)
  );
  if (curves.length === track.curves.length) return track;

  const inputMap = new Map<number, number>();
  const outputMap = new Map<number, number>();
  const inputs: pc.AnimData[] = [];
  const outputs: pc.AnimData[] = [];
  const rebuilt = curves.map((curve) => {
    let input = inputMap.get(curve.input);
    if (input === undefined) {
      input = inputs.length;
      inputMap.set(curve.input, input);
      inputs.push(track.inputs[curve.input]);
    }
    let output = outputMap.get(curve.output);
    if (output === undefined) {
      output = outputs.length;
      outputMap.set(curve.output, output);
      outputs.push(track.outputs[curve.output]);
    }
    return new pc.AnimCurve(
      curve.paths,
      input,
      output,
      curve.interpolation
    );
  });

  // Los eventos no se usan en el juego, pero se conservan por si un GLB los
  // trae y alguien los escucha más adelante.
  const events = (track as unknown as { _animEvents?: pc.AnimEvents })
    ._animEvents;
  return new pc.AnimTrack(
    track.name,
    track.duration,
    inputs,
    outputs,
    rebuilt,
    events
  );
}

/**
 * Elimina de las pistas las curvas que no cambian la pose.
 *
 * Una curva solo es podable si:
 * - todas las pistas usadas tienen una curva para esa ruta,
 * - su valor es constante en todos los keyframes,
 * - y coincide con el transform de bind del nodo.
 *
 * Así, al quitar la curva el nodo se queda exactamente donde lo dejaría la
 * animación y no hay saltos al cambiar de clip. Las pistas no podables se
 * devuelven tal cual.
 */
export function pruneBindConstantTracks(
  tracks: readonly pc.AnimTrack[],
  root: pc.GraphNode
): Map<pc.AnimTrack, pc.AnimTrack> {
  const unique = [...new Set(tracks)];
  const pathCount = new Map<string, number>();
  const unsafe = new Set<string>();

  for (const track of unique) {
    const seen = new Set<string>();
    for (const curve of track.curves) {
      for (const path of curve.paths) {
        const key = pathKey(path);
        seen.add(key);
        if (!isBindConstantCurve(track, curve, root)) unsafe.add(key);
      }
    }
    for (const key of seen) {
      pathCount.set(key, (pathCount.get(key) ?? 0) + 1);
    }
  }

  const prunable = new Set<string>();
  for (const [key, count] of pathCount) {
    if (count === unique.length && !unsafe.has(key)) prunable.add(key);
  }
  if (prunable.size === 0) return new Map();

  const result = new Map<pc.AnimTrack, pc.AnimTrack>();
  for (const track of unique) {
    const pruned = rebuildTrack(track, prunable);
    if (pruned !== track) result.set(track, pruned);
  }
  return result;
}

/** Modelos cuyo esqueleto ya se ha analizado para podar curvas constantes. */
const PRUNED_MODELS = new WeakSet<object>();

/**
 * Poda una vez las pistas de un modelo con la pose de bind ya instanciada. Hay
 * que llamarlo antes de añadir el `AnimComponent`: si la animación ya ha
 * evaluado una pose, los transforms del grafo no son el bind.
 */
export function pruneBindConstantClips(
  owner: object,
  clips: ReadonlyArray<{ track: pc.AnimTrack }>,
  root: pc.GraphNode
): void {
  if (PRUNED_MODELS.has(owner) || clips.length === 0) {
    PRUNED_MODELS.add(owner);
    return;
  }
  const pruned = pruneBindConstantTracks(
    clips.map((clip) => clip.track),
    root
  );
  for (const clip of clips) {
    clip.track = pruned.get(clip.track) ?? clip.track;
  }
  PRUNED_MODELS.add(owner);
}

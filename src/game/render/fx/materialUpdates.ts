/**
 * Actualización perezosa de los materiales que animan los efectos.
 *
 * `StandardMaterial.update()` no es un setter: convierte las propiedades
 * modificadas en datos del uniform buffer, recalcula los transforms de texturas
 * y obliga a subir el buffer entero en el siguiente render. Los efectos y los
 * números de daño ajustan opacidad y tinte cada frame, pero muchos materiales
 * conservan el mismo valor (piezas estáticas del efecto, tramos del fundido con
 * la opacidad ya al mínimo, materiales que solo animan su transform). Comparar
 * antes de llamar evita ese trabajo sin cambiar lo que se ve.
 *
 * El helper solo vigila los valores que se animan por frame. Los cambios
 * estructurales (defines, mezcla, texturas, mapas) siguen necesitando un
 * `update()` explícito, como ya hacen las fábricas de materiales.
 */

/** Campos de `pc.StandardMaterial` que se animan por frame. */
export interface MaterialUpdateTarget {
  opacity: number;
  emissive: { r: number; g: number; b: number };
  emissiveIntensity: number;
  update(): void;
}

interface MaterialSnapshot {
  opacity: number;
  emissiveR: number;
  emissiveG: number;
  emissiveB: number;
  emissiveIntensity: number;
}

const snapshots = new WeakMap<MaterialUpdateTarget, MaterialSnapshot>();

/**
 * Llama a `material.update()` solo si cambió alguno de los valores animados
 * desde la última vez. Devuelve `true` cuando hubo actualización.
 */
export function updateMaterialIfChanged(
  material: MaterialUpdateTarget
): boolean {
  const { emissive } = material;
  const opacity = material.opacity;
  const emissiveIntensity = material.emissiveIntensity;
  const snapshot = snapshots.get(material);

  if (
    snapshot &&
    snapshot.opacity === opacity &&
    snapshot.emissiveR === emissive.r &&
    snapshot.emissiveG === emissive.g &&
    snapshot.emissiveB === emissive.b &&
    snapshot.emissiveIntensity === emissiveIntensity
  ) {
    return false;
  }

  if (snapshot) {
    snapshot.opacity = opacity;
    snapshot.emissiveR = emissive.r;
    snapshot.emissiveG = emissive.g;
    snapshot.emissiveB = emissive.b;
    snapshot.emissiveIntensity = emissiveIntensity;
  } else {
    // El objeto se reutiliza: así el seguimiento no genera basura por frame.
    snapshots.set(material, {
      opacity,
      emissiveR: emissive.r,
      emissiveG: emissive.g,
      emissiveB: emissive.b,
      emissiveIntensity
    });
  }

  material.update();
  return true;
}

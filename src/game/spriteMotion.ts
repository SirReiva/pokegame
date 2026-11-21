/**
 * Desplazamiento en el suelo que debe seguir la sombra de un actor cuando el
 * arte se mueve dentro del frame.
 *
 * Los sprites solo tienen 8 filas de dirección. La sombra no puede seguir la
 * dirección continua de la cámara: se mueve en la misma dirección cardinal o
 * diagonal que la fila visible. La componente horizontal del arte va por el eje
 * derecho de la cámara; la vertical se convierte en avance/retroceso.
 */

export interface RowGroundMotionInput {
  /** Fila de 8 direcciones que se está dibujando (0 = hacia la cámara). */
  row: number;
  /** Dirección horizontal normalizada desde el actor hacia la cámara. */
  toCamX: number;
  /** Dirección vertical normalizada desde el actor hacia la cámara. */
  toCamZ: number;
  /** Delta horizontal del ancla del frame, en píxeles de arte. */
  pixelX: number;
  /** Delta vertical del ancla del frame, en píxeles de arte. */
  pixelY: number;
  /** Unidades de mundo por píxel de arte. */
  pixelScale: number;
  /** Compensación de la inclinación de la cámara (`1 / sin(pitch)`). */
  verticalScale: number;
}

export interface GroundMotion {
  x: number;
  z: number;
}

export function rowGroundMotion(input: RowGroundMotionInput): GroundMotion {
  const rightX = input.toCamZ;
  const rightZ = -input.toCamX;
  const rowAngle = input.row * (Math.PI / 4);
  const sinRow = Math.sin(rowAngle);
  const cosRow = Math.cos(rowAngle);
  // Dirección de la fila en el mundo: 0 = hacia la cámara, 2 = derecha...
  const dirX = input.toCamX * cosRow + rightX * sinRow;
  const dirZ = input.toCamZ * cosRow + rightZ * sinRow;
  // Proyección del movimiento del arte sobre esa dirección de 8 sentidos.
  const horizontal = input.pixelX * input.pixelScale;
  const vertical = input.pixelY * input.pixelScale * input.verticalScale;
  const along = horizontal * sinRow + vertical * cosRow;
  return { x: dirX * along, z: dirZ * along };
}

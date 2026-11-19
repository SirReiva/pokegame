/**
 * Ajuste logístico Bradley-Terry con intercepto de lado para el balance 4v4.
 * Copiado de `scripts/balance-teams.ts` para reutilizarlo sin ejecutar el
 * informe completo.
 */

export interface RatingResult {
  rating: Map<string, number>;
  error: Map<string, number>;
  sideBias: number;
  sideError: number;
  logLoss: number;
  samples: number;
}

export interface RatingSample {
  red: string[];
  blue: string[];
  y: 0 | 1;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function logLossOf(
  samples: readonly RatingSample[],
  weights: Float64Array,
  index: Map<string, number>,
  beta: number
): number {
  let total = 0;
  for (const sample of samples) {
    let z = weights[beta];
    for (const id of sample.red) z += weights[index.get(id) ?? 0] ?? 0;
    for (const id of sample.blue) z -= weights[index.get(id) ?? 0] ?? 0;
    const p = sigmoid(z);
    total -=
      sample.y * Math.log(Math.max(1e-12, p)) +
      (1 - sample.y) * Math.log(Math.max(1e-12, 1 - p));
  }
  return samples.length > 0 ? total / samples.length : 0;
}

/** Eliminación gaussiana con pivoteo parcial. */
function solveLinear(
  matrix: Float64Array[],
  vector: Float64Array,
  size: number
): Float64Array {
  const a = matrix.map((row) => Float64Array.from(row));
  const b = Float64Array.from(vector);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    }
    if (pivot !== column) {
      [a[column], a[pivot]] = [a[pivot], a[column]];
      [b[column], b[pivot]] = [b[pivot], b[column]];
    }
    const divisor = a[column][column];
    if (Math.abs(divisor) < 1e-12) continue;
    for (let row = column + 1; row < size; row++) {
      const factor = a[row][column] / divisor;
      if (factor === 0) continue;
      for (let inner = column; inner < size; inner++) {
        a[row][inner] -= factor * a[column][inner];
      }
      b[row] -= factor * b[column];
    }
  }
  const solution = new Float64Array(size);
  for (let row = size - 1; row >= 0; row--) {
    let sum = b[row];
    for (let column = row + 1; column < size; column++) {
      sum -= a[row][column] * solution[column];
    }
    solution[row] = Math.abs(a[row][row]) < 1e-12 ? 0 : sum / a[row][row];
  }
  return solution;
}

/** Inversa por Gauss-Jordan con pivoteo parcial. */
function invert(matrix: Float64Array[], size: number): Float64Array[] {
  const a = matrix.map((row) => Float64Array.from(row));
  const inverse = Array.from({ length: size }, (_, row) => {
    const unit = new Float64Array(size);
    unit[row] = 1;
    return unit;
  });
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    }
    if (pivot !== column) {
      [a[column], a[pivot]] = [a[pivot], a[column]];
      [inverse[column], inverse[pivot]] = [inverse[pivot], inverse[column]];
    }
    const divisor = a[column][column];
    if (Math.abs(divisor) < 1e-12) continue;
    for (let inner = 0; inner < size; inner++) {
      a[column][inner] /= divisor;
      inverse[column][inner] /= divisor;
    }
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = a[row][column];
      if (factor === 0) continue;
      for (let inner = 0; inner < size; inner++) {
        a[row][inner] -= factor * a[column][inner];
        inverse[row][inner] -= factor * inverse[column][inner];
      }
    }
  }
  return inverse;
}

export function fitRating(
  samples: readonly RatingSample[],
  pool: readonly string[]
): RatingResult {
  const rated = pool.filter((id) =>
    samples.some((sample) => sample.red.includes(id) || sample.blue.includes(id))
  );
  const index = new Map(rated.map((id, position) => [id, position]));
  const n = rated.length;
  const beta = n;
  const dim = n + 1;
  const ridge = 0.5;
  let weights = new Float64Array(dim);

  const hessian = (): Float64Array[] =>
    Array.from({ length: dim }, () => new Float64Array(dim));

  for (let iteration = 0; iteration < 40; iteration++) {
    const gradient = new Float64Array(dim);
    const H = hessian();
    for (const sample of samples) {
      const red = sample.red
        .map((id) => index.get(id))
        .filter((value): value is number => value !== undefined);
      const blue = sample.blue
        .map((id) => index.get(id))
        .filter((value): value is number => value !== undefined);
      let z = weights[beta];
      for (const position of red) z += weights[position];
      for (const position of blue) z -= weights[position];
      const p = sigmoid(z);
      const d = p - sample.y;
      const w = Math.max(1e-9, p * (1 - p));

      for (const position of red) gradient[position] += d;
      for (const position of blue) gradient[position] -= d;
      gradient[beta] += d;

      for (const left of red) {
        for (const right of red) H[left][right] += w;
        H[left][beta] += w;
        H[beta][left] += w;
      }
      for (const left of blue) {
        for (const right of blue) H[left][right] += w;
        H[left][beta] -= w;
        H[beta][left] -= w;
      }
      for (const left of red) {
        for (const right of blue) H[left][right] -= w;
      }
      for (const left of blue) {
        for (const right of red) H[left][right] -= w;
      }
      H[beta][beta] += w;
    }

    for (let position = 0; position < dim; position++) H[position][position] += ridge;
    for (let position = 0; position < n; position++) {
      gradient[position] += ridge * weights[position];
    }

    const delta = solveLinear(H, gradient, dim);
    let maxStep = 0;
    for (let position = 0; position < dim; position++) {
      if (!Number.isFinite(delta[position])) {
        maxStep = Infinity;
        break;
      }
      weights[position] -= delta[position];
      maxStep = Math.max(maxStep, Math.abs(delta[position]));
    }
    if (!Number.isFinite(maxStep)) {
      weights = new Float64Array(dim);
      break;
    }
    if (iteration === 39 || maxStep < 1e-8) break;
  }

  // Covarianza aproximada = inversa de la Hessiana final.
  const H = hessian();
  for (const sample of samples) {
    const red = sample.red
      .map((id) => index.get(id))
      .filter((value): value is number => value !== undefined);
    const blue = sample.blue
      .map((id) => index.get(id))
      .filter((value): value is number => value !== undefined);
    let z = weights[beta];
    for (const position of red) z += weights[position];
    for (const position of blue) z -= weights[position];
    const p = sigmoid(z);
    const w = Math.max(1e-9, p * (1 - p));
    for (const left of red) {
      for (const right of red) H[left][right] += w;
      H[left][beta] += w;
      H[beta][left] += w;
    }
    for (const left of blue) {
      for (const right of blue) H[left][right] += w;
      H[left][beta] -= w;
      H[beta][left] -= w;
    }
    for (const left of red) {
      for (const right of blue) H[left][right] -= w;
    }
    for (const left of blue) {
      for (const right of red) H[left][right] -= w;
    }
    H[beta][beta] += w;
  }
  for (let position = 0; position < dim; position++) H[position][position] += ridge;
  const covariance = invert(H, dim);

  let mean = 0;
  for (let position = 0; position < n; position++) mean += weights[position];
  mean = n > 0 ? mean / n : 0;
  for (let position = 0; position < n; position++) weights[position] -= mean;

  const rating = new Map<string, number>();
  const error = new Map<string, number>();
  const eloScale = 400 / Math.log(10);
  let covarianceMean = 0;
  for (let left = 0; left < n; left++) {
    for (let right = 0; right < n; right++) {
      covarianceMean += covariance[left][right];
    }
  }
  covarianceMean = n > 0 ? covarianceMean / (n * n) : 0;
  for (let position = 0; position < n; position++) {
    const id = rated[position];
    rating.set(id, 1500 + weights[position] * eloScale);
    let rowMean = 0;
    for (let right = 0; right < n; right++) {
      rowMean += covariance[position][right];
    }
    rowMean = n > 0 ? rowMean / n : 0;
    const variance = Math.max(
      0,
      covariance[position][position] - 2 * rowMean + covarianceMean
    );
    error.set(id, Math.sqrt(variance) * eloScale);
  }

  return {
    rating,
    error,
    sideBias: weights[beta],
    sideError: Math.sqrt(Math.max(0, covariance[beta][beta])),
    logLoss: samples.length > 0 ? logLossOf(samples, weights, index, beta) : 0,
    samples: samples.length
  };
}

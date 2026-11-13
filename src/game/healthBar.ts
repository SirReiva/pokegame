/**
 * Barra de vida flotante sobre un Pokémon, con el nivel delante y una barra
 * fina de experiencia debajo.
 *
 * El dibujo se hace en canvas 2D y se guarda por **jugador**, no por viewport:
 * el estado (vida, nivel, XP, armadura) es el mismo en todas las copias del
 * splitscreen. `HealthBarOverlay` proyecta esos canvas a la pantalla una vez
 * por frame, así que las barras ya no son quads 3D ni crean materiales y
 * texturas por copia.
 */

const BAR_TEXTURE_WIDTH = 256;
const BAR_TEXTURE_HEIGHT = 28;

/** Resolución de la barra de experiencia (fina, bajo la de vida). */
const XP_TEXTURE_WIDTH = 256;
const XP_TEXTURE_HEIGHT = 12;

/**
 * Resolución del distintivo de nivel (cuadrado). Se dibuja con margen de sobra
 * y se reduce al pintarlo: el badge ocupa ~20-50 px en pantalla, así que una
 * textura de 128 px evita que el número salga dentado.
 */
const BADGE_TEXTURE_SIZE = 128;

/** Grosor del contorno y de la pista, en píxeles de la textura. */
const BORDER = 3;
const TRACK_PADDING = BORDER + 1;
const XP_BORDER = 2;
const XP_TRACK_PADDING = XP_BORDER + 1;

/** Colores. */
const COLORS = {
  outline: '#050806',
  track: '#1c241c',
  high: '#4ddb6b',
  mid: '#fac832',
  low: '#ef4452',
  highlight: 'rgba(255, 255, 255, 0.22)'
} as const;

/**
 * Medidas de la barra en unidades de mundo. Se calculan a partir de la altura
 * del sprite para que Pokémon altos y bajos mantengan la proporción; el overlay
 * las convierte a píxeles con la proyección de cada viewport.
 */
export interface HealthBarLayout {
  /** Ancho de la barra de vida. */
  width: number;
  height: number;
  badgeSize: number;
  badgeGap: number;
  xpWidth: number;
  xpHeight: number;
  xpGap: number;
  /** Altura sobre la raíz del billboard donde apoya la barra. */
  y: number;
}

export function healthBarLayoutFor(spriteHeight: number): HealthBarLayout {
  const width = clamp(spriteHeight * 0.4, 0.6, 1.55);
  const height = Math.max(0.09, width * 0.11);
  const badgeSize = clamp(width * 0.58, 0.36, 0.5);
  const xpHeight = Math.max(0.03, height * 0.3);
  return {
    width,
    height,
    badgeSize,
    badgeGap: badgeSize * 0.15,
    xpWidth: width * 0.86,
    xpHeight,
    xpGap: Math.max(0.012, height * 0.2),
    y: spriteHeight + 0.18
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function colorFor(fraction: number): string {
  if (fraction > 0.5) return COLORS.high;
  if (fraction > 0.25) return COLORS.mid;
  return COLORS.low;
}

/** Rectángulo redondeado compatible con el canvas 2D. */
function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function createCanvas(
  width: number,
  height: number,
  error: string
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(error);
  return { canvas, context };
}

/**
 * Canvas de vida, experiencia y nivel de un jugador. Compartido por todas las
 * copias del splitscreen: solo se redibuja cuando cambia su estado.
 */
export class HealthBarArt {
  readonly layout: HealthBarLayout;
  readonly barCanvas: HTMLCanvasElement;
  readonly xpCanvas: HTMLCanvasElement;
  readonly badgeCanvas: HTMLCanvasElement;

  private readonly barContext: CanvasRenderingContext2D;
  private readonly xpContext: CanvasRenderingContext2D;
  private readonly badgeContext: CanvasRenderingContext2D;
  private readonly accent: string;
  private readonly badgeTextColor: string;

  private fraction = 1;
  private xpFraction = 0;
  /** Armadura de casteo restante respecto a la vida máxima (0-1). */
  private armorFraction = 0;
  private level = 1;

  constructor(layout: HealthBarLayout, accent: readonly [number, number, number]) {
    this.layout = layout;
    const bar = createCanvas(
      BAR_TEXTURE_WIDTH,
      BAR_TEXTURE_HEIGHT,
      'No se pudo dibujar la barra de vida'
    );
    this.barCanvas = bar.canvas;
    this.barContext = bar.context;

    const xp = createCanvas(
      XP_TEXTURE_WIDTH,
      XP_TEXTURE_HEIGHT,
      'No se pudo dibujar la experiencia'
    );
    this.xpCanvas = xp.canvas;
    this.xpContext = xp.context;

    const badge = createCanvas(
      BADGE_TEXTURE_SIZE,
      BADGE_TEXTURE_SIZE,
      'No se pudo dibujar el nivel'
    );
    this.badgeCanvas = badge.canvas;
    this.badgeContext = badge.context;

    this.accent = `rgb(${accent[0]}, ${accent[1]}, ${accent[2]})`;
    // Texto oscuro sobre acentos claros y blanco sobre los oscuros: así el
    // nivel se lee también en equipos morados, azules o verdes.
    const luminance =
      (accent[0] * 299 + accent[1] * 587 + accent[2] * 114) / 1000;
    this.badgeTextColor = luminance >= 150 ? COLORS.outline : '#ffffff';

    this.drawBar();
    this.drawBadge();
    this.drawXpBar();
  }

  /** `fraction` va de 0 (KO) a 1 (vida completa); a 0 no se pinta la barra. */
  setFraction(fraction: number): void {
    const next = clamp(fraction, 0, 1);
    if (next === this.fraction) return;
    this.fraction = next;
    this.drawBar();
  }

  /** Nivel 1-10 que se muestra delante de la barra. */
  setLevel(level: number): void {
    const next = Math.max(1, Math.min(10, Math.floor(level)));
    if (next === this.level) return;
    this.level = next;
    this.drawBadge();
  }

  /** `fraction` va de 0 (recién subido de nivel) a 1 (siguiente nivel). */
  setXpFraction(fraction: number): void {
    const next = clamp(fraction, 0, 1);
    if (next === this.xpFraction) return;
    this.xpFraction = next;
    this.drawXpBar();
  }

  /**
   * Armadura de casteo restante como fracción de la vida máxima. El ancho de
   * la franja metálica representa el daño que aún puede absorber el
   * lanzamiento; 0 la oculta.
   */
  setArmorFraction(fraction: number): void {
    const next = clamp(fraction, 0, 1);
    if (next === this.armorFraction) return;
    this.armorFraction = next;
    this.drawBar();
  }

  /** `true` mientras quede vida; a 0 la barra no debe pintarse. */
  get isVisible(): boolean {
    return this.fraction > 0;
  }

  /** Libera el lienzo; el overlay deja de dibujar este jugador al destruirse. */
  dispose(): void {
    this.barCanvas.width = 0;
    this.barCanvas.height = 0;
    this.xpCanvas.width = 0;
    this.xpCanvas.height = 0;
    this.badgeCanvas.width = 0;
    this.badgeCanvas.height = 0;
  }

  /** Redibuja el contorno, la pista y la porción de vida. */
  private drawBar(): void {
    const context = this.barContext;
    context.clearRect(0, 0, BAR_TEXTURE_WIDTH, BAR_TEXTURE_HEIGHT);

    context.fillStyle = COLORS.outline;
    context.fillRect(0, 0, BAR_TEXTURE_WIDTH, BAR_TEXTURE_HEIGHT);

    context.fillStyle = COLORS.track;
    context.fillRect(
      BORDER,
      BORDER,
      BAR_TEXTURE_WIDTH - BORDER * 2,
      BAR_TEXTURE_HEIGHT - BORDER * 2
    );

    if (this.fraction <= 0) return;

    const innerHeight = BAR_TEXTURE_HEIGHT - TRACK_PADDING * 2;
    const maxWidth = BAR_TEXTURE_WIDTH - TRACK_PADDING * 2;
    // Con vida casi agotada se deja un sliver visible en vez de desaparecer.
    const width = Math.max(2, Math.round(maxWidth * this.fraction));

    context.fillStyle = colorFor(this.fraction);
    context.fillRect(TRACK_PADDING, TRACK_PADDING, width, innerHeight);
    // Brillo superior para que el relleno no parezca plano.
    context.fillStyle = COLORS.highlight;
    context.fillRect(
      TRACK_PADDING,
      TRACK_PADDING,
      width,
      Math.max(1, Math.round(innerHeight * 0.18))
    );

    this.drawArmorBand(context, innerHeight, maxWidth, width);
  }

  /**
   * Franja metálica de la armadura de casteo sobre la propia barra de vida.
   * Se alinea a la derecha con el tramo verde de la vida actual y comparte su
   * altura; su ancho es la armadura restante respecto a la vida máxima. Si
   * la armadura supera la vida actual, se recorta contra el borde izquierdo del
   * tramo para no salirse de la barra.
   */
  private drawArmorBand(
    context: CanvasRenderingContext2D,
    innerHeight: number,
    maxWidth: number,
    hpWidth: number
  ): void {
    if (this.armorFraction <= 0) return;

    const armorWidth = Math.max(2, Math.round(maxWidth * this.armorFraction));
    const width = Math.min(armorWidth, hpWidth);
    const x = TRACK_PADDING + hpWidth - width;
    const y = TRACK_PADDING;
    const height = innerHeight;

    const gradient = context.createLinearGradient(0, y, 0, y + height);
    gradient.addColorStop(0, '#eef6fd');
    gradient.addColorStop(0.42, '#a9bccd');
    gradient.addColorStop(1, '#5f7285');
    context.fillStyle = gradient;
    context.fillRect(x, y, width, height);

    // Rayado diagonal para que la franja se lea como metal.
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.strokeStyle = 'rgba(20, 30, 40, 0.3)';
    context.lineWidth = 1;
    for (let offset = -height; offset < width + height; offset += 5) {
      context.beginPath();
      context.moveTo(x + offset, y + height);
      context.lineTo(x + offset + height, y);
      context.stroke();
    }
    context.restore();

    context.fillStyle = 'rgba(255, 255, 255, 0.6)';
    context.fillRect(x, y, width, 1);
    context.fillStyle = 'rgba(5, 8, 6, 0.45)';
    context.fillRect(x, y, 1, height);
    context.fillStyle = 'rgba(255, 255, 255, 0.85)';
    context.fillRect(x + width - 1, y, 1, height);
    context.fillStyle = 'rgba(5, 8, 6, 0.5)';
    context.fillRect(x, y + height - 1, width, 1);
  }

  /** Redibuja el contorno, la pista y la porción de experiencia. */
  private drawXpBar(): void {
    const context = this.xpContext;
    context.clearRect(0, 0, XP_TEXTURE_WIDTH, XP_TEXTURE_HEIGHT);

    context.fillStyle = COLORS.outline;
    context.fillRect(0, 0, XP_TEXTURE_WIDTH, XP_TEXTURE_HEIGHT);

    context.fillStyle = COLORS.track;
    context.fillRect(
      XP_BORDER,
      XP_BORDER,
      XP_TEXTURE_WIDTH - XP_BORDER * 2,
      XP_TEXTURE_HEIGHT - XP_BORDER * 2
    );

    if (this.xpFraction <= 0) return;

    const innerHeight = XP_TEXTURE_HEIGHT - XP_TRACK_PADDING * 2;
    const maxWidth = XP_TEXTURE_WIDTH - XP_TRACK_PADDING * 2;
    const width = Math.max(1, Math.round(maxWidth * this.xpFraction));

    context.fillStyle = this.accent;
    context.fillRect(XP_TRACK_PADDING, XP_TRACK_PADDING, width, innerHeight);
    // Brillo superior para que el relleno no parezca plano.
    context.fillStyle = COLORS.highlight;
    context.fillRect(
      XP_TRACK_PADDING,
      XP_TRACK_PADDING,
      width,
      Math.max(1, Math.round(innerHeight * 0.35))
    );
  }

  /** Redibuja el distintivo con el número de nivel. */
  private drawBadge(): void {
    const context = this.badgeContext;
    const size = BADGE_TEXTURE_SIZE;
    // Todo se dibuja relativo a los 96 px originales para no reajustar a mano
    // el borde ni el radio al cambiar la resolución de la textura.
    const scale = size / 96;
    context.clearRect(0, 0, size, size);

    roundedRect(
      context,
      3 * scale,
      3 * scale,
      size - 6 * scale,
      size - 6 * scale,
      18 * scale
    );
    context.fillStyle = this.accent;
    context.fill();
    context.lineWidth = 5 * scale;
    context.strokeStyle = COLORS.outline;
    context.stroke();

    const label = String(this.level);
    // El 10 es el único nivel de dos cifras: se mide y se encoge para que no
    // toque el borde del distintivo.
    const maxTextWidth = size * 0.74;
    let fontSize = size * 0.82;
    const font = (px: number) =>
      `900 ${px}px ui-monospace, "Cascadia Mono", monospace`;
    context.font = font(fontSize);
    const measured = context.measureText(label).width;
    if (measured > maxTextWidth) {
      fontSize = Math.floor((fontSize * maxTextWidth) / measured);
      context.font = font(fontSize);
    }

    const centerX = size / 2;
    const centerY = size / 2 + size * 0.02;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    if (this.badgeTextColor === '#ffffff') {
      context.lineWidth = Math.max(1, size * 0.035);
      context.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      context.strokeText(label, centerX, centerY);
    }
    context.fillStyle = this.badgeTextColor;
    context.fillText(label, centerX, centerY);
  }
}

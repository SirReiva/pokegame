/**
 * Utilidades compartidas de los botones. Se componen en tiempo de ejecución
 * para no repetir la misma ristra de clases de Tailwind en cada pantalla.
 *
 * Cada tamaño fija su propio radio y tamaño de letra, y cada variante su color
 * de texto, para que no haya utilidades en conflicto al combinarlas.
 */
export type ButtonVariant = 'neutral' | 'ghost' | 'primary' | 'accent';
export type ButtonSize = 'md' | 'small' | 'tiny' | 'play';

const base =
  'inline-flex cursor-pointer items-center justify-center gap-2 border font-[650] transition-[background-color,transform,border-color,box-shadow,filter] duration-[120ms] ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:brightness-100 disabled:active:scale-100';

const variants: Record<ButtonVariant, string> = {
  neutral: 'border-transparent bg-white/5 text-ink',
  ghost:
    'border-line bg-white/[0.045] text-ink backdrop-blur-[8px] hover:border-line-strong hover:bg-white/10',
  primary:
    'border-transparent bg-accent text-[#0a1016] shadow-[0_14px_32px_rgb(0_0_0/0.4)] hover:brightness-[1.08]',
  accent: 'border-transparent bg-accent text-[#0a1016]'
};

const sizes: Record<ButtonSize, string> = {
  md: 'rounded-xl px-[18px] py-2.5 text-[0.88rem]',
  small: 'rounded-xl px-[13px] py-[7px] text-[0.76rem]',
  tiny: 'rounded-xl px-2.5 py-1.5 font-mono text-[0.69rem]',
  play: 'rounded-[14px] px-7 py-3.5 text-base'
};

export function btnClass(variant: ButtonVariant = 'neutral', size: ButtonSize = 'md'): string {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}

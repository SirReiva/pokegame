import type { LoadingProgress } from '../game/types';
import { Brand } from './Brand';
import { btnClass } from './buttonStyles';
import { eyebrow } from './styles';

const overlay =
  'fixed inset-0 z-50 flex animate-fade-in flex-col items-center justify-center gap-[clamp(24px,5vh,54px)] bg-[radial-gradient(circle_at_22%_18%,#152436_0%,#0a1119_46%,#05080d_100%)] p-8';
const panel =
  'w-[min(520px,92vw)] animate-rise-in rounded-panel border border-line bg-panel px-6 py-[22px] shadow-[0_24px_60px_rgb(0_0_0/0.45)] backdrop-blur-[12px]';
const codePill =
  'rounded-[5px] border border-chip/16 bg-chip/13 px-1.25 py-px font-mono text-[0.85em]';

interface LoadingScreenProps {
  label: string;
  detail?: string;
  progress?: LoadingProgress;
}

/** Pantalla de carga compartida por el arranque y el montaje de la partida. */
export function LoadingScreen({ label, detail, progress }: LoadingScreenProps) {
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
      : null;

  return (
    <div className={overlay}>
      <Brand />

      <div className={panel}>
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <span className={eyebrow}>Cargando</span>
          <strong className="text-15.2">{label}</strong>
          {progress && (
            <span className="ml-auto font-mono text-11.52 text-muted">
              {progress.loaded} / {progress.total}
            </span>
          )}
        </div>

        <div className="h-2 overflow-hidden rounded-full border border-white/6 bg-white/[0.07]">
          <div
            className={`h-full rounded-[inherit] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-accent)_70%,#2bb3a3),var(--color-accent))] shadow-[0_0_18px_color-mix(in_srgb,var(--color-accent)_60%,transparent)] transition-[width] duration-220 ease-out ${
              percent === null ? 'w-1/3 animate-pulse' : ''
            }`}
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>

        <p className="mt-3 text-12.48/normal text-muted">
          {detail ?? 'Preparando el manifiesto de sprites y los mapas disponibles.'}
        </p>
      </div>

      <p className="font-mono text-11.2 tracking-[0.14em] uppercase text-steel-900">
        Sprites 2D · mundo 3D · splitscreen de 1 a 8 mandos
      </p>
    </div>
  );
}

interface ErrorScreenProps {
  title?: string;
  message: string;
  onRetry: () => void;
  onBack?: () => void;
  backLabel?: string;
}

/** Error de carga con la opción de reintentar o volver a una pantalla segura. */
export function ErrorScreen({
  title = 'No se pudo preparar la demo',
  message,
  onRetry,
  onBack,
  backLabel = 'Volver al menú'
}: ErrorScreenProps) {
  return (
    <div className={overlay}>
      <div className="flex w-[min(560px,92vw)] animate-rise-in flex-col gap-3 rounded-panel border border-line bg-panel-strong px-7 py-6.5">
        <span className={eyebrow}>Error de carga</span>
        <h2 className="text-25.6">{title}</h2>
        <p className="wrap-break-word rounded-[10px] border border-danger/25 bg-danger/9 px-3 py-2.5 font-mono text-12.8 text-danger-200">
          {message}
        </p>
        <p className="text-muted">
          Comprueba que has ejecutado <code className={codePill}>pnpm sprites</code> y que el
          servidor de desarrollo está activo.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <button type="button" className={btnClass('primary')} onClick={onRetry}>
            Reintentar
          </button>
          {onBack && (
            <button type="button" className={btnClass('ghost')} onClick={onBack}>
              {backLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

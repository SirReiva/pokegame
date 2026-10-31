import type { SpriteManifest } from '../game/types';
import { ControlsPanel, CreditsPanel } from './InfoPanels';

export type InfoKind = 'controls' | 'credits';

interface InfoDialogProps {
  kind: InfoKind;
  manifest: SpriteManifest | null;
  onClose: () => void;
}

const panel =
  'rounded-[20px] border border-line bg-panel-strong shadow-[0_34px_80px_rgb(0_0_0/0.55)]';
const modalHead = 'flex items-center justify-between gap-4 border-b border-line px-6 py-[18px]';
const modalClose =
  'size-[34px] cursor-pointer rounded-[9px] border border-transparent bg-transparent text-27.2 leading-none text-muted transition-colors duration-[120ms] hover:bg-white/[0.07] hover:text-ink';

/** Modal informativo de pausa. En `/opciones` se usa el mismo contenido como página. */
export function InfoDialog({ kind, manifest, onClose }: InfoDialogProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-night-900/70 p-5.5 backdrop-blur-[6px]"
      onClick={onClose}
    >
      <div
        className={`${panel} flex max-h-[min(84vh,780px)] w-[min(760px,100%)] animate-pop-in flex-col overflow-hidden`}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={modalHead}>
          <h2 className="text-21.6">
            {kind === 'controls' ? 'Controles' : 'Créditos y licencia'}
          </h2>
          <button type="button" className={modalClose} onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="overflow-y-auto px-6 pt-5 pb-6">
          {kind === 'controls' ? <ControlsPanel /> : <CreditsPanel manifest={manifest} />}
        </div>
      </div>
    </div>
  );
}

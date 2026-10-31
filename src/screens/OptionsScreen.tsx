import { useSession } from '../session/useSession';
import { Brand } from '../ui/Brand';
import { btnClass } from '../ui/buttonStyles';
import { ControlsPanel, CreditsPanel } from '../ui/InfoPanels';
import { eyebrow } from '../ui/styles';
import { useBack } from '../ui/useBack';

const panel =
  'rounded-[20px] border border-line bg-[linear-gradient(170deg,rgb(16_25_38/0.9),rgb(7_12_19/0.92))] p-[clamp(16px,2.4vw,24px)] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]';

export function OptionsScreen() {
  const { manifest } = useSession();
  const goBack = useBack();

  return (
    <div className="relative h-full overflow-y-auto bg-[radial-gradient(circle_at_18%_8%,#122033_0%,#080d15_46%,#05080d_100%)] p-[clamp(16px,2.4vw,32px)]">
      <div className="mx-auto flex w-[min(1180px,100%)] animate-rise-in flex-col gap-[clamp(16px,2.4vh,26px)]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Brand compact />
          <button
            type="button"
            className={btnClass('ghost', 'small')}
            onClick={goBack}
          >
            ← Volver
          </button>
        </header>

        <div>
          <span className={eyebrow}>Menú · Opciones</span>
          <h2 className="mt-1 text-[clamp(1.7rem,3vw,2.4rem)]">Controles y créditos</h2>
          <p className="mt-2 max-w-[62ch] text-14.4 leading-[1.55] text-muted">
            Consulta los controles de mando y teclado, y la atribución de los sprites. Los ajustes
            de partida (mapa, equipos y Pokémon) se eligen antes de jugar.
          </p>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-2">
          <section className={panel}>
            <header className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
              <div>
                <span className={eyebrow}>Entrada</span>
                <h3 className="mt-0.5 text-19.2">Controles</h3>
              </div>
              <span className="rounded-full border border-line px-2 py-1 font-mono text-9.6 uppercase text-steel-650">
                1-8 jugadores
              </span>
            </header>
            <ControlsPanel />
          </section>

          <section className={panel}>
            <header className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
              <div>
                <span className={eyebrow}>Licencia</span>
                <h3 className="mt-0.5 text-19.2">Créditos</h3>
              </div>
              <span className="rounded-full border border-line px-2 py-1 font-mono text-9.6 uppercase text-steel-650">
                CC BY-NC 4.0
              </span>
            </header>
            <CreditsPanel manifest={manifest} />
          </section>
        </div>
      </div>
    </div>
  );
}

import type { SpriteManifest } from '../game/types';
import { KeyPill } from './KeyPill';

const code =
  'rounded-[5px] border border-chip/16 bg-chip/13 px-1.25 py-px font-mono text-[0.85em]';
const sectionTitle =
  'mb-2.5 font-mono text-12.48 tracking-[0.14em] uppercase text-muted';
const list = 'm-0 flex list-none flex-col gap-2 p-0 text-13.28 text-steel-300';
const note = 'border-t border-line pt-3.5 text-12.32 leading-[1.6] text-muted';

/** Controles de mando y teclado, compartidos por la pantalla de opciones y la pausa. */
export function ControlsPanel() {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-6 max-[640px]:grid-cols-1">
      <section>
        <h3 className={sectionTitle}>Mando (1-8 jugadores)</h3>
        <ul className={list}>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>A</KeyPill> unirse / confirmar
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>B</KeyPill> volver / desmarcar
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>Stick izquierdo</KeyPill> moverte y navegar por los menús
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>Stick derecho</KeyPill> girar tu cámara
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>L2 / R2</KeyPill> alejar / acercar
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>L3</KeyPill> correr
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>X / Y / RB / LB</KeyPill> habilidades (básica, 1, 2 y 3)
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>Start</KeyPill> pausar la partida
          </li>
        </ul>
      </section>

      <section>
        <h3 className={sectionTitle}>Teclado (1 jugador)</h3>
        <ul className={list}>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>Espacio / Enter</KeyPill> unirse / confirmar
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>WASD / flechas</KeyPill> moverte y navegar por los menús
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>Q / E</KeyPill> girar tu cámara
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>Arrastrar</KeyPill> orbitar con el ratón
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>Rueda</KeyPill> zoom
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>Shift</KeyPill> correr
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>J / K / L / U</KeyPill> habilidades (básica, 1, 2 y 3)
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>Esc</KeyPill> pausa / volver
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <KeyPill>H</KeyPill> ocultar o mostrar el HUD
          </li>
        </ul>
      </section>

      <p className={`${note} col-span-full`}>
        La pantalla se reparte en una vista por jugador. Cada equipo aparece en su base (azul o
        roja) y se mueve libremente. Los mandos se detectan automáticamente al pulsar un botón.
      </p>
    </div>
  );
}

interface CreditsPanelProps {
  manifest: SpriteManifest | null;
}

/** Atribución de los sprites y desglose de artistas del manifiesto. */
export function CreditsPanel({ manifest }: CreditsPanelProps) {
  return (
    <div>
      <p className="text-13.44 leading-[1.6] text-steel-300">
        Los sprites proceden de{' '}
        <a
          className="text-info underline underline-offset-2"
          href={manifest?.source ?? 'https://sprites.pmdcollab.org/'}
          target="_blank"
          rel="noreferrer"
        >
          PMD Sprite Collab
        </a>{' '}
        y se distribuyen bajo licencia{' '}
        <a
          className="text-info underline underline-offset-2"
          href={manifest?.licenseUrl ?? 'https://creativecommons.org/licenses/by-nc/4.0/'}
          target="_blank"
          rel="noreferrer"
        >
          {manifest?.license ?? 'CC BY-NC 4.0'}
        </a>
        . Esta demo no tiene fines comerciales.
      </p>

      <div className="my-4 flex flex-col gap-0.5">
        {manifest?.pokemon.map((entry) => {
          const artists = [...new Set(entry.credits.map((credit) => credit.artist))];
          const actions = entry.credits.flatMap((credit) => credit.actions);
          return (
            <div
              className="grid grid-cols-[150px_minmax(0,1fr)] gap-3.5 border-b border-line-faint py-2.25 text-12.8 last:border-b-0 max-[640px]:grid-cols-1 max-[640px]:gap-1"
              key={entry.id}
            >
              <div className="flex items-baseline gap-1.75">
                <strong>{entry.name}</strong>
                <span className="font-mono text-9.92 text-steel-750">
                  #{String(entry.dex).padStart(3, '0')}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 wrap-break-word text-steel-300">
                <span>
                  {artists.length > 0 ? artists.join(' · ') : 'Créditos no disponibles'}
                </span>
                {actions.length > 0 && (
                  <span className="text-12.48/normal text-muted">
                    Animaciones: {[...new Set(actions)].join(', ')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-12.32 leading-[1.6] text-muted">
        Las hojas originales, sus ficheros <code className={code}>credits.txt</code> y el detalle
        completo están en <code className={code}>public/sprites/CREDITS.md</code>.
      </p>
    </div>
  );
}

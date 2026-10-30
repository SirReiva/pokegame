import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '../session/useSession';
import { Brand } from '../ui/Brand';
import { KeyPill } from '../ui/KeyPill';
import { eyebrow } from '../ui/styles';
import { useMenuInput } from '../ui/useMenuInput';

const menuCard =
  'group relative flex w-full items-center gap-4 overflow-hidden rounded-[18px] border border-line bg-[image:linear-gradient(120deg,rgb(19_30_45/0.94),rgb(8_13_21/0.9))] px-5 py-4 text-left transition-[transform,border-color,box-shadow,background] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_18px_40px_rgb(0_0_0/0.36)]';
const menuNumber =
  'grid size-12 flex-none place-items-center rounded-[14px] border border-line bg-white/[0.04] font-display text-[1.15rem] font-extrabold text-[#a9bccf] transition-colors duration-200';

export function HomeScreen() {
  const [, navigate] = useLocation();
  const { maps, mapId, resetPlayers } = useSession();
  const activeMap = maps.find((entry) => entry.id === mapId);
  const [selected, setSelected] = useState(0);
  const selectedRef = useRef(selected);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const play = () => {
    resetPlayers();
    navigate('/lobby');
  };
  const openEditor = () => navigate('/editor');
  const openOptions = () => navigate('/opciones');

  const activate = (index: number) => {
    if (index === 0) play();
    else if (index === 1) openEditor();
    else openOptions();
  };

  useMenuInput(({ action }) => {
    if (action === 'up') setSelected((index) => (index + 2) % 3);
    else if (action === 'down') setSelected((index) => (index + 1) % 3);
    else if (action === 'confirm') activate(selectedRef.current);
  });

  const isSelected = (index: number) => selected === index;

  return (
    <div className="relative h-full overflow-y-auto bg-[image:radial-gradient(circle_at_20%_12%,rgb(22_48_78/0.55),transparent_48%),radial-gradient(circle_at_82%_88%,rgb(122_199_76/0.12),transparent_42%),linear-gradient(140deg,#0a1119,#05080d_70%)] p-[clamp(18px,3vw,42px)]">
      <div className="mx-auto flex min-h-full w-[min(1180px,100%)] flex-col justify-center gap-[clamp(22px,4vh,42px)]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Brand />
          <span className="rounded-full border border-line bg-[#090f18]/70 px-3 py-1.5 font-mono text-[0.62rem] tracking-[0.12em] uppercase text-[#7f92a7]">
            {activeMap ? `Mapa · ${activeMap.name}` : 'Demo técnica'}
          </span>
        </header>

        <div className="grid items-center gap-[clamp(22px,4vw,54px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,430px)]">
          <div className="animate-rise-in">
            <span className={eyebrow}>Pokémon · sprites 2D · arena 3D</span>
            <h2 className="mt-2 max-w-[16ch] text-[clamp(2.1rem,5vw,4rem)] leading-[0.98]">
              Elige tu <span className="text-accent">Pokémon</span> y salta a la arena.
            </h2>
            <p className="mt-4 max-w-[48ch] text-[0.95rem] leading-[1.6] text-muted">
              Multijugador local de 1 a 8 jugadores con cámara orbital a 45°, niebla de guerra y
              sprites de ocho direcciones. Configura los equipos, elige especie y juega.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.76rem] text-[#8b9db2]">
              <span className="flex items-center gap-2">
                <KeyPill>↑ ↓</KeyPill> moverse
              </span>
              <span className="flex items-center gap-2">
                <KeyPill>A / Espacio</KeyPill> confirmar
              </span>
            </div>
          </div>

          <nav className="flex animate-rise-in flex-col gap-3" aria-label="Menú principal">
            <button
              type="button"
              aria-current={isSelected(0) ? 'true' : undefined}
              className={`${menuCard} border-[color:color-mix(in_srgb,var(--color-accent)_34%,var(--color-line))] bg-[image:linear-gradient(120deg,color-mix(in_srgb,var(--color-accent)_13%,rgb(19_30_45/0.96)),rgb(8_13_21/0.92))] ${
                isSelected(0) ? 'ring-1 ring-accent/60' : ''
              }`}
              onClick={play}
              onFocus={() => setSelected(0)}
              onMouseEnter={() => setSelected(0)}
            >
              <span className={`${menuNumber} border-accent/40 text-accent`}>▶</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="font-display text-[1.25rem]">Jugar</strong>
                <span className="text-[0.8rem] text-[#9db0c4]">
                  Elige equipos y Pokémon para empezar la partida
                </span>
              </span>
              <span className="font-mono text-[1.1rem] text-[#6f8298] transition-transform duration-200 group-hover:translate-x-1">
                →
              </span>
            </button>

            <button
              type="button"
              aria-current={isSelected(1) ? 'true' : undefined}
              className={`${menuCard} ${isSelected(1) ? 'ring-1 ring-accent/60' : ''}`}
              onClick={openEditor}
              onFocus={() => setSelected(1)}
              onMouseEnter={() => setSelected(1)}
            >
              <span className={menuNumber}>✎</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="font-display text-[1.25rem]">Editor</strong>
                <span className="text-[0.8rem] text-[#9db0c4]">
                  Dibuja terrenos, bases y separadores de un mapa
                </span>
              </span>
              <span className="font-mono text-[1.1rem] text-[#6f8298] transition-transform duration-200 group-hover:translate-x-1">
                →
              </span>
            </button>

            <button
              type="button"
              aria-current={isSelected(2) ? 'true' : undefined}
              className={`${menuCard} ${isSelected(2) ? 'ring-1 ring-accent/60' : ''}`}
              onClick={openOptions}
              onFocus={() => setSelected(2)}
              onMouseEnter={() => setSelected(2)}
            >
              <span className={menuNumber}>⚙</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="font-display text-[1.25rem]">Opciones</strong>
                <span className="text-[0.8rem] text-[#9db0c4]">
                  Controles, créditos y atribución de los sprites
                </span>
              </span>
              <span className="font-mono text-[1.1rem] text-[#6f8298] transition-transform duration-200 group-hover:translate-x-1">
                →
              </span>
            </button>
          </nav>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5 text-[0.72rem] text-[#71859b]">
          <span>
            Sprites de{' '}
            <a
              className="text-[#9fc4e8] underline underline-offset-2"
              href="https://sprites.pmdcollab.org/"
              target="_blank"
              rel="noreferrer"
            >
              PMD Sprite Collab
            </a>{' '}
            · CC BY-NC 4.0
          </span>
          <span className="font-mono tracking-[0.1em] uppercase">
            NewPoke · <span className="normal-case">v{__APP_VERSION__}</span> · demo técnica
          </span>
        </footer>
      </div>
    </div>
  );
}

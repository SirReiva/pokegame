import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { publicUrl } from '../game/publicUrl';
import { useSession } from '../session/useSession';
import { Brand } from '../ui/Brand';
import { KeyPill } from '../ui/KeyPill';
import { useMenuInput } from '../ui/useMenuInput';

const menuCard =
  'group flex items-center gap-3 rounded-xl border border-white/10 bg-night-900/70 px-4 py-3 text-left backdrop-blur-md transition-[transform,border-color,background,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-night-800/90';

export function HomeScreen() {
  const [, navigate] = useLocation();
  const { maps, mapId, manifest, resetPlayers } = useSession();
  const activeMap = maps.find((entry) => entry.id === mapId);
  const pokemon = manifest?.pokemon ?? [];
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

  return (
    <div className="relative isolate h-full overflow-y-auto bg-night-950">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${publicUrl('bg.jpg')}")` }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(3_7_12/0.78)_0%,rgb(3_7_12/0.55)_42%,rgb(3_7_12/0.18)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_76%_48%,transparent_0%,rgb(3_7_12/0.08)_42%,rgb(3_7_12/0.64)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-night-950 to-transparent" />
      </div>

      <div className="mx-auto flex min-h-full w-[min(1440px,100%)] flex-col px-[clamp(20px,5vw,76px)] py-[clamp(18px,3vh,36px)]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Brand />
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-black/35 px-3 py-2 font-mono text-9.92 tracking-[0.12em] text-steel-300 uppercase backdrop-blur-md">
              {activeMap ? `Arena · ${activeMap.name}` : 'Arena de combate'}
            </span>
            <span className="flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-2 font-mono text-9.92 tracking-[0.12em] text-accent-soft uppercase">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              Local · 1-8 jugadores
            </span>
          </div>
        </header>

        <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.65fr)] lg:py-12">
          <section className="animate-rise-in">
            <p className="mb-5 flex items-center gap-3 font-mono text-10.88 tracking-[0.3em] text-accent uppercase">
              <span className="h-px w-9 bg-accent/70" />
              Pokémon · batalla multijugador
            </p>
            <h2 className="max-w-[13ch] text-[clamp(3.4rem,8vw,7.8rem)] leading-[0.82] font-black tracking-[-0.04em] text-white uppercase [text-shadow:0_8px_38px_rgb(0_0_0/0.75)]">
              La arena
              <br />
              <span className="text-accent [text-shadow:0_0_34px_rgb(122_199_76/0.28)]">
                te espera.
              </span>
            </h2>
            <p className="mt-7 max-w-[42ch] text-15.2 leading-[1.7] text-steel-200/80">
              Forma tu equipo, elige a tus Pokémon y enfréntate en combates locales llenos de acción.
              ¿Quién dominará la arena?
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-12.16 text-steel-300/75">
              <span className="flex items-center gap-2">
                <KeyPill>↑ ↓</KeyPill> navegar
              </span>
              <span className="flex items-center gap-2">
                <KeyPill>A / Espacio</KeyPill> confirmar
              </span>
            </div>
          </section>

          <nav
            className="animate-rise-in flex w-full max-w-110 flex-col gap-2.5 lg:ml-auto"
            aria-label="Menú principal"
          >
            <button
              type="button"
              aria-current={selected === 0 ? 'true' : undefined}
              className={`group relative mb-2 flex min-h-20 items-center gap-4 overflow-hidden rounded-2xl border border-accent/55 bg-[linear-gradient(110deg,rgb(122_199_76/0.95),rgb(77_151_52/0.9))] px-5 py-4 text-left text-[#07100a] shadow-[0_14px_44px_rgb(77_151_52/0.2)] transition-[transform,box-shadow,filter] duration-200 hover:-translate-y-1 hover:shadow-[0_20px_52px_rgb(77_151_52/0.34)] ${
                selected === 0 ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-[#08100d]' : ''
              }`}
              onClick={play}
              onFocus={() => setSelected(0)}
              onMouseEnter={() => setSelected(0)}
            >
              <span aria-hidden="true" className="grid size-12 flex-none place-items-center rounded-xl bg-black/10 text-2xl">
                ▶
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="font-display text-2xl leading-none font-black tracking-wide uppercase">
                  Jugar
                </strong>
                <span className="mt-1.5 text-11.52 font-semibold text-ink-dark/80">
                  Prepara tu equipo y entra en combate
                </span>
              </span>
              <span aria-hidden="true" className="font-mono text-2xl transition-transform group-hover:translate-x-1">
                →
              </span>
            </button>

            <button
              type="button"
              aria-current={selected === 1 ? 'true' : undefined}
              className={`${menuCard} ${selected === 1 ? 'border-accent/65 bg-accent/10 ring-1 ring-accent/45' : ''}`}
              onClick={openEditor}
              onFocus={() => setSelected(1)}
              onMouseEnter={() => setSelected(1)}
            >
              <span className="grid size-10 flex-none place-items-center rounded-lg border border-white/10 bg-white/4 text-lg text-steel-200">
                ✎
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="font-display text-16.8 font-bold">Editor de arenas</strong>
                <span className="text-11.52 text-steel-400">Diseña un campo de batalla propio</span>
              </span>
              <span aria-hidden="true" className="font-mono text-xl text-steel-600 transition-transform group-hover:translate-x-1">
                →
              </span>
            </button>

            <button
              type="button"
              aria-current={selected === 2 ? 'true' : undefined}
              className={`${menuCard} ${selected === 2 ? 'border-accent/65 bg-accent/10 ring-1 ring-accent/45' : ''}`}
              onClick={openOptions}
              onFocus={() => setSelected(2)}
              onMouseEnter={() => setSelected(2)}
            >
              <span className="grid size-10 flex-none place-items-center rounded-lg border border-white/10 bg-white/4 text-lg text-steel-200">
                ⚙
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="font-display text-16.8 font-bold">Opciones</strong>
                <span className="text-11.52 text-steel-400">Controles, créditos y ajustes</span>
              </span>
              <span aria-hidden="true" className="font-mono text-xl text-steel-600 transition-transform group-hover:translate-x-1">
                →
              </span>
            </button>

            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-4 text-10.88 text-steel-400">
              <span className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-accent shadow-[0_0_10px_rgb(122_199_76/0.8)]" />
                {pokemon.length} Pokémon disponibles
              </span>
              <span className="font-mono tracking-widest text-steel-500 uppercase">Escoge tu leyenda</span>
            </div>
          </nav>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-10.88 text-steel-500">
          <span>
            Sprites de{' '}
            <a
              className="text-link underline underline-offset-2"
              href="https://sprites.pmdcollab.org/"
              target="_blank"
              rel="noreferrer"
            >
              PMD Sprite Collab
            </a>{' '}
            · CC BY-NC 4.0
          </span>
          <span className="font-mono tracking-widest uppercase">
            NewPoke · <span className="normal-case">v{__APP_VERSION__}</span>
          </span>
        </footer>
      </div>
    </div>
  );
}

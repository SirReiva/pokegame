import { useEffect, useState } from 'react';
import {
  getAudioSettings,
  setAudioSettings,
  subscribeAudioSettings
} from '../game/audioSettings';
import {
  getActiveGraphicsBackend,
  getGraphicsSettings,
  setGraphicsSettings,
  subscribeGraphicsSettings,
  type GraphicsBackend
} from '../game/graphicsSettings';
import {
  detectGraphicsAvailability,
  type GraphicsAvailability
} from '../game/graphicsAvailability';
import {
  getAimAssistSettings,
  setAimAssistSettings,
  subscribeAimAssistSettings
} from '../game/aimAssistSettings';
import { useSession } from '../session/useSession';
import { Brand } from '../ui/Brand';
import { btnClass } from '../ui/buttonStyles';
import { ControlsPanel, CreditsPanel } from '../ui/InfoPanels';
import { eyebrow } from '../ui/styles';
import { useBack } from '../ui/useBack';

const BACKEND_LABELS: Record<string, string> = {
  webgpu: 'WebGPU',
  webgl2: 'WebGL2'
};

const panel =
  'rounded-[20px] border border-line bg-[linear-gradient(170deg,rgb(16_25_38/0.9),rgb(7_12_19/0.92))] p-[clamp(16px,2.4vw,24px)] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]';

const BACKEND_OPTIONS: Array<{
  id: GraphicsBackend;
  label: string;
  detail: string;
}> = [
  {
    id: 'auto',
    label: 'Automático',
    detail:
      'Usa WebGPU si el navegador lo soporta y, si no, WebGL2. Es la opción recomendada.'
  },
  {
    id: 'webgpu',
    label: 'WebGPU',
    detail:
      'Fuerza el backend nuevo. Si el navegador no lo ofrece, la partida avisa y puedes volver aquí para cambiarlo.'
  },
  {
    id: 'webgl2',
    label: 'WebGL2',
    detail:
      'Fuerza el backend clásico. Útil si WebGPU produce artefactos o problemas de driver.'
  }
];

function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

type AvailabilityState = 'checking' | 'available' | 'unavailable';

const AVAILABILITY_LABEL: Record<AvailabilityState, string> = {
  checking: 'Comprobando disponibilidad…',
  available: 'Disponible en este navegador',
  unavailable: 'No disponible en este navegador'
};

/** Icono de disponibilidad del backend: check, aspa o punto mientras se comprueba. */
function AvailabilityIcon({
  state,
  onAccent = false
}: {
  state: AvailabilityState;
  onAccent?: boolean;
}) {
  const tone = onAccent
    ? state === 'unavailable'
      ? 'text-danger-deep'
      : 'text-ink-dark'
    : state === 'available'
      ? 'text-success'
      : state === 'unavailable'
        ? 'text-danger-100'
        : 'animate-pulse text-muted';
  return (
    <span
      className={`inline-flex size-3.5 shrink-0 items-center justify-center ${tone}`}
      title={AVAILABILITY_LABEL[state]}
      aria-label={AVAILABILITY_LABEL[state]}
      role="img"
    >
      <svg
        viewBox="0 0 16 16"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="8" cy="8" r="6.1" />
        {state === 'available' && <path d="M5.1 8.2 7 10.1l3.9-4.2" />}
        {state === 'unavailable' && <path d="M5.6 5.6 10.4 10.4M10.4 5.6 5.6 10.4" />}
        {state === 'checking' && <path d="M8 8h.01" />}
      </svg>
    </span>
  );
}

function VolumeSlider(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between gap-3 text-13.6 text-steel-200">
        {props.label}
        <span className="font-mono text-11.52 text-muted">{percent(props.value)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(props.value * 100)}
        onChange={(event) => props.onChange(Number(event.target.value) / 100)}
        className="w-full cursor-pointer accent-accent"
      />
    </label>
  );
}

export function OptionsScreen() {
  const { manifest } = useSession();
  const goBack = useBack();
  const [audio, setAudio] = useState(getAudioSettings);
  const [graphics, setGraphics] = useState(getGraphicsSettings);
  const [aimAssist, setAimAssist] = useState(getAimAssistSettings);
  const [activeBackend, setActiveBackend] = useState(getActiveGraphicsBackend);
  const [availability, setAvailability] = useState<GraphicsAvailability | null>(null);

  useEffect(() => {
    let cancelled = false;
    void detectGraphicsAvailability().then((result) => {
      if (!cancelled) setAvailability(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => subscribeAudioSettings(() => setAudio(getAudioSettings())),
    []
  );

  useEffect(
    () =>
      subscribeGraphicsSettings(() => {
        setGraphics(getGraphicsSettings());
        setActiveBackend(getActiveGraphicsBackend());
      }),
    []
  );

  useEffect(
    () => subscribeAimAssistSettings(() => setAimAssist(getAimAssistSettings())),
    []
  );

  const availabilityFor = (id: GraphicsBackend): AvailabilityState => {
    if (!availability) return 'checking';
    if (id === 'auto') {
      return availability.webgpu || availability.webgl2 ? 'available' : 'unavailable';
    }
    return availability[id] ? 'available' : 'unavailable';
  };

  const backendDetail =
    BACKEND_OPTIONS.find((option) => option.id === graphics.backend)?.detail ?? '';
  const selectedUnavailable = availabilityFor(graphics.backend) === 'unavailable';

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
          <h2 className="mt-1 text-[clamp(1.7rem,3vw,2.4rem)]">Controles, audio, gráficos y partida</h2>
          <p className="mt-2 max-w-[62ch] text-14.4 leading-[1.55] text-muted">
            Consulta los controles de mando y teclado, ajusta el volumen, elige el backend de render,
            activa o desactiva la ayuda de apuntado y revisa la atribución de los sprites y los
            efectos. Los ajustes de partida (mapa, equipos y Pokémon) se eligen antes de jugar.
          </p>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-2">
          <section className={`${panel} xl:col-span-2`}>
            <header className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
              <div>
                <span className={eyebrow}>Audio</span>
                <h3 className="mt-0.5 text-19.2">Volumen</h3>
              </div>
              <span className="rounded-full border border-line px-2 py-1 font-mono text-9.6 uppercase text-steel-650">
                {percent(audio.master)} general
              </span>
            </header>
            <div className="grid gap-5 md:grid-cols-3">
              <VolumeSlider
                label="Volumen general"
                value={audio.master}
                onChange={(master) => setAudioSettings({ master })}
              />
              <VolumeSlider
                label="Efectos de sonido"
                value={audio.sfx}
                onChange={(sfx) => setAudioSettings({ sfx })}
              />
              <VolumeSlider
                label="Música"
                value={audio.music}
                onChange={(music) => setAudioSettings({ music })}
              />
            </div>
            <p className="mt-4 text-12.8/normal text-muted">
              El volumen general multiplica también los efectos y la música. Los ajustes se guardan
              en este dispositivo.
            </p>
          </section>

          <section className={`${panel} xl:col-span-2`}>
            <header className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
              <div>
                <span className={eyebrow}>Gráficos</span>
                <h3 className="mt-0.5 text-19.2">Motor de render</h3>
              </div>
              <span className="rounded-full border border-line px-2 py-1 font-mono text-9.6 uppercase text-steel-650">
                {activeBackend === null
                  ? 'Sin iniciar'
                  : `Activo: ${BACKEND_LABELS[activeBackend] ?? activeBackend}`}
              </span>
            </header>
            <div className="flex flex-wrap gap-2">
              {BACKEND_OPTIONS.map((option) => {
                const selected = graphics.backend === option.id;
                const state = availabilityFor(option.id);
                const unavailable = state === 'unavailable';
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={unavailable}
                    title={unavailable ? AVAILABILITY_LABEL.unavailable : undefined}
                    className={btnClass(selected ? 'primary' : 'ghost', 'small')}
                    onClick={() => setGraphicsSettings({ backend: option.id })}
                  >
                    <AvailabilityIcon state={state} onAccent={selected} />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-12.8/normal text-muted">
              {backendDetail}
              {selectedUnavailable
                ? ' No está disponible en este navegador: elige Automático o WebGL2.'
                : ''}{' '}
              El cambio se aplica al iniciar la siguiente partida.
            </p>
          </section>

          <section className={`${panel} xl:col-span-2`}>
            <header className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
              <div>
                <span className={eyebrow}>Jugabilidad</span>
                <h3 className="mt-0.5 text-19.2">Ayuda de apuntado</h3>
              </div>
              <span className="rounded-full border border-line px-2 py-1 font-mono text-9.6 uppercase text-steel-650">
                {aimAssist.enabled ? 'Activada' : 'Desactivada'}
              </span>
            </header>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={aimAssist.enabled}
                className={btnClass(aimAssist.enabled ? 'primary' : 'ghost', 'small')}
                onClick={() => setAimAssistSettings({ enabled: true })}
              >
                Activada
              </button>
              <button
                type="button"
                aria-pressed={!aimAssist.enabled}
                className={btnClass(!aimAssist.enabled ? 'primary' : 'ghost', 'small')}
                onClick={() => setAimAssistSettings({ enabled: false })}
              >
                Desactivada
              </button>
            </div>
            <p className="mt-4 text-12.8/normal text-muted">
              Corrige ligeramente el ángulo de los proyectiles y los haces hacia el rival
              más cercano a la mira, solo si está dentro de un cono estrecho y hay línea de
              visión. No alarga el alcance ni atraviesa obstáculos, y los bots no la usan.
              El ajuste se guarda en este dispositivo.
            </p>
          </section>

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

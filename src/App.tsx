import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Game } from './game/game';
import type {
  AnimationName,
  GamePhase,
  GameStats,
  LoadingProgress,
  PokemonEntry,
  SpriteManifest
} from './game/types';
import { SpritePreview } from './ui/SpritePreview';

const TYPE_COLORS: Record<string, string> = {
  Normal: '#a8a77a',
  Fire: '#ee8130',
  Water: '#6390f0',
  Electric: '#f7d02c',
  Grass: '#7ac74c',
  Ice: '#96d9d6',
  Fighting: '#c22e28',
  Poison: '#a33ea1',
  Ground: '#e2bf65',
  Flying: '#a98ff3',
  Psychic: '#f95587',
  Bug: '#a6b91a',
  Rock: '#b6a136',
  Ghost: '#735797',
  Dragon: '#6f35fc',
  Dark: '#705746',
  Steel: '#b7b7ce',
  Fairy: '#d685ad'
};

const TYPE_LABELS: Record<string, string> = {
  Normal: 'Normal',
  Fire: 'Fuego',
  Water: 'Agua',
  Electric: 'Eléctrico',
  Grass: 'Planta',
  Ice: 'Hielo',
  Fighting: 'Lucha',
  Poison: 'Veneno',
  Ground: 'Tierra',
  Flying: 'Volador',
  Psychic: 'Psíquico',
  Bug: 'Bicho',
  Rock: 'Roca',
  Ghost: 'Fantasma',
  Dragon: 'Dragón',
  Dark: 'Siniestro',
  Steel: 'Acero',
  Fairy: 'Hada'
};

const LIGHT_TYPES = new Set(['Normal', 'Electric', 'Ice', 'Ground', 'Steel', 'Fairy']);

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

const DEFAULT_PROGRESS: LoadingProgress = {
  loaded: 0,
  total: 12,
  label: 'Iniciando el motor'
};

function typeStyle(type: string): CSSProperties {
  const color = TYPE_COLORS[type] ?? '#8a93a6';
  return {
    background: color,
    color: LIGHT_TYPES.has(type) ? '#161a22' : '#ffffff'
  };
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="type-badge" style={typeStyle(type)}>
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

function Compass({ direction }: { direction: string }) {
  return (
    <div className="compass" aria-label={`Dirección visible del sprite: ${direction}`}>
      {COMPASS_POINTS.map((point) => (
        <span
          key={point}
          className={`compass-dir compass-${point.toLowerCase()}${
            point === direction ? ' is-active' : ''
          }`}
        >
          {point}
        </span>
      ))}
      <span className="compass-ring" />
    </div>
  );
}

function FeatureChip({ children }: { children: ReactNode }) {
  return <span className="feature-chip">{children}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const phaseRef = useRef<GamePhase>('loading');
  const modalRef = useRef<'controls' | 'credits' | null>(null);

  const [phase, setPhase] = useState<GamePhase>('loading');
  const [manifest, setManifest] = useState<SpriteManifest | null>(null);
  const [progress, setProgress] = useState<LoadingProgress>(DEFAULT_PROGRESS);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewRow, setPreviewRow] = useState(0);
  const [previewAnimation, setPreviewAnimation] = useState<AnimationName>('idle');
  const [stats, setStats] = useState<GameStats | null>(null);
  const [modal, setModal] = useState<'controls' | 'credits' | null>(null);
  const [hudVisible, setHudVisible] = useState(true);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    modalRef.current = modal;
    gameRef.current?.setPaused(modal !== null);
  }, [modal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const game = new Game(canvas, {
      onReady: (loadedManifest) => {
        setManifest(loadedManifest);
        setSelectedId((current) => current ?? loadedManifest.pokemon[0]?.id ?? null);
        setPhase('ready');
      },
      onProgress: (next) => setProgress(next),
      onStats: (next) => setStats(next),
      onError: (message) => setError(message),
      onMenuRequest: () => {
        if (phaseRef.current !== 'playing' || modalRef.current !== null) return;
        gameRef.current?.setMenuOpen(true);
        setPhase('ready');
      }
    });

    gameRef.current = game;
    void game.init();

    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, []);

  const selected = manifest?.pokemon.find((entry) => entry.id === selectedId) ?? null;

  const openMenu = () => {
    gameRef.current?.setMenuOpen(true);
    setPreviewRow(0);
    setPhase('ready');
  };

  const startGame = (id?: string) => {
    const target = id ?? selectedId;
    if (!target) return;
    setModal(null);
    setSelectedId(target);
    gameRef.current?.selectPokemon(target);
    setPreviewRow(0);
    setPhase('playing');
  };

  const selectPokemon = (entry: PokemonEntry) => {
    setSelectedId(entry.id);
    setPreviewRow(0);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (modal !== null) {
          setModal(null);
          return;
        }
        if (phaseRef.current === 'playing') {
          gameRef.current?.setMenuOpen(true);
          setPhase('ready');
        }
        return;
      }
      if (event.key.toLowerCase() === 'h' && !event.repeat && phaseRef.current === 'playing') {
        setHudVisible((visible) => !visible);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modal]);

  const percent = Math.min(100, Math.round((progress.loaded / Math.max(progress.total, 1)) * 100));

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" />

      {error && (
        <div className="overlay overlay-solid">
          <div className="panel error-panel">
            <span className="eyebrow">Error de carga</span>
            <h2>No se pudo preparar la demo</h2>
            <p className="error-message">{error}</p>
            <p className="muted">
              Comprueba que has ejecutado <code>npm run sprites</code> y que el servidor de
              desarrollo está activo.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {!error && phase === 'loading' && (
        <div className="overlay overlay-solid loading-screen">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <span className="brand-pixel" />
            </span>
            <div>
              <h1>
                New<span>Poke</span>
              </h1>
              <p>Demo técnica de sprites y cámara</p>
            </div>
          </div>

          <div className="loading-card">
            <div className="loading-copy">
              <span className="eyebrow">Cargando assets</span>
              <strong>{progress.label}</strong>
              <span className="loading-count">
                {progress.loaded} / {progress.total}
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <p className="muted small">
              Descargando hojas de animación y calculando las anclas de suelo de cada frame.
            </p>
          </div>

          <p className="boot-note">Sprites 2D · mundo 3D · cámara orbital a 45°</p>
        </div>
      )}

      {!error && phase === 'ready' && manifest && selected && (
        <div className="overlay selector-overlay">
          <div className="selector-shell">
            <header className="selector-head">
              <div className="brand brand-compact">
                <span className="brand-mark" aria-hidden="true">
                  <span className="brand-pixel" />
                </span>
                <div>
                  <h1>
                    New<span>Poke</span>
                  </h1>
                  <p>Demo técnica · sprites y cámara</p>
                </div>
              </div>
              <div className="head-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setModal('controls')}>
                  Controles
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setModal('credits')}>
                  Créditos
                </button>
              </div>
            </header>

            <div className="selector-grid">
              <section className="roster-column">
                <span className="eyebrow">Paso 1 · Elige tu Pokémon</span>
                <h2>Compañero de demo</h2>
                <p className="lead">
                  Seis Pokémon con sprites de 8 direcciones. Los demás te esperarán en la plaza.
                </p>

                <div className="roster-grid" role="listbox" aria-label="Elige un Pokémon">
                  {manifest.pokemon.map((entry) => {
                    const isSelected = entry.id === selected.id;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`poke-card${isSelected ? ' is-selected' : ''}`}
                        style={{ '--accent': entry.accent } as CSSProperties}
                        onClick={() => selectPokemon(entry)}
                        onDoubleClick={() => startGame(entry.id)}
                      >
                        <span className="poke-card-top">
                          <span className="poke-dex">#{String(entry.dex).padStart(3, '0')}</span>
                          {isSelected && <span className="poke-check">Elegido</span>}
                        </span>
                        <SpritePreview entry={entry} height={78} className="poke-card-sprite" />
                        <span className="poke-name">{entry.name}</span>
                        <span className="poke-types">
                          {entry.types.map((type) => (
                            <TypeBadge key={type} type={type} />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="asset-note">
                  <span className="asset-dot" />
                  Sprites de <strong>PMD Sprite Collab</strong> · CC BY-NC 4.0 · uso no comercial
                </div>
              </section>

              <section
                className="preview-column"
                style={{ '--accent': selected.accent } as CSSProperties}
              >
                <span className="eyebrow">Paso 2 · Revisa el sprite</span>
                <div className="preview-heading">
                  <div>
                    <h2>{selected.name}</h2>
                    <div className="preview-types">
                      <span className="preview-dex">
                        #{String(selected.dex).padStart(3, '0')}
                      </span>
                      {selected.types.map((type) => (
                        <TypeBadge key={type} type={type} />
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-tiny"
                    onClick={() =>
                      setPreviewAnimation((current) => (current === 'idle' ? 'walk' : 'idle'))
                    }
                  >
                    {previewAnimation === 'idle' ? 'Ver andar' : 'Ver reposo'}
                  </button>
                </div>

                <div className="stage">
                  <span className="stage-glow" />
                  <span className="stage-grid" />
                  <SpritePreview
                    key={previewAnimation}
                    entry={selected}
                    height={216}
                    row={previewRow}
                    animation={previewAnimation}
                    className="stage-sprite"
                  />
                  <span className="stage-floor" />
                </div>

                <div className="direction-picker">
                  <span className="direction-label">Dirección</span>
                  <div className="direction-buttons">
                    {manifest.directions.map((direction, index) => (
                      <button
                        key={direction}
                        type="button"
                        className={`direction-btn${index === previewRow ? ' is-active' : ''}`}
                        onClick={() => setPreviewRow(index)}
                        aria-pressed={index === previewRow}
                      >
                        {direction}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="feature-row">
                  <FeatureChip>8 direcciones</FeatureChip>
                  <FeatureChip>Cámara a 45°</FeatureChip>
                  <FeatureChip>Billboard con profundidad</FeatureChip>
                </div>

                <p className="preview-hint">
                  Cada Pokémon conserva su propio rumbo. El billboard solo mantiene el plano de
                  pie: la vista mostrada se elige entre sus 8 filas según el ángulo entre ese rumbo
                  y la cámara, no según dónde esté mirando la cámara.
                </p>

                <div className="cta-row">
                  <button type="button" className="btn btn-primary btn-play" onClick={() => startGame()}>
                    Explorar el mapa
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setModal('controls')}>
                    Cómo jugar
                  </button>
                </div>
                <p className="gamepad-hint">
                  Mando recomendado · stick izquierdo para moverte · stick derecho para girar la
                  cámara
                </p>
              </section>
            </div>
          </div>
        </div>
      )}

      {!error && phase === 'playing' && manifest && selected && (
        <>
          {hudVisible && (
            <div className="hud">
              <div
                className="hud-card hud-player"
                style={{ '--accent': selected.accent } as CSSProperties}
              >
                <div className="hud-avatar">
                  <SpritePreview
                    entry={selected}
                    height={46}
                    row={stats?.row ?? 0}
                    animation={stats?.animation ?? 'idle'}
                  />
                </div>
                <div className="hud-player-info">
                  <strong>{selected.name}</strong>
                  <span className="hud-sub">
                    {stats?.animation === 'walk' ? 'Caminando' : 'En reposo'} ·{' '}
                    {selected.types.map((type) => TYPE_LABELS[type] ?? type).join(' / ')}
                  </span>
                  <div className="hud-types">
                    {selected.types.map((type) => (
                      <TypeBadge key={type} type={type} />
                    ))}
                  </div>
                </div>
                <Compass direction={stats?.direction ?? 'S'} />
              </div>

              <div className="hud-card hud-stats">
                <div className="hud-stats-head">
                  <span className="eyebrow">Telemetría</span>
                  <span className="live-dot">En vivo</span>
                </div>
                <div className="stat-grid">
                  <Stat label="FPS" value={stats ? String(stats.fps) : '—'} />
                  <Stat label="Dirección" value={stats?.direction ?? 'S'} />
                  <Stat
                    label="Rumbo"
                    value={stats ? `${Math.round(stats.facing)}°` : '—'}
                  />
                  <Stat label="Fila" value={stats ? String(stats.row) : '—'} />
                  <Stat label="Velocidad" value={stats ? `${stats.speed.toFixed(1)} u/s` : '—'} />
                  <Stat
                    label="Cámara"
                    value={stats ? `${Math.round(((stats.yaw % 360) + 360) % 360)}°` : '—'}
                  />
                  <Stat label="Entrada" value={stats?.gamepad ? 'Mando' : 'Teclado'} />
                </div>
                <div className="hud-credit">Sprites: PMD Sprite Collab · CC BY-NC 4.0</div>
              </div>

              <div className="hud-hint">
                <kbd>WASD</kbd> mover · <kbd>Q</kbd>/<kbd>E</kbd> cámara · ratón arrastrar ·{' '}
                <kbd>H</kbd> ocultar HUD
              </div>
            </div>
          )}

          <div className="hud-actions">
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setModal('controls')}>
              Controles
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setModal('credits')}>
              Créditos
            </button>
            <button type="button" className="btn btn-accent btn-small" onClick={openMenu}>
              Cambiar
            </button>
          </div>

          {!hudVisible && (
            <button
              type="button"
              className="btn btn-ghost btn-small hud-toggle"
              onClick={() => setHudVisible(true)}
            >
              Mostrar HUD (H)
            </button>
          )}
        </>
      )}

      {modal && (
        <div className="overlay modal-overlay" onClick={() => setModal(null)}>
          <div
            className="panel modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <h2>{modal === 'controls' ? 'Controles' : 'Créditos y licencia'}</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setModal(null)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </header>

            {modal === 'controls' ? (
              <div className="modal-body controls-body">
                <section>
                  <h3>Mando</h3>
                  <ul className="control-list">
                    <li>
                      <span className="key-pill">Stick izquierdo</span> mover en cualquier ángulo
                    </li>
                    <li>
                      <span className="key-pill">Stick derecho</span> girar la cámara 360°
                    </li>
                    <li>
                      <span className="key-pill">L2 / R2</span> alejar / acercar
                    </li>
                    <li>
                      <span className="key-pill">Start</span> abrir el selector de Pokémon
                    </li>
                  </ul>
                </section>
                <section>
                  <h3>Teclado y ratón</h3>
                  <ul className="control-list">
                    <li>
                      <span className="key-pill">WASD / flechas</span> mover
                    </li>
                    <li>
                      <span className="key-pill">Q / E</span> girar la cámara
                    </li>
                    <li>
                      <span className="key-pill">Arrastrar</span> orbitar con el ratón
                    </li>
                    <li>
                      <span className="key-pill">Rueda</span> zoom
                    </li>
                    <li>
                      <span className="key-pill">Shift</span> correr
                    </li>
                    <li>
                      <span className="key-pill">H</span> ocultar o mostrar el HUD
                    </li>
                    <li>
                      <span className="key-pill">Esc</span> volver al selector
                    </li>
                  </ul>
                </section>
                <p className="modal-note">
                  El movimiento es analógico y relativo a la cámara. El sprite elige una de sus 8
                  vistas según el ángulo entre su dirección y la cámara.
                </p>
              </div>
            ) : (
              <div className="modal-body credits-body">
                <p>
                  Los sprites proceden de{' '}
                  <a href={manifest?.source ?? 'https://sprites.pmdcollab.org/'} target="_blank" rel="noreferrer">
                    PMD Sprite Collab
                  </a>{' '}
                  y se distribuyen bajo licencia{' '}
                  <a
                    href={manifest?.licenseUrl ?? 'https://creativecommons.org/licenses/by-nc/4.0/'}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {manifest?.license ?? 'CC BY-NC 4.0'}
                  </a>
                  . Esta demo no tiene fines comerciales.
                </p>
                <div className="credit-list">
                  {manifest?.pokemon.map((entry) => {
                    const artists = [...new Set(entry.credits.map((credit) => credit.artist))];
                    const actions = entry.credits.flatMap((credit) => credit.actions);
                    return (
                      <div className="credit-row" key={entry.id}>
                        <div className="credit-name">
                          <strong>{entry.name}</strong>
                          <span>#{String(entry.dex).padStart(3, '0')}</span>
                        </div>
                        <div className="credit-meta">
                          <span>{artists.length > 0 ? artists.join(' · ') : 'Créditos no disponibles'}</span>
                          {actions.length > 0 && (
                            <span className="muted small">
                              Animaciones: {[...new Set(actions)].join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="modal-note">
                  Las hojas originales, sus ficheros <code>credits.txt</code> y el detalle completo
                  están en <code>public/sprites/CREDITS.md</code>.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

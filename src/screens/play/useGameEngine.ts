/**
 * Ciclo de vida del motor 3D: crea `Game` sobre el canvas WebGL, expone la
 * capa 2D de barras de vida y destruye todo al desmontar o cambiar de mapa.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { Game, type PokemonSkinSelection } from '../../game/game';
import type { AtmosphereState } from '../../game/atmosphere';
import type { InputDeviceInfo, MenuAction } from '../../game/input';
import type { GameModeId, ModeSettings } from '../../game/modes';
import type {
  MatchEndResult,
  MatchPlayerConfig,
  PlayerMatchStats
} from '../../game/multiplayer';
import { DEFAULT_SKIN_ID } from '../../game/skins';
import type { LoadingProgress, SpriteManifest } from '../../game/types';

/** Callbacks que el motor invoca durante la partida. */
export interface PlayHandlers {
  onReady: () => void;
  onProgress: (progress: LoadingProgress) => void;
  onError: (message: string) => void;
  onDevicesChanged: (devices: InputDeviceInfo[]) => void;
  onMenuInput: (event: { deviceId: string; action: MenuAction }) => void;
  onPauseRequest: () => void;
  onMatchStats: (stats: PlayerMatchStats[]) => void;
  onMatchEnd: (result: MatchEndResult) => void;
  onCountdown: (remaining: number | null) => void;
  onAtmosphere: (state: AtmosphereState | null) => void;
}

interface GameEngineOptions {
  manifest: SpriteManifest;
  mapId: string;
  configs: MatchPlayerConfig[];
  modeId: GameModeId;
  modeSettings: ModeSettings;
  timeLimitSeconds: number;
  atmosphereEnabled: boolean;
}

interface GameEngineRefs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  barCanvasRef: RefObject<HTMLCanvasElement | null>;
  gameRef: RefObject<Game | null>;
  handlersRef: RefObject<PlayHandlers | null>;
  configsRef: RefObject<MatchPlayerConfig[]>;
}

export function useGameEngine({
  manifest,
  mapId,
  configs,
  modeId,
  modeSettings,
  timeLimitSeconds,
  atmosphereEnabled
}: GameEngineOptions): GameEngineRefs {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Barras de vida 2D, encima del canvas WebGL y debajo del HUD. */
  const barCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const handlersRef = useRef<PlayHandlers | null>(null);
  const configsRef = useRef(configs);

  useEffect(() => {
    configsRef.current = configs;
  }, [configs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;

    // El motor solo necesita los sprites de las especies que juegan esta
    // partida. Se deduplican porque dos jugadores pueden elegir el mismo
    // Pokémon y su hoja se comparte. Cada combinación especie + aspecto se
    // carga por separado: dos jugadores pueden usar el mismo Pokémon con
    // skins distintas.
    const pokemonIds = [
      ...new Set(configsRef.current.map((config) => config.pokemonId))
    ];
    const pokemonSkins: PokemonSkinSelection[] = [
      ...new Map(
        configsRef.current.map((config) => {
          const skinId = config.skinId ?? DEFAULT_SKIN_ID;
          return [
            `${config.pokemonId}:${skinId}`,
            { pokemonId: config.pokemonId, skinId }
          ] as const;
        })
      ).values()
    ];
    // Vistas de la partida: los bots no tienen cámara propia, así que no
    // cuentan para decidir la densidad de las hojas.
    const humanViews = configsRef.current.filter(
      (config) => !config.isBot
    ).length;

    // `createGraphicsDevice` es asíncrono: el motor se construye en una promesa.
    let game: Game | null = null;
    void Game.create(
      canvas,
      {
        onReady: () => {
          if (!disposed) handlersRef.current?.onReady();
        },
        onProgress: (next) => {
          if (!disposed) handlersRef.current?.onProgress(next);
        },
        onError: (message) => {
          if (!disposed) handlersRef.current?.onError(message);
        },
        onDevicesChanged: (devices) => {
          if (!disposed) handlersRef.current?.onDevicesChanged(devices);
        },
        onMenuInput: (event) => {
          if (!disposed) handlersRef.current?.onMenuInput(event);
        },
        onPauseRequest: () => {
          if (!disposed) handlersRef.current?.onPauseRequest();
        },
        onMatchStats: (next) => {
          if (!disposed) handlersRef.current?.onMatchStats(next);
        },
        onMatchEnd: (result) => {
          if (!disposed) handlersRef.current?.onMatchEnd(result);
        },
        onCountdown: (remaining) => {
          if (!disposed) handlersRef.current?.onCountdown(remaining);
        },
        onAtmosphere: (state) => {
          if (!disposed) handlersRef.current?.onAtmosphere(state);
        }
      },
      {
        mapId,
        manifest,
        modeId,
        modeSettings,
        timeLimitSeconds,
        atmosphereEnabled,
        pokemonIds,
        pokemonSkins,
        humanViews,
        overlayCanvas: barCanvasRef.current
      }
    )
      .then((created) => {
        // El efecto se desmontó mientras se creaba el dispositivo.
        if (disposed) {
          created.dispose();
          return;
        }
        game = created;
        gameRef.current = created;
        void created.init();
      })
      .catch((cause: unknown) => {
        console.error('No se pudo crear el motor 3D', cause);
        if (!disposed) {
          handlersRef.current?.onError(
            'No se pudo iniciar el motor 3D. Comprueba que WebGL2 está disponible.'
          );
        }
      });

    return () => {
      disposed = true;
      gameRef.current = null;
      game?.dispose();
    };
  }, [mapId, manifest, modeId, modeSettings, timeLimitSeconds, atmosphereEnabled]);

  return { canvasRef, barCanvasRef, gameRef, handlersRef, configsRef };
}

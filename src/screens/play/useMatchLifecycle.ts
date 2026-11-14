/**
 * Ciclo de una partida: arranque cuando motor e intro están listos, pausa,
 * cuenta atrás, resultado y revancha. El motor se pausa también al perder el
 * foco para no simular a ciegas.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Game } from '../../game/game';
import type { MatchEndResult, MatchPlayerConfig } from '../../game/multiplayer';
import type { InfoKind } from '../../ui/InfoDialog';
import type { MatchStatsStore } from '../../ui/matchStatsStore';

interface MatchLifecycleOptions {
  /** Permite arrancar la partida; la intro lo activa al terminar. */
  start: boolean;
  engineReady: boolean;
  gameRef: RefObject<Game | null>;
  configsRef: RefObject<MatchPlayerConfig[]>;
  statsStore: MatchStatsStore;
}

export function useMatchLifecycle({
  start,
  engineReady,
  gameRef,
  configsRef,
  statsStore
}: MatchLifecycleOptions) {
  const startedRef = useRef(false);
  const pausedRef = useRef(false);
  const modalRef = useRef<InfoKind | null>(null);

  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [modal, setModal] = useState<InfoKind | null>(null);
  const [matchResult, setMatchResult] = useState<MatchEndResult | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
    modalRef.current = modal;
  }, [paused, modal]);

  // El motor puede terminar de cargar durante la intro (o al revés). La
  // partida solo arranca cuando ambos lados han terminado.
  useEffect(() => {
    if (!start || !engineReady || startedRef.current) return;
    if (!gameRef.current?.startMatch(configsRef.current)) return;
    startedRef.current = true;
    setPlaying(true);
  }, [engineReady, start, gameRef, configsRef]);

  useEffect(() => {
    gameRef.current?.setPaused(paused || modal !== null);
  }, [paused, modal, gameRef]);

  // Si la ventana pierde el foco (alt-tab, minimizar o cambiar de pestaña)
  // durante la partida, se pausa para no dejar la simulación corriendo a
  // ciegas. Si ya está pausada o hay un modal abierto no se toca nada.
  useEffect(() => {
    if (!playing || paused || modal !== null || matchResult !== null) return;
    const pauseOnFocusLoss = () => setPaused(true);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pauseOnFocusLoss();
    };
    window.addEventListener('blur', pauseOnFocusLoss);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', pauseOnFocusLoss);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [playing, paused, modal, matchResult]);

  const requestPause = useCallback(() => setPaused(true), []);

  const resumeGame = useCallback(() => {
    setPaused(false);
    setModal(null);
  }, []);

  const rematch = useCallback(() => {
    if (!gameRef.current?.startMatch(configsRef.current)) return;
    setMatchResult(null);
    statsStore.setSnapshot([]);
    setPaused(false);
  }, [gameRef, configsRef, statsStore]);

  return {
    playing,
    paused,
    modal,
    matchResult,
    countdown,
    setModal,
    setMatchResult,
    setCountdown,
    setPaused,
    pausedRef,
    modalRef,
    requestPause,
    resumeGame,
    rematch
  };
}

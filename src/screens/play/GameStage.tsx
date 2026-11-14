/**
 * Capas de dibujo de la partida: el canvas WebGL del motor y el canvas 2D de
 * barras de vida, que se pinta encima sin tocar el primero.
 */

import type { RefObject } from 'react';

interface GameStageProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  barCanvasRef: RefObject<HTMLCanvasElement | null>;
}

export function GameStage({ canvasRef, barCanvasRef }: GameStageProps) {
  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 block size-full cursor-grab touch-none outline-none active:cursor-grabbing"
      />
      {/* Barras de vida: capa 2D propia, sin tocar el canvas de WebGL. */}
      <canvas
        ref={barCanvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 block size-full"
      />
    </>
  );
}

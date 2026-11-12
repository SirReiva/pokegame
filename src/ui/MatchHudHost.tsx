import type { ComponentProps } from 'react';
import { MatchHud } from './MatchHud';

/**
 * Punto de entrada del HUD desde `PlayScreen`.
 *
 * La suscripción ya no vive aquí: `MatchHud` separa la cabecera y cada
 * `PlayerHud` en componentes suscritos a su propia porción del store. Mantener
 * el host evita que `PlayScreen` dependa de esa estructura interna.
 */
export function MatchHudHost(props: ComponentProps<typeof MatchHud>) {
  return <MatchHud {...props} />;
}

import { useCallback, useEffect } from 'react';
import { Redirect, useLocation } from 'wouter';
import type { MenuInputEvent } from '../game/input';
import type { SpriteManifest } from '../game/types';
import { useSession } from '../session/useSession';
import { RosterScreen } from '../ui/RosterScreen';
import { useMenuInput } from '../ui/useMenuInput';
import { SessionGate } from './SessionGate';

function RosterContent({ manifest }: { manifest: SpriteManifest }) {
  const session = useSession();
  const [, navigate] = useLocation();

  const handleAction = useCallback(
    ({ deviceId, action }: MenuInputEvent) => {
      const player = session.players.find((entry) => entry.deviceId === deviceId);
      if (!player) return;

      if (action === 'cancel') {
        if (player.rosterReady) {
          session.setRosterReady(player.slot, false);
        } else {
          session.resetRosterReady();
          navigate('/lobby');
        }
        return;
      }

      if (action === 'confirm') {
        if (!player.rosterReady) {
          session.setRosterReady(player.slot, true);
          return;
        }
        if (session.matchConfigs) navigate('/play');
        return;
      }

      session.moveCursor(player.slot, action);
    },
    [navigate, session]
  );

  const devices = useMenuInput(handleAction);
  const { syncDevices } = session;

  useEffect(() => {
    syncDevices(devices);
  }, [devices, syncDevices]);

  return (
    <RosterScreen
      manifest={manifest}
      players={session.players}
      onPick={session.selectPokemon}
      onToggleReady={session.toggleRosterReady}
      onStart={() => navigate('/play')}
      onBack={() => {
        session.resetRosterReady();
        navigate('/lobby');
      }}
      onOptions={() => navigate('/opciones')}
    />
  );
}

function RosterGuard() {
  const { manifest, players } = useSession();
  const readyForRoster =
    manifest !== null &&
    players.length > 0 &&
    players.every((player) => player.teamReady);

  if (!readyForRoster || !manifest) return <Redirect to="/lobby" />;

  return <RosterContent manifest={manifest} />;
}

export function RosterRoute() {
  return (
    <SessionGate
      label="Preparando la selección de Pokémon"
      detail="Cargando los retratos y los datos del roster."
    >
      <RosterGuard />
    </SessionGate>
  );
}

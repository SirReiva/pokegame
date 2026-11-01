import { useCallback, useEffect, useState } from 'react';
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
  // deviceId -> id del Pokémon cuya cara trasera está visible. Si el jugador
  // cambia de especie, el id deja de coincidir y la card vuelve sola a la cara
  // frontal.
  const [flipped, setFlipped] = useState<Record<string, string>>({});

  const clearFlip = useCallback(
    (slot: number) => {
      const player = session.players.find((entry) => entry.slot === slot);
      if (!player) return;
      const deviceId = player.deviceId;
      setFlipped((previous) => {
        if (!(deviceId in previous)) return previous;
        const next = { ...previous };
        delete next[deviceId];
        return next;
      });
    },
    [session.players]
  );

  const toggleFlip = useCallback(
    (slot: number) => {
      const player = session.players.find((entry) => entry.slot === slot);
      if (!player) return;
      setFlipped((previous) => {
        const next = { ...previous };
        if (next[player.deviceId] === player.pokemonId) delete next[player.deviceId];
        else next[player.deviceId] = player.pokemonId;
        return next;
      });
    },
    [session.players]
  );

  const handlePick = useCallback(
    (slot: number, pokemonId: string) => {
      clearFlip(slot);
      session.selectPokemon(slot, pokemonId);
    },
    [clearFlip, session]
  );

  const handleAction = useCallback(
    ({ deviceId, action }: MenuInputEvent) => {
      const player = session.players.find((entry) => entry.deviceId === deviceId);
      if (!player) return;

      if (action === 'cancel') {
        if (flipped[player.deviceId] === player.pokemonId) {
          clearFlip(player.slot);
        } else if (player.rosterReady) {
          session.setRosterReady(player.slot, false);
        } else {
          session.resetRosterReady();
          navigate('/lobby');
        }
        return;
      }

      if (action === 'flip') {
        toggleFlip(player.slot);
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

      clearFlip(player.slot);
      session.moveCursor(player.slot, action);
    },
    [navigate, session, flipped, clearFlip, toggleFlip]
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
      flipped={flipped}
      onPick={handlePick}
      onFlip={toggleFlip}
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

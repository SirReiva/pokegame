import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import type { InputDeviceInfo, MenuInputEvent } from '../game/input';
import { useSession } from '../session/useSession';
import { LobbyScreen } from '../ui/LobbyScreen';
import { useMenuInput } from '../ui/useMenuInput';
import { SessionGate } from './SessionGate';

function fallbackDevice(deviceId: string): InputDeviceInfo {
  const keyboard = deviceId === 'kbd';
  return {
    id: deviceId,
    kind: keyboard ? 'keyboard' : 'gamepad',
    label: keyboard ? 'Teclado' : 'Mando',
    family: keyboard ? null : 'generic',
    index: null
  };
}

function LobbyContent() {
  const session = useSession();
  const [, navigate] = useLocation();
  const devicesRef = useRef<InputDeviceInfo[]>([]);

  const handleAction = useCallback(
    ({ deviceId, action }: MenuInputEvent) => {
      const current = session.players;
      const player = current.find((entry) => entry.deviceId === deviceId);

      if (!player) {
        if (action === 'confirm') {
          const device =
            devicesRef.current.find((entry) => entry.id === deviceId) ??
            fallbackDevice(deviceId);
          session.joinDevice(device);
        }
        return;
      }

      // X/Y (o Tab/F) alterna el modo de movimiento de este jugador sin
      // desmarcar su estado de listo.
      if (action === 'flip') {
        session.cyclePlayerMovementMode(player.slot);
        return;
      }

      if (!player.teamReady) {
        if (action === 'left' || action === 'right') {
          const teams = session.teams;
          const index = Math.max(0, teams.indexOf(player.team));
          const step = action === 'right' ? 1 : -1;
          const next = teams[(index + step + teams.length) % teams.length];
          if (next) session.setPlayerTeam(player.slot, next);
        } else if (action === 'confirm') {
          session.toggleTeamReady(player.slot);
        } else if (action === 'cancel') {
          session.leavePlayer(player.slot);
        }
        return;
      }

      if (action === 'cancel') {
        session.toggleTeamReady(player.slot);
        return;
      }

      if (action === 'confirm') {
        const latest = session.players;
        if (latest.length > 0 && latest.every((entry) => entry.teamReady)) {
          if (session.continueToRoster()) navigate('/roster');
        }
      }
    },
    [navigate, session]
  );

  const devices = useMenuInput(handleAction);
  const { syncDevices } = session;

  useEffect(() => {
    devicesRef.current = devices;
    syncDevices(devices);
  }, [devices, syncDevices]);

  return (
    <LobbyScreen
      players={session.players}
      devices={devices}
      maps={session.maps}
      mapId={session.mapId}
      teams={session.teams}
      mapNotice={session.mapNotice}
      botDifficulty={session.botDifficulty}
      koTarget={session.koTarget}
      onChangeMap={session.setMapId}
      onChangeBotDifficulty={session.setBotDifficulty}
      onChangeKoTarget={session.setKoTarget}
      onAddBot={session.addBot}
      onFillBots={session.fillBots}
      onJoin={session.joinDevice}
      onRename={session.setPlayerName}
      onSetMovementMode={session.setPlayerMovementMode}
      onReady={session.toggleTeamReady}
      onLeave={session.leavePlayer}
      onContinue={() => {
        if (session.continueToRoster()) navigate('/roster');
      }}
      onBack={() => navigate('/')}
      onOptions={() => navigate('/opciones')}
      onEditor={() => navigate('/editor')}
    />
  );
}

export function LobbyRoute() {
  return (
    <SessionGate
      label="Preparando la sala de equipos"
      detail="Cargando el roster, los retratos y los mapas disponibles."
    >
      <LobbyContent />
    </SessionGate>
  );
}

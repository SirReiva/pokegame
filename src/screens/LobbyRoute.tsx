import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import type { InputDeviceInfo, MenuInputEvent } from '../game/input';
import {
  PLAYER_NAME_MAX_LENGTH,
  type LobbyPlayer
} from '../game/multiplayer';
import { useSession } from '../session/useSession';
import { LobbyScreen } from '../ui/LobbyScreen';
import { useMenuInput } from '../ui/useMenuInput';
import {
  applyVirtualKeyboardKey,
  moveVirtualKeyboardCursor,
  VIRTUAL_KEYBOARD_ROWS,
  type VirtualKeyboardCursor
} from '../ui/virtualKeyboard';
import { SessionGate } from './SessionGate';

interface NameEditorState extends VirtualKeyboardCursor {
  deviceId: string;
}

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
  const [nameEditor, setNameEditor] = useState<NameEditorState | null>(null);

  const findEditorPlayer = useCallback(
    (editor: NameEditorState | null): LobbyPlayer | undefined =>
      editor
        ? session.players.find((entry) => entry.deviceId === editor.deviceId)
        : undefined,
    [session.players]
  );

  // Si el jugador sale o se desconecta, su editor deja de existir aunque el
  // estado conserve el cursor: así el mando puede volver a unirse con A.
  const editingPlayer = findEditorPlayer(nameEditor);
  const activeNameEditor = editingPlayer ? nameEditor : null;

  const pressNameKey = useCallback(
    (row: number, col: number) => {
      if (!activeNameEditor) return;
      const player = findEditorPlayer(activeNameEditor);
      const key = VIRTUAL_KEYBOARD_ROWS[row]?.[col];
      if (!player || !key) return;

      const press = applyVirtualKeyboardKey(
        key,
        player.name,
        activeNameEditor.shift,
        PLAYER_NAME_MAX_LENGTH
      );
      if (press.close) {
        setNameEditor(null);
        return;
      }
      if (press.value !== player.name) {
        session.setPlayerName(player.slot, press.value);
      }
      setNameEditor({ ...activeNameEditor, shift: press.shift });
    },
    [activeNameEditor, findEditorPlayer, session]
  );

  const handleAction = useCallback(
    ({ deviceId, action }: MenuInputEvent) => {
      const current = session.players;
      const player = current.find((entry) => entry.deviceId === deviceId);

      // Mientras el teclado en pantalla está abierto, la cruceta y A/B del
      // mando que lo abrió controlan el cursor y las teclas. El resto de
      // dispositivos sigue pudiendo unirse o cambiar de equipo.
      if (activeNameEditor && deviceId === activeNameEditor.deviceId) {
        if (action === 'cancel') {
          setNameEditor(null);
        } else if (action === 'confirm') {
          pressNameKey(activeNameEditor.row, activeNameEditor.col);
        } else if (
          action === 'up' ||
          action === 'down' ||
          action === 'left' ||
          action === 'right'
        ) {
          setNameEditor({
            ...activeNameEditor,
            ...moveVirtualKeyboardCursor(activeNameEditor, action)
          });
        }
        return;
      }

      if (!player) {
        if (action === 'confirm') {
          const device =
            devicesRef.current.find((entry) => entry.id === deviceId) ??
            fallbackDevice(deviceId);
          session.joinDevice(device);
        }
        return;
      }

      // X (o Cuadrado) monta el teclado en pantalla para escribir el nombre.
      if (action === 'editName') {
        setNameEditor({
          deviceId: player.deviceId,
          row: 1,
          col: 0,
          shift: false
        });
        return;
      }

      // Y (o Triángulo / Tab / F) alterna el modo de movimiento de este
      // jugador sin desmarcar su estado de listo.
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
    [activeNameEditor, navigate, pressNameKey, session]
  );

  const devices = useMenuInput(handleAction);
  const { syncDevices } = session;

  useEffect(() => {
    devicesRef.current = devices;
    syncDevices(devices);
  }, [devices, syncDevices]);

  const editorView =
    activeNameEditor && editingPlayer
      ? {
          slot: editingPlayer.slot,
          cursor: {
            row: activeNameEditor.row,
            col: activeNameEditor.col,
            shift: activeNameEditor.shift
          }
        }
      : null;

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
      nameEditor={editorView}
      onKeyboardPress={pressNameKey}
      onKeyboardClose={() => setNameEditor(null)}
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

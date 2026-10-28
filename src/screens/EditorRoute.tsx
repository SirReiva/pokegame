import { useLocation } from 'wouter';
import { useSession } from '../session/useSession';
import { MapEditorScreen } from '../ui/MapEditorScreen';
import { useReturnPath } from '../ui/useReturnPath';
import { SessionGate } from './SessionGate';

function EditorContent() {
  const { maps } = useSession();
  const [, navigate] = useLocation();
  const backPath = useReturnPath('/');

  return <MapEditorScreen maps={maps} onExit={() => navigate(backPath)} />;
}

export function EditorRoute() {
  return (
    <SessionGate
      label="Preparando el editor de mapas"
      detail="Cargando el índice de mapas disponibles."
    >
      <EditorContent />
    </SessionGate>
  );
}

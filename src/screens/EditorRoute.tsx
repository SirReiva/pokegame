import { useSession } from '../session/useSession';
import { MapEditorScreen } from '../ui/MapEditorScreen';
import { useBack } from '../ui/useBack';
import { SessionGate } from './SessionGate';

function EditorContent() {
  const { maps } = useSession();
  const goBack = useBack();

  return <MapEditorScreen maps={maps} onExit={goBack} />;
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

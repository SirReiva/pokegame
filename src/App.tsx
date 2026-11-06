import { lazy, Suspense, useState } from 'react';
import { Redirect, Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from './router/hashLocation';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyRoute } from './screens/LobbyRoute';
import { OptionsScreen } from './screens/OptionsScreen';
import { RosterRoute } from './screens/RosterRoute';
import { SessionProvider } from './session/SessionProvider';
import { useSession } from './session/useSession';
import { LoadingScreen } from './ui/BootScreen';
import { VersusScreen } from './ui/VersusScreen';
import { VirtualMouseLayer } from './ui/VirtualMouse';

// PlayCanvas y el editor solo se descargan al entrar en su ruta.
const PlayRoute = lazy(async () => {
  const module = await import('./screens/PlayScreen');
  return { default: module.PlayRoute };
});
const EditorRoute = lazy(async () => {
  const module = await import('./screens/EditorRoute');
  return { default: module.EditorRoute };
});

const playFallback = (
  <LoadingScreen
    label="Cargando la partida"
    detail="Iniciando PlayCanvas y el motor 3D."
  />
);

/**
 * Muestra el cartel de versus antes de descargar el chunk de PlayCanvas y los
 * assets de la partida. Si no hay una partida preparada (por ejemplo al abrir
 * /play directamente), deja pasar a la ruta normal para que redirija.
 */
function PlayIntroGate() {
  const { bootStatus, manifest, matchConfigs, players } = useSession();
  const [introDone, setIntroDone] = useState(false);

  if (!introDone) {
    if (bootStatus === 'loading') {
      return (
        <LoadingScreen
          label="Preparando la partida"
          detail="Leyendo el manifiesto de sprites y los equipos."
        />
      );
    }
    if (bootStatus === 'ready' && manifest && matchConfigs && players.length > 0) {
      return (
        <VersusScreen
          manifest={manifest}
          players={players}
          onDone={() => setIntroDone(true)}
        />
      );
    }
  }

  return (
    <Suspense fallback={playFallback}>
      <PlayRoute />
    </Suspense>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={HomeScreen} />
      <Route path="/opciones" component={OptionsScreen} />
      <Route path="/editor">
        <Suspense
          fallback={
            <LoadingScreen
              label="Abriendo el editor"
              detail="Preparando la rejilla y las herramientas de dibujo."
            />
          }
        >
          <EditorRoute />
        </Suspense>
      </Route>
      <Route path="/lobby" component={LobbyRoute} />
      <Route path="/roster" component={RosterRoute} />
      <Route path="/play" component={PlayIntroGate} />
      <Route>
        <Redirect to="/" replace />
      </Route>
    </Switch>
  );
}

/** Puntero virtual en todas las rutas salvo la partida en curso. */
function RouteVirtualMouse() {
  const [location] = useLocation();
  return <VirtualMouseLayer enabled={location !== '/play'} />;
}

// Rutas con hash (#/roster): funcionan en GitHub Pages sin fallback 404 y
// mantienen las URLs relativas al index aunque el sitio viva en /<repo>/.
function App() {
  return (
    <Router hook={useHashLocation}>
      <SessionProvider>
        <AppRoutes />
        <RouteVirtualMouse />
      </SessionProvider>
    </Router>
  );
}

export default App;

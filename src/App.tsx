import { lazy, Suspense } from 'react';
import { Redirect, Route, Router, Switch } from 'wouter';
import { useHashLocation } from './router/hashLocation';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyRoute } from './screens/LobbyRoute';
import { OptionsScreen } from './screens/OptionsScreen';
import { RosterRoute } from './screens/RosterRoute';
import { SessionProvider } from './session/SessionProvider';
import { LoadingScreen } from './ui/BootScreen';

// PlayCanvas y el editor solo se descargan al entrar en su ruta.
const PlayRoute = lazy(async () => {
  const module = await import('./screens/PlayScreen');
  return { default: module.PlayRoute };
});
const EditorRoute = lazy(async () => {
  const module = await import('./screens/EditorRoute');
  return { default: module.EditorRoute };
});

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
      <Route path="/play">
        <Suspense
          fallback={
            <LoadingScreen
              label="Cargando la partida"
              detail="Iniciando PlayCanvas y el motor 3D."
            />
          }
        >
          <PlayRoute />
        </Suspense>
      </Route>
      <Route>
        <Redirect to="/" replace />
      </Route>
    </Switch>
  );
}

// Rutas con hash (#/roster): funcionan en GitHub Pages sin fallback 404 y
// mantienen las URLs relativas al index aunque el sitio viva en /<repo>/.
function App() {
  return (
    <Router hook={useHashLocation}>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </Router>
  );
}

export default App;

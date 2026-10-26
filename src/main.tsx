import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Sin StrictMode: PlayCanvas crea y destruye el contexto WebGL una sola vez.
createRoot(document.getElementById('root')!).render(<App />);

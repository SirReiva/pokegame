import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Sin StrictMode: cada visita a /play monta y destruye su propio PlayCanvas.
createRoot(document.getElementById('root')!).render(<App />);

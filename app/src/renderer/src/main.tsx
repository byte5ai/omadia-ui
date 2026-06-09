import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './theme/lume.css';

createRoot(document.getElementById('root') as HTMLElement).render(<App />);

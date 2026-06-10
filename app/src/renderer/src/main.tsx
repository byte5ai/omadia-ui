import { createRoot } from 'react-dom/client';
import { App } from './App.js';
// §2.7 three typographic registers — variable-axis files, bundled locally
// (CSP default-src 'self'; no remote font fetch). Geist = structural,
// Geist Mono = data/code, Source Serif 4 (opsz axis) = agent prose.
import '@fontsource-variable/geist/index.css';
import '@fontsource-variable/geist-mono/index.css';
import '@fontsource-variable/source-serif-4/opsz.css';
import './theme/lume.css';

createRoot(document.getElementById('root') as HTMLElement).render(<App />);

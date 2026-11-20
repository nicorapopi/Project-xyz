import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { WorkspaceBoundary } from './WorkspaceState';
import './styles.css';

createRoot(document.getElementById('root')!, {
  // Render the recovery UI without logging error details that could include workspace text.
  onCaughtError: () => undefined,
  onUncaughtError: () => undefined,
  onRecoverableError: () => undefined,
}).render(
  <StrictMode><WorkspaceBoundary onRetry={() => undefined}><App /></WorkspaceBoundary></StrictMode>,
);

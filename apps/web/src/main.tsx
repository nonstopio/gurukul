import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@gurukul/ui/tokens.css';
import './styles.css';
import { App } from './App';

/** Mount the app into `#root`. Exported so the boot path is testable. */
export function mount(element: HTMLElement | null): void {
  if (!element) {
    throw new Error('Gurukul: #root element is missing from index.html');
  }
  createRoot(element).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

mount(document.getElementById('root'));

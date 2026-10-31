import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Block pinch-zoom and gesture zoom on iOS Safari without breaking tap events
if (typeof document !== 'undefined') {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) =>
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false })
  );

  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );
}

createRoot(document.getElementById('root')!).render(<App />);

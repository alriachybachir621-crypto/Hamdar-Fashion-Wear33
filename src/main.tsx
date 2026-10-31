import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Block pinch-zoom and gesture zoom on iOS Safari
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

  let lastTouch = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const n = Date.now();
      // Block double-tap to zoom if tapping within 300ms, but don't prevent clicking form inputs
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (n - lastTouch <= 300 && !isInput) {
        e.preventDefault();
      }
      lastTouch = n;
    },
    { passive: false }
  );
}

createRoot(document.getElementById('root')!).render(<App />);

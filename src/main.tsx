import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Disable pinch-zoom across all phones and browsers without breaking tap events
if (typeof document !== 'undefined') {
  // 1. Gesture events (iOS Safari)
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) =>
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false })
  );

  // 2. Multi-touch on touchstart and touchmove (Android Chrome, Samsung Internet, iOS, in-app browsers)
  ['touchstart', 'touchmove'].forEach((t) =>
    document.addEventListener(
      t,
      (e: Event) => {
        const touchEvt = e as TouchEvent;
        if (touchEvt.touches && touchEvt.touches.length > 1) {
          e.preventDefault();
        }
      },
      { passive: false }
    )
  );

  // 3. Ctrl + Wheel zoom prevention (desktop browsers & trackpads)
  document.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    },
    { passive: false }
  );
}

createRoot(document.getElementById('root')!).render(<App />);

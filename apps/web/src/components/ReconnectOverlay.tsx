import { useEffect, useState } from 'preact/hooks';
import { wsConnected } from '../state/store';

// Only show the overlay after a sustained disconnect — brief reconnects
// (< DELAY_MS) are invisible to the user, avoiding input disruption.
const DELAY_MS = 1500;

export function ReconnectOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = wsConnected.subscribe(connected => {
      if (!connected) {
        timer = setTimeout(() => setVisible(true), DELAY_MS);
      } else {
        if (timer) clearTimeout(timer);
        timer = null;
        setVisible(false);
      }
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div class="reconnect-overlay">
      <div class="reconnect-content">
        <div class="loading" />
        <div class="reconnect-text">Reconnecting...</div>
      </div>
    </div>
  );
}

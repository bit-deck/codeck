import { wsConnected, restoringPending } from '../state/store';

export function ReconnectOverlay() {
  const disconnected = !wsConnected.value;
  const restoring = restoringPending.value;

  if (!disconnected && !restoring) return null;

  const message = disconnected ? 'Reconnecting...' : 'Restoring sessions...';

  return (
    <div class="reconnect-overlay">
      <div class="reconnect-content">
        <div class="loading" />
        <div class="reconnect-text">{message}</div>
      </div>
    </div>
  );
}

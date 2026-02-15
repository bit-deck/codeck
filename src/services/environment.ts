import { existsSync } from 'fs';

/**
 * Detect if the Docker socket is mounted (experimental mode).
 * Returns true when /var/run/docker.sock exists inside the container.
 */
export function detectDockerSocketMount(): boolean {
  return existsSync('/var/run/docker.sock');
}

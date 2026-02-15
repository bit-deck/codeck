export const ACTIVE_AGENT = {
  id: 'claude',
  name: 'Claude',
  command: 'claude',
  flags: { resume: '--resume', continue: '--continue', version: '--version' },
  instructionFile: 'CLAUDE.md',
  configDir: '/root/.claude',
  credentialsFile: '/root/.claude/.credentials.json',
  configFile: '/root/.claude.json',
  settingsFile: '/root/.claude/settings.json',
  projectsDir: '/root/.claude/projects',
} as const;

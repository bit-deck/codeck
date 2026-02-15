import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, isInitialized } from '../lib/config.js';
import { composeUp } from '../lib/docker.js';

export const startCommand = new Command('start')
  .description('Start the Codeck container')
  .option('--dev', 'Start in development mode (build from source)')
  .action(async (opts) => {
    if (!isInitialized()) {
      console.log(chalk.red('Codeck not initialized. Run `codeck init` first.'));
      process.exit(1);
    }

    const config = getConfig();

    try {
      console.log(chalk.dim(opts.dev ? 'Starting in dev mode...' : 'Starting...'));
      await composeUp({
        projectPath: config.projectPath,
        lanMode: config.lanMode,
        dev: opts.dev,
        build: opts.dev,
      });

      console.log();
      console.log(chalk.green('Codeck is running!'));
      console.log(chalk.dim(`  URL: http://localhost${config.port === 80 ? '' : ':' + config.port}`));
      if (config.lanMode === 'host') {
        console.log(chalk.dim('  LAN: http://codeck.local'));
      } else if (config.lanMode === 'mdns') {
        console.log(chalk.dim('  LAN: Run `codeck lan start` for mDNS access'));
      }
      console.log();
    } catch (err) {
      console.log(chalk.red(`Failed to start: ${(err as Error).message}`));
      process.exit(1);
    }
  });

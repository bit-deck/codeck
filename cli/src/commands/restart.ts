import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, isInitialized } from '../lib/config.js';
import { composeDown, composeUp } from '../lib/docker.js';
import { getContainerStatus } from '../lib/detect.js';

export const restartCommand = new Command('restart')
  .description('Restart the Codeck container')
  .option('--dev', 'Restart in development mode')
  .action(async (opts) => {
    if (!isInitialized()) {
      console.log(chalk.red('Codeck not initialized. Run `codeck init` first.'));
      process.exit(1);
    }

    const config = getConfig();

    try {
      console.log(chalk.dim('Stopping...'));
      await composeDown({
        projectPath: config.projectPath,
        lanMode: config.lanMode,
      });

      // Verify containers stopped before starting new ones
      let retries = 10;
      while (retries-- > 0) {
        const containers = await getContainerStatus(config.projectPath);
        const running = containers.filter(c => c.state === 'running');
        if (running.length === 0) break;
        await new Promise(r => setTimeout(r, 1000));
      }

      console.log(chalk.dim(opts.dev ? 'Starting in dev mode...' : 'Starting...'));
      await composeUp({
        projectPath: config.projectPath,
        lanMode: config.lanMode,
        dev: opts.dev,
        build: opts.dev,
      });

      console.log();
      console.log(chalk.green('Codeck restarted!'));
      console.log(chalk.dim(`  URL: http://localhost${config.port === 80 ? '' : ':' + config.port}`));
      console.log();
    } catch (err) {
      console.log(chalk.red(`Failed to restart: ${(err as Error).message}`));
      process.exit(1);
    }
  });

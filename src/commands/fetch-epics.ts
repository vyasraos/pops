import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import * as yaml from 'js-yaml';
import type { Argv } from 'yargs';
import { JiraDataService } from '../services/jira-data-service';
import { logger } from '../utils/logger';
import { POPSConfig } from '../utils/pops-config';

export const fetchEpicsCommand = {
  command: 'fetch-issues',
  describe: 'Fetch epics and their children from Jira and store as raw JSON in _data folder',
  builder: (y: Argv) => {
    return y
      .option('component', {
        alias: 'c',
        type: 'string',
        description:
          'Component name to fetch epics for (if not provided, fetches all components from .config/scope.yaml)',
        demandOption: false,
      })
      .option('issue', {
        alias: 'i',
        type: 'string',
        description: 'Specific issue key to fetch (e.g., POP-1234)',
        demandOption: false,
      })
      .example('$0 fetch-issues', 'Fetch epics for all components defined in .config/scope.yaml')
      .example('$0 fetch-issues --component idp-infra', 'Fetch epics for specific component')
      .example('$0 fetch-issues --issue POP-1234', 'Fetch specific issue');
  },
  handler: async (argv: Record<string, unknown>) => {
    try {
      const popsConfig = new POPSConfig();
      const dataService = new JiraDataService();

      // Handle single issue fetch
      if (argv.issue && typeof argv.issue === 'string') {
        console.log(chalk.blue(`🔍 Fetching single issue: ${argv.issue}...\n`));
        await dataService.fetchSingleIssue(argv.issue);
        console.log(chalk.green(`✅ Issue ${argv.issue} fetched successfully!`));
        return;
      }

      let componentsToProcess: string[] = [];

      if (argv.component && typeof argv.component === 'string') {
        // Use specified component
        componentsToProcess = [argv.component];
        logger.info(`Fetching epics for component: ${argv.component}`);
      } else {
        // Read components from .config/scope.yaml
        const config = popsConfig.getConfig();
        const targetIncrement = config.jira?.paths?.target || 'FY26Q1';
        const incrementsPath = config.jira?.paths?.increments || 'planning/increments';
        const scopeConfigPath = path.join(incrementsPath, targetIncrement, '.config', 'scope.yaml');

        try {
          const scopeConfigContent = await fs.readFile(scopeConfigPath, 'utf8');
          const scopeConfig = yaml.load(scopeConfigContent) as Record<string, unknown>;

          if (scopeConfig?.components && Array.isArray(scopeConfig.components)) {
            componentsToProcess = (scopeConfig.components as Array<{ name: string }>).map((comp) => comp.name);
            logger.info(
              `Reading components from ${scopeConfigPath}: ${componentsToProcess.join(', ')}`
            );
          } else {
            throw new Error('Invalid scope.yaml format - components array not found');
          }
        } catch (error) {
          logger.error(
            `Failed to read scope configuration from ${scopeConfigPath}: ${error instanceof Error ? error.message : String(error)}`
          );
          console.log(chalk.red(`❌ Could not read scope configuration from: ${scopeConfigPath}`));
          console.log(
            chalk.yellow(
              '💡 Please ensure the .config/scope.yaml file exists and contains a components array'
            )
          );
          process.exit(1);
        }
      }

      // Process each component
      let totalEpics = 0;
      let totalIssues = 0;
      const allErrors: string[] = [];

      for (const componentName of componentsToProcess) {
        try {
          console.log(chalk.blue(`\n📥 Fetching epics for component: ${componentName}`));

          const result = await dataService.fetchEpicsForComponent(componentName);

          if (result.success) {
            totalEpics += result.epicsFetched;
            totalIssues += result.totalIssuesFetched;

            console.log(chalk.green(`✅ Component ${componentName}:`));
            console.log(chalk.green(`   - Epics fetched: ${result.epicsFetched}`));
            console.log(chalk.green(`   - Total issues: ${result.totalIssuesFetched}`));

            if (result.errors.length > 0) {
              console.log(chalk.yellow(`   - Warnings: ${result.errors.length}`));
              result.errors.forEach((error) => {
                console.log(chalk.yellow(`     • ${error}`));
              });
            }
          } else {
            console.log(chalk.red(`❌ Failed to fetch epics for component: ${componentName}`));
            result.errors.forEach((error) => {
              console.log(chalk.red(`   • ${error}`));
            });
            allErrors.push(...result.errors);
          }
        } catch (error) {
          const errorMsg = `Failed to process component ${componentName}: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(errorMsg);
          console.log(chalk.red(`❌ ${errorMsg}`));
          allErrors.push(errorMsg);
        }
      }

      // Summary
      console.log(chalk.blue('\n📊 Summary:'));
      console.log(chalk.blue(`   - Components processed: ${componentsToProcess.length}`));
      console.log(chalk.blue(`   - Total epics fetched: ${totalEpics}`));
      console.log(chalk.blue(`   - Total issues fetched: ${totalIssues}`));

      if (allErrors.length > 0) {
        console.log(chalk.yellow(`   - Errors encountered: ${allErrors.length}`));
        console.log(chalk.blue('\n💾 Data saved to:'), chalk.cyan(dataService.getDataPath()));
      } else {
        console.log(chalk.green('\n🎉 All epics fetched successfully!'));
        console.log(chalk.blue('💾 Data saved to:'), chalk.cyan(dataService.getDataPath()));
        console.log(
          chalk.blue('📝 Next step: Run'),
          chalk.cyan('pops process-epics'),
          chalk.blue('to generate markdown files')
        );
      }
    } catch (error) {
      logger.error('Failed to fetch epics', error);
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
};

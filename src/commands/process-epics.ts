import chalk from 'chalk';
import type { Argv } from 'yargs';
import { JiraDataService } from '../services/jira-data-service';
import { MarkdownProcessor } from '../services/markdown-processor';
import { logger } from '../utils/logger';

export const processEpicsCommand = {
  command: 'process-issue',
  describe:
    'Process JSON data from _data folder and generate markdown files following template specifications',
  builder: (y: Argv) => {
    return y
      .option('component', {
        alias: 'c',
        type: 'string',
        description: 'Component name to process (if not provided, processes all components)',
        demandOption: false,
      })
      .option('epic', {
        alias: 'e',
        type: 'string',
        description: 'Specific epic key to process (if not provided, processes all epics)',
        demandOption: false,
      })
      .option('issue', {
        alias: 'i',
        type: 'string',
        description: 'Specific issue key to process (e.g., POP-1234)',
        demandOption: false,
      })
      .option('dry-run', {
        alias: 'd',
        type: 'boolean',
        description: 'Show what would be processed without actually generating files',
        default: false,
      })
      .example('$0 process-epics', 'Process all epics from _data folder')
      .example('$0 process-epics --component idp-infra', 'Process epics for specific component')
      .example('$0 process-epics --epic POP-1234', 'Process specific epic')
      .example('$0 process-epics --dry-run', 'Show what would be processed');
  },
  handler: async (argv: Record<string, unknown>) => {
    try {
      const dataService = new JiraDataService();
      const processor = new MarkdownProcessor();

      // Handle single issue processing
      if (argv.issue) {
        console.log(chalk.blue(`🔍 Processing single issue: ${argv.issue}...\n`));
        await processor.processSingleIssue(argv.issue as string);
        console.log(chalk.green(`✅ Issue ${argv.issue} processed successfully!`));
        return;
      }

      // Check if _data folder exists
      const dataPath = dataService.getDataPath();
      try {
        await require('node:fs/promises').access(dataPath);
      } catch {
        console.log(
          chalk.red('❌ _data folder not found. Please run'),
          chalk.cyan('pops fetch-epics'),
          chalk.red('first.')
        );
        process.exit(1);
      }

      if (argv.dryRun) {
        console.log(chalk.blue('🔍 Dry run mode - showing what would be processed:'));

        const dataStructure = await dataService.getDataStructure();

        if (dataStructure.size === 0) {
          console.log(chalk.yellow('⚠️  No data found in _data folder'));
          return;
        }

        for (const [component, epicMap] of dataStructure) {
          if (argv.component && component !== argv.component) {
            continue;
          }

          console.log(chalk.blue(`\n📁 Component: ${component}`));

          for (const [epicName, issues] of epicMap) {
            const epic = issues.find((issue) => (issue.fields.issuetype as any)?.name === 'Epic');
            const stories = issues.filter((issue) => (issue.fields.issuetype as any)?.name === 'Story');
            const tasks = issues.filter((issue) => (issue.fields.issuetype as any)?.name === 'Task');

            if (argv.epic && epic && epic.key !== argv.epic) {
              continue;
            }

            console.log(chalk.cyan(`  📂 Epic: ${epicName} (${epic?.key || 'unknown'})`));
            console.log(chalk.gray('     - Epic: 1 file'));
            console.log(chalk.gray(`     - Stories: ${stories.length} files`));
            console.log(chalk.gray(`     - Tasks: ${tasks.length} files`));
            console.log(chalk.gray(`     - Total: ${issues.length} files`));
          }
        }

        console.log(
          chalk.blue('\n💡 Run without --dry-run to actually generate the markdown files')
        );
        return;
      }

      console.log(chalk.blue('🔄 Processing epics from _data folder...'));

      if (argv.component) {
        console.log(chalk.blue(`📁 Processing component: ${argv.component}`));
      }

      if (argv.epic) {
        console.log(chalk.blue(`🎯 Processing epic: ${argv.epic}`));
      }

      const results = await processor.processEpics(argv.component as string, argv.epic as string);

      if (results.length === 0) {
        console.log(chalk.yellow('⚠️  No epics found to process'));
        return;
      }

      // Process results
      let totalFiles = 0;
      let successfulEpics = 0;
      const allErrors: string[] = [];

      for (const result of results) {
        if (result.success) {
          successfulEpics++;
          totalFiles += result.filesGenerated.length;

          console.log(chalk.green(`✅ Epic ${result.epicKey} (${result.component}):`));
          console.log(chalk.green(`   - Files generated: ${result.filesGenerated.length}`));

          if (result.errors.length > 0) {
            console.log(chalk.yellow(`   - Warnings: ${result.errors.length}`));
            result.errors.forEach((error) => {
              console.log(chalk.yellow(`     • ${error}`));
            });
          }
        } else {
          console.log(
            chalk.red(`❌ Failed to process epic ${result.epicKey} (${result.component}):`)
          );
          result.errors.forEach((error) => {
            console.log(chalk.red(`   • ${error}`));
          });
          allErrors.push(...result.errors);
        }
      }

      // Summary
      console.log(chalk.blue('\n📊 Summary:'));
      console.log(chalk.blue(`   - Epics processed: ${results.length}`));
      console.log(chalk.blue(`   - Successful: ${successfulEpics}`));
      console.log(chalk.blue(`   - Total files generated: ${totalFiles}`));

      if (allErrors.length > 0) {
        console.log(chalk.yellow(`   - Errors encountered: ${allErrors.length}`));
      } else {
        console.log(chalk.green('\n🎉 All epics processed successfully!'));
        console.log(chalk.blue('📝 Markdown files generated in component directories'));
      }
    } catch (error) {
      logger.error('Failed to process epics', error);
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
};

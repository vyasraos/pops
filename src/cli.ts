#!/usr/bin/env bun

import chalk from 'chalk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { validateCommand } from './commands/config';
import { fetchEpicsCommand } from './commands/fetch-epics';
import { issueCreateCommand } from './commands/issue-create';
import { issuePromoteCommand } from './commands/issue-promote';
import { issueRefineCommand } from './commands/issue-refine';
import { issueUpdateCommand } from './commands/issue-update';
import { processEpicsCommand } from './commands/process-epics';
import { validateIssuesCommand } from './commands/validate-issues';

const cli = yargs(hideBin(process.argv))
  .scriptName('pops')
  .usage(chalk.blue('$0 <command> [options]'))
  .version('0.1.0')
  .help('help')
  .alias('h', 'help')
  .alias('v', 'version')
  .demandCommand(1, chalk.red('Please specify a command'))
  .strict()
  .recommendCommands()
  .showHelpOnFail(true, 'Use --help for available options')
  .fail((msg, err, yargs) => {
    if (err) {
      console.error(chalk.red('Error:'), err.message);
      process.exit(1);
    }
    if (msg) {
      console.error(chalk.red('Error:'), msg);
      console.log('');
      yargs.showHelp();
      process.exit(1);
    }
  })
  .command(validateCommand)
  .command(fetchEpicsCommand)
  .command(processEpicsCommand)
  .command(issueCreateCommand)
  .command(issueUpdateCommand)
  .command(issuePromoteCommand)
  .command(issueRefineCommand)
  .command(validateIssuesCommand)
  .example('$0 validate', 'Validate POPS configuration and dependencies')
  .example('$0 fetch-issues', 'Fetch epics and children from Jira to _data folder')
  .example('$0 process-issue', 'Generate markdown files from _data JSON')
  .example('$0 create-issue', 'Create a new Jira issue interactively')
  .example('$0 update-issue [file]', 'Update summary and description of an issue')
  .example('$0 update-issue --key POP-1234', 'Update issue by key')
  .example('$0 promote-issue [file]', 'Promote a workspace issue to an increment')
  .example('$0 refine-issue POP-1234', 'Fetch Jira issue and create markdown file for editing')
  .example('$0 validate-issue --all', 'Validate all issues against template specifications')
  .epilogue(chalk.cyan('POPS CLI - Playbook Operations CLI for Jira integration'));

// Parse and execute
cli.parse();

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as yaml from 'js-yaml';
import type { CommandModule } from 'yargs';
import { JiraApiClient } from '../services/jira-api-client';
import { logger } from '../utils/logger';
import { SimpleMapper } from '../utils/simple-mapper';
import type { JiraIssue } from '../types';

interface IssueUpdateArgs {
  file?: string;
  key?: string;
}

interface WorkspaceIssue {
  key: string;
  summary: string;
  component: string;
  filePath: string;
  type: string;
}

class IssueUpdater {
  private jiraClient: JiraApiClient;
  private mapper: SimpleMapper;

  constructor() {
    this.jiraClient = new JiraApiClient();
    this.mapper = new SimpleMapper();
  }

  async run(filePath?: string, issueKey?: string): Promise<void> {
    try {
      console.log(chalk.blue('📝 Updating Jira issue...\n'));

      // Get the file path
      let targetFile: string;
      if (filePath) {
        targetFile = path.resolve(filePath);
      } else if (issueKey) {
        // Find file by issue key
        const foundFile = await this.findFileByKey(issueKey);
        if (!foundFile) {
          throw new Error(`Issue ${issueKey} not found in _workspace directory`);
        }
        targetFile = foundFile;
      } else {
        // Get all issues from _workspace
        const issues = await this.getAllWorkspaceIssues();

        if (issues.length === 0) {
          throw new Error('No issues found in _workspace directory');
        }

        const { selectedFile } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedFile',
            message: 'Select issue to update',
            choices: issues.map((issue) => ({
              name: `${issue.key} - ${issue.summary} (${issue.component})`,
              value: issue.filePath,
              short: issue.key,
            })),
            pageSize: 10,
            filter: (input: string) => {
              // Enable search functionality
              return input;
            },
          },
        ]);
        targetFile = selectedFile;
      }

      // Read the markdown file
      const content = await fs.readFile(targetFile, 'utf8');
      const { frontmatter, summary, description } = this.parseMarkdown(content);

      if (!(frontmatter.properties as Record<string, unknown>)?.key) {
        throw new Error('Issue key not found in frontmatter');
      }

      const key = (frontmatter.properties as Record<string, unknown>)?.key as string;

      // Build Jira fields using mapping
      console.log(chalk.blue('\n🚀 Updating issue in Jira...'));
      let jiraFields: Record<string, unknown> = {
        summary: summary.trim(),
        description: description.trim(),
      };

      // Apply mapping if it exists
      if (frontmatter.mapping && frontmatter.properties) {
        console.log(chalk.blue('📋 Applying field mappings...'));

        const mappedFields = this.mapper.mapPropertiesToJira(
          frontmatter.properties as Record<string, unknown>,
          frontmatter.mapping as Record<string, string>
        );

        const additionalFields = this.mapper.convertToJiraFields(mappedFields);

        // Merge with existing fields (additionalFields is already the fields object)
        jiraFields = { ...jiraFields, ...additionalFields };

        console.log(chalk.green(`✅ Mapped ${Object.keys(mappedFields).length} fields`));
      }

      const payload = { fields: jiraFields };
      await this.jiraClient.updateIssue(key, payload);

      console.log(chalk.green('\n✅ Issue updated successfully!'));
      console.log(chalk.green(`   Key: ${key}`));
      console.log(chalk.green(`   File: ${path.relative(process.cwd(), targetFile)}`));
    } catch (error) {
      logger.error('Failed to update issue:', error);
      console.log(
        chalk.red(
          `\n❌ Failed to update issue: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      process.exit(1);
    }
  }

  private parseMarkdown(content: string): {
    frontmatter: Record<string, unknown>;
    summary: string;
    description: string;
  } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      throw new Error('No frontmatter found in markdown file');
    }

    const frontmatter = yaml.load(frontmatterMatch[1]) as Record<string, unknown>;

    // Extract summary and description
    const summaryMatch = content.match(/## Summary\n\n(.*?)(?=\n\n##|$)/s);
    const descriptionMatch = content.match(/## Description\n\n([\s\S]*?)$/);

    const summary = summaryMatch ? summaryMatch[1].trim() : '';
    const description = descriptionMatch ? descriptionMatch[1].trim() : '';

    return { frontmatter, summary, description };
  }

  private async getAllWorkspaceIssues(): Promise<WorkspaceIssue[]> {
    const issues: WorkspaceIssue[] = [];
    const workspacePath = path.join(process.cwd(), 'planning', 'increments', '_workspace');

    try {
      await this.scanDirectory(workspacePath, issues);
    } catch (error) {
      logger.warn('Failed to scan workspace directory:', error);
    }

    // Sort by key for consistent ordering
    return issues.sort((a, b) => a.key.localeCompare(b.key));
  }

  private async scanDirectory(dirPath: string, issues: WorkspaceIssue[]): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await this.scanDirectory(fullPath, issues);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Check if it's an issue file (contains issue key pattern)
          if (entry.name.match(/^(epic|story|task|bug|sub-task)-POP-\d+\.md$/i)) {
            try {
              const content = await fs.readFile(fullPath, 'utf8');
              const { frontmatter } = this.parseMarkdown(content);

              if ((frontmatter.properties as Record<string, unknown>)?.key) {
                const component = this.extractComponentFromPath(fullPath);
                issues.push({
                  key: (frontmatter.properties as Record<string, unknown>).key as string,
                  summary: this.extractSummaryFromContent(content),
                  component: component,
                  filePath: fullPath,
                  type: ((frontmatter.properties as Record<string, unknown>).type as string) || 'Unknown',
                });
              }
            } catch (error) {
              logger.warn(`Failed to parse file ${fullPath}:`, error);
            }
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to scan directory ${dirPath}:`, error);
    }
  }

  private extractComponentFromPath(filePath: string): string {
    // Extract component from path like: .../_workspace/cp-bm-mgmt/epic-.../story-POP-123.md
    const pathParts = filePath.split(path.sep);
    const workspaceIndex = pathParts.indexOf('_workspace');
    if (workspaceIndex !== -1 && workspaceIndex + 1 < pathParts.length) {
      return pathParts[workspaceIndex + 1];
    }
    return 'Unknown';
  }

  private extractSummaryFromContent(content: string): string {
    // Extract summary from markdown content
    const summaryMatch = content.match(/## Summary\n\n(.*?)(?=\n\n##|$)/s);
    return summaryMatch ? summaryMatch[1].trim() : 'No summary';
  }

  private async findFileByKey(issueKey: string): Promise<string | null> {
    const issues = await this.getAllWorkspaceIssues();
      const issue = issues.find((i) => (i as any).key === issueKey);
      return issue ? (issue as any).filePath : null;
  }
}

export const issueUpdateCommand: CommandModule<Record<string, never>, IssueUpdateArgs> = {
  command: 'update-issue [file]',
  describe: 'Update an existing Jira issue with dynamic field mapping support',
  builder: (yargs) => {
    return yargs
      .positional('file', {
        describe: 'Path to the markdown file',
        type: 'string',
      })
      .option('key', {
        alias: 'k',
        describe: 'Issue key (e.g., POP-1234)',
        type: 'string',
      })
      .conflicts('file', 'key');
  },
  handler: async (argv) => {
    const updater = new IssueUpdater();
    await updater.run(argv.file, argv.key);
  },
};

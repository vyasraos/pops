import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import * as yaml from 'js-yaml';
import type { CommandModule } from 'yargs';
import { JiraApiClient } from '../services/jira-api-client';
import { logger } from '../utils/logger';
import type { JiraIssue } from '../types';

interface IssueReworkArgs {
  issueKey: string;
}

class IssueReworker {
  private jiraClient: JiraApiClient;

  constructor() {
    this.jiraClient = new JiraApiClient();
  }

  async run(issueKey: string): Promise<void> {
    try {
      console.log(chalk.blue(`🔍 Reworking Jira issue: ${issueKey}...\n`));

      // First check if issue exists in workspace
      const existingFile = await this.findFileInWorkspace(issueKey);
      if (existingFile) {
        console.log(chalk.green(`✅ Found existing issue in workspace: ${existingFile}`));
        console.log(chalk.blue('📝 You can now edit the markdown file to rework the content'));
        console.log(chalk.blue(`   File: ${path.relative(process.cwd(), existingFile)}`));
        console.log(chalk.blue('\n📋 Next steps:'));
        console.log(chalk.blue(`   1. Edit the markdown file to rework the content`));
        console.log(chalk.blue(`   2. Run: pops update-issue ${issueKey}`));
        console.log(chalk.blue(`   3. Run: pops promote-issue ${issueKey} --target FY26Q1`));
        return;
      }

      // Issue not found in workspace, fetch from Jira
      console.log(chalk.blue('📥 Issue not found in workspace, fetching from Jira...'));
      const jiraIssue = await this.jiraClient.getIssue(issueKey);

      if (!jiraIssue) {
        throw new Error(`Issue ${issueKey} not found in Jira`);
      }

      console.log(chalk.green(`✅ Found issue: ${jiraIssue.fields.summary}`));

      // Add re-workspace label to the issue
      console.log(chalk.blue('🏷️  Adding re-workspace label...'));
      await this.addReWorkspaceLabel(issueKey, jiraIssue);

      // Determine target directory based on issue type and components
      const targetDir = await this.determineTargetDirectory(jiraIssue);

      // Create markdown file
      console.log(chalk.blue('📝 Creating markdown file...'));
      const markdownContent = this.generateMarkdownContent(jiraIssue);
      const fileName = this.generateFileName(jiraIssue);
      const filePath = path.join(targetDir, fileName);

      // Ensure directory exists
      await fs.mkdir(targetDir, { recursive: true });

      // Write markdown file
      await fs.writeFile(filePath, markdownContent, 'utf8');

      console.log(chalk.green('\n✅ Issue reworked successfully!'));
      console.log(chalk.green(`   Key: ${issueKey}`));
      console.log(chalk.green(`   File: ${path.relative(process.cwd(), filePath)}`));
      console.log(chalk.blue('\n📋 Next steps:'));
      console.log(chalk.blue('   1. Edit the markdown file to rework the content'));
      console.log(chalk.blue(`   2. Run: pops update-issue ${issueKey}`));
      console.log(chalk.blue(`   3. Run: pops promote-issue ${issueKey} --target FY26Q1`));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`❌ Failed to rework issue: ${errorMessage}`));
      logger.error('Issue rework failed:', error);
      throw error;
    }
  }

  private async addReWorkspaceLabel(issueKey: string, jiraIssue: JiraIssue): Promise<void> {
    const currentLabels = (jiraIssue.fields.labels as string[]) || [];

    // Add re-workspace label if not already present
    if (!currentLabels.includes('re-workspace')) {
      const newLabels = [...currentLabels, 're-workspace'];

      const payload = {
        fields: {
          labels: newLabels,
        },
      };

      await this.jiraClient.updateIssue(issueKey, payload);
      console.log(chalk.green('✅ Added re-workspace label'));
    } else {
      console.log(chalk.yellow('⚠️  re-workspace label already present'));
    }
  }

  private async determineTargetDirectory(jiraIssue: JiraIssue): Promise<string> {
    const issueType = (jiraIssue.fields.issuetype as any)?.name?.toLowerCase() || 'unknown';
    const component = (jiraIssue.fields.components as any)?.[0]?.name || 'unknown';

    // Determine base directory based on component
    let baseDir: string;
    if (component === 'idp-infra') {
      baseDir = 'planning/increments/_workspace/idp-infra';
    } else if (component.startsWith('cp-')) {
      baseDir = `planning/increments/_workspace/${component}`;
    } else {
      baseDir = `planning/increments/_workspace/${component}`;
    }

    // For epics, create epic directory
    if (issueType === 'epic') {
      const epicName = this.generateEpicDirectoryName(jiraIssue.fields.summary as string);
      return path.join(baseDir, epicName);
    }

    // For stories/tasks, try to find existing epic directory
    const epicDir = await this.findEpicDirectory(baseDir);
    if (epicDir) {
      return path.join(baseDir, epicDir);
    }

    // Default to component directory
    return baseDir;
  }

  private generateEpicDirectoryName(summary: string): string {
    const cleanSummary = summary
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return `epic-${cleanSummary}`;
  }

  private async findEpicDirectory(baseDir: string): Promise<string | null> {
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('epic-')) {
          return entry.name;
        }
      }
    } catch (_error: unknown) {
      // Directory doesn't exist or can't be read
    }

    return null;
  }

  private generateFileName(jiraIssue: JiraIssue): string {
    const issueType = (jiraIssue.fields.issuetype as any)?.name?.toLowerCase() || 'unknown';
    const key = jiraIssue.key;

    return `${issueType}-${key}.md`;
  }

  private generateMarkdownContent(jiraIssue: JiraIssue): string {
    const issueType = (jiraIssue.fields.issuetype as any)?.name || 'Unknown';
    const workstream = (jiraIssue.fields.customfield_12401 as any)?.value || 'IaC';
    const initiative = (jiraIssue.fields.customfield_12400 as any)?.value || 'Private Cloud 2.0';
    const components = (jiraIssue.fields.components as any)?.map((c: any) => c.name) || ['idp-infra'];
    const labels = [...((jiraIssue.fields.labels as string[]) || []), 'workspace'];
    const points = (jiraIssue.fields.customfield_10006 as number) || null;

    const frontmatter = {
      properties: {
        key: jiraIssue.key,
        type: issueType,
        workstream: workstream,
        initiative: initiative,
        components: components,
        labels: labels,
        status: (jiraIssue.fields.status as any)?.name || 'Unknown',
        points: points,
      },
      mapping: {
        key: 'api.key',
        type: 'api.fields.issuetype.name',
        workstream: 'api.fields.customfield_12401.value',
        initiative: 'api.fields.customfield_12400.value',
        components: 'api.fields.components[].name',
        labels: 'api.fields.labels[]',
        status: 'api.fields.status.name',
        points: 'api.fields.customfield_10006',
      },
    };

    const description = jiraIssue.fields.description || 'No description available.';

    return `---
${yaml.dump(frontmatter, { lineWidth: -1, noRefs: true })}
---

## Summary

${jiraIssue.fields.summary}

## Description

${description}
`;
  }

  private async findFileInWorkspace(issueKey: string): Promise<string | null> {
    const workspacePath = path.join(process.cwd(), 'planning', 'increments', '_workspace');
    
    try {
      const files = await this.scanWorkspaceForIssue(workspacePath, issueKey);
      return files.length > 0 ? files[0] : null;
    } catch (error) {
      logger.warn('Failed to scan workspace for issue:', error);
      return null;
    }
  }

  private async scanWorkspaceForIssue(dirPath: string, issueKey: string): Promise<string[]> {
    const foundFiles: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.scanWorkspaceForIssue(fullPath, issueKey);
          foundFiles.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Check if it's an issue file with the matching key
          if (entry.name.match(/^(epic|story|task|bug|sub-task)-POP-\d+\.md$/i)) {
            try {
              const content = await fs.readFile(fullPath, 'utf8');
              const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
              if (frontmatterMatch) {
                const frontmatter = yaml.load(frontmatterMatch[1]) as any;
                if (frontmatter.properties?.key === issueKey) {
                  foundFiles.push(fullPath);
                }
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

    return foundFiles;
  }
}

export const issueReworkCommand: CommandModule<{}, IssueReworkArgs> = {
  command: 'rework-issue <issueKey>',
  describe: 'Rework a Jira issue by fetching it and creating a markdown file for editing',
  builder: (yargs) => {
    return yargs.positional('issueKey', {
      describe: 'Jira issue key (e.g., POP-1234)',
      type: 'string',
      demandOption: true,
    });
  },
  handler: async (argv) => {
    const reworker = new IssueReworker();
    await reworker.run(argv.issueKey);
  },
};

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import * as yaml from 'js-yaml';
import type { CommandModule } from 'yargs';
import { JiraApiClient } from '../services/jira-api-client';
import { logger } from '../utils/logger';
import { POPSConfig } from '../utils/pops-config';
import type { JiraIssue } from '../types';

interface IssueReworkArgs {
  issueKey: string;
  recurse?: boolean;
}

class IssueReworker {
  private jiraClient: JiraApiClient;
  private popsConfig: POPSConfig;

  constructor() {
    this.jiraClient = new JiraApiClient();
    this.popsConfig = new POPSConfig();
  }

  async run(issueKey: string, recurse: boolean = false): Promise<void> {
    try {
      if (recurse) {
        console.log(chalk.blue(`🔍 Reworking Jira issue and all children: ${issueKey}...\n`));
        await this.reworkIssueWithChildren(issueKey);
      } else {
        console.log(chalk.blue(`🔍 Reworking Jira issue: ${issueKey}...\n`));
        await this.reworkSingleIssue(issueKey);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`❌ Failed to rework issue: ${errorMessage}`));
      logger.error('Issue rework failed:', error);
      throw error;
    }
  }

  private async reworkSingleIssue(issueKey: string): Promise<void> {
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
  }

  private async reworkIssueWithChildren(issueKey: string): Promise<void> {
    // First, rework the parent issue
    console.log(chalk.blue(`📋 Processing parent issue: ${issueKey}`));
    await this.reworkSingleIssue(issueKey);

    // Get all child issues
    console.log(chalk.blue('\n🔍 Fetching child issues...'));
    const childIssues = await this.jiraClient.getIssueChildren(issueKey);

    if (!childIssues || childIssues.length === 0) {
      console.log(chalk.yellow('⚠️  No child issues found'));
      return;
    }

    console.log(chalk.green(`✅ Found ${childIssues.length} child issues`));

    // Process each child issue
    const processedIssues: string[] = [];
    const failedIssues: string[] = [];

    for (const childIssue of childIssues) {
      try {
        console.log(chalk.blue(`\n📋 Processing child issue: ${childIssue.key}`));
        await this.reworkSingleIssue(childIssue.key);
        processedIssues.push(childIssue.key);
      } catch (error) {
        logger.error(`Failed to rework child issue ${childIssue.key}:`, error);
        failedIssues.push(childIssue.key);
        console.log(chalk.red(`❌ Failed to rework child issue: ${childIssue.key}`));
      }
    }

    // Summary
    console.log(chalk.blue('\n📊 Processing Summary:'));
    console.log(chalk.green(`✅ Successfully processed: ${processedIssues.length} issues`));
    if (processedIssues.length > 0) {
      console.log(chalk.green(`   - Parent: ${issueKey}`));
      processedIssues.forEach(key => {
        console.log(chalk.green(`   - Child: ${key}`));
      });
    }

    if (failedIssues.length > 0) {
      console.log(chalk.red(`❌ Failed to process: ${failedIssues.length} issues`));
      failedIssues.forEach(key => {
        console.log(chalk.red(`   - ${key}`));
      });
    }

    console.log(chalk.blue('\n📋 Next steps:'));
    console.log(chalk.blue('   1. Edit the markdown files to rework the content'));
    console.log(chalk.blue('   2. Run update and promote commands for each issue as needed'));
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

    // For stories/tasks, find the parent epic and use its directory
    if (issueType === 'story' || issueType === 'task') {
      const parentEpicKey = await this.getParentEpicKey(jiraIssue);
      if (parentEpicKey) {
        const parentEpicDir = await this.findParentEpicDirectory(baseDir, parentEpicKey);
        if (parentEpicDir) {
          return path.join(baseDir, parentEpicDir);
        }
      }
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
    } catch {
      // Directory doesn't exist or can't be read
    }

    return null;
  }

  private async getParentEpicKey(jiraIssue: JiraIssue): Promise<string | null> {
    try {
      // Check for Epic Link field (customfield_10000 is commonly used for Epic Link)
      const epicLink = (jiraIssue.fields as any)?.customfield_10000;
      if (epicLink) {
        return epicLink;
      }

      // Check for parent field
      const parent = (jiraIssue.fields as any)?.parent;
      if (parent && parent.key) {
        // Verify that the parent is an epic
        const parentIssue = await this.jiraClient.getIssue(parent.key);
        if (parentIssue && (parentIssue.fields.issuetype as any)?.name?.toLowerCase() === 'epic') {
          return parent.key;
        }
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to get parent epic for issue ${jiraIssue.key}:`, error);
      return null;
    }
  }

  private async findParentEpicDirectory(baseDir: string, parentEpicKey: string): Promise<string | null> {
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('epic-')) {
          // Check if this directory contains the parent epic
          const epicDirPath = path.join(baseDir, entry.name);
          const epicFiles = await this.scanWorkspaceForIssue(epicDirPath, parentEpicKey);
          if (epicFiles.length > 0) {
            return entry.name;
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to find parent epic directory for ${parentEpicKey}:`, error);
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

    const frontmatter: any = {
      properties: {
        key: jiraIssue.key,
        type: issueType,
        workstream: workstream,
        initiative: initiative,
        labels: labels,
        status: (jiraIssue.fields.status as any)?.name || 'Unknown',
        points: points,
      },
      mapping: {
        key: 'api.key',
        type: 'api.fields.issuetype.name',
        workstream: 'api.fields.customfield_12401.value',
        initiative: 'api.fields.customfield_12400.value',
        labels: 'api.fields.labels[]',
        status: 'api.fields.status.name',
        points: 'api.fields.customfield_10006',
      },
    };

    // Only include components for EPICs
    if (issueType === 'Epic') {
      frontmatter.properties.components = components;
      frontmatter.mapping.components = 'api.fields.components[].name';
    }

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
          const config = this.popsConfig.getConfig();
          const projectKey = config.jira?.project;
          
          if (!projectKey) {
            throw new Error('Project key is required in pops.toml configuration. Please add "project = "YOUR_PROJECT_KEY"" under [jira] section.');
          }
          const projectRegex = new RegExp(`^(epic|story|task|bug|sub-task)-${projectKey}-\\d+\\.md$`, 'i');
          if (entry.name.match(projectRegex)) {
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
    return yargs
      .positional('issueKey', {
        describe: 'Jira issue key (e.g., POP-1234)',
        type: 'string',
        demandOption: true,
      })
      .option('recurse', {
        alias: 'r',
        describe: 'Process all child issues under the specified issue',
        type: 'boolean',
        default: false,
      })
      .example('$0 rework-issue GVT-2029', 'Rework a single issue')
      .example('$0 rework-issue GVT-2000 --recurse', 'Rework an epic and all its child issues');
  },
  handler: async (argv) => {
    const reworker = new IssueReworker();
    await reworker.run(argv.issueKey, argv.recurse);
  },
};

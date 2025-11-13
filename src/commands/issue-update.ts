import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import * as yaml from 'js-yaml';
import type { CommandModule } from 'yargs';
import { JiraApiClient } from '../services/jira-api-client';
import { logger } from '../utils/logger';
import { SimpleMapper } from '../utils/simple-mapper';
import { POPSConfig } from '../utils/pops-config';

interface IssueUpdateArgs {
  issueKey: string;
  recurse?: boolean;
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
  private popsConfig: POPSConfig;

  constructor() {
    this.jiraClient = new JiraApiClient();
    this.mapper = new SimpleMapper();
    this.popsConfig = new POPSConfig();
  }

  async run(issueKey: string, recurse: boolean = false): Promise<void> {
    try {
      if (recurse) {
        console.log(chalk.blue(`📝 Updating Jira issue and all children: ${issueKey}...\n`));
        await this.updateIssueWithChildren(issueKey);
      } else {
        console.log(chalk.blue(`📝 Updating Jira issue: ${issueKey}...\n`));
        await this.updateSingleIssue(issueKey);
      }
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

  private async updateSingleIssue(issueKey: string): Promise<void> {
    // Find file by issue key in _workspace
    const foundFile = await this.findFileByKey(issueKey);
    if (!foundFile) {
      throw new Error(`Issue ${issueKey} not found in _workspace directory`);
    }
    const targetFile = foundFile;

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

    // Check if this is a story/task and update epic link based on directory
    const issueType = (frontmatter.properties as Record<string, unknown>)?.type as string;
    if (issueType === 'Story' || issueType === 'Task') {
      const epicKey = await this.getEpicKeyFromDirectory(targetFile);
      if (epicKey) {
        console.log(chalk.blue(`🔗 Updating epic link to: ${epicKey}`));
        jiraFields.customfield_10000 = epicKey; // Epic Link field
      }
    }

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
  }

  private async updateIssueWithChildren(issueKey: string): Promise<void> {
    // Find all child issues BEFORE updating parent
    const childIssues = await this.findChildIssuesInWorkspace(issueKey);
    
    if (childIssues.length === 0) {
      console.log(chalk.yellow('ℹ️  No child issues found in workspace'));
    } else {
      console.log(chalk.blue(`\n📋 Found ${childIssues.length} child issues in workspace:`));
      for (const child of childIssues) {
        console.log(chalk.blue(`   - ${child.key}: ${child.summary}`));
      }
    }

    // Then update the main issue
    await this.updateSingleIssue(issueKey);

    // Finally update each child issue
    if (childIssues.length > 0) {
      for (const child of childIssues) {
        console.log(chalk.blue(`\n📝 Updating child issue: ${child.key}...`));
        try {
          await this.updateSingleIssue(child.key);
        } catch (error) {
          console.log(chalk.red(`❌ Failed to update child issue ${child.key}: ${error instanceof Error ? error.message : String(error)}`));
          logger.warn(`Failed to update child issue ${child.key}:`, error);
        }
      }

      console.log(chalk.green(`\n✅ Updated ${childIssues.length + 1} issues total (1 parent + ${childIssues.length} children)`));
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

      // Get project from config
      const config = this.popsConfig.getConfig();
      const projectKey = config.jira?.project;
      
      if (!projectKey) {
        throw new Error('Project key is required in pops.toml configuration. Please add "project = "YOUR_PROJECT_KEY"" under [jira] section.');
      }
      const projectRegex = new RegExp(`^(epic|story|task|bug|sub-task)-${projectKey}-\\d+\\.md$`, 'i');

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await this.scanDirectory(fullPath, issues);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Check if it's an issue file (contains issue key pattern)
          if (entry.name.match(projectRegex)) {
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
              // Only warn about parsing failures for files that should have valid frontmatter
              // Skip verbose warnings for files that are clearly not issue files
              if (error instanceof Error && error.message.includes('No frontmatter found')) {
                // This is likely a template or placeholder file, don't warn
                logger.debug(`Skipping file without frontmatter: ${path.basename(fullPath)}`);
              } else {
                logger.warn(`Failed to parse file ${fullPath}:`, error);
              }
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
    // Get project from config
    const config = this.popsConfig.getConfig();
    const projectKey = config.jira?.project;
    
    if (!projectKey) {
      throw new Error('Project key is required in pops.toml configuration. Please add "project = "YOUR_PROJECT_KEY"" under [jira] section.');
    }

    // Create filename pattern for the specific issue
    const issueFilePattern = new RegExp(`^(epic|story|task|bug|sub-task)-${issueKey}\\.md$`, 'i');
    
    // Recursively find all files matching the pattern
    const workspacePath = path.join(process.cwd(), 'planning', 'increments', '_workspace');
    const foundFile = await this.findFileByPattern(workspacePath, issueFilePattern);
    
    return foundFile;
  }

  private async findFileByPattern(dirPath: string, pattern: RegExp): Promise<string | null> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively search subdirectories
          const found = await this.findFileByPattern(fullPath, pattern);
          if (found) {
            return found;
          }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Check if filename matches the pattern
          if (entry.name.match(pattern)) {
            return fullPath;
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to scan directory ${dirPath}:`, error);
    }

    return null;
  }

  private async findChildIssuesInWorkspace(epicKey: string): Promise<WorkspaceIssue[]> {
    const childIssues: WorkspaceIssue[] = [];
    const workspacePath = path.join(process.cwd(), 'planning', 'increments', '_workspace');

    try {
      await this.scanDirectoryForChildren(workspacePath, epicKey, childIssues);
    } catch (error) {
      logger.warn('Failed to scan workspace directory for children:', error);
    }

    return childIssues;
  }

  private async scanDirectoryForChildren(dirPath: string, epicKey: string, childIssues: WorkspaceIssue[]): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      // Get project from config
      const config = this.popsConfig.getConfig();
      const projectKey = config.jira?.project;
      
      if (!projectKey) {
        throw new Error('Project key is required in pops.toml configuration. Please add "project = "YOUR_PROJECT_KEY"" under [jira] section.');
      }
      const projectRegex = new RegExp(`^(epic|story|task|bug|sub-task)-${projectKey}-\\d+\\.md$`, 'i');

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await this.scanDirectoryForChildren(fullPath, epicKey, childIssues);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Check if it's an issue file (contains issue key pattern)
          if (entry.name.match(projectRegex)) {
            try {
              const content = await fs.readFile(fullPath, 'utf8');
              const { frontmatter } = this.parseMarkdown(content);

              if ((frontmatter.properties as Record<string, unknown>)?.key) {
                const key = (frontmatter.properties as Record<string, unknown>).key as string;
                const issueType = ((frontmatter.properties as Record<string, unknown>).type as string) || 'Unknown';
                
                // Check if this is a child issue (Story or Task) in the same epic directory
                if ((issueType === 'Story' || issueType === 'Task') && key !== epicKey) {
                  // Check if the file is in an epic directory that matches our epic key
                  const epicKeyFromPath = await this.getEpicKeyFromDirectory(fullPath);
                  if (epicKeyFromPath === epicKey) {
                    const component = this.extractComponentFromPath(fullPath);
                    childIssues.push({
                      key: key,
                      summary: this.extractSummaryFromContent(content),
                      component: component,
                      filePath: fullPath,
                      type: issueType,
                    });
                  }
                }
              }
            } catch (error) {
              // Only warn about parsing failures for files that should have valid frontmatter
              // Skip verbose warnings for files that are clearly not issue files
              if (error instanceof Error && error.message.includes('No frontmatter found')) {
                // This is likely a template or placeholder file, don't warn
                logger.debug(`Skipping file without frontmatter: ${path.basename(fullPath)}`);
              } else {
                logger.warn(`Failed to parse file ${fullPath}:`, error);
              }
            }
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to scan directory ${dirPath}:`, error);
    }
  }

  private async getEpicKeyFromDirectory(filePath: string): Promise<string | null> {
    try {
      // Extract the directory path from the file path
      const dirPath = path.dirname(filePath);
      
      // Check if we're in an epic directory (path contains 'epic-')
      const pathParts = dirPath.split(path.sep);
      const epicDirIndex = pathParts.findIndex(part => part.startsWith('epic-'));
      
      if (epicDirIndex === -1) {
        // Not in an epic directory
        return null;
      }

      // Look for epic files in the epic directory
      // Reconstruct path preserving absolute path structure
      const epicDirName = pathParts[epicDirIndex];
      const epicDir = dirPath.substring(0, dirPath.indexOf(epicDirName) + epicDirName.length);
      const entries = await fs.readdir(epicDir, { withFileTypes: true });

      // Find epic files (epic-*.md)
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md') && entry.name.startsWith('epic-')) {
          try {
            const epicFilePath = path.join(epicDir, entry.name);
            const content = await fs.readFile(epicFilePath, 'utf8');
            const { frontmatter } = this.parseMarkdown(content);
            
            const epicKey = (frontmatter.properties as Record<string, unknown>)?.key as string;
            if (epicKey) {
              return epicKey;
            }
          } catch (error) {
            logger.warn(`Failed to parse epic file ${entry.name}:`, error);
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to get epic key from directory ${filePath}:`, error);
      return null;
    }
  }
}

export const issueUpdateCommand: CommandModule<{}, IssueUpdateArgs> = {
  command: 'update-issue <issueKey>',
  describe: 'Update an existing Jira issue with dynamic field mapping support',
  builder: (yargs) => {
    return yargs
      .positional('issueKey', {
        describe: 'Jira issue key (e.g., POP-1234)',
        type: 'string',
        demandOption: true,
      })
      .option('recurse', {
        alias: 'r',
        describe: 'Update all child issues under the specified epic',
        type: 'boolean',
        default: false,
      });
  },
  handler: async (argv) => {
    const updater = new IssueUpdater();
    await updater.run(argv.issueKey, argv.recurse);
  },
};

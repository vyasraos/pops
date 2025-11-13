import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as yaml from 'js-yaml';
import type { CommandModule } from 'yargs';
import { JiraApiClient } from '../services/jira-api-client';
import { JiraDataService } from '../services/jira-data-service';
import { MarkdownProcessor } from '../services/markdown-processor';
import { logger } from '../utils/logger';
import { POPSConfig } from '../utils/pops-config';
import { SimpleMapper } from '../utils/simple-mapper';

interface IssuePromoteArgs {
  issueKey: string;
  target?: string;
  recurse?: boolean;
}

interface WorkspaceIssue {
  key: string;
  summary: string;
  component: string;
  filePath: string;
  type: string;
  labels: string[];
}

class IssuePromoter {
  private jiraClient: JiraApiClient;
  private dataService: JiraDataService;
  private processor: MarkdownProcessor;
  private mapper: SimpleMapper;
  private popsConfig: POPSConfig;

  constructor() {
    this.jiraClient = new JiraApiClient();
    this.dataService = new JiraDataService();
    this.processor = new MarkdownProcessor();
    this.mapper = new SimpleMapper();
    this.popsConfig = new POPSConfig();
  }

  async run(issueKey: string, target?: string, recurse: boolean = false): Promise<void> {
    try {
      if (recurse) {
        console.log(chalk.blue(`🚀 Promoting Jira issue and all children: ${issueKey}...\n`));
        await this.promoteIssueWithChildren(issueKey, target);
      } else {
        console.log(chalk.blue(`🚀 Promoting Jira issue: ${issueKey}...\n`));
        await this.promoteSingleIssue(issueKey, target);
      }
    } catch (error) {
      logger.error('Failed to promote issue:', error);
      console.log(
        chalk.red(
          `\n❌ Failed to promote issue: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      process.exit(1);
    }
  }

  private async promoteSingleIssue(issueKey: string, target?: string): Promise<void> {
    // First, update the issue to ensure all local changes are synced to JIRA
    console.log(chalk.blue('📝 Updating issue before promotion...'));
    await this.updateIssue(issueKey);

    // Find file by issue key in _workspace
    const foundFile = await this.findFileByKey(issueKey);
    if (!foundFile) {
      throw new Error(`Issue ${issueKey} not found in _workspace directory`);
    }
    const targetFile = foundFile;

    // Read the markdown file
    const content = await fs.readFile(targetFile, 'utf8');
    const { frontmatter } = this.parseMarkdown(content);

    if (!frontmatter.properties?.key) {
      throw new Error('Issue key not found in frontmatter');
    }

    const currentLabels = frontmatter.properties.labels || [];

    // Check if the issue has the workspace label
    if (!currentLabels.includes('workspace')) {
      throw new Error(
        'Issue does not have the "workspace" label. Only workspace issues can be promoted.'
      );
    }

    // Get promotion labels from workspace scope.yaml
    const promotionLabels = await this.getPromotionLabels();

    // Use provided target or prompt for promotion label
    let promotionLabel: string;
    if (target) {
      // Validate that the target is in the available promotion labels
      if (!promotionLabels.includes(target)) {
        throw new Error(
          `Invalid promotion target: ${target}. Available targets: ${promotionLabels.join(', ')}`
        );
      }
      promotionLabel = target;
      console.log(chalk.blue(`📋 Using promotion target: ${promotionLabel}`));
    } else {
      // Prompt for promotion label
      const { selectedLabel } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedLabel',
          message: 'Select promotion target',
          choices: promotionLabels.map((label) => ({ name: label, value: label })),
        },
      ]);
      promotionLabel = selectedLabel;
    }

    // Remove 'workspace' and 're-workspace' labels and add the promotion label
    const newLabels = currentLabels.filter(
      (label: string) => label !== 'workspace' && label !== 're-workspace'
    );
    if (!newLabels.includes(promotionLabel)) {
      newLabels.push(promotionLabel);
    }

    // Update the frontmatter with new labels
    const updatedProperties = {
      ...frontmatter.properties,
      labels: newLabels,
    };

    // Use the same update logic as update-issue command
    console.log(chalk.blue('\n🚀 Updating issue in Jira...'));
    let jiraFields: any = {};

    // Apply mapping if it exists (reuse update-issue logic)
    if (frontmatter.mapping && updatedProperties) {
      console.log(chalk.blue('📋 Applying field mappings...'));

      const mappedFields = this.mapper.mapPropertiesToJira(
        updatedProperties,
        frontmatter.mapping
      );

      const additionalFields = this.mapper.convertToJiraFields(mappedFields);

      // Merge with existing fields
      jiraFields = { ...jiraFields, ...additionalFields };

      console.log(chalk.green(`✅ Mapped ${Object.keys(mappedFields).length} fields`));
    }

    const payload = { fields: jiraFields };
    await this.jiraClient.updateIssue(issueKey, payload);

    // Fetch updated issue from Jira and regenerate markdown
    console.log(chalk.blue('📥 Fetching updated issue from Jira...'));
    await this.dataService.fetchSingleIssue(issueKey);

    console.log(chalk.blue('📝 Processing issue to target increment...'));
    await this.processor.processSingleIssue(issueKey);

    // Clean up the original workspace file
    console.log(chalk.blue('🧹 Cleaning up workspace file...'));
    try {
      await fs.unlink(targetFile);
      console.log(chalk.green(`✅ Removed workspace file: ${path.relative(process.cwd(), targetFile)}`));
    } catch (error) {
      logger.warn(`Failed to remove workspace file ${targetFile}:`, error);
      console.log(chalk.yellow(`⚠️  Could not remove workspace file: ${path.relative(process.cwd(), targetFile)}`));
      console.log(chalk.yellow('   You may need to remove it manually'));
    }

    console.log(chalk.green('\n✅ Issue promoted successfully!'));
    console.log(chalk.green(`   Key: ${issueKey}`));
    console.log(chalk.green(`   Promotion: workspace → ${promotionLabel}`));
    console.log(chalk.blue('\n📋 The issue has been moved to the target increment directory'));
  }

  private async promoteIssueWithChildren(issueKey: string, target?: string): Promise<void> {
    // Find all child issues BEFORE promoting parent
    const childIssues = await this.findChildIssuesInWorkspace(issueKey);
    
    if (childIssues.length === 0) {
      console.log(chalk.yellow('ℹ️  No child issues found in workspace'));
    } else {
      console.log(chalk.blue(`\n📋 Found ${childIssues.length} child issues in workspace:`));
      for (const child of childIssues) {
        console.log(chalk.blue(`   - ${child.key}: ${child.summary}`));
      }
    }

    // Then promote the main issue
    await this.promoteSingleIssue(issueKey, target);

    // Finally promote each child issue
    if (childIssues.length > 0) {
      for (const child of childIssues) {
        console.log(chalk.blue(`\n🚀 Promoting child issue: ${child.key}...`));
        try {
          await this.promoteSingleIssue(child.key, target);
        } catch (error) {
          console.log(chalk.red(`❌ Failed to promote child issue ${child.key}: ${error instanceof Error ? error.message : String(error)}`));
          logger.warn(`Failed to promote child issue ${child.key}:`, error);
        }
      }

      console.log(chalk.green(`\n✅ Promoted ${childIssues.length + 1} issues total (1 parent + ${childIssues.length} children)`));
    }
  }

  private parseMarkdown(content: string): { frontmatter: any; issueType: string } {
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      throw new Error('No frontmatter found in markdown file');
    }

    const frontmatter = yaml.load(frontmatterMatch[1]) as any;
    const issueType = frontmatter.properties?.type || 'Unknown';

    return { frontmatter, issueType };
  }

  private async getPromotionLabels(): Promise<string[]> {
    try {
      const workspacePath = path.join(process.cwd(), 'planning', 'increments', '_workspace');
      const scopePath = path.join(workspacePath, '.config', 'scope.yaml');
      const scopeContent = await fs.readFile(scopePath, 'utf8');
      const scope = yaml.load(scopeContent) as any;

      let promotionLabels: string[] = [];

      if (scope.labels && Array.isArray(scope.labels)) {
        for (const labelSection of scope.labels) {
          if (labelSection.promotion) {
            promotionLabels = labelSection.promotion;
            break;
          }
        }
      }

      if (promotionLabels.length === 0) {
        throw new Error('No promotion labels found in scope.yaml');
      }

      return promotionLabels;
    } catch (error) {
      logger.error('Failed to read promotion labels from scope.yaml:', error);
      throw error;
    }
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

  private async getWorkspaceIssuesForPromotion(): Promise<WorkspaceIssue[]> {
    const issues = await this.getAllWorkspaceIssues();

    // Filter only issues with 'workspace' label and sort by key
    return issues
      .filter((issue) => issue.labels?.includes('workspace'))
      .sort((a, b) => a.key.localeCompare(b.key));
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

              if (frontmatter.properties?.key) {
                const component = this.extractComponentFromPath(fullPath);
                issues.push({
                  key: frontmatter.properties.key,
                  summary: this.extractSummaryFromContent(content),
                  component: component,
                  filePath: fullPath,
                  type: frontmatter.properties.type || 'Unknown',
                  labels: frontmatter.properties.labels || [],
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

              if (frontmatter.properties?.key) {
                const key = frontmatter.properties.key;
                const issueType = frontmatter.properties.type || 'Unknown';
                
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
                      labels: frontmatter.properties.labels || [],
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
            
            const epicKey = frontmatter.properties?.key;
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

  private async updateIssue(issueKey: string): Promise<void> {
    try {
      // Find file by issue key in _workspace
      const foundFile = await this.findFileByKey(issueKey);
      if (!foundFile) {
        throw new Error(`Issue ${issueKey} not found in _workspace directory`);
      }
      const targetFile = foundFile;

      // Read the markdown file
      const content = await fs.readFile(targetFile, 'utf8');
      const { frontmatter, summary, description } = this.parseMarkdownForUpdate(content);

      if (!(frontmatter.properties as Record<string, unknown>)?.key) {
        throw new Error('Issue key not found in frontmatter');
      }

      const key = (frontmatter.properties as Record<string, unknown>)?.key as string;

      // Build Jira fields using mapping
      let jiraFields: Record<string, unknown> = {
        summary: summary.trim(),
        description: description.trim(),
      };

      // Apply mapping if it exists
      if (frontmatter.mapping && frontmatter.properties) {
        const mappedFields = this.mapper.mapPropertiesToJira(
          frontmatter.properties as Record<string, unknown>,
          frontmatter.mapping as Record<string, string>
        );

        const additionalFields = this.mapper.convertToJiraFields(mappedFields);

        // Merge with existing fields
        jiraFields = { ...jiraFields, ...additionalFields };
      }

      const payload = { fields: jiraFields };
      await this.jiraClient.updateIssue(key, payload);

      console.log(chalk.green(`✅ Issue ${issueKey} updated successfully`));
    } catch (error) {
      logger.error(`Failed to update issue ${issueKey}:`, error);
      throw new Error(`Failed to update issue before promotion: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private parseMarkdownForUpdate(content: string): {
    frontmatter: Record<string, unknown>;
    summary: string;
    description: string;
  } {
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      throw new Error('No frontmatter found in markdown file');
    }

    const frontmatter = yaml.load(frontmatterMatch[1]) as Record<string, unknown>;

    // Extract summary and description
    const summaryMatch = content.match(/## Summary\r?\n\r?\n(.*?)(?=\r?\n\r?\n##|$)/s);
    const descriptionMatch = content.match(/## Description\r?\n\r?\n([\s\S]*?)$/);

    const summary = summaryMatch ? summaryMatch[1].trim() : '';
    const description = descriptionMatch ? descriptionMatch[1].trim() : '';

    return { frontmatter, summary, description };
  }
}

export const issuePromoteCommand: CommandModule<{}, IssuePromoteArgs> = {
  command: 'promote-issue <issueKey>',
  describe: 'Promote a workspace issue to an increment',
  builder: (yargs) => {
    return yargs
      .positional('issueKey', {
        describe: 'Jira issue key (e.g., POP-1234)',
        type: 'string',
        demandOption: true,
      })
      .option('target', {
        alias: 't',
        describe: 'Promotion target (e.g., FY26Q1)',
        type: 'string',
      })
      .option('recurse', {
        alias: 'r',
        describe: 'Promote all child issues under the specified epic',
        type: 'boolean',
        default: false,
      });
  },
  handler: async (argv) => {
    const promoter = new IssuePromoter();
    await promoter.run(argv.issueKey, argv.target, argv.recurse);
  },
};

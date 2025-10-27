import { CommandModule } from 'yargs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { JiraApiClient } from '../services/jira-api-client';
import { JiraDataService } from '../services/jira-data-service';
import { MarkdownProcessor } from '../services/markdown-processor';
import { SimpleMapper } from '../utils/simple-mapper';
import { POPSConfig } from '../utils/pops-config';
import { logger } from '../utils/logger';

interface IssuePromoteArgs {
  file?: string;
  target?: string;
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

  async run(filePath?: string, target?: string): Promise<void> {
    try {
      console.log(chalk.blue('🚀 Promoting Jira issue...\n'));

      // Get the file path
      let targetFile: string;
      if (filePath) {
        targetFile = path.resolve(filePath);
      } else {
        // Get all workspace issues (only those with 'workspace' label)
        const issues = await this.getWorkspaceIssuesForPromotion();
        
        if (issues.length === 0) {
          throw new Error('No workspace issues found for promotion');
        }

        const { selectedFile } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedFile',
            message: 'Select workspace issue to promote',
            choices: issues.map(issue => ({
              name: `${issue.key} - ${issue.summary} (${issue.component})`,
              value: issue.filePath,
              short: issue.key
            })),
            pageSize: 10,
            filter: (input: string) => {
              // Enable search functionality
              return input;
            }
          }
        ]);
        targetFile = selectedFile;
      }

      // Read the markdown file
      const content = await fs.readFile(targetFile, 'utf8');
      const { frontmatter, issueType } = this.parseMarkdown(content);

      if (!frontmatter.properties?.key) {
        throw new Error('Issue key not found in frontmatter');
      }

      const issueKey = frontmatter.properties.key;
      const currentLabels = frontmatter.properties.labels || [];

      // Check if the issue has the workspace label
      if (!currentLabels.includes('workspace')) {
        throw new Error('Issue does not have the "workspace" label. Only workspace issues can be promoted.');
      }

      // Get promotion labels from workspace scope.yaml
      const promotionLabels = await this.getPromotionLabels();

      // Use provided target or prompt for promotion label
      let promotionLabel: string;
      if (target) {
        // Validate that the target is in the available promotion labels
        if (!promotionLabels.includes(target)) {
          throw new Error(`Invalid promotion target: ${target}. Available targets: ${promotionLabels.join(', ')}`);
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
            choices: promotionLabels.map(label => ({ name: label, value: label }))
          }
        ]);
        promotionLabel = selectedLabel;
      }

      // Remove 'workspace' and 're-workspace' labels and add the promotion label
      const newLabels = currentLabels.filter((label: string) => 
        label !== 'workspace' && label !== 're-workspace'
      );
      if (!newLabels.includes(promotionLabel)) {
        newLabels.push(promotionLabel);
      }

      // Update the frontmatter with new labels
      const updatedProperties = {
        ...frontmatter.properties,
        labels: newLabels
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

      console.log(chalk.green(`\n✅ Issue promoted successfully!`));
      console.log(chalk.green(`   Key: ${issueKey}`));
      console.log(chalk.green(`   Promotion: workspace → ${promotionLabel}`));
      console.log(chalk.blue(`\n📋 The issue has been moved to the target increment directory`));

    } catch (error) {
      logger.error('Failed to promote issue:', error);
      console.log(chalk.red(`\n❌ Failed to promote issue: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  }

  private parseMarkdown(content: string): { frontmatter: any; issueType: string } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      throw new Error('No frontmatter found in markdown file');
    }

    const frontmatter = yaml.load(frontmatterMatch[1]) as any;
    const issueType = frontmatter.properties?.type || 'Unknown';

    return { frontmatter, issueType };
  }

  private async getPromotionLabels(): Promise<string[]> {
    try {
      const workspacePath = path.join(
        process.cwd(),
        'planning',
        'increments',
        '_workspace'
      );
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

  private async moveFileToIncrement(
    currentFilePath: string,
    targetIncrement: string,
    issueType: string,
    frontmatter: any,
    content?: string
  ): Promise<string> {
    const fileName = path.basename(currentFilePath);
    const component = frontmatter.properties?.components?.[0];

    if (!component) {
      throw new Error('Component not found in frontmatter');
    }

    // Determine the target directory structure
    const incrementsDir = path.join(process.cwd(), 'planning', 'increments', targetIncrement);
    let targetDir = path.join(incrementsDir, component);

    // If it's a story or task, we need to find/create the epic directory
    if (issueType === 'Story' || issueType === 'Task') {
      // Try to find the epic directory by reading the current file's parent
      const currentDir = path.dirname(currentFilePath);
      const currentDirName = path.basename(currentDir);

      if (currentDirName.startsWith('epic-')) {
        // The file is already in an epic directory, use that name
        targetDir = path.join(targetDir, currentDirName);
      } else {
        // File is directly in component directory, place it there too
        // This handles cases where story/task doesn't have an epic
      }
    } else if (issueType === 'Epic') {
      // For epics, derive the epic directory name from the summary instead of using current directory
      const epicDirName = this.generateEpicDirectoryName(frontmatter.properties, content);
      const newTargetDir = path.join(targetDir, epicDirName);

      // Check if this epic already exists in the target increment with a different directory name
      const issueKey = frontmatter.properties.key;
      const existingEpicDir = await this.findExistingEpicDirectory(targetDir, issueKey);

      if (existingEpicDir && existingEpicDir !== newTargetDir) {
        // Epic exists with different directory name - rename it
        console.log(chalk.blue(`📁 Renaming epic directory: ${path.basename(existingEpicDir)} → ${epicDirName}`));
        await this.renameEpicDirectory(existingEpicDir, newTargetDir);
      }

      targetDir = newTargetDir;
    }

    // Create target directory if it doesn't exist
    await fs.mkdir(targetDir, { recursive: true });

    // Move the file
    const targetFilePath = path.join(targetDir, fileName);
    
    // Update the labels in the frontmatter before moving
    const fileContent = await fs.readFile(currentFilePath, 'utf8');
    const updatedContent = this.updateLabelsInMarkdown(fileContent, frontmatter.properties.labels.filter((l: string) => l !== 'workspace').concat([targetIncrement]));
    
    await fs.writeFile(targetFilePath, updatedContent, 'utf8');
    await fs.unlink(currentFilePath);

    return targetFilePath;
  }

  private updateLabelsInMarkdown(content: string, newLabels: string[]): string {
    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return content;
    }

    const frontmatter = yaml.load(frontmatterMatch[1]) as any;
    frontmatter.properties.labels = newLabels;

    // Regenerate frontmatter
    const newFrontmatter = yaml.dump(frontmatter, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false
    });

    // Replace the frontmatter in the content
    return content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFrontmatter}---`);
  }

  private async getWorkspaceIssuesForPromotion(): Promise<WorkspaceIssue[]> {
    const issues: WorkspaceIssue[] = [];
    const workspacePath = path.join(process.cwd(), 'planning', 'increments', '_workspace');

    try {
      await this.scanDirectory(workspacePath, issues);
    } catch (error) {
      logger.warn('Failed to scan workspace directory:', error);
    }

    // Filter only issues with 'workspace' label and sort by key
    return issues
      .filter(issue => issue.labels?.includes('workspace'))
      .sort((a, b) => a.key.localeCompare(b.key));
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

              if (frontmatter.properties?.key) {
                const component = this.extractComponentFromPath(fullPath);
                issues.push({
                  key: frontmatter.properties.key,
                  summary: this.extractSummaryFromContent(content),
                  component: component,
                  filePath: fullPath,
                  type: frontmatter.properties.type || 'Unknown',
                  labels: frontmatter.properties.labels || []
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

  private generateEpicDirectoryName(properties: any, content?: string): string {
    // Get the summary from content or properties
    let summary = properties.summary;

    if (!summary && content) {
      // Extract summary from markdown content
      summary = this.extractSummaryFromContent(content);
    }

    if (!summary || summary === 'No summary') {
      summary = 'Unknown Epic';
    }

    // Convert summary to kebab-case directory name
    const epicName = summary
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

    return `epic-${epicName}`;
  }

  private async findExistingEpicDirectory(componentDir: string, issueKey: string): Promise<string | null> {
    try {
      // Check if component directory exists
      const entries = await fs.readdir(componentDir, { withFileTypes: true });

      // Look for epic directories
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('epic-')) {
          const epicDir = path.join(componentDir, entry.name);

          // Look for the epic file with this key
          const epicFiles = await fs.readdir(epicDir);
          for (const file of epicFiles) {
            if (file.startsWith('epic-') && file.endsWith('.md')) {
              const filePath = path.join(epicDir, file);
              try {
                const content = await fs.readFile(filePath, 'utf8');
                const { frontmatter } = this.parseMarkdown(content);

                if (frontmatter.properties?.key === issueKey) {
                  return epicDir;
                }
              } catch (error) {
                // Continue to next file if this one can't be parsed
                continue;
              }
            }
          }
        }
      }
    } catch (error) {
      // Component directory doesn't exist or can't be read
      return null;
    }

    return null;
  }

  private async renameEpicDirectory(oldDir: string, newDir: string): Promise<void> {
    try {
      // Move all contents from old directory to new directory
      await fs.mkdir(newDir, { recursive: true });

      const entries = await fs.readdir(oldDir);
      let movedFilesCount = 0;

      console.log(chalk.blue(`📁 Moving ${entries.length} items from old epic directory...`));

      for (const entry of entries) {
        const oldPath = path.join(oldDir, entry);
        const newPath = path.join(newDir, entry);
        await fs.rename(oldPath, newPath);
        movedFilesCount++;

        // Log if it's a story/task being moved with the epic
        if (entry.endsWith('.md') && (entry.startsWith('story-') || entry.startsWith('task-'))) {
          console.log(chalk.green(`   ✅ Moved ${entry} with epic`));
        }
      }

      // Remove the old directory
      await fs.rmdir(oldDir);

      console.log(chalk.green(`✅ Epic directory renamed: ${path.basename(oldDir)} → ${path.basename(newDir)}`));
      console.log(chalk.green(`   Moved ${movedFilesCount} items including any stories/tasks`));

      logger.info(`Epic directory renamed from ${path.basename(oldDir)} to ${path.basename(newDir)}, moved ${movedFilesCount} items`);
    } catch (error) {
      logger.error(`Failed to rename epic directory from ${oldDir} to ${newDir}:`, error);
      throw error;
    }
  }
}

export const issuePromoteCommand: CommandModule<{}, IssuePromoteArgs> = {
  command: 'promote-issue [file]',
  describe: 'Promote a workspace issue to an increment',
  builder: (yargs) => {
    return yargs
      .positional('file', {
        describe: 'Path to the markdown file',
        type: 'string'
      })
      .option('target', {
        alias: 't',
        describe: 'Promotion target (e.g., FY26Q1)',
        type: 'string'
      });
  },
  handler: async (argv) => {
    const promoter = new IssuePromoter();
    await promoter.run(argv.file, argv.target);
  }
};


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

  async run(issueKey: string, target?: string): Promise<void> {
    try {
      console.log(chalk.blue(`🚀 Promoting Jira issue: ${issueKey}...\n`));

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

      console.log(chalk.green('\n✅ Issue promoted successfully!'));
      console.log(chalk.green(`   Key: ${issueKey}`));
      console.log(chalk.green(`   Promotion: workspace → ${promotionLabel}`));
      console.log(chalk.blue('\n📋 The issue has been moved to the target increment directory'));
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
      .filter((issue) => issue.labels?.includes('workspace'))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  private async scanDirectory(dirPath: string, issues: WorkspaceIssue[]): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      // Get project from config
      const config = this.popsConfig.getConfig();
      const projectKey = config.jira?.project || 'GVT';
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
    const issues = await this.getWorkspaceIssuesForPromotion();
    const issue = issues.find((i) => i.key === issueKey);
    return issue ? issue.filePath : null;
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
      });
  },
  handler: async (argv) => {
    const promoter = new IssuePromoter();
    await promoter.run(argv.issueKey, argv.target);
  },
};

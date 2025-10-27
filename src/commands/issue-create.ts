import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as yaml from 'js-yaml';
import type { CommandModule } from 'yargs';
import { JiraApiClient } from '../services/jira-api-client';
import { MarkdownProcessor } from '../services/markdown-processor';
import { logger } from '../utils/logger';
import { POPSConfig } from '../utils/pops-config';
import { SimpleMapper } from '../utils/simple-mapper';

interface IssueCreateArgs {
  workspace?: string;
}

interface IssueData {
  type: string;
  summary: string;
  description: string;
  component: string;
  epic?: string;
  labels: string[];
}

class IssueCreator {
  private jiraClient: JiraApiClient;
  private markdownProcessor: MarkdownProcessor;
  private popsConfig: POPSConfig;
  private mapper: SimpleMapper;
  private workspacePath: string;

  constructor() {
    this.jiraClient = new JiraApiClient();
    this.markdownProcessor = new MarkdownProcessor();
    this.popsConfig = new POPSConfig();
    this.mapper = new SimpleMapper();
    this.workspacePath = path.join(process.cwd(), 'planning/increments/_workspace');
  }

  async createIssue(): Promise<void> {
    try {
      console.log(chalk.blue('🎯 Creating new Jira issue...\n'));

      // Step 1: Issue Type
      const issueType = await this.promptIssueType();

      // Step 2: Summary
      const summary = await this.promptSummary();

      // Step 3: Description
      const description = await this.promptDescription();

      // Step 4: Component
      const component = await this.promptComponent();

      // Step 5: Epic (if Story or Task)
      let epic: string | undefined;
      if (issueType === 'Story' || issueType === 'Task') {
        epic = await this.promptEpic(component);
      }

      // Step 6: Labels
      const labels = await this.promptLabels();

      const issueData: IssueData = {
        type: issueType,
        summary,
        description,
        component,
        epic,
        labels,
      };

      // Create the issue in Jira
      console.log(chalk.blue('\n🚀 Creating issue in Jira...'));
      const createdIssue = await this.createJiraIssue(issueData);

      // Create the markdown file in _workspace
      console.log(chalk.blue('📝 Creating markdown file...'));
      await this.createMarkdownFile(createdIssue, issueData);

      console.log(chalk.green('\n✅ Issue created successfully!'));
      console.log(chalk.green(`   Key: ${createdIssue.key}`));
      console.log(chalk.green(`   URL: ${this.getJiraUrl(createdIssue.key)}`));
    } catch (error) {
      logger.error('Failed to create issue:', error);
      console.log(
        chalk.red(
          `\n❌ Failed to create issue: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      process.exit(1);
    }
  }

  private async promptIssueType(): Promise<string> {
    const { issueType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'issueType',
        message: 'Issue type',
        choices: [
          { name: 'Epic', value: 'Epic' },
          { name: 'Story', value: 'Story' },
          { name: 'Task', value: 'Task' },
          { name: 'Bug', value: 'Bug' },
          { name: 'Sub-task', value: 'Sub-task' },
        ],
        default: 'Story',
      },
    ]);
    return issueType;
  }

  private async promptSummary(): Promise<string> {
    const { summary } = await inquirer.prompt([
      {
        type: 'input',
        name: 'summary',
        message: 'Summary',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Summary is required';
          }
          return true;
        },
      },
    ]);
    return summary.trim();
  }

  private async promptDescription(): Promise<string> {
    const { description } = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'Description',
        default: '',
      },
    ]);
    return description.trim();
  }

  private async promptComponent(): Promise<string> {
    const components = await this.getComponents();
    const { component } = await inquirer.prompt([
      {
        type: 'list',
        name: 'component',
        message: 'Components',
        choices: components.map((comp) => ({ name: comp.name, value: comp.name })),
        default: components[0]?.name,
      },
    ]);
    return component;
  }

  private async promptEpic(component: string): Promise<string | undefined> {
    try {
      const epics = await this.getEpicsForComponent(component);
      if (epics.length === 0) {
        console.log(chalk.yellow(`⚠️  No epics found for component ${component}`));
        return undefined;
      }

      const { epic } = await inquirer.prompt([
        {
          type: 'list',
          name: 'epic',
          message: 'Epic',
          choices: [
            { name: 'None', value: '' },
            ...epics.map((epic) => ({
              name: `${epic.key}: ${epic.summary}`,
              value: epic.key,
            })),
          ],
          default: '',
        },
      ]);
      return epic || undefined;
    } catch (error) {
      logger.warn(`Failed to fetch epics for component ${component}:`, error);
      return undefined;
    }
  }

  private async promptLabels(): Promise<string[]> {
    // Get default labels and options from scope.yaml
    const labelConfig = await this.getLabelConfiguration();

    let selectedLabels: string[] = [];

    // If there are label options, let user select from them
    if (labelConfig.options && labelConfig.options.length > 0) {
      const { labels } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'labels',
          message: 'Select labels (optional - press Tab then Enter to skip)',
          choices: labelConfig.options.map((option) => ({ name: option, value: option })),
          default: [],
        },
      ]);
      selectedLabels = labels || [];
    } else {
      // Fallback to text input if no options defined
      const { labels } = await inquirer.prompt([
        {
          type: 'input',
          name: 'labels',
          message: 'Additional labels (comma-separated, optional - press Enter to skip)',
          default: '',
        },
      ]);

      selectedLabels = labels
        .split(',')
        .map((label: string) => label.trim())
        .filter((label: string) => label.length > 0);
    }

    // Combine default labels with selected labels
    const allLabels = [...(labelConfig.defaults || []), ...selectedLabels];

    // Remove duplicates while preserving order
    return [...new Set(allLabels)];
  }

  private async getComponents(): Promise<Array<{ name: string; jira_id: string }>> {
    try {
      const scopePath = path.join(this.workspacePath, '.config', 'scope.yaml');
      const scopeContent = await fs.readFile(scopePath, 'utf8');
      const scope = yaml.load(scopeContent) as any;
      return scope.components || [];
    } catch (error) {
      logger.error('Failed to read scope.yaml:', error);
      throw new Error(
        'Could not read component configuration. Please ensure _workspace/.config/scope.yaml exists.'
      );
    }
  }

  private async getLabelConfiguration(): Promise<{ options: string[]; defaults: string[] }> {
    try {
      const scopePath = path.join(this.workspacePath, '.config', 'scope.yaml');
      const scopeContent = await fs.readFile(scopePath, 'utf8');
      const scope = yaml.load(scopeContent) as any;

      // Handle the YAML structure from scope.yaml
      let options: string[] = [];
      let defaults: string[] = [];

      if (scope.labels) {
        // Check if labels is an array (as per the YAML structure)
        if (Array.isArray(scope.labels)) {
          for (const labelSection of scope.labels) {
            if (labelSection.options) {
              options = labelSection.options;
            }
            if (labelSection.defaults) {
              defaults = labelSection.defaults;
            }
          }
        } else if (scope.labels.options) {
          options = scope.labels.options;
        }
        if (scope.labels.defaults) {
          defaults = scope.labels.defaults;
        }
      }

      return {
        options: options || [],
        defaults: defaults || ['workspace'], // Fallback to workspace if no defaults defined
      };
    } catch (error) {
      logger.error('Failed to read label configuration from scope.yaml:', error);
      // Return fallback configuration
      return {
        options: [],
        defaults: ['workspace'],
      };
    }
  }

  private async getEpicsForComponent(
    componentName: string
  ): Promise<Array<{ key: string; summary: string }>> {
    try {
      const epics = await this.jiraClient.getAllEpicsByComponent(componentName);
      return epics?.map((epic) => ({
        key: epic.key,
        summary: epic.fields.summary as string,
      })) || [];
    } catch (error) {
      logger.warn(`Failed to fetch epics for component ${componentName}:`, error);
      return [];
    }
  }

  private async createJiraIssue(issueData: IssueData): Promise<any> {
    // Build the basic issue payload
    let jiraFields: any = {
      project: { key: 'APE' },
      summary: issueData.summary,
      description: issueData.description,
      issuetype: { name: issueData.type },
      components: [{ name: issueData.component }],
      labels: issueData.labels,
    };

    // Try to get mapping from template and apply it
    try {
      const templateMapping = await this.getTemplateMapping(issueData.type);
      if (templateMapping) {
        console.log(chalk.blue('📋 Applying template field mappings...'));

        // Create properties object from issueData
        const properties = {
          key: '', // Will be set by Jira
          type: issueData.type,
          workstream: 'IaC', // Default workstream
          initiative: 'Private Cloud 2.0', // Default initiative
          components: [issueData.component],
          labels: issueData.labels,
          status: 'To Do',
          points: null,
        };

        const mappedFields = this.mapper.mapPropertiesToJira(properties, templateMapping);
        const additionalFields = this.mapper.convertToJiraFields(mappedFields);

        // Merge with existing fields (additionalFields is already the fields object)
        jiraFields = { ...jiraFields, ...additionalFields };

        console.log(
          chalk.green(`✅ Applied ${Object.keys(mappedFields).length} template mappings`)
        );
      }
    } catch (_error) {
      console.log(chalk.yellow('⚠️  Could not apply template mappings, using defaults'));
    }

    // Legacy fallback for Epic Link and Epic Name
    if (issueData.epic && (issueData.type === 'Story' || issueData.type === 'Task')) {
      jiraFields.customfield_10000 = issueData.epic; // Epic Link field
    }

    if (issueData.type === 'Epic') {
      jiraFields.customfield_10002 = issueData.summary; // Epic Name field
    }

    const payload = { fields: jiraFields };
    return await this.jiraClient.createIssue(payload);
  }

  private async getTemplateMapping(issueType: string): Promise<any> {
    try {
      const templatePath = path.join(
        process.cwd(),
        'templates/planning',
        `${issueType.toLowerCase()}.md`
      );
      const templateContent = await fs.readFile(templatePath, 'utf8');

      // Extract frontmatter from template
      const frontmatterMatch = templateContent.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const frontmatter = yaml.load(frontmatterMatch[1]) as any;
        return frontmatter.mapping;
      }
    } catch (_error) {
      // Template not found or no mapping, return null
    }
    return null;
  }

  private async createMarkdownFile(createdIssue: any, issueData: IssueData): Promise<void> {
    // Create the component directory if it doesn't exist
    const componentDir = path.join(this.workspacePath, issueData.component);
    await fs.mkdir(componentDir, { recursive: true });

    // Create epic directory if this is an epic
    let targetDir = componentDir;
    if (issueData.type === 'Epic') {
      const epicDirName = this.generateEpicFolderName(createdIssue.key, issueData.summary);
      targetDir = path.join(componentDir, epicDirName);
      await fs.mkdir(targetDir, { recursive: true });
    } else if (issueData.epic) {
      // For stories/tasks, get the epic directory name from API
      const epicDirName = await this.getEpicDirectoryName(issueData.epic);
      targetDir = path.join(componentDir, epicDirName);
      await fs.mkdir(targetDir, { recursive: true });
    }

    // Generate the markdown content
    const markdownContent = await this.generateMarkdownContent(createdIssue, issueData);

    // Determine the filename
    const filename = this.generateFilename(createdIssue.key, issueData.type);
    const filePath = path.join(targetDir, filename);

    // Write the file
    await fs.writeFile(filePath, markdownContent, 'utf8');
    console.log(chalk.green(`   📄 Created: ${path.relative(process.cwd(), filePath)}`));
  }

  private generateEpicFolderName(_issueKey: string, summary: string): string {
    // For epics, slugify the summary to create directory name
    // (e.g., "BMH Dagger Modules" -> "epic-bmh-dagger-modules")
    const cleanSummary = summary
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
    return `epic-${cleanSummary}`;
  }

  private async getEpicDirectoryName(epicKey: string): Promise<string> {
    try {
      // Make API call to get epic details
      const client = await this.jiraClient.getPublicClient();
      const response = await client.get(`/issue/${epicKey}`);
      const epicSummary = response.data.fields.summary;

      // Create slugified directory name from epic summary
      const cleanSummary = epicSummary
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);

      return `epic-${cleanSummary}`;
    } catch (error) {
      logger.warn(`Failed to get epic details for ${epicKey}:`, error);
      // Fallback to using the epic key
      return `epic-${epicKey.toLowerCase()}`;
    }
  }

  private generateFilename(issueKey: string, issueType: string): string {
    const typePrefix = issueType.toLowerCase();
    return `${typePrefix}-${issueKey}.md`;
  }

  private async generateMarkdownContent(createdIssue: any, issueData: IssueData): Promise<string> {
    // Create a mock issue data structure for the markdown processor
    const mockIssueData = {
      id: createdIssue.id,
      key: createdIssue.key,
      fields: {
        summary: issueData.summary,
        description: issueData.description,
        issuetype: { name: issueData.type },
        components: [{ name: issueData.component }],
        labels: issueData.labels,
        status: { name: 'To Do' },
      },
    };

    // Use the markdown processor to generate content
    return await this.markdownProcessor.generateMarkdownPublic(
      mockIssueData,
      issueData.type.toLowerCase() as 'epic' | 'story' | 'task'
    );
  }

  private getJiraUrl(issueKey: string): string {
    const config = this.popsConfig.getConfig();
    const baseUrl = config.jira?.base_url || 'https://jira.instance.com/techops/jira';
    return `${baseUrl}/browse/${issueKey}`;
  }
}

export const issueCreateCommand: CommandModule<{}, IssueCreateArgs> = {
  command: 'create-issue',
  describe: 'Create a new Jira issue with interactive prompts',
  builder: (yargs) => {
    return yargs
      .option('workspace', {
        alias: 'w',
        type: 'string',
        description: 'Workspace directory (default: _workspace)',
        default: '_workspace',
      })
      .example('$0 issue-create', 'Create a new issue interactively')
      .example('$0 issue-create --workspace backlog', 'Create issue in backlog workspace');
  },
  handler: async (_args) => {
    try {
      const creator = new IssueCreator();
      await creator.createIssue();
    } catch (error) {
      logger.error('Error creating issue:', error);
      console.log(
        chalk.red(
          `\n❌ An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      process.exit(1);
    }
  },
};

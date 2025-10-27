import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as yaml from 'js-yaml';
import type { CommandModule } from 'yargs';
import { JiraDataService } from '../services/jira-data-service';
import { MarkdownProcessor } from '../services/markdown-processor';
import { logger } from '../utils/logger';
import { POPSConfig } from '../utils/pops-config';

interface ValidateIssuesArgs {
  issueKey?: string;
  file?: string;
  component?: string;
  epic?: string;
  all?: boolean;
}

interface ValidationResult {
  file: string;
  key: string;
  type: string;
  component: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface IssueContent {
  summary: string;
  description: string;
  type: string;
}

class IssueValidator {
  private templatesPath: string;
  private dataService: JiraDataService;
  private processor: MarkdownProcessor;
  private popsConfig: POPSConfig;

  constructor() {
    this.templatesPath = 'templates/planning';
    this.dataService = new JiraDataService();
    this.processor = new MarkdownProcessor();
    this.popsConfig = new POPSConfig();
  }

  async run(args: ValidateIssuesArgs): Promise<void> {
    try {
      console.log(chalk.blue('🔍 Validating issues against template specifications...\n'));

      let filesToValidate: string[] = [];

      if (args.issueKey) {
        // Validate specific issue by key
        const foundFile = await this.findFileByKey(args.issueKey);
        if (foundFile) {
          filesToValidate = [foundFile];
          console.log(chalk.green(`✅ Found issue in workspace: ${foundFile}`));
        } else {
          // Issue not found locally, fetch and process it
          console.log(chalk.blue(`📥 Issue ${args.issueKey} not found in workspace, fetching from Jira...`));
          await this.fetchAndProcessIssue(args.issueKey);
          
          // Try to find the file again after processing
          const foundFileAfterProcess = await this.findFileByKey(args.issueKey);
          if (foundFileAfterProcess) {
            filesToValidate = [foundFileAfterProcess];
            console.log(chalk.green(`✅ Issue processed and found: ${foundFileAfterProcess}`));
          } else {
            throw new Error(`Failed to process issue ${args.issueKey}`);
          }
        }
      } else if (args.file) {
        // Validate specific file
        filesToValidate = [path.resolve(args.file)];
      } else if (args.all) {
        // Validate all issues in all increments
        filesToValidate = await this.getAllIssueFiles();
      } else if (args.component || args.epic) {
        // Validate issues in specific component or epic
        filesToValidate = await this.getFilteredIssueFiles(args.component, args.epic);
      } else {
        // Interactive selection with search
        const allFiles = await this.getAllIssueFiles();
        if (allFiles.length === 0) {
          console.log(chalk.yellow('⚠️  No issue files found to validate'));
          return;
        }

        const { selectedFile } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedFile',
            message: 'Select issue to validate',
            choices: allFiles.map((file) => ({
              name: this.formatFileChoice(file),
              value: file,
              short: path.basename(file),
            })),
            pageSize: 15,
            filter: (input: string) => {
              // Enable search functionality
              return input;
            },
          },
        ]);
        filesToValidate = [selectedFile];
      }

      if (filesToValidate.length === 0) {
        console.log(chalk.yellow('⚠️  No files selected for validation'));
        return;
      }

      console.log(chalk.blue(`\n📋 Validating ${filesToValidate.length} issue(s)...\n`));

      const results: ValidationResult[] = [];
      for (const file of filesToValidate) {
        const result = await this.validateFile(file);
        results.push(result);
      }

      this.displayResults(results);
    } catch (error) {
      logger.error('Failed to validate issues:', error);
      console.log(
        chalk.red(
          `\n❌ Failed to validate issues: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      process.exit(1);
    }
  }

  private async getAllIssueFiles(): Promise<string[]> {
    const files: string[] = [];
    const incrementsPath = 'planning/increments';

    try {
      // Scan both _workspace and target increment (FY26Q1)
      await this.scanDirectory(incrementsPath, files);
    } catch (error) {
      logger.warn('Failed to scan increments directory:', error);
    }

    // Sort files with _workspace first, then by path
    return files.sort((a, b) => {
      const aIsWorkspace = a.includes('/_workspace/');
      const bIsWorkspace = b.includes('/_workspace/');

      if (aIsWorkspace && !bIsWorkspace) return -1;
      if (!aIsWorkspace && bIsWorkspace) return 1;

      return a.localeCompare(b);
    });
  }

  private async getFilteredIssueFiles(component?: string, epic?: string): Promise<string[]> {
    const allFiles = await this.getAllIssueFiles();

    return allFiles.filter((file) => {
      if (component && !file.includes(`/${component}/`)) {
        return false;
      }
      if (epic && !file.includes(epic)) {
        return false;
      }
      return true;
    });
  }

  private async scanDirectory(dirPath: string, files: string[]): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath, files);
        } else if (
          entry.isFile() &&
          entry.name.match(/^(epic|story|task|bug|sub-task)-POP-\d+\.md$/i)
        ) {
          files.push(fullPath);
        }
      }
    } catch (_error) {
      // Directory might not exist or be accessible, continue
    }
  }

  private formatFileChoice(filePath: string): string {
    const relativePath = path.relative(process.cwd(), filePath);
    const pathParts = relativePath.split(path.sep);
    const fileName = path.basename(filePath);

    // Determine if it's workspace or increment
    const isWorkspace = filePath.includes('/_workspace/');
    const incrementIndex = pathParts.indexOf('increments');
    const component = pathParts[incrementIndex + 2] || 'unknown';

    if (isWorkspace) {
      return `${fileName} (${component}) [workspace]`;
    } else {
      const increment = pathParts[incrementIndex + 1] || 'unknown';
      return `${fileName} (${component}) [${increment}]`;
    }
  }

  private async validateFile(filePath: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      file: filePath,
      key: 'unknown',
      type: 'unknown',
      component: 'unknown',
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const { frontmatter, issueContent } = this.parseMarkdown(content);

      result.key = frontmatter.properties?.key || 'unknown';
      result.type = frontmatter.properties?.type || 'unknown';
      result.component = this.extractComponentFromPath(filePath);

      // Validate against template specifications
      const templateValidation = await this.validateAgainstTemplate(issueContent, result.type);
      result.errors.push(...templateValidation.errors);
      result.warnings.push(...templateValidation.warnings);
      result.isValid = templateValidation.errors.length === 0;
    } catch (error) {
      result.isValid = false;
      result.errors.push(
        `Failed to parse file: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return result;
  }

  private parseMarkdown(content: string): { frontmatter: any; issueContent: IssueContent } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      throw new Error('No frontmatter found');
    }

    const frontmatter = yaml.load(frontmatterMatch[1]) as any;

    // Extract summary and description
    const summaryMatch = content.match(/## Summary\n\n(.*?)(?=\n\n##|$)/s);
    const descriptionMatch = content.match(/## Description\n\n([\s\S]*?)$/);

    const summary = summaryMatch ? summaryMatch[1].trim() : '';
    const description = descriptionMatch ? descriptionMatch[1].trim() : '';

    return {
      frontmatter,
      issueContent: {
        summary,
        description,
        type: frontmatter.properties?.type || 'unknown',
      },
    };
  }

  private extractComponentFromPath(filePath: string): string {
    const pathParts = filePath.split(path.sep);
    const incrementsIndex = pathParts.indexOf('increments');
    if (incrementsIndex !== -1 && incrementsIndex + 2 < pathParts.length) {
      return pathParts[incrementsIndex + 2];
    }
    return 'unknown';
  }

  private async validateAgainstTemplate(
    issueContent: IssueContent,
    issueType: string
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!issueContent.summary || issueContent.summary.trim().length === 0) {
      errors.push('Summary is empty or missing');
    } else if (issueContent.summary.includes('<INSTRUCTION:')) {
      errors.push('Summary contains template instructions - needs to be filled out');
    }

    if (!issueContent.description || issueContent.description.trim().length === 0) {
      errors.push('Description is empty or missing');
    } else if (issueContent.description.includes('<INSTRUCTION:')) {
      errors.push('Description contains template instructions - needs to be filled out');
    }

    // Type-specific validation
    switch (issueType.toLowerCase()) {
      case 'epic':
        this.validateEpic(issueContent, errors, warnings);
        break;
      case 'story':
        this.validateStory(issueContent, errors, warnings);
        break;
      case 'task':
        this.validateTask(issueContent, errors, warnings);
        break;
    }

    return { errors, warnings };
  }

  private validateEpic(issueContent: IssueContent, errors: string[], warnings: string[]): void {
    const description = issueContent.description;

    // Check for required sections
    const requiredSections = [
      '### Problem',
      '### Solution',
      '### Technical Scope',
      '### Constraints & Dependencies',
      '### Timeline',
    ];
    for (const section of requiredSections) {
      if (!description.includes(section)) {
        errors.push(`Missing required section: ${section}`);
      }
    }

    // Check for instruction placeholders
    if (description.includes('<INSTRUCTION:')) {
      errors.push('Description contains unfilled template instructions');
    }

    // Check minimum content length
    if (description.length < 500) {
      warnings.push('Description seems too short for an epic (should be comprehensive)');
    }

    // Check for specific content quality
    if (description.includes('### Problem') && !description.includes('impacted')) {
      warnings.push('Problem section should mention who is impacted');
    }

    if (description.includes('### Solution') && !description.includes('technical')) {
      warnings.push('Solution section should include technical approach');
    }
  }

  private validateStory(issueContent: IssueContent, errors: string[], warnings: string[]): void {
    const description = issueContent.description;

    // Check for required sections
    const requiredSections = [
      '### Story',
      '### Technical Details',
      '### Acceptance Criteria',
      '### Dependencies',
      '### Definition of Done',
    ];
    for (const section of requiredSections) {
      if (!description.includes(section)) {
        errors.push(`Missing required section: ${section}`);
      }
    }

    // Check for instruction placeholders
    if (description.includes('<INSTRUCTION:')) {
      errors.push('Description contains unfilled template instructions');
    }

    // Check for user story format
    if (description.includes('### Story')) {
      const storySection = this.extractSection(description, '### Story');
      if (
        !storySection.includes('As a') ||
        !storySection.includes('I want to') ||
        !storySection.includes('So that')
      ) {
        errors.push('Story section should follow "As a... I want to... So that..." format');
      }
    }

    // Check for acceptance criteria format
    if (description.includes('### Acceptance Criteria')) {
      const acSection = this.extractSection(description, '### Acceptance Criteria');
      if (!acSection.includes('[ ]') && !acSection.includes('- [ ]')) {
        warnings.push('Acceptance criteria should use checkbox format [ ]');
      }
    }
  }

  private validateTask(issueContent: IssueContent, errors: string[], warnings: string[]): void {
    const description = issueContent.description;

    // Check for required sections
    const requiredSections = [
      '### Objective',
      '### Technical Approach',
      '### Acceptance Criteria',
      '### Dependencies',
    ];
    for (const section of requiredSections) {
      if (!description.includes(section)) {
        errors.push(`Missing required section: ${section}`);
      }
    }

    // Check for instruction placeholders
    if (description.includes('<INSTRUCTION:')) {
      errors.push('Description contains unfilled template instructions');
    }

    // Check for acceptance criteria format
    if (description.includes('### Acceptance Criteria')) {
      const acSection = this.extractSection(description, '### Acceptance Criteria');
      if (!acSection.includes('[ ]') && !acSection.includes('- [ ]')) {
        warnings.push('Acceptance criteria should use checkbox format [ ]');
      }
    }

    // Check minimum content length
    if (description.length < 200) {
      warnings.push('Description seems too short for a task');
    }
  }

  private extractSection(description: string, sectionHeader: string): string {
    const regex = new RegExp(`${sectionHeader}\\s*\\n([\\s\\S]*?)(?=\\n###|$)`, 'i');
    const match = description.match(regex);
    return match ? match[1].trim() : '';
  }

  private displayResults(results: ValidationResult[]): void {
    const validCount = results.filter((r) => r.isValid).length;
    const invalidCount = results.length - validCount;
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

    console.log(chalk.blue('\n📊 Validation Summary:'));
    console.log(chalk.blue(`   - Total issues: ${results.length}`));
    console.log(chalk.green(`   - Valid: ${validCount}`));
    console.log(chalk.red(`   - Invalid: ${invalidCount}`));
    console.log(chalk.yellow(`   - Warnings: ${totalWarnings}`));
    console.log(chalk.red(`   - Errors: ${totalErrors}`));

    // Display detailed results
    for (const result of results) {
      const status = result.isValid ? chalk.green('✅') : chalk.red('❌');
      const shortPath = path.relative(process.cwd(), result.file);

      console.log(`\n${status} ${chalk.bold(result.key)} (${result.type}) - ${result.component}`);
      console.log(chalk.gray(`   ${shortPath}`));

      if (result.errors.length > 0) {
        result.errors.forEach((error) => {
          console.log(chalk.red(`   ❌ ${error}`));
        });
      }

      if (result.warnings.length > 0) {
        result.warnings.forEach((warning) => {
          console.log(chalk.yellow(`   ⚠️  ${warning}`));
        });
      }
    }

    if (invalidCount === 0 && totalWarnings === 0) {
      console.log(chalk.green('\n🎉 All issues are valid!'));
    } else if (invalidCount === 0) {
      console.log(chalk.green('\n✅ All issues are valid (with some warnings)'));
    } else {
      console.log(chalk.red(`\n❌ ${invalidCount} issue(s) need attention`));
    }
  }

  private async findFileByKey(issueKey: string): Promise<string | null> {
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
          const projectKey = config.jira?.project || 'GVT';
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

  private async fetchAndProcessIssue(issueKey: string): Promise<void> {
    try {
      console.log(chalk.blue('📥 Fetching issue from Jira...'));
      await this.dataService.fetchSingleIssue(issueKey);
      
      console.log(chalk.blue('📝 Processing issue...'));
      await this.processor.processSingleIssue(issueKey);
      
      console.log(chalk.green('✅ Issue fetched and processed successfully'));
    } catch (error) {
      logger.error('Failed to fetch and process issue:', error);
      throw new Error(`Failed to fetch and process issue ${issueKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const validateIssuesCommand: CommandModule<{}, ValidateIssuesArgs> = {
  command: 'validate-issue [issueKey] [file]',
  describe: 'Validate issue summary and description against template specifications',
  builder: (yargs) => {
    return yargs
      .positional('issueKey', {
        describe: 'Jira issue key to validate (e.g., POP-1234)',
        type: 'string',
      })
      .positional('file', {
        describe: 'Path to specific issue file to validate',
        type: 'string',
      })
      .option('component', {
        alias: 'c',
        describe: 'Validate all issues in specific component',
        type: 'string',
      })
      .option('epic', {
        alias: 'e',
        describe: 'Validate all issues in specific epic',
        type: 'string',
      })
      .option('all', {
        alias: 'a',
        describe: 'Validate all issues in all increments',
        type: 'boolean',
        default: false,
      })
      .conflicts('file', ['component', 'epic', 'all'])
      .conflicts('issueKey', ['component', 'epic', 'all'])
      .conflicts('component', ['epic', 'all'])
      .conflicts('epic', 'all')
      .example('$0 validate-issue', 'Interactive selection of issue to validate')
      .example('$0 validate-issue POP-1234', 'Validate specific issue by key')
      .example('$0 validate-issue --all', 'Validate all issues in all increments')
      .example(
        '$0 validate-issue --component idp-infra',
        'Validate all issues in idp-infra component'
      )
      .example('$0 validate-issue --epic POP-1234', 'Validate all issues in specific epic')
      .example('$0 validate-issue path/to/issue.md', 'Validate specific issue file');
  },
  handler: async (argv) => {
    const validator = new IssueValidator();
    await validator.run(argv);
  },
};

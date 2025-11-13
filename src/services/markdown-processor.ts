import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { IssueRawData, ProcessingResult } from '../types';
import { logger } from '../utils/logger';
import { POPSConfig } from '../utils/pops-config';

export class MarkdownProcessor {
  private popsConfig: POPSConfig;
  private templatesPath: string;
  private incrementsPath: string;
  private targetIncrement: string;

  constructor(configPath?: string) {
    this.popsConfig = new POPSConfig(configPath || 'pops.toml');
    const config = this.popsConfig.getConfig();
    this.templatesPath = config.jira?.paths?.templates || 'templates/planning';
    this.incrementsPath = config.jira?.paths?.increments || 'planning/increments';
    this.targetIncrement = config.jira?.paths?.target || 'FY26Q1';
  }

  // Public method to generate markdown for a single issue
  async generateMarkdownPublic(
    issue: IssueRawData,
    type: 'epic' | 'story' | 'task'
  ): Promise<string> {
    return this.generateMarkdown(issue, type);
  }

  async processSingleIssue(issueKey: string): Promise<void> {
    try {
      const dataService = new (await import('./jira-data-service')).JiraDataService();

      // Find the issue data file
      const dataPath = dataService.getDataPath();
      const issueData = await this.findIssueData(dataPath, issueKey);

      if (!issueData) {
        throw new Error(`Issue data for ${issueKey} not found in _data folder`);
      }

      // Determine issue type
      const issueType = (issueData.fields.issuetype as any)?.name?.toLowerCase() || 'unknown';
      const type = issueType === 'epic' ? 'epic' : issueType === 'task' ? 'task' : 'story';

      // Generate markdown
      const markdown = await this.generateMarkdown(issueData, type);

      // Determine target directory based on component and issue type
      const component = (issueData.fields.components as any)?.[0]?.name || 'unknown';
      const targetDir = this.determineTargetDirectory(component, issueData, type);

      // Ensure target directory exists
      await fs.mkdir(targetDir, { recursive: true });

      // Generate filename
      const fileName = this.generateFileName(issueData, type);
      const filePath = path.join(targetDir, fileName);

      // Write markdown file
      await fs.writeFile(filePath, markdown, 'utf8');

      logger.info(`✅ Single issue ${issueKey} processed and saved to ${filePath}`);
    } catch (error) {
      logger.error(`Failed to process single issue ${issueKey}:`, error);
      throw error;
    }
  }

  private async findIssueData(dataPath: string, issueKey: string): Promise<IssueRawData | null> {
    try {
      const components = await fs.readdir(dataPath, { withFileTypes: true });

      for (const component of components) {
        if (component.isDirectory()) {
          const componentPath = path.join(dataPath, component.name);
          const files = await fs.readdir(componentPath);

          for (const file of files) {
            if (file === `${issueKey}.json`) {
              const filePath = path.join(componentPath, file);
              const content = await fs.readFile(filePath, 'utf8');
              return JSON.parse(content) as IssueRawData;
            }
          }
        }
      }
    } catch {
      // Component directory doesn't exist or can't be read
    }

    return null;
  }

  private determineTargetDirectory(
    component: string,
    issueData: IssueRawData,
    type: string
  ): string {
    const baseDir = path.join(this.incrementsPath, this.targetIncrement, component);

    if (type === 'epic') {
      // For epics, create epic directory
      const epicName = this.generateEpicDirectoryName(issueData.fields.summary as string);
      return path.join(baseDir, epicName);
    }

    // For stories/tasks, try to find existing epic directory
    // For now, just use the component directory
    return baseDir;
  }

  private generateFileName(issueData: IssueRawData, type: string): string {
    const key = issueData.key;
    return `${type}-${key}.md`;
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

  async processEpics(componentName?: string, epicKey?: string): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    const dataService = new (await import('./jira-data-service')).JiraDataService();

    try {
      const dataStructure = await dataService.getDataStructure();

      // Build a map of current valid epic directories based on Jira data
      const validEpicDirectories = new Map<string, Set<string>>();
      const validEpicKeys = new Set<string>();

      for (const [_component, epicMap] of dataStructure) {
        for (const [_epicName, issues] of epicMap) {
          const epic = issues.find((issue) => (issue.fields.issuetype as any)?.name === 'Epic');
          if (epic) {
            const correctComponent = this.determineCorrectComponent(epic);
            const correctEpicDir = this.determineCorrectEpicDirectory(epic);

            if (!validEpicDirectories.has(correctComponent)) {
              validEpicDirectories.set(correctComponent, new Set());
            }
            validEpicDirectories.get(correctComponent)?.add(correctEpicDir);
            validEpicKeys.add(epic.key);
          }
        }
      }

      // Process each epic as before
      for (const [component, epicMap] of dataStructure) {
        // Skip if component filter is specified and doesn't match
        if (componentName && component !== componentName) {
          continue;
        }

        for (const [epicName, issues] of epicMap) {
          // Skip if epic filter is specified and doesn't match
          if (epicKey && !issues.some((issue) => issue.key === epicKey)) {
            continue;
          }

          const result = await this.processEpicGroupWithEnforcement(component, epicName, issues);
          results.push(result);
        }
      }

      // COMPREHENSIVE CLEANUP: Remove orphaned epic directories across all components
      await this.cleanupOrphanedEpicDirectories(validEpicDirectories, validEpicKeys);
    } catch (error) {
      logger.error(
        `Failed to process epics: ${error instanceof Error ? error.message : String(error)}`
      );
      results.push({
        success: false,
        component: componentName || 'unknown',
        epicKey: epicKey || 'unknown',
        filesGenerated: [],
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }

    return results;
  }

  private async processEpicGroupWithEnforcement(
    componentName: string,
    epicName: string,
    issues: IssueRawData[]
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      success: true,
      component: componentName,
      epicKey: 'unknown',
      filesGenerated: [],
      errors: [],
    };

    try {
      // Separate issues by type
      const epic = issues.find((issue) => (issue.fields.issuetype as any)?.name === 'Epic');
      const stories = issues.filter((issue) => (issue.fields.issuetype as any)?.name === 'Story');
      const tasks = issues.filter((issue) => (issue.fields.issuetype as any)?.name === 'Task');
      const spikes = issues.filter((issue) => (issue.fields.issuetype as any)?.name === 'Spike');

      if (!epic) {
        throw new Error(`No epic found in epic group: ${epicName}`);
      }

      result.epicKey = epic.key;

      // STRICT ENFORCEMENT: Determine correct directory structure based on Jira data
      const correctComponent = this.determineCorrectComponent(epic);
      const correctEpicDir = this.determineCorrectEpicDirectory(epic);

      // STRICT ENFORCEMENT: Validate and filter issues to belong to this epic/component
      const validatedStories = await this.validateIssuesForDirectory(
        stories,
        epic.key,
        correctComponent,
        'Story'
      );
      const validatedTasks = await this.validateIssuesForDirectory(
        tasks,
        epic.key,
        correctComponent,
        'Task'
      );
      const validatedSpikes = await this.validateIssuesForDirectory(
        spikes,
        epic.key,
        correctComponent,
        'Spike'
      );

      // Track data filtering for debug purposes
      const removedStories = stories.length - validatedStories.length;
      const removedTasks = tasks.length - validatedTasks.length;
      const removedSpikes = spikes.length - validatedSpikes.length;

      if (removedStories > 0) {
        logger.debug(
          `Filtered out ${removedStories} misplaced stories from epic ${epic.key} during data processing`
        );
      }

      if (removedTasks > 0) {
        logger.debug(
          `Filtered out ${removedTasks} misplaced tasks from epic ${epic.key} during data processing`
        );
      }

      if (removedSpikes > 0) {
        logger.debug(
          `Filtered out ${removedSpikes} misplaced spikes from epic ${epic.key} during data processing`
        );
      }

      // Enforce correct directory structure
      const targetPath = path.join(
        this.incrementsPath,
        this.targetIncrement,
        correctComponent,
        correctEpicDir
      );
      await this.ensureDirectory(targetPath);

      // CLEANUP: Remove files from incorrect directories across the entire planning structure
      const cleanupResults = await this.cleanupMisplacedFiles(
        epic,
        validatedStories,
        validatedTasks,
        validatedSpikes,
        correctComponent,
        correctEpicDir
      );

      // Process epic in correct location
      const epicMarkdown = await this.generateMarkdown(epic, 'epic');
      const epicFileName = `epic-${epic.key}.md`;
      const epicFilePath = path.join(targetPath, epicFileName);
      await fs.writeFile(epicFilePath, epicMarkdown, 'utf8');
      result.filesGenerated.push(epicFilePath);

      // Process validated stories in correct location
      for (const story of validatedStories) {
        const storyMarkdown = await this.generateMarkdown(story, 'story');
        const storyFileName = `story-${story.key}.md`;
        const storyFilePath = path.join(targetPath, storyFileName);
        await fs.writeFile(storyFilePath, storyMarkdown, 'utf8');
        result.filesGenerated.push(storyFilePath);
      }

      // Process validated tasks in correct location
      for (const task of validatedTasks) {
        const taskMarkdown = await this.generateMarkdown(task, 'task');
        const taskFileName = `task-${task.key}.md`;
        const taskFilePath = path.join(targetPath, taskFileName);
        await fs.writeFile(taskFilePath, taskMarkdown, 'utf8');
        result.filesGenerated.push(taskFilePath);
      }

      // Process validated spikes in correct location
      for (const spike of validatedSpikes) {
        const spikeMarkdown = await this.generateMarkdown(spike, 'spike');
        const spikeFileName = `spike-${spike.key}.md`;
        const spikeFilePath = path.join(targetPath, spikeFileName);
        await fs.writeFile(spikeFilePath, spikeMarkdown, 'utf8');
        result.filesGenerated.push(spikeFilePath);
      }

      // Summary logging to distinguish data filtering vs file operations
      const totalFilteredIssues = removedStories + removedTasks + removedSpikes;

      if (cleanupResults.removedFiles > 0) {
        logger.info(
          `Epic ${epic.key} cleanup: ${cleanupResults.removedFiles} misplaced files removed from file system`
        );
      } else if (totalFilteredIssues > 0) {
        logger.info(
          `Epic ${epic.key}: Structure already compliant, ${totalFilteredIssues} issues filtered during data processing`
        );
      } else {
        logger.info(`Epic ${epic.key}: Structure fully compliant, no filtering or cleanup needed`);
      }

      logger.info(
        `Processed epic group ${correctEpicDir}: ${result.filesGenerated.length} files generated in ${correctComponent}/${correctEpicDir}`
      );
    } catch (error) {
      const errorMsg = `Failed to process epic group ${epicName}: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMsg);
      result.errors.push(errorMsg);
      result.success = false;
    }

    return result;
  }

  private async generateMarkdown(
    issue: IssueRawData,
    type: 'epic' | 'story' | 'task' | 'spike'
  ): Promise<string> {
    // Generate frontmatter dynamically from template
    const frontmatter = await this.generateFrontmatter(issue, type);

    // Generate simple content with only Summary and Description
    const content = this.generateSimpleContent(issue);

    // Combine frontmatter and content
    return `---\n${frontmatter}\n---\n\n${content}`;
  }

  private async generateFrontmatter(
    issue: IssueRawData,
    type: 'epic' | 'story' | 'task' | 'spike'
  ): Promise<string> {
    // Read template to get the structure and mapping
    const templatePath = path.join(this.templatesPath, `${type}.md`);
    const template = await fs.readFile(templatePath, 'utf8');

    // Parse template to extract properties and mapping
    const templateData = this.parseTemplate(template);

    // Extract values from issue data based on mapping
    const properties = this.extractPropertiesFromIssue(issue, templateData.mapping);

    // Generate YAML frontmatter
    return this.generateYamlFromProperties(properties, templateData.mapping);
  }

  private parseTemplate(template: string): { properties: any; mapping: any } {
    // Extract frontmatter section
    const frontmatterMatch = template.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      throw new Error('No frontmatter found in template');
    }

    const frontmatterYaml = frontmatterMatch[1];

    // Parse YAML to get properties and mapping
    const parsed = yaml.load(frontmatterYaml) as any;

    return {
      properties: parsed?.properties || {},
      mapping: parsed?.mapping || {},
    };
  }

  private extractPropertiesFromIssue(issue: IssueRawData, mapping: any): any {
    const result: any = {};

    for (const [propertyName, apiPath] of Object.entries(mapping)) {
      try {
        result[propertyName] = this.extractValueFromPath(issue, apiPath as string);
      } catch (error) {
        logger.warn(`Failed to extract ${propertyName} from ${apiPath}: ${error}`);
        result[propertyName] = null;
      }
    }

    return result;
  }

  private extractValueFromPath(data: any, path: string): any {
    // Handle api.key, api.fields.xxx, etc.
    const cleanPath = path.replace(/^api\./, '');

    // Split path and navigate through object
    const parts = cleanPath.split('.');
    let current = data;

    for (const part of parts) {
      if (part.includes('[]')) {
        // Handle array notation like components[].name
        const arrayPart = part.replace('[]', '');
        if (Array.isArray(current[arrayPart])) {
          return current[arrayPart].map((item: any) => {
            const remainingPath = parts.slice(parts.indexOf(part) + 1).join('.');
            return remainingPath ? this.extractValueFromPath(item, remainingPath) : item;
          });
        }
        return [];
      } else {
        current = current[part];
        if (current === undefined || current === null) {
          return null;
        }
      }
    }

    return current;
  }

  private generateYamlFromProperties(properties: any, templateMapping: any): string {
    // Create the frontmatter structure with properties and mapping
    const frontmatter = {
      properties: properties,
      mapping: templateMapping,
    };

    return yaml.dump(frontmatter, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    });
  }

  private generateSimpleContent(issue: IssueRawData): string {
    const fields = issue.fields;

    // Extract summary and description from Jira issue
    const summary = fields.summary || '';
    const description = this.extractDescription(fields.description);

    // Generate simple content with only Summary and Description
    let content = `## Summary\n\n${summary}\n\n## Description\n\n`;

    if (description) {
      content += description;
    } else {
      content += 'No description available.';
    }

    return content;
  }

  private extractDescription(description: any): string {
    if (typeof description === 'string') {
      return description;
    }

    if (!description || !description.content) {
      return '';
    }

    // Extract text from JIRA's document format
    const extractText = (content: any[]): string => {
      return content
        .map((item) => {
          if (item.type === 'paragraph' && item.content) {
            return item.content.map((textItem: any) => textItem.text || '').join('');
          }
          return '';
        })
        .join('\n');
    };

    return extractText(description.content);
  }

  private objectToYaml(obj: any, indent: number = 0): string {
    const spaces = '  '.repeat(indent);
    let yaml = '';

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        yaml += `${spaces}${key}: null\n`;
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        if (value.length === 0) {
          yaml += `${spaces}  []\n`;
        } else {
          for (const item of value) {
            yaml += `${spaces}  - ${item}\n`;
          }
        }
      } else if (typeof value === 'object') {
        yaml += `${spaces}${key}:\n`;
        yaml += this.objectToYaml(value, indent + 1);
      } else if (typeof value === 'string') {
        yaml += `${spaces}${key}: "${value}"\n`;
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }

    return yaml;
  }

  private determineCorrectComponent(epic: IssueRawData): string {
    // Get component from epic's Jira data
    const components = (epic.fields.components as any) || [];
    if (components.length > 0) {
      return components[0].name; // Use first component as primary
    }

    // Fallback: use a default component if none specified
    logger.warn(`Epic ${epic.key} has no component specified, using 'unassigned'`);
    return 'unassigned';
  }

  private determineCorrectEpicDirectory(epic: IssueRawData): string {
    // Generate epic directory name from summary/title
    let epicName = epic.fields.summary || epic.key;

    // Clean up the name for folder use
    epicName = (epicName as string)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

    return `epic-${epicName}`;
  }

  private async validateIssuesForDirectory(
    issues: IssueRawData[],
    epicKey: string,
    expectedComponent: string,
    _issueType: string
  ): Promise<IssueRawData[]> {
    const validIssues: IssueRawData[] = [];

    for (const issue of issues) {
      let isValid = true;
      const reasons: string[] = [];

      // Check 1: Epic Link validation - does this issue belong to the expected epic?
      const epicLink = this.getEpicLink(issue);
      if (epicLink !== epicKey) {
        isValid = false;
        reasons.push(`Epic Link mismatch: expected ${epicKey}, got ${epicLink || 'none'}`);
      }

      // Check 2: Component validation - only validate components for epics
      const issueType = (issue.fields.issuetype as any)?.name;
      if (issueType === 'Epic') {
        const issueComponents = (issue.fields.components as any) || [];
        const issueComponentNames = issueComponents.map((comp: any) => comp.name);

        if (!issueComponentNames.includes(expectedComponent)) {
          isValid = false;
          reasons.push(
            `Component mismatch: expected ${expectedComponent}, got [${issueComponentNames.join(', ')}]`
          );
        }
      }

      if (isValid) {
        validIssues.push(issue);
      } else {
        // Try to fix component mismatch automatically
        const hasComponentMismatch = reasons.some(reason => reason.includes('Component mismatch'));
        if (hasComponentMismatch) {
          try {
            logger.info(`🔧 Attempting to fix component mismatch for ${issueType} ${issue.key}...`);
            const fixedIssue = await this.fixComponentMismatch(issue, expectedComponent);
            if (fixedIssue) {
              logger.info(`✅ Successfully fixed component for ${issue.key}, re-validating...`);
              // Re-validate the fixed issue
              const reValidatedIssues = await this.validateIssuesForDirectory([fixedIssue], epicKey, expectedComponent, issueType);
              validIssues.push(...reValidatedIssues);
              continue;
            }
          } catch (error) {
            logger.warn(`Failed to fix component mismatch for ${issue.key}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        
        logger.warn(
          `Excluding ${issueType} ${issue.key} from directory structure: ${reasons.join(', ')}`
        );
      }
    }

    return validIssues;
  }

  private async fixComponentMismatch(issue: IssueRawData, correctComponent: string): Promise<IssueRawData | null> {
    try {
      // Only fix component mismatches for epics
      const issueType = (issue.fields.issuetype as any)?.name;
      if (issueType !== 'Epic') {
        logger.info(`Skipping component fix for ${issueType} ${issue.key} - components are only required for epics`);
        return null;
      }

      // Import JiraApiClient dynamically to avoid circular dependencies
      const { JiraApiClient } = await import('./jira-api-client');
      const jiraClient = new JiraApiClient();

      // Update the issue with only the correct component
      const updatePayload = {
        fields: {
          components: [{ name: correctComponent }]
        }
      };

      logger.info(`🔄 Updating ${issue.key} to have only component: ${correctComponent}`);
      await jiraClient.updateIssue(issue.key, updatePayload);

      // Re-fetch the issue to get updated data
      logger.info(`📥 Re-fetching updated issue ${issue.key}...`);
      const updatedIssue = await jiraClient.getIssue(issue.key);
      
      if (!updatedIssue) {
        logger.error(`Failed to re-fetch issue ${issue.key} after component update`);
        return null;
      }

      // Convert to IssueRawData format
      const updatedIssueData: IssueRawData = {
        key: updatedIssue.key,
        fields: updatedIssue.fields,
        expand: updatedIssue.expand,
        id: updatedIssue.id,
        self: updatedIssue.self,
      };

      logger.info(`✅ Successfully updated and re-fetched ${issue.key} with correct component`);
      return updatedIssueData;

    } catch (error) {
      logger.error(`Failed to fix component mismatch for ${issue.key}:`, error);
      return null;
    }
  }

  private getEpicLink(issue: IssueRawData): string | null {
    // Epic Link is typically in customfield_10014 for JIRA Cloud
    // or could be in customfield_10008 for JIRA Server/DC
    // Check multiple possible fields for epic link
    const epicLinkFields = [
      'customfield_10000', // Primary Epic Link field used in JQL queries
      'customfield_10014', // Common for JIRA Cloud
      'customfield_10008', // Common for JIRA Server/DC
      'customfield_10006', // Alternative
      'customfield_10007', // Alternative
      'customfield_10010', // Alternative
    ];

    for (const field of epicLinkFields) {
      const epicLink = issue.fields[field];
      if (epicLink) {
        // Epic link could be a string (epic key) or object with key property
        if (typeof epicLink === 'string') {
          return epicLink;
        } else if (epicLink && typeof epicLink === 'object' && (epicLink as any).key) {
          return (epicLink as any).key;
        }
      }
    }

    return null;
  }

  private async cleanupMisplacedFiles(
    epic: IssueRawData,
    validStories: IssueRawData[],
    validTasks: IssueRawData[],
    validSpikes: IssueRawData[],
    correctComponent: string,
    correctEpicDir: string
  ): Promise<{ removedFiles: number; removedFilePaths: string[] }> {
    try {
      const correctPath = path.join(
        this.incrementsPath,
        this.targetIncrement,
        correctComponent,
        correctEpicDir
      );

      // Build set of files that should exist in the correct location
      const validFileNames = new Set<string>();
      validFileNames.add(`epic-${epic.key}.md`);

      for (const story of validStories) {
        validFileNames.add(`story-${story.key}.md`);
      }

      for (const task of validTasks) {
        validFileNames.add(`task-${task.key}.md`);
      }

      for (const spike of validSpikes) {
        validFileNames.add(`spike-${spike.key}.md`);
      }

      // Search across entire planning structure for misplaced files
      const cleanupResults = await this.searchAndRemoveMisplacedFiles(
        path.join(this.incrementsPath, this.targetIncrement),
        validFileNames,
        correctPath,
        epic.key
      );

      return cleanupResults;
    } catch (error) {
      logger.warn(
        `Failed to cleanup misplaced files for epic ${epic.key}: ${error instanceof Error ? error.message : String(error)}`
      );
      return { removedFiles: 0, removedFilePaths: [] };
    }
  }

  private async searchAndRemoveMisplacedFiles(
    searchDir: string,
    validFileNames: Set<string>,
    correctPath: string,
    epicKey: string
  ): Promise<{ removedFiles: number; removedFilePaths: string[] }> {
    const removedFilePaths: string[] = [];

    try {
      const entries = await fs.readdir(searchDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(searchDir, entry.name);

        if (entry.isDirectory()) {
          // Recursively search subdirectories
          const subResults = await this.searchAndRemoveMisplacedFiles(
            fullPath,
            validFileNames,
            correctPath,
            epicKey
          );
          removedFilePaths.push(...subResults.removedFilePaths);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Check if this file should be in the correct location instead
          if (validFileNames.has(entry.name) && fullPath !== path.join(correctPath, entry.name)) {
            await fs.unlink(fullPath);
            removedFilePaths.push(fullPath);
            logger.info(`Removed misplaced file: ${fullPath} (should be in ${correctPath})`);
          }
          // Also check if it's an orphaned file related to this epic
          else if (this.isOrphanedEpicFile(entry.name, epicKey)) {
            await fs.unlink(fullPath);
            removedFilePaths.push(fullPath);
            logger.info(`Removed orphaned epic file: ${fullPath}`);
          }
        }
      }
    } catch (error) {
      // If directory doesn't exist or can't be read, that's fine
      if ((error as any).code !== 'ENOENT' && (error as any).code !== 'EACCES') {
        logger.debug(
          `Could not search directory ${searchDir}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return { removedFiles: removedFilePaths.length, removedFilePaths };
  }

  private isOrphanedEpicFile(fileName: string, epicKey: string): boolean {
    // Check if this file belongs to the epic but shouldn't exist anymore
    return fileName.includes(epicKey) && fileName.endsWith('.md');
  }

  private async ensureDirectory(path: string): Promise<void> {
    try {
      await fs.mkdir(path, { recursive: true });
    } catch (error) {
      throw new Error(
        `Failed to create directory ${path}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Comprehensive cleanup method that removes orphaned epic directories
   * This ensures the file system matches the Jira component -> epic hierarchy
   */
  private async cleanupOrphanedEpicDirectories(
    validEpicDirectories: Map<string, Set<string>>,
    validEpicKeys: Set<string>
  ): Promise<void> {
    try {
      const incrementPath = path.join(this.incrementsPath, this.targetIncrement);

      // Get all component directories
      const componentEntries = await fs.readdir(incrementPath, { withFileTypes: true });

      for (const componentEntry of componentEntries) {
        if (!componentEntry.isDirectory()) continue;

        const componentPath = path.join(incrementPath, componentEntry.name);
        const componentName = componentEntry.name;

        // Skip special directories like _data, .config, etc.
        if (componentName.startsWith('_') || componentName.startsWith('.')) {
          continue;
        }

        // Get all epic directories in this component
        try {
          const epicEntries = await fs.readdir(componentPath, { withFileTypes: true });

          for (const epicEntry of epicEntries) {
            if (!epicEntry.isDirectory()) continue;

            const epicDirName = epicEntry.name;
            const epicPath = path.join(componentPath, epicDirName);

            // Skip non-epic directories
            if (!epicDirName.startsWith('epic-')) {
              continue;
            }

            // Check if this epic directory should exist
            const validEpicsForComponent = validEpicDirectories.get(componentName);
            const shouldKeepDirectory = validEpicsForComponent?.has(epicDirName);

            if (!shouldKeepDirectory) {
              // Check if any files in this directory belong to valid epics (for safety)
              const hasValidEpicFiles = await this.checkForValidEpicFiles(epicPath, validEpicKeys);

              if (!hasValidEpicFiles) {
                await this.removeDirectoryRecursively(epicPath);
                logger.info(`Removed orphaned epic directory: ${epicPath}`);
              } else {
                logger.warn(
                  `Epic directory ${epicPath} contains valid epic files but doesn't match expected structure`
                );
              }
            }
          }

          // Check if component directory is now empty (except for special files)
          await this.cleanupEmptyComponentDirectory(componentPath, componentName);
        } catch (error) {
          if ((error as any).code !== 'ENOENT') {
            logger.debug(
              `Could not read component directory ${componentPath}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    } catch (error) {
      logger.warn(
        `Failed to cleanup orphaned epic directories: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if an epic directory contains files belonging to valid epics
   */
  private async checkForValidEpicFiles(
    epicPath: string,
    validEpicKeys: Set<string>
  ): Promise<boolean> {
    try {
      const files = await fs.readdir(epicPath);

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        // Extract epic key from filename (epic-POP-1234.md, story-POP-1234.md, etc.)
        const keyMatch = file.match(/(?:epic|story|task|spike)-([A-Z]+-\d+)\.md/);
        if (keyMatch) {
          const epicKey = keyMatch[1];
          if (validEpicKeys.has(epicKey)) {
            return true;
          }
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Remove an empty component directory if it only contains system files
   */
  private async cleanupEmptyComponentDirectory(
    componentPath: string,
    _componentName: string
  ): Promise<void> {
    try {
      const entries = await fs.readdir(componentPath);

      // Filter out system files and check if only non-epic content remains
      const meaningfulEntries = entries.filter((entry) => {
        return (
          !entry.startsWith('.') &&
          !entry.startsWith('_') &&
          !entry.includes('README') &&
          !entry.includes('CHANGELOG')
        );
      });

      if (meaningfulEntries.length === 0) {
        await this.removeDirectoryRecursively(componentPath);
        logger.info(`Removed empty component directory: ${componentPath}`);
      }
    } catch {
      // Ignore errors, this is just cleanup
    }
  }

  /**
   * Recursively remove a directory and all its contents
   */
  private async removeDirectoryRecursively(dirPath: string): Promise<void> {
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        await fs.unlink(dirPath);
        return;
      }

      const entries = await fs.readdir(dirPath);

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        await this.removeDirectoryRecursively(entryPath);
      }

      await fs.rmdir(dirPath);
    } catch (error) {
      // If file/directory doesn't exist, that's fine
      if ((error as any).code !== 'ENOENT') {
        logger.warn(
          `Failed to remove ${dirPath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}

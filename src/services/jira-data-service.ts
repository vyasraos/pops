import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { FetchResult, IssueRawData, JiraIssue } from '../types';
import { logger } from '../utils/logger';
import { POPSConfig } from '../utils/pops-config';
import { JiraApiClient } from './jira-api-client';

export class JiraDataService {
  private jiraClient: JiraApiClient;
  private popsConfig: POPSConfig;
  private dataPath: string;

  constructor(configPath?: string) {
    this.jiraClient = new JiraApiClient(configPath);
    this.popsConfig = new POPSConfig(configPath || 'pops.toml');
    this.dataPath = this.initializeDataPath();
  }

  private initializeDataPath(): string {
    const config = this.popsConfig.getConfig();
    const targetIncrement = config.jira?.paths?.target || 'FY26Q1';
    const incrementsPath = config.jira?.paths?.increments || 'planning/increments';
    return path.join(incrementsPath, targetIncrement, '_data');
  }

  getDataPath(): string {
    return this.dataPath;
  }

  async fetchSingleIssue(issueKey: string): Promise<void> {
    try {
      // Ensure data directory exists
      await fs.mkdir(this.dataPath, { recursive: true });

      // Fetch the issue from Jira
      const issue = await this.jiraClient.getIssue(issueKey);
      if (!issue) {
        throw new Error(`Issue ${issueKey} not found in Jira`);
      }

      // Determine component from issue
      const component = (issue.fields.components as any)?.[0]?.name || 'unknown';
      const componentDir = path.join(this.dataPath, component);
      await fs.mkdir(componentDir, { recursive: true });

      // Save issue data
      const issueData: IssueRawData = {
        key: issue.key,
        fields: issue.fields,
        expand: issue.expand,
        id: issue.id,
        self: issue.self,
      };

      const fileName = `${issueKey}.json`;
      const filePath = path.join(componentDir, fileName);
      await fs.writeFile(filePath, JSON.stringify(issueData, null, 2), 'utf8');

      logger.info(`✅ Single issue ${issueKey} fetched and saved to ${filePath}`);
    } catch (error) {
      logger.error(`Failed to fetch single issue ${issueKey}:`, error);
      throw error;
    }
  }

  async fetchEpicsForComponent(componentName: string): Promise<FetchResult> {
    const result: FetchResult = {
      success: true,
      component: componentName,
      epicsFetched: 0,
      totalIssuesFetched: 0,
      errors: [],
    };

    try {
      logger.info(`Fetching epics for component: ${componentName}`);

      // Get all epics for the component
      const epics = await this.jiraClient.getEpicsByComponent(componentName);
      result.epicsFetched = epics?.length || 0;

      if (!epics || epics.length === 0) {
        logger.warn(`No epics found for component: ${componentName}`);
        return result;
      }

      // Create component directory in _data
      const componentDataPath = path.join(this.dataPath, componentName);
      await this.ensureDataDirectory(componentDataPath);

      // Process each epic
      for (const epic of epics) {
        try {
          const epicKey = epic.key;
          const epicName = this.generateEpicFolderName(epic);

          logger.info(`Processing epic: ${epicKey} (${epicName})`);

          // Create epic directory
          const epicDataPath = path.join(componentDataPath, epicName);
          await this.ensureDataDirectory(epicDataPath);

          // Save epic JSON
          const epicFileName = `epic-${epicKey}.json`;
          const epicFilePath = path.join(epicDataPath, epicFileName);
          await this.saveIssueData(epic as unknown as Record<string, unknown>, epicFilePath);
          result.totalIssuesFetched++;

          // Get and save children (stories and tasks)
          const children = await this.jiraClient.getIssueChildren(epicKey);

          if (children) {
            for (const child of children) {
              const childKey = child.key;
              const childType = (child.fields.issuetype as any)?.name?.toLowerCase() || 'unknown';
              const childFileName = `${childType}-${childKey}.json`;
              const childFilePath = path.join(epicDataPath, childFileName);

              await this.saveIssueData(child as unknown as Record<string, unknown>, childFilePath);
              result.totalIssuesFetched++;
            }

            logger.info(`Completed epic ${epicKey}: ${children.length} children processed`);
          }
        } catch (error) {
          const errorMsg = `Failed to process epic ${epic.key}: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }

      logger.info(
        `Completed fetching for component ${componentName}: ${result.epicsFetched} epics, ${result.totalIssuesFetched} total issues`
      );
    } catch (error) {
      const errorMsg = `Failed to fetch epics for component ${componentName}: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMsg);
      result.errors.push(errorMsg);
      result.success = false;
    }

    return result;
  }

  private generateEpicFolderName(epic: JiraIssue): string {
    // Extract epic name from summary or custom field
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

  private async saveIssueData(issueJson: Record<string, unknown>, filePath: string): Promise<void> {
    try {
      const jsonContent = JSON.stringify(issueJson, null, 2);
      await fs.writeFile(filePath, jsonContent, 'utf8');
      logger.debug(`Saved issue data to: ${filePath}`);
    } catch (error) {
      throw new Error(
        `Failed to save issue data to ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async ensureDataDirectory(path: string): Promise<void> {
    try {
      await fs.mkdir(path, { recursive: true });
    } catch (error) {
      throw new Error(
        `Failed to create directory ${path}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getDataStructure(): Promise<Map<string, Map<string, IssueRawData[]>>> {
    const structure = new Map<string, Map<string, IssueRawData[]>>();

    try {
      const dataDir = this.dataPath;
      const componentDirs = await fs.readdir(dataDir, { withFileTypes: true });

      for (const componentDir of componentDirs) {
        if (!componentDir.isDirectory()) continue;

        const componentName = componentDir.name;
        const componentPath = path.join(dataDir, componentName);
        const epicDirs = await fs.readdir(componentPath, { withFileTypes: true });

        const componentMap = new Map<string, IssueRawData[]>();

        for (const epicDir of epicDirs) {
          if (!epicDir.isDirectory()) continue;

          const epicName = epicDir.name;
          const epicPath = path.join(componentPath, epicName);
          const files = await fs.readdir(epicPath);

          const issues: IssueRawData[] = [];

          for (const file of files) {
            if (!file.endsWith('.json')) continue;

            try {
              const filePath = path.join(epicPath, file);
              const content = await fs.readFile(filePath, 'utf8');
              const issueData = JSON.parse(content);
              issues.push(issueData);
            } catch (error) {
              logger.warn(
                `Failed to read JSON file ${file}: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }

          if (issues.length > 0) {
            componentMap.set(epicName, issues);
          }
        }

        if (componentMap.size > 0) {
          structure.set(componentName, componentMap);
        }
      }
    } catch (error) {
      logger.error(
        `Failed to read data structure: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return structure;
  }
}

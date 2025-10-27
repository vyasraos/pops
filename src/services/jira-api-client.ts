import axios, { type AxiosError, type AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import type { JiraComponent, JiraProject } from '../types';
import { logger } from '../utils/logger';
import { POPSConfig } from '../utils/pops-config';

// Load environment variables
dotenv.config();

export class JiraApiClient {
  private client: AxiosInstance | null = null;
  private popsConfig: POPSConfig;

  constructor(configPath?: string) {
    this.popsConfig = new POPSConfig(configPath || 'pops.toml');
  }

  private async getClient(): Promise<AxiosInstance> {
    if (this.client) {
      return this.client;
    }

    // Get JIRA Data Center configuration from TOML file
    const tomlConfig = this.popsConfig.getConfig();
    const jiraBaseUrl = tomlConfig.jira?.base_url;

    // Get API token from environment variable
    const apiToken = process.env.JIRA_PERSONAL_TOKEN;

    if (!jiraBaseUrl) {
      throw new Error(
        'JIRA base URL not found in pops.toml file. Please add [jira] base_url configuration.'
      );
    }

    if (!apiToken) {
      throw new Error(
        'JIRA_PERSONAL_TOKEN environment variable is required. Please set it in your .env file or environment.'
      );
    }

    logger.info(`Initializing JIRA API client for ${jiraBaseUrl}`);

    this.client = axios.create({
      baseURL: `${jiraBaseUrl}/rest/api/2`,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    });

    // Add response interceptor for better error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          throw new Error('JIRA authentication failed. Please check your JIRA_PERSONAL_TOKEN.');
        }
        if (error.response?.status === 403) {
          throw new Error('JIRA access forbidden. Please check your permissions.');
        }
        if (error.response?.status === 404) {
          throw new Error('JIRA resource not found. Please check the project key or issue key.');
        }

        // Pass through original Jira error messages
        if (error.response?.data && typeof error.response.data === 'object') {
          const errorData = error.response.data as Record<string, unknown>;
          let errorMessage = 'JIRA API Error: ';

          // Handle different JIRA error response formats
          if (
            errorData.errorMessages &&
            Array.isArray(errorData.errorMessages) &&
            errorData.errorMessages.length > 0
          ) {
            errorMessage += errorData.errorMessages.join(', ');
          } else if (errorData.errors && typeof errorData.errors === 'object') {
            const errorDetails = Object.entries(errorData.errors)
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ');
            errorMessage += errorDetails;
          } else if (errorData.message) {
            errorMessage += errorData.message;
          } else if (errorData.error) {
            errorMessage += errorData.error;
          } else {
            // If no specific error format, show the raw response for debugging
            errorMessage += `Raw response: ${JSON.stringify(errorData, null, 2)}`;
          }

          // Add HTTP status if available
          if (error.response?.status) {
            errorMessage += ` (HTTP ${error.response.status})`;
          }

          throw new Error(errorMessage);
        }

        // If no response data, include the original error message
        const originalMessage = error.message || 'Unknown error';
        const statusInfo = error.response?.status ? ` (HTTP ${error.response.status})` : '';
        throw new Error(`JIRA API Error: ${originalMessage}${statusInfo}`);
      }
    );

    return this.client;
  }

  // Project operations for validation
  async getProject(projectKey: string): Promise<JiraProject> {
    try {
      const client = await this.getClient();
      const response = await client.get(`/project/${projectKey}`, {
        params: {
          expand: 'issueTypes,components',
        },
      });

      const project = response.data;
      return {
        id: project.id,
        key: project.key,
        name: project.name,
        description: project.description,
        issueTypes: project.issueTypes?.map((it: Record<string, unknown>) => ({
          id: it.id,
          name: it.name,
          description: it.description,
          iconUrl: it.iconUrl,
          subtask: it.subtask || false,
        })),
        components: project.components?.map(this.mapComponent),
      };
    } catch (error) {
      logger.error(`Failed to get project ${projectKey}`, error);
      throw error;
    }
  }

  // New methods for data-driven approach

  async getIssue(issueKey: string): Promise<JiraIssue | undefined> {
    try {
      const client = await this.getClient();

      const response = await client.get(`/issue/${issueKey}`, {
        params: {
          fields: '*all',
          expand: 'renderedFields',
        },
      });

      if (response.data) {
        logger.info(`✅ JIRA issue fetched: ${issueKey}`);
        return response.data;
      }

      return null;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 404) {
          logger.error(`Issue ${issueKey} not found`);
          return null;
        }
        logger.error(
          `JIRA API Error: ${axiosError.response?.data || axiosError.message} (HTTP ${axiosError.response?.status})`
        );
        throw new Error(
          `JIRA API Error: ${axiosError.response?.data || axiosError.message} (HTTP ${axiosError.response?.status})`
        );
      }
      logger.error('Failed to fetch issue:', error);
      throw error;
    }
  }

  async getIssueChildren(parentKey: string): Promise<JiraIssue[] | undefined> {
    try {
      const client = await this.getClient();
      const tomlConfig = this.popsConfig.getConfig();
      const projectKey = tomlConfig.jira?.project || 'APE';

      // Try multiple approaches to find children
      // First try the standard Jira parent field
      let jql = `project = ${projectKey} AND parent = ${parentKey} AND labels NOT IN ("workspace")`;

      try {
        const response = await client.get('/search', {
          params: {
            jql,
            maxResults: 100,
            fields: '*all',
            expand: 'renderedFields',
          },
        });

        if (response.data?.issues && response.data.issues.length > 0) {
          logger.info(
            `Found ${response.data.issues.length} children for epic ${parentKey} using parent field`
          );
          return response.data.issues;
        }
      } catch (_error) {
        logger.debug(
          `Parent field approach failed for ${parentKey}, trying alternative approaches`
        );
      }

      // If parent field doesn't work, try using Epic Link field
      jql = `project = ${projectKey} AND "Epic Link" = ${parentKey} AND labels NOT IN ("workspace")`;

      try {
        const response = await client.get('/search', {
          params: {
            jql,
            maxResults: 100,
            fields: '*all',
            expand: 'renderedFields',
          },
        });

        if (response.data?.issues && response.data.issues.length > 0) {
          logger.info(
            `Found ${response.data.issues.length} children for epic ${parentKey} using Epic Link field`
          );
          return response.data.issues;
        }
      } catch (_error) {
        logger.debug(
          `Epic Link field approach failed for ${parentKey}, trying custom field approach`
        );
      }

      // If Epic Link doesn't work, try customfield_10000 (as defined in schemas)
      jql = `project = ${projectKey} AND customfield_10000 = ${parentKey} AND labels NOT IN ("workspace")`;

      try {
        const response = await client.get('/search', {
          params: {
            jql,
            maxResults: 100,
            fields: '*all',
            expand: 'renderedFields',
          },
        });

        if (response.data?.issues && response.data.issues.length > 0) {
          logger.info(
            `Found ${response.data.issues.length} children for epic ${parentKey} using customfield_10000`
          );
          return response.data.issues;
        }
      } catch (_error) {
        logger.debug(`Custom field approach failed for ${parentKey}`);
      }

      // If all approaches fail, return empty array
      logger.warn(
        `No children found for epic ${parentKey} using any known parent-child relationship field`
      );
      return [];
    } catch (error) {
      logger.error(`Failed to get children for issue ${parentKey}`, error);
      throw error;
    }
  }

  async getEpicsByComponent(componentName: string): Promise<JiraIssue[] | undefined> {
    try {
      const client = await this.getClient();
      const tomlConfig = this.popsConfig.getConfig();
      const projectKey = tomlConfig.jira?.project || 'APE';

      const jql = `project = ${projectKey} AND component = "${componentName}" AND issuetype = Epic AND labels NOT IN ("workspace")`;
      const response = await client.get('/search', {
        params: {
          jql,
          maxResults: 100,
          fields: '*all',
          expand: 'renderedFields',
        },
      });

      if (!response.data || !response.data.issues) {
        logger.warn('Unexpected JIRA response structure for epics:', response.data);
        return [];
      }

      return response.data.issues; // Return raw JSON array
    } catch (error) {
      logger.error(`Failed to get epics for component ${componentName}`, error);
      throw error;
    }
  }

  async getAllEpicsByComponent(componentName: string): Promise<JiraIssue[] | undefined> {
    try {
      const client = await this.getClient();
      const tomlConfig = this.popsConfig.getConfig();
      const projectKey = tomlConfig.jira?.project || 'APE';

      const jql = `project = ${projectKey} AND component = "${componentName}" AND issuetype = Epic`;
      const response = await client.get('/search', {
        params: {
          jql,
          maxResults: 100,
          fields: '*all',
          expand: 'renderedFields',
        },
      });

      if (!response.data || !response.data.issues) {
        logger.warn('Unexpected JIRA response structure for epics:', response.data);
        return [];
      }

      return response.data.issues; // Return raw JSON array
    } catch (error) {
      logger.error(`Failed to get all epics for component ${componentName}`, error);
      throw error;
    }
  }

  // Component operations
  async getComponents(projectKey: string): Promise<JiraComponent[]> {
    try {
      const client = await this.getClient();

      // Get project to get the project ID
      const projectResponse = await client.get(`/project/${projectKey}`);
      const projectId = projectResponse.data.id;

      // Get components using the paginated endpoint
      const response = await client.get('/component/page', {
        params: {
          projectIds: projectId,
          maxResults: 100,
        },
      });

      return response.data.values.map(this.mapComponent);
    } catch (error) {
      logger.error(`Failed to get components for project ${projectKey}`, error);
      throw error;
    }
  }

  // Issue creation method
  async createIssue(payload: Record<string, unknown>): Promise<JiraIssue | undefined> {
    try {
      const client = await this.getClient();
      const response = await client.post('/issue', payload);
      logger.info(`✅ JIRA issue created: ${response.data.key}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to create issue', error);
      throw error;
    }
  }

  async updateIssue(issueKey: string, payload: Record<string, unknown>): Promise<JiraIssue | undefined> {
    try {
      const client = await this.getClient();
      const response = await client.put(`/issue/${issueKey}`, payload);
      logger.info(`✅ JIRA issue updated: ${issueKey}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to update issue ${issueKey}`, error);
      throw error;
    }
  }

  // Public method to access client for custom operations
  async getPublicClient(): Promise<AxiosInstance> {
    return this.getClient();
  }

  // Private helper methods

  private mapComponent(component: Record<string, unknown>): JiraComponent {
    return {
      id: component.id,
      name: component.name,
      description: component.description || '',
      project: component.project,
      projectId: component.projectId,
      lead: component.lead?.displayName,
      leadDisplayName: component.lead?.displayName,
      leadUserName: component.lead?.name,
      assigneeType: component.assigneeType,
      realAssigneeType: component.realAssigneeType,
      isAssigneeTypeValid: component.isAssigneeTypeValid,
    };
  }
}

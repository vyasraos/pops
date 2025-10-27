export interface JiraProject {
  id: string;
  key: string;
  name: string;
  description?: string;
  issueTypes?: JiraIssueType[];
  components?: JiraComponent[];
}

export interface JiraIssueType {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  subtask: boolean;
}

export interface JiraComponent {
  id: string;
  name: string;
  description?: string;
  project: string;
  projectId: string;
  lead?: string;
  leadDisplayName?: string;
  leadUserName?: string;
  assigneeType: string;
  realAssigneeType?: string;
  isAssigneeTypeValid?: boolean;
}

// Component YAML file structure (simplified for components.yaml)
export interface ComponentsFile {
  project: {
    key: string;
    name: string;
    id: string | number;
  };
  components: Array<{ name: string }>;
  metadata: {
    lastUpdated: string;
    apiEndpoint: string;
  };
}

// Full component structure for API responses
export interface FullComponentsFile {
  project: {
    key: string;
    name: string;
    id: string;
  };
  components: JiraComponent[];
  metadata: {
    lastUpdated: string;
    apiEndpoint: string;
  };
}

// Master file structure (simplified for pops CLI)
export interface MasterFile {
  project: {
    key: string;
    name: string;
    id: string;
  };
  components: Array<{
    name: string;
    jira_id: string;
  }>;
  issue_types: Array<{
    issue_type: string;
    jira_id: string;
  }>;
  metadata: {
    lastUpdated: string;
    version: string;
  };
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// New interfaces for data-driven approach
export interface IssueRawData {
  id: string;
  key: string;
  fields: Record<string, unknown>;
  expand?: string;
  renderedFields?: Record<string, unknown>;
  changelog?: unknown;
  self?: string;
}

export interface ProcessingResult {
  success: boolean;
  component: string;
  epicKey: string;
  filesGenerated: string[];
  errors: string[];
}

export interface FetchResult {
  success: boolean;
  component: string;
  epicsFetched: number;
  totalIssuesFetched: number;
  errors: string[];
}

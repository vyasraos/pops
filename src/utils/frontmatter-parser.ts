import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as yaml from 'js-yaml';

export interface SyncMetadata {
  issueKey: string | null;
  lastSync: string | null;
  localHash: string | null;
  remoteHash: string | null;
}

export interface StandardFields {
  project: string | null;
  type: string;
  components: string[];
  labels: string[];
  status: string | null;
}

export interface CustomFields {
  customfield_12401?: string; // Workstream
  customfield_12400?: string; // Virtualization Initiative
  customfield_10006?: number; // Story Points
  customfield_10000?: string | null; // Parent
}

export interface FrontmatterData {
  standard: StandardFields;
  custom: CustomFields;
  sync: SyncMetadata;
}

export interface ParsedMarkdown {
  frontmatter: FrontmatterData;
  content: string;
  rawContent: string;
}

export class FrontmatterParser {
  private static readonly FRONTMATTER_DELIMITER = '---';

  /**
   * Parse markdown file with YAML frontmatter
   */
  static parseFile(filePath: string): ParsedMarkdown {
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    return FrontmatterParser.parseContent(rawContent);
  }

  /**
   * Parse markdown content with YAML frontmatter
   */
  static parseContent(content: string): ParsedMarkdown {
    const lines = content.split('\n');

    if (lines.length < 2 || lines[0] !== FrontmatterParser.FRONTMATTER_DELIMITER) {
      // File doesn't have frontmatter, but we can't create a default without project key
      throw new Error('File does not contain valid frontmatter and project key is required. Please ensure the file has proper YAML frontmatter or provide a project key.');
    }

    let frontmatterEndIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === FrontmatterParser.FRONTMATTER_DELIMITER) {
        frontmatterEndIndex = i;
        break;
      }
    }

    if (frontmatterEndIndex === -1) {
      throw new Error('Frontmatter not properly closed');
    }

    const frontmatterLines = lines.slice(1, frontmatterEndIndex);
    const contentLines = lines.slice(frontmatterEndIndex + 1);

    const frontmatterYaml = frontmatterLines.join('\n');
    const markdownContent = contentLines.join('\n');

    const frontmatter = yaml.load(frontmatterYaml) as any;

    return {
      frontmatter: FrontmatterParser.normalizeFrontmatter(frontmatter),
      content: markdownContent,
      rawContent: content,
    };
  }

  /**
   * Normalize frontmatter to ensure all required fields exist
   */
  private static normalizeFrontmatter(data: any): FrontmatterData {
    return {
      standard: {
        project: data.standard?.project || null,
        type: data.standard?.type || 'Epic',
        components: data.standard?.components || [],
        labels: data.standard?.labels || [],
        status: data.standard?.status || null,
      },
      custom: {
        customfield_12401: data.custom?.customfield_12401 || 'IaC',
        customfield_12400: data.custom?.customfield_12400 || 'Private Cloud 2.0',
        customfield_10006: data.custom?.customfield_10006 || 0,
        customfield_10000: data.custom?.customfield_10000 || null,
      },
      sync: {
        issueKey: data.sync?.issueKey || null,
        lastSync: data.sync?.lastSync || null,
        localHash: data.sync?.localHash || null,
        remoteHash: data.sync?.remoteHash || null,
      },
    };
  }

  /**
   * Serialize frontmatter and content back to markdown
   */
  static serialize(parsed: ParsedMarkdown): string {
    const frontmatterYaml = yaml.dump(parsed.frontmatter, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });

    return [
      FrontmatterParser.FRONTMATTER_DELIMITER,
      frontmatterYaml.trim(),
      FrontmatterParser.FRONTMATTER_DELIMITER,
      '',
      parsed.content,
    ].join('\n');
  }

  /**
   * Calculate hash of content (excluding frontmatter sync metadata)
   */
  static calculateContentHash(content: string): string {
    const parsed = FrontmatterParser.parseContent(content);

    // Create content without sync metadata for hashing
    const contentForHash = {
      ...parsed.frontmatter,
      sync: {
        ...parsed.frontmatter.sync,
        localHash: null,
        remoteHash: null,
      },
    };

    const contentString = JSON.stringify(contentForHash) + parsed.content;
    return crypto.createHash('md5').update(contentString).digest('hex');
  }

  /**
   * Update sync metadata in frontmatter
   */
  static updateSyncMetadata(content: string, updates: Partial<SyncMetadata>): string {
    const parsed = FrontmatterParser.parseContent(content);

    parsed.frontmatter.sync = {
      ...parsed.frontmatter.sync,
      ...updates,
    };

    return FrontmatterParser.serialize(parsed);
  }

  /**
   * Update standard fields in frontmatter
   */
  static updateStandardFields(content: string, updates: Partial<StandardFields>): string {
    const parsed = FrontmatterParser.parseContent(content);

    parsed.frontmatter.standard = {
      ...parsed.frontmatter.standard,
      ...updates,
    };

    return FrontmatterParser.serialize(parsed);
  }

  /**
   * Update custom fields in frontmatter
   */
  static updateCustomFields(content: string, updates: Partial<CustomFields>): string {
    const parsed = FrontmatterParser.parseContent(content);

    parsed.frontmatter.custom = {
      ...parsed.frontmatter.custom,
      ...updates,
    };

    return FrontmatterParser.serialize(parsed);
  }

  /**
   * Set parent relationship for stories/tasks
   */
  static setParent(content: string, parentIssueKey: string): string {
    return FrontmatterParser.updateCustomFields(content, {
      customfield_10000: parentIssueKey,
    });
  }

  /**
   * Set component for epic
   */
  static setComponent(content: string, componentName: string): string {
    return FrontmatterParser.updateStandardFields(content, {
      components: [componentName],
    });
  }

  /**
   * Check if file has been synced to Jira
   */
  static isSynced(content: string): boolean {
    const parsed = FrontmatterParser.parseContent(content);
    return parsed.frontmatter.sync.issueKey !== null;
  }

  /**
   * Get issue key from frontmatter
   */
  static getIssueKey(content: string): string | null {
    const parsed = FrontmatterParser.parseContent(content);
    return parsed.frontmatter.sync.issueKey;
  }

  /**
   * Get last sync timestamp
   */
  static getLastSync(content: string): string | null {
    const parsed = FrontmatterParser.parseContent(content);
    return parsed.frontmatter.sync.lastSync;
  }

  /**
   * Get local hash
   */
  static getLocalHash(content: string): string | null {
    const parsed = FrontmatterParser.parseContent(content);
    return parsed.frontmatter.sync.localHash;
  }

  /**
   * Get remote hash
   */
  static getRemoteHash(content: string): string | null {
    const parsed = FrontmatterParser.parseContent(content);
    return parsed.frontmatter.sync.remoteHash;
  }

  /**
   * Create new frontmatter from template
   */
  static createFromTemplate(
    type: 'Epic' | 'Story' | 'Task',
    componentName?: string,
    parentIssueKey?: string,
    projectKey?: string
  ): FrontmatterData {
    if (!projectKey) {
      throw new Error('Project key is required when creating frontmatter template. Please provide a valid project key.');
    }
    
    const frontmatter: FrontmatterData = {
      standard: {
        project: projectKey,
        type,
        components: [],
        labels: [],
        status: null,
      },
      custom: {
        customfield_12401: 'IaC',
        customfield_12400: 'Private Cloud 2.0',
        customfield_10006: 0,
        customfield_10000: parentIssueKey || null,
      },
      sync: {
        issueKey: null,
        lastSync: null,
        localHash: null,
        remoteHash: null,
      },
    };

    // Only set components for EPICs
    if (type === 'Epic' && componentName) {
      frontmatter.standard.components = [componentName];
    }

    return frontmatter;
  }

  /**
   * Validate frontmatter structure
   */
  static validateFrontmatter(frontmatter: FrontmatterData): string[] {
    const errors: string[] = [];

    if (!frontmatter.standard.type) {
      errors.push('Missing required field: standard.type');
    }

    if (!frontmatter.standard.project) {
      errors.push('Missing required field: standard.project');
    }

    // Only validate components array for epics
    if (frontmatter.standard.type === 'Epic' && !Array.isArray(frontmatter.standard.components)) {
      errors.push('standard.components must be an array for epics');
    }

    if (!Array.isArray(frontmatter.standard.labels)) {
      errors.push('standard.labels must be an array');
    }

    if (typeof frontmatter.custom.customfield_10006 !== 'number') {
      errors.push('custom.customfield_10006 must be a number');
    }

    return errors;
  }
}

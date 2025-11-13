/**
 * Simple Mapper for converting properties to Jira API fields
 * Handles special Jira field structures like custom fields, arrays, and nested objects
 */

interface MappingResult {
  [jiraFieldPath: string]: unknown;
}

interface JiraFieldMapping {
  [propertyName: string]: string;
}

interface JiraFields {
  [fieldName: string]: unknown;
  fields?: {
    [fieldName: string]: unknown;
  };
}


export class SimpleMapper {
  /**
   * Convert properties to Jira API fields using mapping
   */
  mapPropertiesToJira(properties: Record<string, unknown>, mapping: JiraFieldMapping): MappingResult {
    const result: MappingResult = {};

    // Fields that cannot be updated via API (workflow fields, etc.)
    const readonlyFields = ['status', 'assignee', 'reporter', 'created', 'updated', 'resolution'];

    // Get issue type to determine if components should be skipped
    const issueType = properties.type as string;

    for (const [propertyName, apiPath] of Object.entries(mapping)) {
      const value = properties[propertyName];
      if (value !== undefined && value !== null) {
        // Skip readonly fields
        if (readonlyFields.includes(propertyName)) {
          console.log(`⚠️  Skipping readonly field: ${propertyName}`);
          continue;
        }

        // Skip components field for non-EPIC issue types
        if (propertyName === 'components' && issueType !== 'Epic') {
          console.log(`⚠️  Skipping components field for non-EPIC issue type: ${issueType}`);
          continue;
        }

        result[apiPath as string] = value;
      }
    }

    return result;
  }

  /**
   * Convert Jira API path to actual Jira field structure
   * Handles special field structures required by Jira API
   */
  convertToJiraFields(mappedFields: MappingResult): JiraFields {
    const fields: JiraFields = {};

    for (const [apiPath, value] of Object.entries(mappedFields)) {
      this.setNestedField(fields, apiPath, value);
    }

    // Return only the fields object, not the nested api.fields structure
    return fields.fields || fields;
  }

  /**
   * Set nested field with special handling for Jira field structures
   */
  private setNestedField(obj: JiraFields, path: string, value: unknown): void {
    // Handle special Jira field structures
    if (path.includes('customfield_')) {
      this.handleCustomField(obj, path, value);
      return;
    }

    if (path.includes('components[]')) {
      this.handleComponentsArray(obj, path, value);
      return;
    }

    if (path.includes('labels[]')) {
      this.handleLabelsArray(obj, path, value);
      return;
    }

    if (path.includes('issuetype')) {
      this.handleIssueType(obj, path, value);
      return;
    }

    if (path.includes('status')) {
      this.handleStatus(obj, path, value);
      return;
    }

    // Default nested field handling
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part] as JiraFields;
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Handle custom fields with proper Jira structure
   * Examples:
   * - api.fields.customfield_12401.value -> { customfield_12401: { value: "IaC" } }
   * - api.fields.customfield_10006 -> { customfield_10006: 5 }
   */
  private handleCustomField(obj: JiraFields, path: string, value: unknown): void {
    const parts = path.split('.');
    const customFieldId = parts.find((part) => part.startsWith('customfield_'));

    if (!customFieldId) return;

    // Check if it's a value-based custom field (like select fields)
    if (path.includes('.value')) {
      obj.fields = obj.fields || {};
      obj.fields[customFieldId] = { value: value };
    } else {
      // Direct value custom field (like number fields)
      obj.fields = obj.fields || {};
      obj.fields[customFieldId] = value;
    }
  }

  /**
   * Handle components array with proper Jira structure
   * Example: api.fields.components[].name -> { components: [{ name: "idp-infra" }] }
   */
  private handleComponentsArray(obj: JiraFields, _path: string, value: unknown): void {
    if (!Array.isArray(value)) {
      value = [value];
    }

    obj.fields = obj.fields || {};
    obj.fields.components = (value as unknown[]).map((component: unknown) => {
      if (typeof component === 'string') {
        return { name: component };
      }
      return component;
    });
  }

  /**
   * Handle labels array
   * Example: api.fields.labels[] -> { labels: ["IaC", "workspace"] }
   */
  private handleLabelsArray(obj: JiraFields, _path: string, value: unknown): void {
    if (!Array.isArray(value)) {
      value = [value];
    }

    obj.fields = obj.fields || {};
    obj.fields.labels = value;
  }

  /**
   * Handle issue type with proper Jira structure
   * Example: api.fields.issuetype.name -> { issuetype: { name: "Story" } }
   */
  private handleIssueType(obj: JiraFields, _path: string, value: unknown): void {
    obj.fields = obj.fields || {};
    obj.fields.issuetype = { name: value };
  }

  /**
   * Handle status with proper Jira structure
   * Example: api.fields.status.name -> { status: { name: "To Do" } }
   */
  private handleStatus(obj: JiraFields, _path: string, value: unknown): void {
    obj.fields = obj.fields || {};
    obj.fields.status = { name: value };
  }
}

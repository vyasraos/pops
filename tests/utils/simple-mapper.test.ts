import { describe, it, expect } from 'vitest';
import { SimpleMapper } from '../../src/utils/simple-mapper';

describe('SimpleMapper', () => {
  const mapper = new SimpleMapper();

  describe('mapPropertiesToJira', () => {
    it('should map properties to Jira API paths', () => {
      const properties = {
        workstream: 'IaC',
        initiative: 'Private Cloud 2.0',
        components: ['idp-infra'],
        labels: ['IaC', 'workspace'],
        points: 5
      };

      const mapping = {
        workstream: 'api.fields.customfield_12401.value',
        initiative: 'api.fields.customfield_12400.value',
        components: 'api.fields.components[].name',
        labels: 'api.fields.labels[]',
        points: 'api.fields.customfield_10006'
      };

      const result = mapper.mapPropertiesToJira(properties, mapping);

      expect(result).toEqual({
        'api.fields.customfield_12401.value': 'IaC',
        'api.fields.customfield_12400.value': 'Private Cloud 2.0',
        'api.fields.components[].name': ['idp-infra'],
        'api.fields.labels[]': ['IaC', 'workspace'],
        'api.fields.customfield_10006': 5
      });
    });

    it('should skip undefined and null values', () => {
      const properties = {
        workstream: 'IaC',
        initiative: null,
        points: undefined
      };

      const mapping = {
        workstream: 'api.fields.customfield_12401.value',
        initiative: 'api.fields.customfield_12400.value',
        points: 'api.fields.customfield_10006'
      };

      const result = mapper.mapPropertiesToJira(properties, mapping);

      expect(result).toEqual({
        'api.fields.customfield_12401.value': 'IaC'
      });
    });
  });

  describe('convertToJiraFields', () => {
    it('should convert custom fields with .value to proper structure', () => {
      const mappedFields = {
        'api.fields.customfield_12401.value': 'IaC',
        'api.fields.customfield_12400.value': 'Private Cloud 2.0'
      };

      const result = mapper.convertToJiraFields(mappedFields);

      expect(result).toEqual({
        customfield_12401: { value: 'IaC' },
        customfield_12400: { value: 'Private Cloud 2.0' }
      });
    });

    it('should convert direct custom fields without .value', () => {
      const mappedFields = {
        'api.fields.customfield_10006': 5
      };

      const result = mapper.convertToJiraFields(mappedFields);

      expect(result).toEqual({
        customfield_10006: 5
      });
    });

    it('should convert components array to proper structure', () => {
      const mappedFields = {
        'api.fields.components[].name': ['idp-infra', 'cp-bm-mgmt']
      };

      const result = mapper.convertToJiraFields(mappedFields);

      expect(result).toEqual({
        components: [
          { name: 'idp-infra' },
          { name: 'cp-bm-mgmt' }
        ]
      });
    });

    it('should convert labels array', () => {
      const mappedFields = {
        'api.fields.labels[]': ['IaC', 'workspace', 'infra']
      };

      const result = mapper.convertToJiraFields(mappedFields);

      expect(result).toEqual({
        labels: ['IaC', 'workspace', 'infra']
      });
    });

    it('should convert issue type to proper structure', () => {
      const mappedFields = {
        'api.fields.issuetype.name': 'Story'
      };

      const result = mapper.convertToJiraFields(mappedFields);

      expect(result).toEqual({
        issuetype: { name: 'Story' }
      });
    });

    it('should convert status to proper structure', () => {
      const mappedFields = {
        'api.fields.status.name': 'To Do'
      };

      const result = mapper.convertToJiraFields(mappedFields);

      expect(result).toEqual({
        status: { name: 'To Do' }
      });
    });

    it('should handle mixed field types', () => {
      const mappedFields = {
        'api.fields.customfield_12401.value': 'IaC',
        'api.fields.customfield_10006': 5,
        'api.fields.components[].name': ['idp-infra'],
        'api.fields.labels[]': ['IaC', 'workspace'],
        'api.fields.issuetype.name': 'Story',
        'api.fields.status.name': 'To Do'
      };

      const result = mapper.convertToJiraFields(mappedFields);

      expect(result).toEqual({
        customfield_12401: { value: 'IaC' },
        customfield_10006: 5,
        components: [{ name: 'idp-infra' }],
        labels: ['IaC', 'workspace'],
        issuetype: { name: 'Story' },
        status: { name: 'To Do' }
      });
    });
  });
});

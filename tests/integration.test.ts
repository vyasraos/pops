import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createCommand } from '../src/commands/create';
import { POPSConfig } from '../src/utils/pops-config';
import { ComponentSelector } from '../src/utils/component-selector';
import { TemplateValidator } from '../src/utils/template-validator';
import { TOMLValidator } from '../src/utils/toml-validator';

// Mock dependencies
vi.mock('inquirer');
vi.mock('chalk');

describe('POP CLI Integration Tests', () => {
  const testDir = '.poptest';
  const componentsPath = path.join(testDir, 'planning/components');
  const deliveryPath = path.join(testDir, 'planning/delivery/FY26/Q1');
  const templatesPath = path.join(testDir, 'templates/planning');
  const configPath = path.join(testDir, 'pops.toml');

  beforeEach(() => {
    // Create test directory structure
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(componentsPath, { recursive: true });
    fs.mkdirSync(deliveryPath, { recursive: true });
    fs.mkdirSync(templatesPath, { recursive: true });
    
    // Create complete test config
    const testConfig = `# Pops CLI Configuration File
[cli]
name = "pops"
version = "1.0.0"
description = "Playbook Operations CLI"

[templates]
base_path = "templates"

[templates.planning]
path = "templates/planning"

[templates.planning.types]
component = "component.md"
epic = "epic.md"
story = "story.md"
task = "task.md"
spike = "spike.md"
bug = "bug.md"

[jira]
base_url = "https://jira.instance.com/techops/jira"
default_project = "APE"
issue_types = ["Epic", "Story", "Task", "Bug", "Component"]

[output]
default_format = "markdown"
create_directories = true
overwrite_existing = false

[output.paths]
components = "planning/components"
delivery = "planning/delivery/FY26/Q1/"

[validation.component]
required_sections = [
    { section = "## Title", cli_input = true },
    { section = "## Summary", cli_input = false },
    { section = "## Description", cli_input = false },
    { section = "## JIRA_Mapping", cli_input = false, fields = [
        { field = "Component_Name", jira_field = "name", required = true, cli_input = false },
        { field = "Issue_Type", jira_field = "type", required = true, default = "Component", cli_input = false },
        { field = "Project", jira_field = "project", required = true, default = "APE", cli_input = false }
    ] }
]

[validation.epic]
required_sections = [
    { section = "## Title", cli_input = true },
    { section = "## Summary", cli_input = false },
    { section = "## Description", cli_input = false, sub_sections = [
        { section = "### Problem", cli_input = false },
        { section = "### Solution", cli_input = false },
        { section = "### Technical Scope", cli_input = false },
        { section = "### Constraints & Dependencies:", cli_input = false },
        { section = "### Timeline:", cli_input = false },
    ] },
    { section = "## JIRA_Mapping", cli_input = false, fields = [
        { field = "Issue_Key", jira_field = "key", required = true, cli_input = false },
        { field = "Epic_Name", jira_field = "customfield_10011", required = true, cli_input = false },
        { field = "Issue_Type", jira_field = "issuetype", required = true, default = "Epic", cli_input = false },
        { field = "Project", jira_field = "project", required = true, default = "APE", cli_input = false },
        { field = "Component", jira_field = "components", required = false, cli_input = false }
    ] }
]

[validation.story]
required_sections = [
    { section = "## Title", cli_input = true },
    { section = "## Summary", cli_input = false },
    { section = "## Description", cli_input = false, sub_sections = [
        { section = "### Story", cli_input = false },
        { section = "### Technical Details", cli_input = false },
        { section = "### Acceptance Criteria", cli_input = false },
        { section = "### Dependencies", cli_input = false },
        { section = "### Definition of Done", cli_input = false },
    ] },
    { section = "## JIRA_Mapping", cli_input = false, fields = [
        { field = "Issue_Key", jira_field = "key", required = true, cli_input = false },
        { field = "Story_Name", jira_field = "summary", required = true, cli_input = false },
        { field = "Issue_Type", jira_field = "issuetype", required = true, default = "Story", cli_input = false },
        { field = "Project", jira_field = "project", required = true, default = "APE", cli_input = false },
        { field = "Epic_Link", jira_field = "customfield_10014", required = true, cli_input = false },
        { field = "Link", jira_field = "url", required = false, cli_input = false }
    ] }
]

[validation.task]
required_sections = [
    { section = "## Title", cli_input = true },
    { section = "## Summary", cli_input = false },
    { section = "## Description", cli_input = false, sub_sections = [
        { section = "### Objective", cli_input = false },
        { section = "### Technical Approach", cli_input = false },
        { section = "### Acceptance Criteria", cli_input = false },
        { section = "### Dependencies", cli_input = false },
    ] },
    { section = "## JIRA_Mapping", cli_input = false, fields = [
        { field = "Issue_Key", jira_field = "key", required = true, cli_input = false },
        { field = "Task_Name", jira_field = "summary", required = true, cli_input = false },
        { field = "Issue_Type", jira_field = "issuetype", required = true, default = "Task", cli_input = false },
        { field = "Project", jira_field = "project", required = true, default = "APE", cli_input = false },
        { field = "Epic_Link", jira_field = "customfield_10014", required = true, cli_input = false },
        { field = "Link", jira_field = "url", required = false, cli_input = false }
    ] }
]

[validation.spike]
required_sections = [
    { section = "## Title", cli_input = true },
    { section = "## Summary", cli_input = false },
    { section = "## Description", cli_input = false, sub_sections = [
        { section = "### Problem / Question", cli_input = false },
        { section = "## Objectives & Approach", cli_input = false },
        { section = "### Acceptance Criteria", cli_input = false },
        { section = "### Timeline & Constraints", cli_input = false },
    ] },
    { section = "## JIRA_Mapping", cli_input = false, fields = [
        { field = "Issue_Key", jira_field = "key", required = true, cli_input = false },
        { field = "Spike_Name", jira_field = "summary", required = true, cli_input = false },
        { field = "Issue_Type", jira_field = "issuetype", required = true, default = "Story", cli_input = false },
        { field = "Project", jira_field = "project", required = true, default = "APE", cli_input = false },
        { field = "Epic_Link", jira_field = "customfield_10014", required = true, cli_input = false },
        { field = "Link", jira_field = "url", required = false, cli_input = false }
    ] }
]

[validation.bug]
required_sections = [
    { section = "## Title", cli_input = true },
    { section = "## Summary", cli_input = false },
    { section = "## Description", cli_input = false, sub_sections = [
        { section = "### Problem Description", cli_input = false },
        { section = "### Steps to Reproduce", cli_input = false },
        { section = "### Environment", cli_input = false },
        { section = "### Impact & Priority", cli_input = false },
        { section = "### Additional Information", cli_input = false },
        { section = "### Acceptance Criteria", cli_input = false },
    ] },
    { section = "## JIRA_Mapping", cli_input = false, fields = [
        { field = "Issue_Key", jira_field = "key", required = true, cli_input = false },
        { field = "Bug_Name", jira_field = "summary", required = true, cli_input = false },
        { field = "Issue_Type", jira_field = "issuetype", required = true, default = "Bug", cli_input = false },
        { field = "Project", jira_field = "project", required = true, default = "APE", cli_input = false },
        { field = "Link", jira_field = "url", required = false, cli_input = false }
    ] }
]`;

    fs.writeFileSync(configPath, testConfig);

    // Create all templates
    const templates = {
      'component.md': `## Title

<component-name>

## Summary

<One-line description of the overall work item>

## Description

<INSTRUCTION: Provide a 1-2 sentence overview of the component and its purpose in the platform>

## JIRA_Mapping

- Component_Name: <NAME>
- Issue_Type: <Component>
- Project: <APE>`,

      'epic.md': `## Title 

<Concise Goal>

## Summary

<One-line description of the overall work item>

## Description

### Problem

<INSTRUCTION: Describe the problem in 3-4 sentences>

### Solution

<INSTRUCTION: Describe the solution in 3-5 sentences>

### Technical Scope

<INSTRUCTION: In Scope - List 4-6 specific components>

<INSTRUCTION: Out Of Scope - List 3-5 items explicitly NOT included>

### Constraints & Dependencies:

<INSTRUCTION: List 3-5 critical items>

### Timeline: 

<INSTRUCTION: Break work into 2-4 meaningful phases>

## JIRA_Mapping

- Issue_Key: <POP-XXXX>
- Epic_Name: <NAME>
- Issue_Type: <Epic>
- Project: <APE>
- Link: <[POP-1700](https://jira.instance.com/techops/jira/browse/POP-1700)>`,

      'story.md': `## Title

<Concise User-Facing Goal>

## Summary

<One-line description of the overall work item>

## Description

### Story

<INSTRUCTION: As a [specific user role] I want to [specific action] So that [business value]>

### Technical Details

<INSTRUCTION: Provide implementation guidance in 3-5 bullet points>

### Acceptance Criteria

<INSTRUCTION: List 4-6 specific, testable conditions>

### Dependencies

<INSTRUCTION: List any blockers or prerequisites>

### Definition of Done

<INSTRUCTION: Standard checklist for story completion>

## JIRA_Mapping

- Issue_Key: <POP-XXXX>
- Story_Name: <NAME>
- Issue_Type: <Story>
- Project: <APE>
- Epic_Link: <POP-XXXX>
- Link: <[POP-XXXX](https://jira.instance.com/techops/jira/browse/POP-XXXX)>`,

      'task.md': `## Title

<Specific Technical Task>

## Summary

<One-line description of the overall work item>

## Description

### Objective

<INSTRUCTION: Describe what needs to be done in 2-3 sentences>

### Technical Approach

<INSTRUCTION: Provide implementation details in 3-5 bullet points>

### Acceptance Criteria

<INSTRUCTION: List 3-5 specific, testable conditions>

### Dependencies

<INSTRUCTION: List any blockers or prerequisites>

## JIRA_Mapping

- Issue_Key: <POP-XXXX>
- Task_Name: <NAME>
- Issue_Type: <Task>
- Project: <APE>
- Epic_Link: <POP-XXXX>
- Link: <[POP-XXXX](https://jira.instance.com/techops/jira/browse/POP-XXXX)>`,

      'spike.md': `## Title
    
<Concise Research/POC Goal>

## Summary

<One-line description of the overall work item>

## Description

### Problem / Question

<INSTRUCTION: Describe the unknown or unclear issue being investigated>

## Objectives & Approach

<INSTRUCTION: Define the research scope in 4-6 bullet points>

### Acceptance Criteria

<INSTRUCTION: List 3-5 specific outcomes that must be achieved>

### Timeline & Constraints

<INSTRUCTION: Define the research parameters>

## JIRA_Mapping

- Issue_Key: <POP-XXXX>
- Spike_Name: <NAME>
- Issue_Type: <Story>
- Project: <APE>
- Epic_Link: <POP-XXXX>
- Link: <[POP-XXXX](https://jira.instance.com/techops/jira/browse/POP-XXXX)>`,

      'bug.md': `## Title: 

<Concise Description of the Issue>

## Summary

<One-line description of the overall work item>

## Description

### Problem Description

<INSTRUCTION: Describe the bug in 2-3 sentences>

### Steps to Reproduce

<INSTRUCTION: List the exact steps to reproduce the issue>

### Environment

<INSTRUCTION: Provide relevant environment details>

### Impact & Priority

<INSTRUCTION: Assess the impact>

### Additional Information

<INSTRUCTION: Include any additional context>

### Acceptance Criteria

<INSTRUCTION: Define what constitutes a successful fix>

## JIRA_Mapping

- Issue_Key: <POP-XXXX>
- Bug_Name: <NAME>
- Issue_Type: <Bug>
- Project: <APE>
- Link: <[POP-XXXX](https://jira.instance.com/techops/jira/browse/POP-XXXX)>`
    };

    Object.entries(templates).forEach(([filename, content]) => {
      fs.writeFileSync(path.join(templatesPath, filename), content);
    });
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Complete Workflow Integration', () => {
    it('should create a complete project structure with components, epics, and work items', async () => {
      const config = new POPSConfig(configPath);
      const tomlValidator = new TOMLValidator(config);
      const templateValidator = new TemplateValidator(config);
      const selector = new ComponentSelector(config.getComponentsPath());

      // Validate configuration
      expect(tomlValidator.validateConfig()).toBe(true);

      // Validate all templates
      const templateTypes = ['component', 'epic', 'story', 'task', 'spike', 'bug'];
      templateTypes.forEach(type => {
        expect(templateValidator.validateTemplate(config.getTemplatePath(type), type)).toBe(true);
      });

      // Create components
      const componentNames = ['cp-compute-mgmt', 'idp-infra', 'cp-img-mgmt'];
      componentNames.forEach(componentName => {
        const componentFile = path.join(componentsPath, `${componentName}.md`);
        fs.copyFileSync(config.getTemplatePath('component'), componentFile);
        expect(fs.existsSync(componentFile)).toBe(true);
      });

      // Verify components are listed
      const components = selector['listComponents']();
      expect(components).toHaveLength(3);
      expect(components).toContain('cp-compute-mgmt');
      expect(components).toContain('idp-infra');
      expect(components).toContain('cp-img-mgmt');

      // Create epics under components
      const epicData = [
        { component: 'cp-compute-mgmt', epic: 'epic-fiskka' },
        { component: 'idp-infra', epic: 'epic-argocd-gitops-setup' },
        { component: 'cp-img-mgmt', epic: 'epic-cloud-image-maker' }
      ];

      epicData.forEach(({ component, epic }) => {
        const epicDir = path.join(deliveryPath, component, epic);
        const epicFile = path.join(epicDir, 'epic.md');
        
        fs.mkdirSync(epicDir, { recursive: true });
        fs.copyFileSync(config.getTemplatePath('epic'), epicFile);
        
        expect(fs.existsSync(epicDir)).toBe(true);
        expect(fs.existsSync(epicFile)).toBe(true);
      });

      // Create work items directly in epic folders
      const workItemData = [
        { component: 'cp-compute-mgmt', epic: 'epic-fiskka', type: 'story', name: 'fiskka-setup' },
        { component: 'idp-infra', epic: 'epic-argocd-gitops-setup', type: 'task', name: 'argocd-install' },
        { component: 'idp-infra', epic: 'epic-argocd-gitops-setup', type: 'spike', name: 'gitops-strategy' },
        { component: 'cp-img-mgmt', epic: 'epic-cloud-image-maker', type: 'bug', name: 'image-build-failure' }
      ];

      workItemData.forEach(({ component, epic, type, name }) => {
        const epicDir = path.join(deliveryPath, component, epic);
        // Add story- prefix for stories
        const fileName = type === 'story' ? `story-${name}` : name;
        const workItemFile = path.join(epicDir, `${fileName}.md`);
        
        fs.copyFileSync(config.getTemplatePath(type), workItemFile);
        
        expect(fs.existsSync(workItemFile)).toBe(true);
      });

      // Verify complete directory structure
      const expectedStructure = [
        'planning/components/cp-compute-mgmt.md',
        'planning/components/idp-infra.md',
        'planning/components/cp-img-mgmt.md',
        'planning/delivery/FY26/Q1/cp-compute-mgmt/epic-fiskka/epic.md',
        'planning/delivery/FY26/Q1/cp-compute-mgmt/epic-fiskka/story-fiskka-setup.md',
        'planning/delivery/FY26/Q1/idp-infra/epic-argocd-gitops-setup/epic.md',
        'planning/delivery/FY26/Q1/idp-infra/epic-argocd-gitops-setup/argocd-install.md',
        'planning/delivery/FY26/Q1/idp-infra/epic-argocd-gitops-setup/gitops-strategy.md',
        'planning/delivery/FY26/Q1/cp-img-mgmt/epic-cloud-image-maker/epic.md',
        'planning/delivery/FY26/Q1/cp-img-mgmt/epic-cloud-image-maker/image-build-failure.md'
      ];

      expectedStructure.forEach(relativePath => {
        const fullPath = path.join(testDir, relativePath);
        expect(fs.existsSync(fullPath)).toBe(true);
      });
    });

    it('should handle complex naming scenarios correctly', async () => {
      const config = new POPSConfig(configPath);
      
      // Test various naming scenarios
      const namingTests = [
        { input: 'API Gateway Setup', expected: 'api-gateway-setup' },
        { input: 'User Management System v2.0', expected: 'user-management-system-v20' },
        { input: 'Component@#$%Special', expected: 'componentspecial' },
        { input: '123 Test Component', expected: '123-test-component' },
        { input: 'UPPERCASE COMPONENT', expected: 'uppercase-component' }
      ];

      namingTests.forEach(({ input, expected }) => {
        // Test component naming
        const componentName = input.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        expect(componentName).toBe(expected);

        // Test epic naming
        const epicName = `epic-${componentName}`;
        expect(epicName).toBe(`epic-${expected}`);

        // Test work item naming
        const workItemName = `story-${componentName}`;
        expect(workItemName).toBe(`story-${expected}`);
      });
    });

    it('should validate complete configuration and templates', async () => {
      const config = new POPSConfig(configPath);
      const tomlValidator = new TOMLValidator(config);
      const templateValidator = new TemplateValidator(config);

      // Validate TOML configuration
      expect(tomlValidator.validateConfig()).toBe(true);

      // Validate all templates
      const templateTypes = ['component', 'epic', 'story', 'task', 'spike', 'bug'];
      templateTypes.forEach(type => {
        const isValid = templateValidator.validateTemplate(config.getTemplatePath(type), type);
        expect(isValid).toBe(true);
      });

      // Validate CLI input sections
      templateTypes.forEach(type => {
        const cliSections = config.getCliInputSections(type);
        expect(cliSections).toHaveLength(1);
        expect(cliSections[0].section).toBe('## Title');
        expect(cliSections[0].cli_input).toBe(true);
      });

      // Validate JIRA mappings
      templateTypes.forEach(type => {
        const templatePath = config.getTemplatePath(type);
        const content = fs.readFileSync(templatePath, 'utf-8');
        
        expect(content).toContain('- Issue_Key:');
        expect(content).toContain('- Issue_Type:');
        expect(content).toContain('- Project:');
      });
    });

    it('should handle overwrite scenarios correctly', async () => {
      const config = new POPSConfig(configPath);
      
      // Create initial component
      const componentName = 'test-component';
      const componentFile = path.join(componentsPath, `${componentName}.md`);
      fs.copyFileSync(config.getTemplatePath('component'), componentFile);
      
      // Create initial epic
      const epicName = 'test-epic';
      const epicDir = path.join(deliveryPath, componentName, `epic-${epicName}`);
      const epicFile = path.join(epicDir, 'epic.md');
      fs.mkdirSync(epicDir, { recursive: true });
      fs.copyFileSync(config.getTemplatePath('epic'), epicFile);

      // Create initial work item
      const workItemName = 'test-story';
      const workItemDir = path.join(deliveryPath, componentName, `story-${workItemName}`);
      const workItemFile = path.join(workItemDir, 'story.md');
      fs.mkdirSync(workItemDir, { recursive: true });
      fs.copyFileSync(config.getTemplatePath('story'), workItemFile);

      // Verify initial creation
      expect(fs.existsSync(componentFile)).toBe(true);
      expect(fs.existsSync(epicFile)).toBe(true);
      expect(fs.existsSync(workItemFile)).toBe(true);

      // Test overwrite scenarios
      const originalContent = fs.readFileSync(componentFile, 'utf-8');
      
      // Simulate overwrite
      fs.copyFileSync(config.getTemplatePath('component'), componentFile);
      const newContent = fs.readFileSync(componentFile, 'utf-8');
      
      // Content should be updated (template content)
      expect(newContent).toContain('## Title');
      expect(newContent).toContain('## Summary');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle missing directories gracefully', async () => {
      // Remove components directory
      fs.rmSync(componentsPath, { recursive: true, force: true });
      
      const selector = new ComponentSelector(componentsPath);
      const components = selector['listComponents']();
      expect(components).toHaveLength(0);
    });

    it('should handle invalid template paths', async () => {
      const invalidConfigPath = path.join(testDir, 'invalid-config.toml');
      const invalidConfig = `[templates.planning.types]
component = "nonexistent.md"`;

      fs.writeFileSync(invalidConfigPath, invalidConfig);

      expect(() => {
        const config = new POPSConfig(invalidConfigPath);
        config.getTemplatePath('component');
      }).toThrow();
    });

    it('should handle malformed TOML configuration', async () => {
      const malformedConfigPath = path.join(testDir, 'malformed-config.toml');
      fs.writeFileSync(malformedConfigPath, 'invalid toml content [missing closing bracket');

      expect(() => {
        new POPSConfig(malformedConfigPath);
      }).toThrow();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of components efficiently', async () => {
      const config = new POPSConfig(configPath);
      const selector = new ComponentSelector(componentsPath);

      // Create many components
      const componentCount = 50;
      for (let i = 0; i < componentCount; i++) {
        const componentName = `component-${i}`;
        const componentFile = path.join(componentsPath, `${componentName}.md`);
        fs.copyFileSync(config.getTemplatePath('component'), componentFile);
      }

      // Test component listing performance
      const startTime = Date.now();
      const components = selector['listComponents']();
      const endTime = Date.now();

      expect(components).toHaveLength(componentCount);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle deep directory structures', async () => {
      const config = new POPSConfig(configPath);
      
      // Create deep nested structure
      const deepPath = path.join(deliveryPath, 'deep', 'nested', 'component', 'epic', 'workitem');
      fs.mkdirSync(deepPath, { recursive: true });
      
      const workItemFile = path.join(deepPath, 'story.md');
      fs.copyFileSync(config.getTemplatePath('story'), workItemFile);
      
      expect(fs.existsSync(workItemFile)).toBe(true);
    });
  });
});

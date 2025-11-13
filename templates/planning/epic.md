---
properties:
  key: null
  type: Epic
  workstream: IaC
  initiative: Private Cloud 2.0
  labels: []
  status: null
  points: null
  components: []
mapping:
  key: api.key
  type: api.fields.issuetype.name
  workstream: api.fields.customfield_12401.value
  initiative: api.fields.customfield_12400.value
  labels: api.fields.labels[]
  status: api.fields.status.name
  points: api.fields.customfield_10006
  components: api.fields.components[].name
---

# Epic Template

## Title
{{epic_title}}

## Summary
{{epic_summary}}

## Description

### Problem
Description of the problem this epic aims to solve.

### Solution
High-level solution approach and strategy.

### Technical Scope
Technical components and systems involved.

### Constraints & Dependencies:
Any limitations, dependencies, or external factors.

### Timeline:
Key milestones and timeline considerations.

## JIRA_Mapping
- Issue_Key: {{issue_key}}
- Epic_Name: {{epic_name}}
- Issue_Type: Epic
- Project: APE
- Component: {{component}}
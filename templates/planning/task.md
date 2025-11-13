---
properties:
  key: null
  type: Task
  workstream: IaC
  initiative: Private Cloud 2.0
  labels: []
  status: null
  points: null
mapping:
  key: api.key
  type: api.fields.issuetype.name
  workstream: api.fields.customfield_12401.value
  initiative: api.fields.customfield_12400.value
  labels: api.fields.labels[]
  status: api.fields.status.name
  points: api.fields.customfield_10006
---

# Task Template

## Title
{{task_title}}

## Summary
Brief description of the task and its purpose.

## Description

### Objective
Clear statement of what needs to be accomplished.

### Technical Approach
How the task will be implemented technically.

### Acceptance Criteria
Specific criteria that must be met:
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

### Dependencies
Any prerequisites or dependencies that must be completed first.

## JIRA_Mapping
- Issue_Key: {{issue_key}}
- Task_Name: {{task_name}}
- Issue_Type: Task
- Project: APE
---
properties:
  key: null
  type: Story
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

# Story Template

## Title
{{story_title}}

## Summary
{{story_summary}}

## Description

### Story
User story description in the format: "As a [user], I want [goal] so that [benefit]"

### Technical Details
Technical implementation details and considerations.

### Acceptance Criteria
Clear, testable criteria for story completion:
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

### Dependencies
Any dependencies on other stories, epics, or external factors.

### Definition of Done
Checklist of what must be completed for the story to be considered done.

## JIRA_Mapping
- Issue_Key: {{issue_key}}
- Story_Name: {{story_name}}
- Issue_Type: Story
- Project: APE
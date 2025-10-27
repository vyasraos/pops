# POPS Command Data Source Matrix

This document provides a comprehensive overview of all POPS commands, their data sources, and data flow patterns.

## Overview

POPS (Playbook Operations CLI) operates on two main data sources:
- **Jira API**: Remote issue management system
- **Local Files**: Markdown files in workspace and JSON data files

## Data Flow Patterns

### 1. Jira → File (Download/Import)
Commands that fetch data from Jira and create local files.

### 2. File → Jira (Upload/Export)  
Commands that read local files and update Jira.

### 3. File → File (Local Processing)
Commands that process local files without Jira interaction.

### 4. Interactive (User Input → Jira)
Commands that create new data based on user input.

---

## Command Matrix

| Command | Data Source | Data Destination | Flow Pattern | Primary Service | Description |
|---------|-------------|------------------|--------------|-----------------|-------------|
| `fetch-issues` | Jira API | `_data/*.json` | Jira → File | `JiraDataService` | Downloads epics and issues as raw JSON |
| `process-issue` | `_data/*.json` | `planning/increments/*.md` | File → File | `MarkdownProcessor` | Converts JSON to markdown files |
| `create-issue` | User Input | Jira API + `_workspace/*.md` | Interactive → Jira + File | `JiraApiClient` | Creates new issue in Jira and local file |
| `update-issue` | `_workspace/*.md` | Jira API | File → Jira | `JiraApiClient` | Updates Jira from local markdown file |
| `promote-issue` | `_workspace/*.md` | Jira API | File → Jira | `JiraApiClient` | Moves issue from workspace to increment |
| `rework-issue` | Jira API | `_workspace/*.md` | Jira → File | `JiraApiClient` | Fetches issue and creates workspace file |
| `validate-issue` | `_workspace/*.md` or Jira API | Console Output | File → Console or Jira → File → Console | `IssueValidator` | Validates issue structure and content |
| `validate` | `pops.toml` | Console Output | File → Console | `POPSConfig` | Validates configuration and dependencies |

---

## Detailed Command Analysis

### 1. `fetch-issues` (Jira → File)

**Purpose**: Downloads epics and their children from Jira and stores as raw JSON.

**Data Flow**:
```
Jira API → JiraDataService → _data/{component}/{epic}/{issue}.json
```

**Key Components**:
- **Service**: `JiraDataService`
- **API Client**: `JiraApiClient`
- **Input**: Component names from `.config/scope.yaml` or command line
- **Output**: JSON files in `_data/{component}/{epic}/` structure

**File Structure Created**:
```
_data/
├── idp-infra/
│   ├── epic-1/
│   │   ├── GVT-1001.json
│   │   └── GVT-1002.json
│   └── epic-2/
│       └── GVT-1003.json
└── cp-img-mgmt/
    └── epic-3/
        └── GVT-1004.json
```

**Usage**:
```bash
pops fetch-issues                    # All components
pops fetch-issues --component idp-infra  # Specific component
pops fetch-issues --issue GVT-1234  # Single issue
```

---

### 2. `process-issue` (File → File)

**Purpose**: Converts raw JSON data to structured markdown files.

**Data Flow**:
```
_data/*.json → MarkdownProcessor → planning/increments/{target}/*.md
```

**Key Components**:
- **Service**: `MarkdownProcessor`
- **Input**: JSON files from `_data/` directory
- **Output**: Markdown files in `planning/increments/` structure

**File Structure Created**:
```
planning/increments/
├── FY26Q1/
│   ├── idp-infra/
│   │   ├── epic-GVT-1001.md
│   │   └── story-GVT-1002.md
│   └── cp-img-mgmt/
│       └── epic-GVT-1004.md
└── _workspace/
    └── story-GVT-1003.md
```

**Usage**:
```bash
pops process-issue                   # All issues
pops process-issue --issue GVT-1234 # Single issue
pops process-issue --dry-run         # Preview changes
```

---

### 3. `create-issue` (Interactive → Jira + File)

**Purpose**: Creates new issues in Jira and generates local markdown files.

**Data Flow**:
```
User Input → IssueCreator → Jira API + _workspace/*.md
```

**Key Components**:
- **Service**: `IssueCreator`
- **API Client**: `JiraApiClient`
- **Input**: Interactive prompts for issue details
- **Output**: New Jira issue + markdown file in `_workspace/`

**Interactive Prompts**:
1. Issue Type (Epic, Story, Task, Bug)
2. Summary
3. Description
4. Component
5. Epic (for Stories/Tasks)
6. Labels

**Usage**:
```bash
pops create-issue
```

---

### 4. `update-issue` (File → Jira)

**Purpose**: Updates Jira issues from local markdown files.

**Data Flow**:
```
_workspace/*.md → IssueUpdater → Jira API
```

**Key Components**:
- **Service**: `IssueUpdater`
- **API Client**: `JiraApiClient`
- **Mapper**: `SimpleMapper` (for field mapping)
- **Input**: Markdown file with frontmatter
- **Output**: Updated Jira issue

**Process**:
1. Find markdown file by issue key
2. Parse frontmatter and content
3. Apply field mappings if configured
4. Update Jira issue via API

**Usage**:
```bash
pops update-issue GVT-1234
```

---

### 5. `promote-issue` (File → Jira)

**Purpose**: Moves issues from workspace to specific increments.

**Data Flow**:
```
_workspace/*.md → IssuePromoter → Jira API (label update)
```

**Key Components**:
- **Service**: `IssuePromoter`
- **API Client**: `JiraApiClient`
- **Input**: Markdown file in `_workspace/`
- **Output**: Updated Jira issue with new labels

**Process**:
1. Find markdown file by issue key
2. Verify issue has 'workspace' label
3. Get promotion targets from `.config/scope.yaml`
4. Update Jira issue labels (remove 'workspace', add target label)

**Usage**:
```bash
pops promote-issue GVT-1234
pops promote-issue GVT-1234 --target FY26Q1
```

---

### 6. `rework-issue` (Jira → File)

**Purpose**: Fetches issues from Jira and creates workspace files for editing.

**Data Flow**:
```
Jira API → IssueReworker → _workspace/*.md
```

**Key Components**:
- **Service**: `IssueReworker`
- **API Client**: `JiraApiClient`
- **Input**: Issue key
- **Output**: Markdown file in `_workspace/`

**Process**:
1. Check if issue exists in workspace
2. If not found, fetch from Jira
3. Add 're-workspace' label to Jira issue
4. Generate markdown file with frontmatter
5. Save to appropriate workspace directory

**Usage**:
```bash
pops rework-issue GVT-1234
```

---

### 7. `validate-issue` (File → Console or Jira → File → Console)

**Purpose**: Validates issue structure and content against templates.

**Data Flow**:
```
_workspace/*.md → IssueValidator → Console Output
OR
Jira API → IssueValidator → _workspace/*.md → Console Output
```

**Key Components**:
- **Service**: `IssueValidator`
- **API Client**: `JiraApiClient` (if issue not found locally)
- **Data Service**: `JiraDataService` (for fetching)
- **Processor**: `MarkdownProcessor` (for processing)
- **Input**: Issue key or file path
- **Output**: Validation results to console

**Process**:
1. Find issue file locally or fetch from Jira
2. Parse markdown content and frontmatter
3. Validate against template specifications
4. Report validation results

**Usage**:
```bash
pops validate-issue GVT-1234
pops validate-issue --all
pops validate-issue --component idp-infra
```

---

### 8. `validate` (File → Console)

**Purpose**: Validates POPS configuration and dependencies.

**Data Flow**:
```
pops.toml → ConfigValidator → Console Output
```

**Key Components**:
- **Service**: `ConfigValidator`
- **Config**: `POPSConfig`
- **Schema**: `POPSConfigSchema`
- **Input**: Configuration file
- **Output**: Validation results to console

**Validation Checks**:
1. TOML file exists and is readable
2. Required configuration sections present
3. Jira configuration valid
4. Dependencies available
5. File paths accessible

**Usage**:
```bash
pops validate
pops validate --config custom.toml
```

---

## Data Storage Locations

### Input Data Sources
- **Jira API**: Remote issue management system
- **`_data/`**: Raw JSON data from Jira
- **`_workspace/`**: Markdown files for editing
- **`planning/increments/`**: Organized markdown files by increment
- **`pops.toml`**: Configuration file
- **`.config/scope.yaml`**: Component and promotion configuration

### Output Destinations
- **Jira API**: Updated issues, new issues, label changes
- **`_data/`**: Downloaded raw JSON data
- **`_workspace/`**: New or reworked markdown files
- **`planning/increments/`**: Processed markdown files
- **Console**: Validation results, status messages

---

## Service Dependencies

### Core Services
- **`JiraApiClient`**: Handles all Jira API interactions
- **`JiraDataService`**: Manages data fetching and storage
- **`MarkdownProcessor`**: Converts between JSON and markdown
- **`POPSConfig`**: Manages configuration
- **`SimpleMapper`**: Handles field mapping for updates

### Utility Services
- **`IssueValidator`**: Validates issue content and structure
- **`ConfigValidator`**: Validates configuration
- **`Logger`**: Centralized logging

---

## Command Interaction Patterns

### Sequential Workflows
1. **Data Import**: `fetch-issues` → `process-issue`
2. **Issue Creation**: `create-issue` → `update-issue` → `promote-issue`
3. **Issue Rework**: `rework-issue` → `update-issue` → `promote-issue`
4. **Validation**: `validate` → `validate-issue`

### Parallel Operations
- Multiple `update-issue` commands can run simultaneously
- Multiple `validate-issue` commands can run in parallel
- `fetch-issues` can process multiple components concurrently

---

## Error Handling

### Common Error Scenarios
1. **Jira API Errors**: Network issues, authentication failures, rate limiting
2. **File System Errors**: Missing files, permission issues, disk space
3. **Configuration Errors**: Invalid TOML, missing required fields
4. **Data Validation Errors**: Malformed JSON, missing required fields
5. **Business Logic Errors**: Invalid issue states, missing labels

### Error Recovery
- **Retry Logic**: Built into API client for transient failures
- **Graceful Degradation**: Commands continue with available data
- **User Guidance**: Clear error messages with suggested actions
- **Logging**: Comprehensive logging for debugging

---

## Performance Considerations

### API Rate Limiting
- Jira API calls are rate-limited
- Commands implement appropriate delays
- Batch operations when possible

### File System Performance
- Large directory scans are optimized
- File operations are asynchronous
- Memory usage is managed for large datasets

### Caching
- Configuration is cached after first load
- API client maintains connection pooling
- File system operations are optimized

---

## Security Considerations

### Authentication
- Jira API uses Bearer token authentication
- Tokens are stored in environment variables
- No credentials stored in code or config files

### Data Privacy
- Local files contain issue data
- Sensitive information should be handled carefully
- Workspace files should be secured appropriately

### Input Validation
- All user inputs are validated
- File paths are sanitized
- API responses are validated before processing

---

This matrix provides a comprehensive understanding of how POPS commands interact with data sources and can be used for troubleshooting, development, and system integration.

# POPS Command Data Flow Diagrams

This document contains visual representations of the data flow patterns used by POPS commands.

## Data Flow Overview

```mermaid
graph TB
    subgraph "External Systems"
        JIRA[Jira API]
        USER[User Input]
    end
    
    subgraph "Local Storage"
        DATA[_data/*.json]
        WORKSPACE[_workspace/*.md]
        INCREMENTS[planning/increments/*.md]
        CONFIG[pops.toml]
    end
    
    subgraph "POPS Commands"
        FETCH[fetch-issues]
        PROCESS[process-issue]
        CREATE[create-issue]
        UPDATE[update-issue]
        PROMOTE[promote-issue]
        REWORK[rework-issue]
        VALIDATE[validate-issue]
        CONFIG_VAL[validate]
    end
    
    JIRA -->|Download| FETCH
    FETCH -->|Store JSON| DATA
    DATA -->|Convert| PROCESS
    PROCESS -->|Generate MD| INCREMENTS
    
    USER -->|Interactive| CREATE
    CREATE -->|Create Issue| JIRA
    CREATE -->|Generate MD| WORKSPACE
    
    WORKSPACE -->|Read| UPDATE
    UPDATE -->|Update Issue| JIRA
    
    WORKSPACE -->|Read| PROMOTE
    PROMOTE -->|Update Labels| JIRA
    
    JIRA -->|Fetch| REWORK
    REWORK -->|Generate MD| WORKSPACE
    
    WORKSPACE -->|Validate| VALIDATE
    JIRA -->|Fetch & Validate| VALIDATE
    
    CONFIG -->|Read| CONFIG_VAL
```

## Command-Specific Data Flows

### 1. Data Import Workflow

```mermaid
sequenceDiagram
    participant User
    participant POPS
    participant JiraAPI
    participant FileSystem
    
    User->>POPS: pops fetch-issues
    POPS->>JiraAPI: Get epics and issues
    JiraAPI-->>POPS: Return JSON data
    POPS->>FileSystem: Save to _data/*.json
    
    User->>POPS: pops process-issue
    POPS->>FileSystem: Read _data/*.json
    POPS->>FileSystem: Generate markdown files
    POPS->>FileSystem: Save to planning/increments/
```

### 2. Issue Creation Workflow

```mermaid
sequenceDiagram
    participant User
    participant POPS
    participant JiraAPI
    participant FileSystem
    
    User->>POPS: pops create-issue
    POPS->>User: Prompt for issue details
    User-->>POPS: Provide issue data
    POPS->>JiraAPI: Create issue
    JiraAPI-->>POPS: Return issue key
    POPS->>FileSystem: Generate markdown file
    POPS->>FileSystem: Save to _workspace/
```

### 3. Issue Update Workflow

```mermaid
sequenceDiagram
    participant User
    participant POPS
    participant FileSystem
    participant JiraAPI
    
    User->>POPS: pops update-issue GVT-1234
    POPS->>FileSystem: Find markdown file
    FileSystem-->>POPS: Return file content
    POPS->>POPS: Parse frontmatter and content
    POPS->>POPS: Apply field mappings
    POPS->>JiraAPI: Update issue
    JiraAPI-->>POPS: Confirm update
```

### 4. Issue Promotion Workflow

```mermaid
sequenceDiagram
    participant User
    participant POPS
    participant FileSystem
    participant JiraAPI
    
    User->>POPS: pops promote-issue GVT-1234
    POPS->>FileSystem: Find markdown file
    FileSystem-->>POPS: Return file content
    POPS->>POPS: Verify workspace label
    POPS->>POPS: Get promotion targets
    POPS->>JiraAPI: Update labels
    JiraAPI-->>POPS: Confirm label update
```

### 5. Issue Rework Workflow

```mermaid
sequenceDiagram
    participant User
    participant POPS
    participant FileSystem
    participant JiraAPI
    
    User->>POPS: pops rework-issue GVT-1234
    POPS->>FileSystem: Check if file exists
    alt File exists
        FileSystem-->>POPS: Return file path
        POPS->>User: Show existing file location
    else File not found
        POPS->>JiraAPI: Fetch issue
        JiraAPI-->>POPS: Return issue data
        POPS->>JiraAPI: Add re-workspace label
        POPS->>FileSystem: Generate markdown file
        POPS->>FileSystem: Save to _workspace/
    end
```

## Service Architecture

```mermaid
graph TB
    subgraph "Command Layer"
        CMD1[fetch-issues]
        CMD2[process-issue]
        CMD3[create-issue]
        CMD4[update-issue]
        CMD5[promote-issue]
        CMD6[rework-issue]
        CMD7[validate-issue]
        CMD8[validate]
    end
    
    subgraph "Service Layer"
        JDS[JiraDataService]
        JAC[JiraApiClient]
        MP[MarkdownProcessor]
        PC[POPSConfig]
        SM[SimpleMapper]
        IV[IssueValidator]
        CV[ConfigValidator]
    end
    
    subgraph "Data Layer"
        JIRA[Jira API]
        FS[File System]
        ENV[Environment Variables]
    end
    
    CMD1 --> JDS
    CMD2 --> MP
    CMD3 --> JAC
    CMD4 --> JAC
    CMD4 --> SM
    CMD5 --> JAC
    CMD6 --> JAC
    CMD7 --> IV
    CMD7 --> JAC
    CMD8 --> CV
    
    JDS --> JAC
    JDS --> FS
    MP --> FS
    JAC --> JIRA
    JAC --> ENV
    PC --> FS
    IV --> JAC
    IV --> JDS
    IV --> MP
    CV --> PC
```

## Data Storage Hierarchy

```mermaid
graph TD
    ROOT[Project Root]
    
    ROOT --> DATA[_data/]
    ROOT --> PLANNING[planning/]
    ROOT --> CONFIG[.config/]
    ROOT --> TEMPLATES[templates/]
    ROOT --> POPS[pops.toml]
    
    DATA --> COMP1[idp-infra/]
    DATA --> COMP2[cp-img-mgmt/]
    DATA --> COMP3[other-components/]
    
    COMP1 --> EPIC1[epic-1/]
    COMP1 --> EPIC2[epic-2/]
    EPIC1 --> JSON1[GVT-1001.json]
    EPIC1 --> JSON2[GVT-1002.json]
    
    PLANNING --> INCREMENTS[increments/]
    INCREMENTS --> Q1[FY26Q1/]
    INCREMENTS --> WORKSPACE[_workspace/]
    
    Q1 --> Q1_COMP1[idp-infra/]
    Q1 --> Q1_COMP2[cp-img-mgmt/]
    Q1_COMP1 --> MD1[epic-GVT-1001.md]
    Q1_COMP1 --> MD2[story-GVT-1002.md]
    
    WORKSPACE --> WS_MD1[story-GVT-1003.md]
    WORKSPACE --> WS_MD2[epic-GVT-1004.md]
    
    CONFIG --> SCOPE[scope.yaml]
    TEMPLATES --> TMPL1[epic-template.md]
    TEMPLATES --> TMPL2[story-template.md]
```

## Error Handling Flow

```mermaid
graph TD
    START[Command Execution]
    START --> TRY{Try Operation}
    
    TRY -->|Success| SUCCESS[Return Success]
    TRY -->|Error| CATCH[Catch Error]
    
    CATCH --> TYPE{Error Type}
    
    TYPE -->|API Error| API_RETRY{Retry Available?}
    TYPE -->|File Error| FILE_CHECK{File Exists?}
    TYPE -->|Config Error| CONFIG_VALIDATE[Validate Config]
    TYPE -->|Validation Error| SHOW_ERROR[Show Error Message]
    
    API_RETRY -->|Yes| RETRY[Retry Operation]
    API_RETRY -->|No| API_ERROR[Show API Error]
    
    FILE_CHECK -->|Yes| PERMISSION[Check Permissions]
    FILE_CHECK -->|No| FILE_MISSING[Show File Missing Error]
    
    CONFIG_VALIDATE --> CONFIG_ERROR[Show Config Error]
    
    RETRY --> TRY
    API_ERROR --> END[Exit with Error]
    FILE_MISSING --> END
    CONFIG_ERROR --> END
    SHOW_ERROR --> END
    SUCCESS --> END
```

This comprehensive documentation provides both textual and visual representations of how POPS commands interact with data sources, making it easier to understand the system architecture and troubleshoot issues.

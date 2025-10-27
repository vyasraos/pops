# POPS CLI - Playbook Operations CLI

A powerful command-line tool that streamlines project management by connecting your Jira workspace with local markdown files. Transform how you track epics, stories, and tasks with automated syncing, template-driven workflows, and organized project planning.

## What You Can Do

✨ **Sync Jira Issues**: Automatically fetch epics and stories from Jira into organized markdown files
📝 **Create Issues**: Build new Jira issues with guided prompts and templates
🔄 **Manage Workflows**: Move issues from workspace to planning increments with ease
✅ **Validate Content**: Ensure your issues meet project standards and template requirements
📁 **Organize Projects**: Maintain clean directory structures for components and increments

## Quick Start

```bash
# Install and setup
./setup-bun.sh

# Configure your Jira connection
echo "JIRA_PERSONAL_TOKEN=your_token" > .env

# Validate setup
pops validate

# Start working with issues
pops fetch-issues      # Sync from Jira
pops create-issue      # Create new issue
pops validate-issue    # Check your work
```

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Core Commands](#commands)
- [Common Workflows](#workflows)
- [For Developers](#development)

## Installation

### Download Binary (Recommended)

**macOS & Linux:**
```bash
# Download and install latest version
curl -fsSL https://github.com/vyasraos/pops/releases/latest/download/install.sh | sh
```

**Manual Download:**
- **macOS**: [Download pops-macos](https://github.com/vyasraos/pops/releases/latest/download/pops-macos)
- **Linux**: [Download pops-linux](https://github.com/vyasraos/pops/releases/latest/download/pops-linux)
- **Windows**: [Download pops-windows.exe](https://github.com/vyasraos/pops/releases/latest/download/pops-windows.exe)

**Package Managers:**
```bash
# Homebrew (macOS/Linux)
brew install vyasraos/tap/pops

# Chocolatey (Windows) - Coming Soon
# choco install pops
```

### From Source (Developers)
See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup.

### Setup Your Jira Connection

1. **Get a Jira Token**: Visit [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens) to create one

2. **Add to Environment**:
```bash
export JIRA_PERSONAL_TOKEN=your_jira_token_here
# Or add to your shell profile (~/.zshrc, ~/.bashrc)
```

3. **Alternative**: Create a `.env` file in your project:
```bash
JIRA_PERSONAL_TOKEN=your_jira_token_here
```

## Configuration

Create a `pops.toml` file to connect to your Jira instance:

```toml
[jira]
base_url = "https://your-company.atlassian.net"  # Your Jira URL
project = "PROJ"                                # Your project key
create_directories = true
overwrite_existing = false

[jira.paths]
master = "planning/master/master.yaml"
increments = "planning/increments"
templates = "templates/planning"
target = "FY26Q1"                              # Current planning increment
```

**Test your setup:**
```bash
pops validate  # Checks config, token, and Jira connectivity
```

## Commands

### Core Commands

#### `validate`
Validates POPS configuration and dependencies.

```bash
pops validate
```

**What it checks:**
- Configuration file syntax
- Required environment variables
- JIRA connectivity
- Template file structure
- Schema validation

#### `fetch-issues`
Fetches epics and their children from JIRA, storing raw JSON data in `_data` folders.

```bash
# Fetch all epics for configured components
pops fetch-issues

# Fetch epics for specific component
pops fetch-issues --component idp-infra

# Dry run (show what would be fetched)
pops fetch-issues --dry-run
```

**Features:**
- Excludes issues with `workspace` label
- Fetches one level deep (epic → stories/tasks)
- Stores raw JIRA JSON in `planning/increments/FY26Q1/_data/`
- Creates organized directory structure: `component/epic-name/epic-POP-XXXX.json`

#### `process-issue`
Processes JSON data from `_data` folders and generates markdown files following template specifications.

```bash
# Process all fetched data
pops process-issue

# Process specific component
pops process-issue --component idp-infra

# Process specific epic
pops process-issue --epic POP-1234

# Dry run (show what would be processed)
pops process-issue --dry-run
```

**Features:**
- Dynamic frontmatter processing from templates
- Generates files with proper naming: `epic-POP-XXXX.md`
- Includes mapping section for API field mapping
- Overwrites existing files completely

#### `create-issue`
Creates new JIRA issues interactively with guided prompts.

```bash
pops create-issue
```

**Interactive Flow:**
1. **Issue Type**: Epic, Story, Task, Bug, Sub-task
2. **Summary**: Issue title
3. **Description**: Issue description
4. **Component**: Select from configured components
5. **Epic**: Link to existing epic (for stories/tasks)
6. **Labels**: Optional additional labels

**Features:**
- Automatically adds `workspace` label
- Applies default labels from scope configuration
- Creates markdown file in `_workspace` directory
- Generates proper epic directory structure
- Full JIRA API integration

#### `update-issue`
Updates summary and description of existing workspace issues.

```bash
# Interactive selection
pops update-issue

# Update specific file
pops update-issue path/to/issue.md

# Update by JIRA key
pops update-issue --key POP-1234
```

**Features:**
- Shows only workspace issues
- Searchable list with filtering
- Direct JIRA API updates
- No additional prompts (uses current file content)

#### `promote-issue`
Promotes workspace issues to target increments.

```bash
# Interactive selection
pops promote-issue

# Promote specific file
pops promote-issue path/to/issue.md
```

**Features:**
- Shows only workspace issues (with `workspace` label)
- Interactive promotion label selection
- Updates JIRA (removes `workspace`, adds promotion label)
- Moves file to target increment directory
- Bundles all API operations

#### `validate-issue`
#### `refine-issue`
Fetch an existing Jira issue and create a markdown file in `_workspace` for refinement.

```bash
# Create a local markdown for an existing issue
pops refine-issue POP-1234

# Next steps after refinement
pops update-issue planning/increments/_workspace/<component>/<...>/<type>-POP-1234.md
pops promote-issue planning/increments/_workspace/<component>/<...>/<type>-POP-1234.md --target FY26Q1
```

Validates issue content against template specifications.

```bash
# Interactive selection
pops validate-issue

# Validate all issues
pops validate-issue --all

# Validate by component
pops validate-issue --component idp-infra

# Validate by epic
pops validate-issue --epic POP-1234

# Validate specific file
pops validate-issue path/to/issue.md
```

**Validation Rules:**
- Required sections present
- Instruction placeholders replaced
- Content length requirements
- Format compliance (user stories, acceptance criteria)
- Template structure adherence

## Workflows

### Issue Creation Workflow

```bash
# 1. Create new issue
pops create-issue

# 2. Fill in prompts
# 3. Issue created in Jira and markdown file in _workspace
# 4. Edit the markdown file as needed
# 5. Update Jira when ready
pops update-issue --key POP-5678

# 6. Promote to increment when complete
pops promote-issue
```

### Data Synchronization Workflow

```bash
# 1. Fetch latest data from JIRA
pops fetch-issues

# 2. Process into markdown files
pops process-issue

# 3. Validate generated content
pops validate-issue --all

# 4. Review and commit changes
git add .
git commit -m "Sync issues from JIRA"
```

### Issue Management Workflow

```bash
# 1. List workspace issues
ls planning/increments/_workspace/*/

# 2. Update issue content
pops update-issue

# 3. Validate against templates
pops validate-issue

# 4. Promote when ready
pops promote-issue
```

## Architecture

### Directory Structure

```
planning/increments/
├── _workspace/           # Draft issues
│   ├── idp-infra/
│   │   ├── epic-kubernetes-cluster-setup/
│   │   │   └── story-POP-1234.md
│   │   └── task-POP-5678.md
│   └── cp-bm-mgmt/
├── FY26Q1/              # Committed increment
│   ├── _data/           # Raw JIRA JSON
│   │   ├── idp-infra/
│   │   │   └── epic-kubernetes-cluster-setup/
│   │   │       ├── epic-POP-1234.json
│   │   │       ├── story-POP-5678.json
│   │   │       └── task-POP-9012.json
│   │   └── cp-bm-mgmt/
│   ├── idp-infra/       # Generated markdown
│   │   └── epic-kubernetes-cluster-setup/
│   │       ├── epic-POP-1234.md
│   │       ├── story-POP-5678.md
│   │       └── task-POP-9012.md
│   └── cp-bm-mgmt/
└── FY26Q2/
```

### Key Components

#### Services

- **JiraApiClient**: Handles all JIRA API interactions
- **JiraDataService**: Manages data fetching and storage
- **MarkdownProcessor**: Processes JSON data into markdown files
- **TemplateValidator**: Validates issue content against templates

#### Commands

- **fetch-issues**: Data fetching from JIRA
- **process-issue**: Data processing and markdown generation
- **create-issue**: Interactive issue creation
- **update-issue**: Issue content updates
- **promote-issue**: Issue promotion workflow
- **validate-issue**: Content validation

#### Configuration

- **pops.toml**: Main configuration file
- **scope.yaml**: Component and label configuration per increment
- **master.yaml**: Global component and issue type definitions

## Troubleshooting

**JIRA Authentication Error**
```bash
# Check your token
echo $JIRA_PERSONAL_TOKEN

# Verify token permissions in JIRA
# Required: Browse projects, Create issues, Edit issues
```

**Configuration Issues**
```bash
# Validate your setup
pops validate

# Check pops.toml syntax and required fields
```

**Debug Mode**
```bash
# Enable verbose logging
DEBUG=pops:* pops validate
pops fetch-issues --verbose
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and contribution guidelines.

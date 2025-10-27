# POPS Documentation

This directory contains comprehensive documentation for the POPS (Playbook Operations CLI) system.

## Documentation Overview

### 📊 [Command Data Matrix](./command-data-matrix.md)
A detailed matrix showing all POPS commands, their data sources, destinations, and flow patterns. This is the primary reference for understanding how each command works with data.

**Key Sections:**
- Command overview table
- Detailed analysis of each command
- Data storage locations
- Service dependencies
- Error handling patterns
- Performance considerations

### 🔄 [Command Data Flow Diagrams](./command-data-flow.md)
Visual representations of data flow patterns using Mermaid diagrams. These complement the matrix with visual understanding of system architecture.

**Key Diagrams:**
- Overall data flow overview
- Command-specific workflows
- Service architecture
- Data storage hierarchy
- Error handling flow

## Quick Reference

### Commands by Data Flow Pattern

#### Jira → File (Download/Import)
- `fetch-issues` - Downloads epics and issues as JSON
- `rework-issue` - Fetches issue and creates workspace file

#### File → Jira (Upload/Export)
- `update-issue` - Updates Jira from markdown file
- `promote-issue` - Moves issue from workspace to increment

#### File → File (Local Processing)
- `process-issue` - Converts JSON to markdown files

#### Interactive (User Input → Jira)
- `create-issue` - Creates new issue with user input

#### Validation
- `validate-issue` - Validates issue structure and content
- `validate` - Validates configuration and dependencies

### Data Storage Locations

| Location | Purpose | Format | Commands |
|----------|---------|--------|----------|
| `_data/` | Raw Jira data | JSON | `fetch-issues` |
| `_workspace/` | Editable issues | Markdown | `create-issue`, `rework-issue` |
| `planning/increments/` | Organized issues | Markdown | `process-issue` |
| `pops.toml` | Configuration | TOML | `validate` |
| `.config/scope.yaml` | Component config | YAML | `fetch-issues`, `promote-issue` |

### Service Architecture

```
Commands → Services → Data Sources
    ↓         ↓           ↓
┌─────────┐ ┌─────────┐ ┌─────────┐
│ fetch-  │ │ JiraData│ │ Jira API│
│ process │ │ Service │ │         │
│ create- │ ├─────────┤ ├─────────┤
│ update- │ │ Markdown│ │ File    │
│ promote │ │ Processor│ │ System  │
│ rework- │ ├─────────┤ ├─────────┤
│ validate│ │ JiraApi │ │ Config  │
└─────────┘ │ Client  │ │ Files   │
            └─────────┘ └─────────┘
```

## Usage Patterns

### 1. Data Import Workflow
```bash
# 1. Fetch data from Jira
pops fetch-issues --component idp-infra

# 2. Process into markdown files
pops process-issue

# 3. Validate the results
pops validate-issue --all
```

### 2. Issue Creation Workflow
```bash
# 1. Create new issue
pops create-issue

# 2. Update with changes
pops update-issue GVT-1234

# 3. Promote to increment
pops promote-issue GVT-1234 --target FY26Q1
```

### 3. Issue Rework Workflow
```bash
# 1. Rework existing issue
pops rework-issue GVT-1234

# 2. Edit the markdown file manually
# (Edit _workspace/story-GVT-1234.md)

# 3. Update Jira with changes
pops update-issue GVT-1234

# 4. Promote to increment
pops promote-issue GVT-1234 --target FY26Q1
```

## Troubleshooting

### Common Issues

1. **Issue not found in workspace**
   - Check if issue key pattern matches project configuration
   - Verify issue exists in `_workspace/` directory
   - Use `pops rework-issue` to fetch from Jira

2. **Jira API errors**
   - Verify `JIRA_PERSONAL_TOKEN` environment variable
   - Check `pops.toml` configuration
   - Ensure network connectivity

3. **File permission errors**
   - Check write permissions on target directories
   - Verify file paths are accessible
   - Ensure sufficient disk space

4. **Configuration errors**
   - Run `pops validate` to check configuration
   - Verify TOML syntax in `pops.toml`
   - Check required fields are present

### Debug Commands

```bash
# Validate configuration
pops validate

# Check specific issue
pops validate-issue GVT-1234

# Dry run processing
pops process-issue --dry-run

# Fetch single issue for testing
pops fetch-issues --issue GVT-1234
```

## Development

### Adding New Commands

When adding new commands, follow these patterns:

1. **Determine data flow pattern** (Jira → File, File → Jira, etc.)
2. **Use appropriate services** (JiraApiClient, MarkdownProcessor, etc.)
3. **Follow error handling patterns** (try/catch, user-friendly messages)
4. **Update this documentation** with new command details

### Service Dependencies

- **JiraApiClient**: For all Jira API interactions
- **JiraDataService**: For data fetching and storage
- **MarkdownProcessor**: For JSON ↔ Markdown conversion
- **POPSConfig**: For configuration management
- **SimpleMapper**: For field mapping in updates

## Contributing

When contributing to POPS:

1. **Update documentation** for any command changes
2. **Follow existing patterns** for data flow and error handling
3. **Test with different project keys** (not just POP-*)
4. **Validate configuration** before submitting changes
5. **Update this README** if adding new documentation files

---

For more detailed information, refer to the specific documentation files in this directory.

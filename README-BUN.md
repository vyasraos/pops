# POPS CLI - Bun Edition

This is the Bun-optimized version of the POPS CLI tool.

## Prerequisites

- [Bun](https://bun.sh) >= 1.0.0 installed on your system

## Installation

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Link the CLI globally
bun run link
```

## Development

```bash
# Run in development mode
bun run dev

# Run with watch mode
bun run dev:watch

# Build and watch for changes
bun run build:watch
```

## Usage

```bash
# Validate configuration
pops validate

# Fetch epics from Jira
pops fetch-epics

# Process epics to markdown
pops process-epics

# Create a new issue
pops create-issue

# Update an issue
pops update-issue [file]

# Promote a workspace issue
pops promote-issue [file]

# Refine an issue
pops refine-issue POP-1234

# Validate issues
pops validate-issues --all
```

## Benefits of Bun

- **Faster startup**: Bun starts significantly faster than Node.js
- **Built-in TypeScript**: No need for tsx or ts-node
- **Better performance**: Optimized JavaScript runtime
- **Simplified toolchain**: Fewer dependencies and configuration files
- **Native bundling**: Built-in bundling capabilities

## Migration Notes

- Removed Jest in favor of Bun's built-in test runner
- Updated TypeScript configuration for Bun compatibility
- Removed tsx dependency (Bun handles TypeScript natively)
- Updated shebang to use Bun instead of Node.js

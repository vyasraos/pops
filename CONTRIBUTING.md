# Contributing to POPS CLI

Thank you for your interest in contributing to POPS CLI! This guide will help you set up your development environment and understand our contribution process.

## Prerequisites

- [Bun](https://bun.sh) >= 1.0.0
- Node.js >= 18 (for compatibility testing)
- Git
- JIRA Personal Access Token for testing

## Development Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/vyasraos/pops-cli.git
cd pops-cli

# Install dependencies
bun install

# Build the CLI
bun run build
```

### 2. Development Scripts

```bash
# Development mode with auto-reload
bun run dev

# Watch mode (rebuilds on changes)
bun run dev:watch
bun run build:watch

# Run the CLI locally
bun run dev [command]

# Example: Run validate command
bun run dev validate
```

### 3. Testing Setup

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/commands/validate.test.ts

# Run tests in watch mode
bun test --watch
```

### 4. Code Quality

```bash
# Lint code
bun run lint

# Type checking
bun run type-check

# Format code (if applicable)
bun run format
```

## Project Structure

```
pops-cli/
├── src/
│   ├── commands/        # CLI command implementations
│   │   ├── validate.ts
│   │   ├── fetch-issues.ts
│   │   ├── create-issue.ts
│   │   └── ...
│   ├── services/        # Core business logic
│   │   ├── jira-api-client.ts
│   │   ├── markdown-processor.ts
│   │   └── ...
│   ├── utils/          # Utility functions
│   │   ├── config.ts
│   │   ├── file-utils.ts
│   │   └── ...
│   ├── types/          # TypeScript type definitions
│   │   ├── jira.ts
│   │   ├── config.ts
│   │   └── ...
│   ├── cli.ts          # Main CLI entry point
│   └── index.ts        # Library exports
├── tests/              # Test files
├── templates/          # Issue templates
├── dist/              # Built files
├── package.json
├── tsconfig.json
├── bun.lockb
└── README.md
```

## Building Binaries

### Local Binary Build

```bash
# Build binary for current platform
bun run build:binary

# Build for specific platforms
bun run build:binary-linux    # Linux x64
bun run build:binary-macos    # macOS universal
bun run build:binary-windows  # Windows x64

# Build all platforms
bun run build:binaries-all
```

### Binary Build Commands

The following scripts are available in `package.json`:

```json
{
  "scripts": {
    "build:binary": "bun build --compile --minify src/cli.ts --outfile dist/pops",
    "build:binary-linux": "bun build --compile --target=bun-linux-x64 --minify src/cli.ts --outfile dist/pops-linux",
    "build:binary-macos": "bun build --compile --target=bun-darwin-x64 --minify src/cli.ts --outfile dist/pops-macos",
    "build:binary-windows": "bun build --compile --target=bun-windows-x64 --minify src/cli.ts --outfile dist/pops-windows.exe",
    "build:binaries-all": "bun run build:binary-linux && bun run build:binary-macos && bun run build:binary-windows"
  }
}
```

### Testing Binaries

```bash
# Test the binary
./dist/pops --version
./dist/pops validate

# Test cross-platform binaries (if on macOS/Linux)
docker run --rm -v $(pwd):/app -w /app ubuntu:latest ./dist/pops-linux --version
```

## Adding New Commands

### 1. Create Command File

Create a new file in `src/commands/`:

```typescript
// src/commands/my-command.ts
import { CommandModule } from 'yargs';

export const myCommand: CommandModule = {
  command: 'my-command',
  describe: 'Description of my command',
  builder: (yargs) => {
    return yargs
      .option('option1', {
        describe: 'Description of option1',
        type: 'string',
        demandOption: true,
      });
  },
  handler: async (argv) => {
    // Command implementation
    console.log('My command executed with:', argv.option1);
  },
};
```

### 2. Register Command

Add your command to `src/cli.ts`:

```typescript
import { myCommand } from './commands/my-command';

// Add to the yargs configuration
.command(myCommand)
```

### 3. Add Tests

Create a test file in `tests/commands/`:

```typescript
// tests/commands/my-command.test.ts
import { describe, it, expect } from 'bun:test';
import { myCommand } from '../../src/commands/my-command';

describe('my-command', () => {
  it('should execute successfully', async () => {
    // Test implementation
  });
});
```

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `JIRA_PERSONAL_TOKEN` | JIRA API authentication token | `ATB...` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `DEBUG` | Enable debug logging | `pops:*` |
| `POPS_CONFIG_PATH` | Custom config file path | `./pops.toml` |

### Development Environment

Create a `.env` file for development:

```bash
# Required for testing
JIRA_PERSONAL_TOKEN=your_development_token

# Optional debug settings
DEBUG=pops:*

# Test Jira instance
JIRA_BASE_URL=https://your-test-instance.atlassian.net
JIRA_PROJECT=TEST
```

## Dependencies

### Runtime Dependencies

- **yargs**: CLI argument parsing and command routing
- **inquirer**: Interactive command-line prompts
- **axios**: HTTP client for JIRA API requests
- **js-yaml**: YAML configuration file parsing
- **chalk**: Terminal colors and styling
- **dotenv**: Environment variable loading
- **jira.js**: JIRA API client library
- **marked**: Markdown parsing and processing
- **smol-toml**: TOML configuration parsing
- **zod**: Runtime type validation

### Development Dependencies

- **typescript**: TypeScript compiler
- **@types/\***: TypeScript type definitions
- **eslint**: Code linting
- **@typescript-eslint/\***: TypeScript-specific ESLint rules

## Code Style and Standards

### TypeScript Guidelines

1. **Use strict TypeScript**: Enable strict mode in `tsconfig.json`
2. **Type everything**: Avoid `any` types, prefer specific interfaces
3. **Use Zod for validation**: Runtime type checking for external data
4. **Error handling**: Use proper error types and handling

### Code Organization

1. **Separation of concerns**: Keep commands, services, and utilities separate
2. **Single responsibility**: Each file/function should have one clear purpose
3. **Consistent naming**: Use descriptive names for variables and functions
4. **Documentation**: Add JSDoc comments for public APIs

### Example Code Style

```typescript
// Good: Typed interface with clear naming
interface JiraIssueConfig {
  projectKey: string;
  issueType: 'Epic' | 'Story' | 'Task' | 'Bug';
  summary: string;
  description?: string;
}

// Good: Error handling with specific types
class JiraApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: any
  ) {
    super(message);
    this.name = 'JiraApiError';
  }
}

// Good: Service class with clear methods
export class JiraApiClient {
  async createIssue(config: JiraIssueConfig): Promise<JiraIssue> {
    try {
      const response = await this.makeRequest('/issue', config);
      return this.validateIssueResponse(response);
    } catch (error) {
      throw new JiraApiError('Failed to create issue', 500, error);
    }
  }
}
```

## Testing Guidelines

### Unit Tests

- Test individual functions and methods
- Mock external dependencies (JIRA API, file system)
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

### Integration Tests

- Test command workflows end-to-end
- Use test fixtures for predictable data
- Test error scenarios and edge cases

### Example Test

```typescript
import { describe, it, expect, mock } from 'bun:test';
import { JiraApiClient } from '../src/services/jira-api-client';

describe('JiraApiClient', () => {
  it('should create issue successfully', async () => {
    // Arrange
    const mockResponse = { key: 'TEST-123', id: '12345' };
    const apiClient = new JiraApiClient();
    mock.module('axios', () => ({
      post: mock.fn().mockResolvedValue({ data: mockResponse })
    }));

    // Act
    const result = await apiClient.createIssue({
      projectKey: 'TEST',
      issueType: 'Story',
      summary: 'Test issue'
    });

    // Assert
    expect(result.key).toBe('TEST-123');
  });
});
```

## Release Process

### Version Management

1. **Semantic Versioning**: Follow semver (major.minor.patch)
2. **Update package.json**: Bump version before release
3. **Create changelog**: Document changes in CHANGELOG.md

### Binary Release

1. **Build all binaries**:
   ```bash
   bun run build:binaries-all
   ```

2. **Test binaries**:
   ```bash
   ./dist/pops-macos --version
   ./dist/pops-linux --version
   ./dist/pops-windows.exe --version
   ```

3. **Create GitHub release**:
   - Tag the version: `git tag v1.0.0`
   - Push tags: `git push --tags`
   - Create release on GitHub with binaries attached

### Continuous Integration

The project uses GitHub Actions for:
- **Testing**: Run tests on multiple platforms
- **Building**: Create binaries for all platforms
- **Releasing**: Automated releases on tag push

## Contribution Process

### 1. Fork and Clone

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/your-username/pops-cli.git
cd pops-cli
git remote add upstream https://github.com/vyasraos/pops-cli.git
```

### 2. Create Feature Branch

```bash
git checkout -b feature/my-new-feature
```

### 3. Make Changes

- Follow the code style guidelines
- Add tests for new functionality
- Update documentation if needed
- Ensure all tests pass

### 4. Submit Pull Request

```bash
git push origin feature/my-new-feature
# Create PR on GitHub
```

### Pull Request Guidelines

- **Clear title**: Describe what the PR does
- **Detailed description**: Explain the changes and why
- **Test coverage**: Include tests for new features
- **Documentation**: Update docs for new commands/features
- **Breaking changes**: Clearly mark any breaking changes

## Getting Help

- **Issues**: Report bugs and request features on [GitHub Issues](https://github.com/vyasraos/pops-cli/issues)
- **Discussions**: Ask questions in [GitHub Discussions](https://github.com/vyasraos/pops-cli/discussions)
- **Code review**: Maintainers will review PRs and provide feedback

## License

By contributing to POPS CLI, you agree that your contributions will be licensed under the same license as the project (MIT).
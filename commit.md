# Claude Command: Commit

This command helps you create well-formatted commits with conventional commit messages that work with semantic-release for automated versioning and releases.

## Usage

To create commit(s), just type:
```
/commit
```

Or with options:
```
/commit --no-verify
```

## What This Command Does

1. Unless specified with `--no-verify`, automatically runs pre-commit checks
2. Checks which files are staged with `git status`
3. If 0 files are staged, automatically adds all modified and new files with `git add`
4. Performs a `git diff` to understand what changes are being committed
5. Analyzes the diff to determine if multiple distinct logical changes are present - VERY IMPORTANT AND MUST CONSIDER and THINK CRITICALLY to evaluate if single or multiple commits are required!!!!!
6. If multiple distinct changes are detected, suggests breaking the commit into multiple smaller commits
7. For each commit (or the single commit if not split), creates a commit message using conventional commit format

## Semantic Release Integration

This project uses **semantic-release** for automated versioning and releases. Your commit messages directly determine version bumps:

### Version Bump Types

| Commit Type | Version Bump | Example | Result |
|-------------|--------------|---------|---------|
| `feat:` | **Minor** | `feat: add new feature` | `0.1.0` → `0.2.0` |
| `fix:` | **Patch** | `fix: resolve bug` | `0.1.0` → `0.1.1` |
| `perf:` | **Patch** | `perf: improve performance` | `0.1.0` → `0.1.1` |
| `feat!:` | **Major** | `feat!: breaking change` | `0.1.0` → `1.0.0` |
| `chore:` | **None** | `chore: update deps` | No release |
| `docs:` | **None** | `docs: update README` | No release |
| `style:` | **None** | `style: fix formatting` | No release |
| `refactor:` | **None** | `refactor: simplify code` | No release |
| `test:` | **None** | `test: add unit tests` | No release |

### Breaking Changes

Use `!` after the type for breaking changes:
- `feat!: remove deprecated API` → Major version bump
- `fix!: change default behavior` → Major version bump

### Scope (Optional)

Add scope for better organization:
- `feat(api): add new endpoint`
- `fix(cli): resolve command parsing`
- `docs(readme): update installation`

## Best Practices for Commits

- **Verify before committing**: Ensure code is linted, builds correctly, and documentation is updated
- **Atomic commits**: Each commit should contain related changes that serve a single purpose
- **Split large changes**: If changes touch multiple concerns, split them into separate commits
- **Conventional commit format**: Use the format `<type>: <description>` where type is one of:
  - `feat`: A new feature (minor version bump)
  - `fix`: A bug fix (patch version bump)
  - `perf`: Performance improvements (patch version bump)
  - `feat!`: A breaking change (major version bump)
  - `docs`: Documentation changes (no release)
  - `style`: Code style changes (no release)
  - `refactor`: Code changes that neither fix bugs nor add features (no release)
  - `test`: Adding or fixing tests (no release)
  - `chore`: Changes to the build process, tools, etc. (no release)
  - `ci`: CI/CD improvements (no release)
  - `revert`: Reverting changes (patch version bump)
- **Present tense, imperative mood**: Write commit messages as commands (e.g., "add feature" not "added feature")
- **Concise first line**: Keep the first line under 72 characters

## Guidelines for Splitting Commits

When analyzing the diff, consider splitting commits based on these criteria:

1. **Different concerns**: Changes to unrelated parts of the codebase
2. **Different types of changes**: Mixing features, fixes, refactoring, etc.
3. **File patterns**: Changes to different types of files (e.g., source code vs documentation)
4. **Logical grouping**: Changes that would be easier to understand or review separately
5. **Size**: Very large changes that would be clearer if broken down

## Examples

### Good commit messages for releases:
- `feat: add user authentication system` → Minor version bump
- `fix: resolve memory leak in rendering process` → Patch version bump
- `feat!: change API response format` → Major version bump
- `perf: optimize database queries` → Patch version bump

### Good commit messages for no release:
- `docs: update API documentation with new endpoints`
- `refactor: simplify error handling logic in parser`
- `style: resolve linter warnings in component files`
- `chore: improve developer tooling setup process`
- `test: add unit tests for authentication flow`

### Examples of splitting commits:
- First commit: `feat: add new solc version type definitions` → Minor bump
- Second commit: `docs: update documentation for new solc versions` → No release
- Third commit: `chore: update package.json dependencies` → No release
- Fourth commit: `feat: add type definitions for new API endpoints` → Minor bump
- Fifth commit: `feat: improve concurrency handling in worker threads` → Minor bump
- Sixth commit: `style: resolve linting issues in new code` → No release
- Seventh commit: `test: add unit tests for new solc version features` → No release
- Eighth commit: `fix: update dependencies with security vulnerabilities` → Patch bump

## Command Options

- `--no-verify`: Skip running the pre-commit checks (lint, build, generate:docs)

## Important Notes

- By default, pre-commit checks will run to ensure code quality
- If these checks fail, you'll be asked if you want to proceed with the commit anyway or fix the issues first
- If specific files are already staged, the command will only commit those files
- If no files are staged, it will automatically stage all modified and new files
- The commit message will be constructed based on the changes detected
- Before committing, the command will review the diff to identify if multiple commits would be more appropriate
- If suggesting multiple commits, it will help you stage and commit the changes separately
- Always reviews the commit diff to ensure the message matches the changes
- **Remember**: Your commit messages directly trigger automated releases via semantic-release!

## Automated Release Process

When you push commits to the main branch:
1. **CI runs** tests and builds
2. **Semantic-release analyzes** your commit messages
3. **Automatically determines** version bump (patch/minor/major)
4. **Creates tag and release** if changes are releasable
5. **Builds binaries** for all platforms
6. **Publishes GitHub release** with binaries and changelog

## Workflow

```bash
# Make changes
git add .
/commit  # This will create conventional commit messages

# Push to trigger automated release
git push origin main
```

The system will automatically:
- Run tests
- Analyze commits
- Create release (if needed)
- Build binaries
- Publish to GitHub

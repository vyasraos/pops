# Automated Release Process

This project uses **semantic-release** for fully automated versioning and releases based on conventional commits.

## How It Works

1. **Push to main branch** with conventional commit messages
2. **Semantic-release analyzes** the commits
3. **Automatically determines** version bump (patch/minor/major)
4. **Creates tag and release** if changes are releasable
5. **Builds binaries** for all platforms
6. **Publishes GitHub release** with binaries

## Commit Message Format

Use conventional commit format for automatic versioning:

```bash
# Patch version bump (0.1.0 → 0.1.1)
git commit -m "fix: resolve authentication bug"
git commit -m "perf: improve memory usage"

# Minor version bump (0.1.0 → 0.2.0)  
git commit -m "feat: add new command"
git commit -m "feat: add configuration file support"

# Major version bump (0.1.0 → 1.0.0)
git commit -m "feat!: breaking change in API"
git commit -m "feat!: remove deprecated command"

# No release (chore, docs, style, refactor, test)
git commit -m "docs: update README"
git commit -m "chore: update dependencies"
git commit -m "style: fix linting issues"
```

## Release Types

| Commit Type | Version Bump | Example |
|-------------|--------------|---------|
| `feat:` | Minor | `feat: add new feature` |
| `fix:` | Patch | `fix: resolve bug` |
| `perf:` | Patch | `perf: improve performance` |
| `feat!:` | Major | `feat!: breaking change` |
| `chore:` | None | `chore: update deps` |
| `docs:` | None | `docs: update README` |
| `style:` | None | `style: fix formatting` |
| `refactor:` | None | `refactor: simplify code` |
| `test:` | None | `test: add unit tests` |

## Workflow

1. **Make changes** to your code
2. **Commit with conventional format**:
   ```bash
   git add .
   git commit -m "feat: add new Jira integration"
   ```
3. **Push to main**:
   ```bash
   git push origin main
   ```
4. **GitHub Actions automatically**:
   - Runs tests
   - Analyzes commits
   - Creates release (if needed)
   - Builds binaries
   - Publishes to GitHub

## Manual Release (Emergency)

If you need to manually trigger a release:

1. Go to **Actions** tab in GitHub
2. Select **Semantic Release** workflow
3. Click **Run workflow**
4. Choose branch and run

## Release Artifacts

Each release includes:
- **Linux Binary** (`pops-linux`)
- **macOS Binary** (`pops-macos`) 
- **Windows Binary** (`pops-windows.exe`)
- **Checksums** (`checksums.txt`)
- **Install Script** (`install.sh`)

## Prerelease Branches

- **`beta`** branch: Creates prerelease versions (e.g., `1.0.0-beta.1`)
- **`alpha`** branch: Creates prerelease versions (e.g., `1.0.0-alpha.1`)

## Configuration

The release process is configured in:
- `.releaserc.json` - Semantic-release configuration
- `.github/workflows/semantic-release.yml` - GitHub Actions workflow

## Troubleshooting

### No Release Created
- Check commit message format
- Ensure commits are on `main` branch
- Check GitHub Actions logs for errors

### Wrong Version Bump
- Review commit message types
- Use `feat!:` for breaking changes
- Use `feat:` for new features

### Build Failures
- Check that all tests pass
- Verify build process works locally
- Review GitHub Actions logs

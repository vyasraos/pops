# Homebrew Tap Setup Instructions

This document explains how to set up the Homebrew tap for POPS CLI distribution.

## Prerequisites

1. Create a separate repository: `vyasraos/homebrew-tap`
2. Generate a GitHub Personal Access Token with `repo` permissions
3. Add the token as `HOMEBREW_TAP_TOKEN` in repository secrets

## Steps to Set Up Homebrew Tap

### 1. Create the Tap Repository

```bash
# Create a new repository on GitHub: vyasraos/homebrew-tap
git clone https://github.com/vyasraos/homebrew-tap.git
cd homebrew-tap
```

### 2. Set Up Repository Structure

```bash
# Create the Formula directory
mkdir -p Formula

# Copy the formula template
cp ../pops/homebrew-formula.rb Formula/pops.rb

# Create README
cat > README.md << 'EOF'
# Homebrew Tap for vyasraos

This is the official Homebrew tap for vyasraos projects.

## Installation

```bash
# Add the tap
brew tap vyasraos/tap

# Install POPS CLI
brew install pops
```

## Available Formulas

- **pops**: Playbook Operations CLI - A tool for Jira management and project automation

## Updating

Formulas are automatically updated when new releases are published.

## Issues

Report issues with the Homebrew formula at: https://github.com/vyasraos/pops/issues
EOF

# Initial commit
git add .
git commit -m "Initial homebrew tap setup"
git push origin main
```

### 3. Configure GitHub Secrets

In the main `pops` repository, add the following secrets:

```bash
# GitHub Personal Access Token with repo permissions
HOMEBREW_TAP_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 4. Test the Formula

```bash
# Test locally
brew install --formula ./Formula/pops.rb

# Test the tap
brew tap vyasraos/tap
brew install pops

# Verify installation
pops --version
pops --help
```

## Automatic Updates

The GitHub Actions workflow in `pops` will automatically:

1. **Update the formula** when a new release is created
2. **Calculate new SHA256** checksums for binaries
3. **Create a PR** in the homebrew-tap repository
4. **Auto-merge** if all tests pass

## Formula Template Variables

The following variables are automatically updated:

- `version`: Set from the git tag (e.g., v1.0.0 → 1.0.0)
- `url`: Updated to point to the latest release binaries
- `sha256`: Calculated from the downloaded binary

## Testing

The formula includes comprehensive tests:

```ruby
test do
  # Version check
  assert_match version.to_s, shell_output("#{bin}/pops --version")

  # Help output validation
  help_output = shell_output("#{bin}/pops --help")
  assert_match "Playbook Operations CLI", help_output
  assert_match "validate", help_output
end
```

## Troubleshooting

### Formula Update Failures

If the automatic update fails:

1. Check the `HOMEBREW_TAP_TOKEN` permissions
2. Verify the binary URLs are accessible
3. Check the SHA256 calculation
4. Review the workflow logs

### Manual Formula Update

```bash
# Clone the tap repository
git clone https://github.com/vyasraos/homebrew-tap.git
cd homebrew-tap

# Update the formula manually
vim Formula/pops.rb

# Test the formula
brew install --formula ./Formula/pops.rb
brew test pops

# Commit and push
git add Formula/pops.rb
git commit -m "Update pops to vX.Y.Z"
git push origin main
```

## Multi-Platform Support

The formula supports:

- **macOS Intel** (x86_64)
- **macOS Apple Silicon** (ARM64) - Same binary as Intel, Rosetta compatible
- **Linux x86_64** (when using Homebrew on Linux)

## Best Practices

1. **Version Consistency**: Ensure formula version matches the release tag
2. **SHA256 Verification**: Always verify checksums for security
3. **Test Coverage**: Include comprehensive tests in the formula
4. **Documentation**: Keep caveats updated with usage instructions
5. **Error Handling**: Provide clear error messages for unsupported platforms

## Publishing Checklist

Before publishing a new release:

- [ ] Test formula locally on macOS
- [ ] Test formula locally on Linux (if applicable)
- [ ] Verify binary downloads work
- [ ] Check SHA256 checksums
- [ ] Validate version numbers
- [ ] Test installation and basic functionality
- [ ] Review caveats and help text
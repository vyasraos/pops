#!/bin/bash

# Version bumping script for POPS CLI
# Usage: ./scripts/bump-version.sh [major|minor|patch]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not in a git repository"
    exit 1
fi

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    print_error "You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Get the bump type (major, minor, patch)
BUMP_TYPE=${1:-patch}

if [[ ! "$BUMP_TYPE" =~ ^(major|minor|patch)$ ]]; then
    print_error "Invalid bump type. Use: major, minor, or patch"
    exit 1
fi

print_status "Bumping $BUMP_TYPE version..."

# Fetch latest tags
print_status "Fetching latest tags..."
git fetch --tags

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
print_status "Current version: $CURRENT_VERSION"

# Get latest tag
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
print_status "Latest tag: $LATEST_TAG"

# Remove 'v' prefix and split version
VERSION=${LATEST_TAG#v}
IFS='.' read -r -a VERSION_PARTS <<< "$VERSION"

MAJOR=${VERSION_PARTS[0]:-0}
MINOR=${VERSION_PARTS[1]:-0}
PATCH=${VERSION_PARTS[2]:-0}

# Increment version based on bump type
case $BUMP_TYPE in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch)
        PATCH=$((PATCH + 1))
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
NEW_TAG="v$NEW_VERSION"

print_status "New version: $NEW_VERSION"
print_status "New tag: $NEW_TAG"

# Check if tag already exists
if git rev-parse "$NEW_TAG" >/dev/null 2>&1; then
    print_error "Tag $NEW_TAG already exists!"
    exit 1
fi

# Update package.json
print_status "Updating package.json..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Update CLI version
print_status "Updating CLI version..."
sed -i.bak "s/\.version('[^']*')/\.version('$NEW_VERSION')/g" src/cli.ts
rm src/cli.ts.bak

# Update homebrew formula
print_status "Updating homebrew formula..."
sed -i.bak "s/version \"[^\"]*\"/version \"$NEW_VERSION\"/g" homebrew-formula.rb
rm homebrew-formula.rb.bak

# Commit changes
print_status "Committing version changes..."
git add package.json src/cli.ts homebrew-formula.rb
git commit -m "chore: bump version to $NEW_VERSION"

# Create and push tag
print_status "Creating tag $NEW_TAG..."
git tag -a "$NEW_TAG" -m "Release $NEW_TAG"

print_status "Pushing changes and tag..."
git push origin main
git push origin "$NEW_TAG"

print_success "Version bumped to $NEW_VERSION!"
print_success "Tag $NEW_TAG created and pushed!"
print_status "GitHub Actions will now build and release the new version."

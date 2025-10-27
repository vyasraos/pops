#!/bin/bash

# POPS CLI Installation Script
# Usage: curl -fsSL https://github.com/vyasraos/pops-cli/releases/latest/download/install.sh | sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO="vyasraos/pops"
BINARY_NAME="pops"
INSTALL_DIR="/usr/local/bin"

# Print colored output
print_status() {
    printf "${BLUE}[INFO]${NC} %s\n" "$1"
}

print_success() {
    printf "${GREEN}[SUCCESS]${NC} %s\n" "$1"
}

print_warning() {
    printf "${YELLOW}[WARNING]${NC} %s\n" "$1"
}

print_error() {
    printf "${RED}[ERROR]${NC} %s\n" "$1"
    exit 1
}

# Detect OS and architecture
detect_platform() {
    local os
    local arch

    case "$(uname -s)" in
        Darwin*)
            os="macos"
            ;;
        Linux*)
            os="linux"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            os="windows"
            ;;
        *)
            print_error "Unsupported operating system: $(uname -s)"
            ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64)
            arch="x64"
            ;;
        arm64|aarch64)
            arch="arm64"
            ;;
        *)
            print_warning "Unsupported architecture: $(uname -m). Trying x64..."
            arch="x64"
            ;;
    esac

    # For now, we only build x64 binaries
    if [ "$arch" != "x64" ]; then
        print_warning "Only x64 binaries are available. Proceeding with x64 binary."
    fi

    echo "${os}"
}

# Get the latest release version
get_latest_version() {
    local version
    version=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

    if [ -z "$version" ]; then
        print_error "Failed to get latest version"
    fi

    echo "$version"
}

# Download and install binary
install_binary() {
    local platform="$1"
    local version="$2"
    local binary_name
    local download_url
    local temp_file

    # Determine binary name based on platform
    case "$platform" in
        macos)
            binary_name="pops-macos"
            ;;
        linux)
            binary_name="pops-linux"
            ;;
        windows)
            binary_name="pops-windows.exe"
            ;;
    esac

    download_url="https://github.com/${REPO}/releases/download/${version}/${binary_name}"
    temp_file="/tmp/${binary_name}"

    print_status "Downloading POPS CLI ${version} for ${platform}..."

    # Download the binary
    if ! curl -fsSL "$download_url" -o "$temp_file"; then
        print_error "Failed to download binary from $download_url"
    fi

    # Make it executable
    chmod +x "$temp_file"

    # Check if we need sudo for installation
    if [ -w "$INSTALL_DIR" ]; then
        print_status "Installing to $INSTALL_DIR..."
        mv "$temp_file" "$INSTALL_DIR/$BINARY_NAME"
    else
        print_status "Installing to $INSTALL_DIR (requires sudo)..."
        sudo mv "$temp_file" "$INSTALL_DIR/$BINARY_NAME"
    fi

    print_success "POPS CLI installed successfully!"
}

# Verify installation
verify_installation() {
    if command -v "$BINARY_NAME" >/dev/null 2>&1; then
        local version
        version=$("$BINARY_NAME" --version 2>/dev/null || echo "unknown")
        print_success "POPS CLI is ready! Version: $version"
        print_status "Try running: $BINARY_NAME --help"
    else
        print_warning "Installation completed but '$BINARY_NAME' not found in PATH"
        print_status "You may need to restart your terminal or add $INSTALL_DIR to your PATH"
    fi
}

# Check if running with custom install directory
if [ -n "$POPS_INSTALL_DIR" ]; then
    INSTALL_DIR="$POPS_INSTALL_DIR"
    print_status "Using custom install directory: $INSTALL_DIR"
fi

# Main installation process
main() {
    print_status "Installing POPS CLI..."

    # Check for curl
    if ! command -v curl >/dev/null 2>&1; then
        print_error "curl is required but not installed"
    fi

    # Detect platform
    platform=$(detect_platform)
    print_status "Detected platform: $platform"

    # Get latest version
    version=$(get_latest_version)
    print_status "Latest version: $version"

    # Install binary
    install_binary "$platform" "$version"

    # Verify installation
    verify_installation

    cat << 'EOF'

🎉 Installation complete!

Get started:
  1. Set your Jira token: export JIRA_PERSONAL_TOKEN=your_token
  2. Create config: pops init (coming soon)
  3. Validate setup: pops validate
  4. Get help: pops --help

For more information, visit: https://github.com/vyasraos/pops

EOF
}

# Run main function
main "$@"
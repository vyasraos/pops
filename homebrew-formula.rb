# This is a template for the Homebrew formula
# This file should be placed in a separate repository: vyasraos/homebrew-tap
# The GitHub Actions workflow will automatically update this formula

class Pops < Formula
  desc "Playbook Operations CLI - A tool for Jira management and project automation"
  homepage "https://github.com/vyasraos/pops"
  version "0.1.0" # This will be automatically updated by GitHub Actions
  license "Apache-2.0"

  on_macos do
    if Hardware::CPU.intel?
      url "https://github.com/vyasraos/pops/releases/download/v#{version}/pops-macos"
      sha256 "PLACEHOLDER_SHA256" # This will be automatically updated
    end
    if Hardware::CPU.arm?
      url "https://github.com/vyasraos/pops/releases/download/v#{version}/pops-macos"
      sha256 "PLACEHOLDER_SHA256" # This will be automatically updated
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/vyasraos/pops/releases/download/v#{version}/pops-linux"
      sha256 "PLACEHOLDER_SHA256" # This will be automatically updated
    end
  end

  def install
    if OS.mac?
      bin.install "pops-macos" => "pops"
    elsif OS.linux?
      bin.install "pops-linux" => "pops"
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/pops --version")

    # Test basic functionality
    help_output = shell_output("#{bin}/pops --help")
    assert_match "Playbook Operations CLI", help_output
    assert_match "validate", help_output
    assert_match "fetch-issues", help_output
  end

  def caveats
    <<~EOS
      🎉 POPS CLI has been installed successfully!

      Get started:
        1. Set your Jira token: export JIRA_PERSONAL_TOKEN=your_token
        2. Validate setup: pops validate
        3. Get help: pops --help

      Configuration:
        Create a pops.toml file in your project root to configure Jira connection.

      Documentation:
        https://github.com/vyasraos/pops/blob/main/README.md

      Report issues:
        https://github.com/vyasraos/pops/issues
    EOS
  end
end
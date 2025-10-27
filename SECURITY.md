# Security Policy

## Supported Versions

We actively support the following versions of POPS CLI with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of POPS CLI seriously. If you discover a security vulnerability, please follow these steps:

### 🔒 Private Reporting (Preferred)

1. **DO NOT** create a public GitHub issue for security vulnerabilities
2. Email security details to: [INSERT SECURITY EMAIL]
3. Include the following information:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact assessment
   - Any suggested fixes (if available)

### 📧 Email Template

```
Subject: [SECURITY] Vulnerability Report for POPS CLI

Vulnerability Type: [e.g., Command Injection, Path Traversal, etc.]
Affected Component: [e.g., CLI command, configuration parser, etc.]
Severity: [Critical/High/Medium/Low]

Description:
[Detailed description of the vulnerability]

Steps to Reproduce:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Expected Impact:
[What could an attacker potentially do?]

Environment:
- POPS CLI Version: [version]
- Operating System: [OS and version]
- Installation Method: [binary/npm/homebrew/source]

Additional Context:
[Any additional information, logs, or context]
```

## Security Response Process

### Timeline

- **Initial Response**: Within 48 hours of receiving the report
- **Validation**: Within 7 days we will validate and assess the severity
- **Resolution**: Critical issues will be patched within 14 days, others within 30 days
- **Disclosure**: Public disclosure will happen after the fix is released

### Our Commitment

1. **Acknowledgment**: We will acknowledge receipt of your vulnerability report
2. **Regular Updates**: We will provide regular updates on our progress
3. **Credit**: We will credit you in our security advisory (unless you prefer to remain anonymous)
4. **Coordination**: We will work with you to ensure proper fix validation

## Security Features

POPS CLI implements several security measures:

### 🔐 Authentication Security
- Secure storage of Jira Personal Access Tokens
- Environment variable-based token management
- No hardcoded credentials in source code

### 🛡️ Input Validation
- Sanitization of user inputs
- Validation of configuration files
- Protection against path traversal attacks

### 🔍 Dependency Security
- Regular dependency updates via Dependabot
- Automated vulnerability scanning with Trivy
- License compliance checking

### 🏗️ Build Security
- Signed releases with checksums
- Reproducible builds
- Supply chain security measures

## Known Security Considerations

### Environment Variables
- `JIRA_PERSONAL_TOKEN` should be kept secure
- Never commit tokens to version control
- Use secure environment variable management

### Configuration Files
- Ensure `pops.toml` doesn't contain sensitive data
- Review file permissions on configuration files
- Use secure paths for template and data directories

### Network Security
- All Jira API calls use HTTPS
- Certificate validation is enforced
- No insecure HTTP fallbacks

## Security Best Practices for Users

### 🔑 Token Management
```bash
# Good: Use environment variables
export JIRA_PERSONAL_TOKEN=your_token_here

# Good: Use .env files (add to .gitignore)
echo "JIRA_PERSONAL_TOKEN=your_token" > .env

# Bad: Don't hardcode in scripts
pops --token hardcoded_token_here  # DON'T DO THIS
```

### 📁 File Permissions
```bash
# Secure your configuration
chmod 600 pops.toml
chmod 600 .env

# Secure your workspace
chmod 700 planning/
```

### 🌐 Network Security
```bash
# Always use HTTPS for Jira URLs
base_url = "https://your-company.atlassian.net"  # Good
base_url = "http://your-company.atlassian.net"   # Bad
```

## Vulnerability Disclosure Policy

### Coordinated Disclosure

We follow a coordinated disclosure policy:

1. **Private Report**: Vulnerability reported privately
2. **Investigation**: We investigate and develop a fix
3. **Validation**: Fix is tested and validated
4. **Release**: Security update is released
5. **Public Disclosure**: Advisory is published with details

### Public Advisory

After fixing a vulnerability, we will publish a security advisory including:

- CVE identifier (if applicable)
- Affected versions
- Impact assessment
- Mitigation steps
- Credit to the reporter (if desired)

## Security Updates

### Automatic Updates

Security updates are distributed through:

- **GitHub Releases**: New versions with security fixes
- **Package Managers**: Updated packages on npm, Homebrew
- **Notifications**: Security advisories via GitHub

### Manual Updates

Users should regularly update POPS CLI:

```bash
# Check current version
pops --version

# Update via Homebrew
brew upgrade pops-cli

# Update via npm
npm update -g pops-cli

# Update binary manually
curl -fsSL https://github.com/vyasraos/pops-cli/releases/latest/download/install.sh | sh
```

## Security Contact

For security-related questions or concerns:

- **Security Issues**: [INSERT SECURITY EMAIL]
- **General Security Questions**: Create a discussion in our [GitHub Discussions](https://github.com/vyasraos/pops-cli/discussions)

## Acknowledgments

We would like to thank the following security researchers for their responsible disclosure:

<!-- This section will be updated as we receive security reports -->

---

**Note**: This security policy is reviewed and updated regularly. Last updated: [Current Date]
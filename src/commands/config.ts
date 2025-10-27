import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import type { CommandModule } from 'yargs';
import { logger } from '../utils/logger';
import { POPSConfig } from '../utils/pops-config';
import { validatePOPSConfig } from '../utils/pops-schema';

interface ConfigValidateArgs {
  configPath?: string;
}

class ConfigValidator {
  private popsConfig: POPSConfig;
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor(configPath?: string) {
    this.popsConfig = new POPSConfig(configPath || 'pops.toml');
  }

  async validate(): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    this.errors = [];
    this.warnings = [];

    console.log(chalk.blue('🔍 Validating POPS configuration...\n'));

    try {
      // 1. Validate TOML file exists and is readable
      await this.validateConfigFile();

      // 2. Validate template files exist
      await this.validateTemplateFiles();

      // 3. Validate JIRA configuration
      await this.validateJiraConfig();

      // 4. Validate paths and directories
      await this.validatePaths();
    } catch (error) {
      this.addError(
        `Critical validation error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  private async validateConfigFile(): Promise<void> {
    const configPath = this.popsConfig.getConfigPath();

    if (!fs.existsSync(configPath)) {
      this.addError(`Configuration file not found: ${configPath}`);
      return;
    }

    try {
      const config = this.popsConfig.getConfig();
      console.log(chalk.green('✅ TOML configuration file loaded successfully'));

      // Validate configuration against Zod schema
      console.log(chalk.blue('🔍 Validating configuration schema...'));
      const validation = validatePOPSConfig(config);

      if (!validation.success) {
        console.log(chalk.red('❌ Configuration schema validation failed:'));
        for (const error of validation.errors || []) {
          this.addError(error);
          console.log(chalk.red(`  • ${error}`));
        }
      } else {
        console.log(chalk.green('✅ Configuration schema validation passed'));
      }
    } catch (error) {
      this.addError(
        `Failed to parse TOML configuration: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async validateTemplateFiles(): Promise<void> {
    const config = this.popsConfig.getConfig();

    if (!config.jira?.paths?.templates) {
      this.addError('Missing templates path configuration in jira.paths');
      return;
    }

    const templateBasePath = config.jira.paths.templates;

    console.log(chalk.blue(`📁 Checking template files in: ${templateBasePath}`));

    // Check for required template files
    const requiredTemplates = ['epic.md', 'story.md', 'task.md', 'spike.md'];

    for (const templateFile of requiredTemplates) {
      const templatePath = path.join(templateBasePath, templateFile);

      if (!fs.existsSync(templatePath)) {
        this.addError(`Template file missing: ${templatePath}`);
      } else {
        console.log(chalk.green(`  ✅ ${templateFile}`));
      }
    }
  }

  private async validateJiraConfig(): Promise<void> {
    const config = this.popsConfig.getConfig();

    console.log(chalk.blue('\n🔗 Validating JIRA configuration...'));

    if (!config.jira?.base_url) {
      this.addError('Missing JIRA base_url in configuration');
    } else {
      console.log(chalk.green(`  ✅ Base URL: ${config.jira.base_url}`));
    }

    if (!config.jira?.project) {
      this.addError('Missing JIRA project key in configuration');
    } else {
      console.log(chalk.green(`  ✅ Project: ${config.jira.project}`));
    }

    // Validate jira.paths configuration
    if (!config.jira?.paths) {
      this.addError('Missing jira.paths configuration');
      return;
    }

    const paths = config.jira.paths;

    if (!paths.master) {
      this.addError('Missing jira.paths.master configuration');
    } else {
      console.log(chalk.green(`  ✅ Master path: ${paths.master}`));
    }

    if (!paths.increments) {
      this.addError('Missing jira.paths.increments configuration');
    } else {
      console.log(chalk.green(`  ✅ Increments path: ${paths.increments}`));
    }

    if (!paths.templates) {
      this.addError('Missing jira.paths.templates configuration');
    } else {
      console.log(chalk.green(`  ✅ Templates path: ${paths.templates}`));
    }

    if (!paths.target) {
      this.addError('Missing jira.paths.target configuration');
    } else {
      console.log(chalk.green(`  ✅ Target: ${paths.target}`));
    }

    // Check environment variable
    if (!process.env.JIRA_PERSONAL_TOKEN) {
      this.addWarning('JIRA_PERSONAL_TOKEN environment variable not set');
    } else {
      console.log(chalk.green('  ✅ JIRA_PERSONAL_TOKEN environment variable is set'));
    }
  }

  private async validatePaths(): Promise<void> {
    const config = this.popsConfig.getConfig();

    console.log(chalk.blue('\n📂 Validating paths and directories...'));

    if (!config.jira?.paths) {
      return; // Already handled in schema validation
    }

    const paths = config.jira.paths;

    // Check if directories exist or can be created
    const pathsToCheck = [
      { name: 'Master', path: paths.master },
      { name: 'Increments', path: paths.increments },
      { name: 'Templates', path: paths.templates },
    ];

    for (const { name, path: dirPath } of pathsToCheck) {
      if (!fs.existsSync(dirPath)) {
        if (config.jira?.create_directories) {
          try {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(chalk.green(`  ✅ ${name} directory created: ${dirPath}`));
          } catch (_error) {
            this.addError(`Failed to create ${name.toLowerCase()} directory: ${dirPath}`);
          }
        } else {
          this.addError(`${name} directory does not exist: ${dirPath}`);
        }
      } else {
        console.log(chalk.green(`  ✅ ${name} directory exists: ${dirPath}`));
      }
    }

    // Check master file exists
    const masterFile = paths.master;
    if (!fs.existsSync(masterFile)) {
      this.addWarning(
        `Master components file not found: ${masterFile} (run 'pops setup' to create it)`
      );
    } else {
      console.log(chalk.green(`  ✅ Master components file exists: ${masterFile}`));
    }
  }

  private addError(message: string): void {
    this.errors.push(message);
  }

  private addWarning(message: string): void {
    this.warnings.push(message);
  }
}

export const validateCommand: CommandModule<{}, ConfigValidateArgs> = {
  command: 'validate',
  describe: 'Validate POPS configuration and setup',
  builder: (yargs) => {
    return yargs
      .option('config-path', {
        alias: 'c',
        type: 'string',
        description: 'Path to POPS configuration file',
        default: 'pops.toml',
      })
      .example('$0 validate', 'Validate pops.toml configuration')
      .example('$0 validate -c my-config.toml', 'Validate custom configuration file');
  },
  handler: async (args) => {
    try {
      const validator = new ConfigValidator(args.configPath);
      const result = await validator.validate();

      console.log(`\n${'='.repeat(60)}`);
      console.log(chalk.bold('📊 VALIDATION RESULTS'));
      console.log('='.repeat(60));

      if (result.errors.length > 0) {
        console.log(chalk.red(`\n❌ ${result.errors.length} ERROR(S) FOUND:`));
        for (const error of result.errors) {
          console.log(chalk.red(`  • ${error}`));
        }
      }

      if (result.warnings.length > 0) {
        console.log(chalk.yellow(`\n⚠️  ${result.warnings.length} WARNING(S) FOUND:`));
        for (const warning of result.warnings) {
          console.log(chalk.yellow(`  • ${warning}`));
        }
      }

      if (result.isValid) {
        console.log(chalk.green('\n✅ Configuration validation PASSED!'));
        console.log(chalk.green('   All configurations are properly set up.'));

        if (result.warnings.length > 0) {
          console.log(chalk.cyan('\n💡 Tip: Address the warnings above to improve your setup.'));
        }
      } else {
        console.log(chalk.red('\n❌ Configuration validation FAILED!'));
        console.log(chalk.red('   Please fix the errors above before proceeding.'));
        process.exit(1);
      }
    } catch (error) {
      logger.error('Failed to validate configuration', error);
      console.log(
        chalk.red(
          `\n❌ Validation failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      process.exit(1);
    }
  },
};

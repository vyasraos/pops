import * as fs from 'fs';
import * as path from 'path';
import * as TOML from 'smol-toml';

export interface SectionConfig {
  section: string;
  cli_input: boolean;
  sub_sections?: SectionConfig[];
}

export interface FieldConfig {
  field: string;
  jira_field: string;
  required: boolean;
  cli_input: boolean;
  default?: string;
}

export interface SectionConfig {
  section: string;
  cli_input: boolean;
  sub_sections?: SectionConfig[];
  fields?: FieldConfig[];
}

export interface ValidationRules {
  required_sections: SectionConfig[];
  jira_mappings: Record<string, any>;
}

export class POPSConfig {
  private config: any;
  private configLoaded: boolean = false;
  private configPath: string;

  // Getter for config access (used by validator)
  getConfig(): any {
    if (!this.configLoaded) {
      this.loadConfig();
    }
    return this.config;
  }

  // Getter for jira config
  get jira(): any {
    if (!this.configLoaded) {
      this.loadConfig();
    }
    return this.config.jira || {};
  }

  constructor(configPath?: string) {
    if (configPath) {
      this.configPath = configPath;
    } else {
      // Try multiple possible locations
      const possiblePaths = [
        'pops.toml',
        path.join(process.cwd(), 'pops.toml'),
        path.join(process.cwd(), '..', 'pops.toml'),
        path.join(process.cwd(), '..', '..', 'pops.toml'),
        path.join(process.cwd(), '..', '..', '..', 'pops.toml'),
        path.join(process.cwd(), '..', '..', '..', '..', 'pops.toml'),
        path.join(process.cwd(), '..', '..', '..', '..', '..', 'pops.toml')
      ];
      
      let foundPath: string | undefined;
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          foundPath = possiblePath;
          break;
        }
      }
      
      this.configPath = foundPath || 'pops.toml'; // fallback
    }
    // Don't load config in constructor - load lazily
  }

  getConfigPath(): string {
    return this.configPath;
  }

  private loadConfig() {
    if (this.configLoaded) {
      return;
    }
    
    try {
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Config file does not exist: ${this.configPath}`);
      }
      const configContent = fs.readFileSync(this.configPath, 'utf-8');
      this.config = TOML.parse(configContent);
      
      // Resolve relative paths relative to config file directory
      const configDir = path.dirname(this.configPath);
      if (this.config.jira?.paths) {
        const paths = this.config.jira.paths;
        if (paths.master) {
          paths.master = path.resolve(configDir, paths.master);
        }
        if (paths.increments) {
          paths.increments = path.resolve(configDir, paths.increments);
        }
        if (paths.templates) {
          paths.templates = path.resolve(configDir, paths.templates);
        }
      }
      
      this.configLoaded = true;
    } catch (error) {
      throw new Error(`Failed to load config from ${this.configPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getTemplatePath(templateType: string): string {
    const templates = this.config.templates || {};
    const planning = templates.planning || {};
    const types = planning.types || {};

    if (!types[templateType]) {
      throw new Error(`Template type '${templateType}' not found in config`);
    }

    const basePath = templates.base_path || 'templates';
    const planningPath = planning.path || 'templates/planning';

    return path.join(planningPath, types[templateType]);
  }

  getDeliveryPath(): string {
    return this.config.output?.paths?.delivery || 'planning/delivery/FY26/Q2/';
  }

  getComponentsPath(): string {
    return this.config.output?.paths?.components || 'planning/components';
  }

  getValidationRules(templateType: string): ValidationRules {
    const validation = this.config.validation || {};

    // Get template-specific validation rules
    const typeRules = validation[templateType] || {};

    // Extract JIRA mappings from fields in sections
    const jiraMappings: Record<string, any> = {};
    const requiredSections = typeRules.required_sections || [];
    
    for (const section of requiredSections) {
      if (section.fields) {
        for (const field of section.fields) {
          jiraMappings[field.field] = {
            jira_field: field.jira_field,
            required: field.required,
            cli_input: field.cli_input,
            default: field.default
          };
        }
      }
    }

    return {
      required_sections: requiredSections,
      jira_mappings: jiraMappings,
    };
  }

  getCliInputSections(templateType?: string): SectionConfig[] {
    const validation = this.config.validation || {};

    // Use template-specific validation if provided
    const rules = templateType ? (validation[templateType] || {}) : {};

    const requiredSections = rules.required_sections || [];
    const cliSections: SectionConfig[] = [];

    // Collect sections with cli_input = true, including sub-sections
    for (const section of requiredSections) {
      if (section.cli_input === true) {
        cliSections.push(section);
      }

      // Check sub-sections for cli_input = true
      if (section.sub_sections) {
        for (const subSection of section.sub_sections) {
          if (subSection.cli_input === true) {
            cliSections.push(subSection);
          }
        }
      }
    }

    return cliSections;
  }

  getCliInputFields(templateType?: string): FieldConfig[] {
    const validation = this.config.validation || {};

    // Use template-specific validation if provided
    const rules = templateType ? (validation[templateType] || {}) : {};

    const requiredSections = rules.required_sections || [];
    const cliFields: FieldConfig[] = [];

    // Collect fields with cli_input = true from all sections
    for (const section of requiredSections) {
      if (section.fields) {
        for (const field of section.fields) {
          if (field.cli_input === true) {
            cliFields.push(field);
          }
        }
      }
    }

    return cliFields;
  }
}

// Export a function to load config
export function loadPopsConfig(): any {
  const config = new POPSConfig();
  return config.getConfig();
}
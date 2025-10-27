import { z } from 'zod';

// Zod schema for pops.toml configuration validation
export const POPSConfigSchema = z.object({
  cli: z.object({
    name: z.string().min(1, 'CLI name is required'),
    version: z.string().min(1, 'CLI version is required'),
    description: z.string().optional(),
  }),

  jira: z.object({
    base_url: z.string().min(1, 'Jira base URL is required'),
    project: z.string().min(1, 'Jira project key is required'),
    paths: z.object({
      master: z.string().min(1, 'Master path is required'),
      increments: z.string().min(1, 'Increments path is required'),
      templates: z.string().min(1, 'Templates path is required'),
      target: z.string().min(1, 'Target increment is required'),
    }),
    create_directories: z.boolean().default(true),
    overwrite_existing: z.boolean().default(false),
  }),

  // Removed deprecated sections: templates, output, validation
});

export type POPSConfigType = z.infer<typeof POPSConfigSchema>;

// Schema for master file (simplified structure)
export const MasterComponentsSchema = z.object({
  project: z.object({
    key: z.string(),
    name: z.string(),
    id: z.string(),
  }),
  components: z.array(
    z.object({
      name: z.string(),
      jira_id: z.string(),
    })
  ),
  issue_types: z.array(
    z.object({
      issue_type: z.string(),
      jira_id: z.string(),
    })
  ),
  metadata: z.object({
    lastUpdated: z.string(),
    version: z.string(),
  }),
});

export type MasterComponentsType = z.infer<typeof MasterComponentsSchema>;

export function validatePOPSConfig(config: unknown): {
  success: boolean;
  data?: POPSConfigType;
  errors?: string[];
} {
  try {
    const validatedConfig = POPSConfigSchema.parse(config);
    return { success: true, data: validatedConfig };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err) => {
        const path = err.path.length > 0 ? err.path.join('.') : 'root';
        return `${path}: ${err.message}`;
      });
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown validation error'] };
  }
}

export function validateMasterComponents(config: unknown): {
  success: boolean;
  data?: MasterComponentsType;
  errors?: string[];
} {
  try {
    const validatedConfig = MasterComponentsSchema.parse(config);
    return { success: true, data: validatedConfig };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err) => {
        const path = err.path.length > 0 ? err.path.join('.') : 'root';
        return `${path}: ${err.message}`;
      });
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown validation error'] };
  }
}

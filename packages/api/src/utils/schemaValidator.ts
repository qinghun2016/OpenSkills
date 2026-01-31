/**
 * JSON Schema validation utilities
 * Uses AJV for validation against OpenSkills schemas
 */

import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import * as path from 'path';
import { readJsonFile, getSchemasDir } from './fileUtils';

// AJV instance with formats
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Cached validators
const validators: Map<string, ValidateFunction> = new Map();

/**
 * Schema types available for validation
 */
export type SchemaType = 'proposal' | 'decision' | 'preferences';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ErrorObject[] | null;
  errorMessage?: string;
}

/**
 * Get schema file path
 */
function getSchemaPath(schemaType: SchemaType): string {
  return path.join(getSchemasDir(), `${schemaType}.schema.json`);
}

/**
 * Load and compile a schema
 */
async function loadSchema(schemaType: SchemaType): Promise<ValidateFunction | null> {
  // Check cache first
  if (validators.has(schemaType)) {
    return validators.get(schemaType)!;
  }

  const schemaPath = getSchemaPath(schemaType);
  const schema = await readJsonFile<object>(schemaPath);

  if (!schema) {
    console.error(`Schema not found: ${schemaPath}`);
    return null;
  }

  try {
    const validate = ajv.compile(schema);
    validators.set(schemaType, validate);
    return validate;
  } catch (err) {
    console.error(`Failed to compile schema ${schemaType}:`, err);
    return null;
  }
}

/**
 * Validate data against a schema
 */
export async function validate(
  schemaType: SchemaType,
  data: unknown
): Promise<ValidationResult> {
  const validator = await loadSchema(schemaType);

  if (!validator) {
    return {
      valid: false,
      errorMessage: `Schema '${schemaType}' not found or invalid`,
    };
  }

  const valid = validator(data);

  if (valid) {
    return { valid: true };
  }

  // Format error messages
  const errors = validator.errors;
  const errorMessage = errors
    ?.map(e => {
      const field = e.instancePath || 'root';
      return `${field}: ${e.message}`;
    })
    .join('; ');

  return {
    valid: false,
    errors,
    errorMessage,
  };
}

/**
 * Validate a proposal
 */
export async function validateProposal(data: unknown): Promise<ValidationResult> {
  return validate('proposal', data);
}

/**
 * Validate a decision
 */
export async function validateDecision(data: unknown): Promise<ValidationResult> {
  return validate('decision', data);
}

/**
 * Quick validation check (returns boolean)
 */
export async function isValid(schemaType: SchemaType, data: unknown): Promise<boolean> {
  const result = await validate(schemaType, data);
  return result.valid;
}

/**
 * Clear cached validators (useful for testing or schema updates)
 */
export function clearValidatorCache(): void {
  validators.clear();
}

/**
 * Preload all schemas into cache
 */
export async function preloadSchemas(): Promise<void> {
  const schemaTypes: SchemaType[] = ['proposal', 'decision', 'preferences'];
  await Promise.all(schemaTypes.map(loadSchema));
}

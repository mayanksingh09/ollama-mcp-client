/**
 * Tool Validator - Parameter validation using JSON Schema
 */

import type { ExtendedTool, ToolValidationResult, ToolValidationError } from '../types/tools.types';
import type { Logger } from 'winston';
import winston from 'winston';

export class ToolValidator {
  private logger: Logger;
  private customValidators: Map<string, (value: unknown, schema: unknown) => boolean> = new Map();

  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'ToolValidator' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
      ],
    });

    this.registerDefaultValidators();
  }

  /**
   * Validate tool parameters against schema
   */
  async validate(
    tool: ExtendedTool,
    parameters: Record<string, unknown>
  ): Promise<ToolValidationResult> {
    const errors: ToolValidationError[] = [];
    const warnings: string[] = [];
    const sanitizedParams: Record<string, unknown> = {};

    if (!tool.inputSchema) {
      // No schema defined, pass through parameters
      return {
        isValid: true,
        sanitizedParams: parameters,
      };
    }

    const schema = tool.inputSchema;
    const properties = schema.properties || {};
    const required = schema.required || [];

    // Check required parameters
    for (const requiredParam of required) {
      if (!(requiredParam in parameters) || parameters[requiredParam] === undefined) {
        errors.push({
          parameter: requiredParam,
          message: `Required parameter '${requiredParam}' is missing`,
          expected: 'defined value',
          received: undefined,
        });
      }
    }

    // Validate each parameter
    for (const [paramName, paramValue] of Object.entries(parameters)) {
      const paramSchema = properties[paramName];

      if (!paramSchema) {
        // Parameter not in schema
        warnings.push(`Parameter '${paramName}' is not defined in schema`);
        continue;
      }

      const validationResult = this.validateParameter(
        paramName,
        paramValue,
        paramSchema as Record<string, unknown>
      );

      if (validationResult.error) {
        errors.push(validationResult.error);
      } else {
        sanitizedParams[paramName] =
          validationResult.sanitizedValue !== undefined
            ? validationResult.sanitizedValue
            : paramValue;
      }

      if (validationResult.warnings) {
        warnings.push(...validationResult.warnings);
      }
    }

    // Add default values for missing optional parameters
    for (const [paramName, paramSchema] of Object.entries(properties)) {
      if (!(paramName in sanitizedParams)) {
        const schema = paramSchema as Record<string, unknown>;
        if ('default' in schema) {
          sanitizedParams[paramName] = schema.default;
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      sanitizedParams,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate a single parameter
   */
  private validateParameter(
    name: string,
    value: unknown,
    schema: Record<string, unknown>
  ): {
    error?: ToolValidationError;
    sanitizedValue?: unknown;
    warnings?: string[];
  } {
    const warnings: string[] = [];
    let sanitizedValue = value;

    // Type validation
    if (schema.type) {
      const typeResult = this.validateType(name, value, schema.type as string);
      if (typeResult.error) {
        return { error: typeResult.error };
      }
      if (typeResult.coercedValue !== undefined) {
        sanitizedValue = typeResult.coercedValue;
      }
    }

    // String validations
    if (schema.type === 'string' && typeof sanitizedValue === 'string') {
      // Pattern validation
      if (schema.pattern) {
        const pattern = new RegExp(schema.pattern as string);
        if (!pattern.test(sanitizedValue)) {
          return {
            error: {
              parameter: name,
              message: `Value does not match pattern: ${schema.pattern}`,
              expected: `matching pattern ${schema.pattern}`,
              received: sanitizedValue,
            },
          };
        }
      }

      // Length validations
      if (schema.minLength && sanitizedValue.length < (schema.minLength as number)) {
        return {
          error: {
            parameter: name,
            message: `String length is less than minimum: ${schema.minLength}`,
            expected: `length >= ${schema.minLength}`,
            received: `length = ${(sanitizedValue as string).length}`,
          },
        };
      }

      if (schema.maxLength && sanitizedValue.length > (schema.maxLength as number)) {
        // Truncate and warn
        sanitizedValue = sanitizedValue.substring(0, schema.maxLength as number);
        warnings.push(`String truncated to maximum length: ${schema.maxLength}`);
      }
    }

    // Number validations
    if (
      (schema.type === 'number' || schema.type === 'integer') &&
      typeof sanitizedValue === 'number'
    ) {
      // Integer check
      if (schema.type === 'integer' && !Number.isInteger(sanitizedValue)) {
        sanitizedValue = Math.round(sanitizedValue);
        warnings.push(`Number rounded to integer: ${sanitizedValue}`);
      }

      // Range validations
      if (schema.minimum !== undefined && (sanitizedValue as number) < (schema.minimum as number)) {
        return {
          error: {
            parameter: name,
            message: `Value is less than minimum: ${schema.minimum}`,
            expected: `>= ${schema.minimum}`,
            received: sanitizedValue,
          },
        };
      }

      if (schema.maximum !== undefined && (sanitizedValue as number) > (schema.maximum as number)) {
        return {
          error: {
            parameter: name,
            message: `Value is greater than maximum: ${schema.maximum}`,
            expected: `<= ${schema.maximum}`,
            received: sanitizedValue,
          },
        };
      }
    }

    // Array validations
    if (schema.type === 'array' && Array.isArray(sanitizedValue)) {
      // Items validation
      if (schema.items) {
        const itemSchema = schema.items as Record<string, unknown>;
        const validatedItems: unknown[] = [];

        for (let i = 0; i < sanitizedValue.length; i++) {
          const itemResult = this.validateParameter(`${name}[${i}]`, sanitizedValue[i], itemSchema);

          if (itemResult.error) {
            return { error: itemResult.error };
          }

          validatedItems.push(
            itemResult.sanitizedValue !== undefined ? itemResult.sanitizedValue : sanitizedValue[i]
          );
        }

        sanitizedValue = validatedItems;
      }

      // Array length validations
      if (schema.minItems && (sanitizedValue as unknown[]).length < (schema.minItems as number)) {
        return {
          error: {
            parameter: name,
            message: `Array length is less than minimum: ${schema.minItems}`,
            expected: `length >= ${schema.minItems}`,
            received: `length = ${(sanitizedValue as unknown[]).length}`,
          },
        };
      }

      if (schema.maxItems && (sanitizedValue as unknown[]).length > (schema.maxItems as number)) {
        sanitizedValue = (sanitizedValue as unknown[]).slice(0, schema.maxItems as number);
        warnings.push(`Array truncated to maximum items: ${schema.maxItems}`);
      }
    }

    // Enum validation
    if (schema.enum) {
      const enumValues = schema.enum as unknown[];
      if (!enumValues.includes(sanitizedValue)) {
        return {
          error: {
            parameter: name,
            message: `Value is not in enum`,
            expected: `one of [${enumValues.join(', ')}]`,
            received: sanitizedValue,
          },
        };
      }
    }

    // Object validations
    if (schema.type === 'object' && typeof sanitizedValue === 'object' && sanitizedValue !== null) {
      if (schema.properties) {
        const objectProps = schema.properties as Record<string, Record<string, unknown>>;
        const sanitizedObject: Record<string, unknown> = {};

        for (const [propName, propValue] of Object.entries(
          sanitizedValue as Record<string, unknown>
        )) {
          if (objectProps[propName]) {
            const propResult = this.validateParameter(
              `${name}.${propName}`,
              propValue,
              objectProps[propName]
            );

            if (propResult.error) {
              return { error: propResult.error };
            }

            sanitizedObject[propName] =
              propResult.sanitizedValue !== undefined ? propResult.sanitizedValue : propValue;
          } else {
            sanitizedObject[propName] = propValue;
          }
        }

        sanitizedValue = sanitizedObject;
      }
    }

    // Custom validation
    if (schema.format && this.customValidators.has(schema.format as string)) {
      const validator = this.customValidators.get(schema.format as string);
      if (validator && !validator(sanitizedValue, schema)) {
        return {
          error: {
            parameter: name,
            message: `Value does not match format: ${schema.format}`,
            expected: schema.format as string,
            received: sanitizedValue,
          },
        };
      }
    }

    return {
      sanitizedValue,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate and coerce type
   */
  private validateType(
    name: string,
    value: unknown,
    expectedType: string
  ): {
    error?: ToolValidationError;
    coercedValue?: unknown;
  } {
    const actualType = this.getType(value);

    if (actualType === expectedType) {
      return {};
    }

    // Try type coercion
    const coerced = this.coerceType(value, expectedType);
    if (coerced.success) {
      return { coercedValue: coerced.value };
    }

    return {
      error: {
        parameter: name,
        message: `Type mismatch`,
        expected: expectedType,
        received: actualType,
      },
    };
  }

  /**
   * Get the type of a value
   */
  private getType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  /**
   * Attempt to coerce value to expected type
   */
  private coerceType(value: unknown, targetType: string): { success: boolean; value?: unknown } {
    try {
      switch (targetType) {
        case 'string':
          if (value === null || value === undefined) return { success: false };
          return { success: true, value: String(value) };

        case 'number':
          if (typeof value === 'string') {
            const num = parseFloat(value);
            if (!isNaN(num)) {
              return { success: true, value: num };
            }
          }
          if (typeof value === 'boolean') {
            return { success: true, value: value ? 1 : 0 };
          }
          break;

        case 'integer':
          if (typeof value === 'string') {
            const num = parseInt(value, 10);
            if (!isNaN(num)) {
              return { success: true, value: num };
            }
          }
          if (typeof value === 'number') {
            return { success: true, value: Math.round(value) };
          }
          if (typeof value === 'boolean') {
            return { success: true, value: value ? 1 : 0 };
          }
          break;

        case 'boolean':
          if (typeof value === 'string') {
            if (value === 'true' || value === '1') {
              return { success: true, value: true };
            }
            if (value === 'false' || value === '0') {
              return { success: true, value: false };
            }
          }
          if (typeof value === 'number') {
            return { success: true, value: value !== 0 };
          }
          break;

        case 'array':
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value);
              if (Array.isArray(parsed)) {
                return { success: true, value: parsed };
              }
            } catch {
              // Try comma-separated values
              return { success: true, value: value.split(',').map((s) => s.trim()) };
            }
          }
          break;

        case 'object':
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value);
              if (typeof parsed === 'object' && parsed !== null) {
                return { success: true, value: parsed };
              }
            } catch {
              // Not valid JSON
            }
          }
          break;
      }
    } catch (error) {
      this.logger.debug(`Failed to coerce type: ${error}`);
    }

    return { success: false };
  }

  /**
   * Register default format validators
   */
  private registerDefaultValidators(): void {
    // Email validator
    this.registerValidator('email', (value) => {
      if (typeof value !== 'string') return false;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    });

    // URL validator
    this.registerValidator('uri', (value) => {
      if (typeof value !== 'string') return false;
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    });

    // Date-time validator
    this.registerValidator('date-time', (value) => {
      if (typeof value !== 'string') return false;
      const date = new Date(value);
      return !isNaN(date.getTime());
    });

    // UUID validator
    this.registerValidator('uuid', (value) => {
      if (typeof value !== 'string') return false;
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      return uuidRegex.test(value);
    });

    // IPv4 validator
    this.registerValidator('ipv4', (value) => {
      if (typeof value !== 'string') return false;
      const ipv4Regex =
        /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      return ipv4Regex.test(value);
    });

    // IPv6 validator
    this.registerValidator('ipv6', (value) => {
      if (typeof value !== 'string') return false;
      const ipv6Regex =
        /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
      return ipv6Regex.test(value);
    });
  }

  /**
   * Register a custom format validator
   */
  registerValidator(format: string, validator: (value: unknown, schema: unknown) => boolean): void {
    this.customValidators.set(format, validator);
    this.logger.debug(`Registered custom validator for format: ${format}`);
  }

  /**
   * Unregister a custom format validator
   */
  unregisterValidator(format: string): void {
    this.customValidators.delete(format);
    this.logger.debug(`Unregistered custom validator for format: ${format}`);
  }
}

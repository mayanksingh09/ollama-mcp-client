/**
 * ToolValidator unit tests
 */

import { ToolValidator } from '../../src/tools/ToolValidator';

describe('ToolValidator', () => {
  let validator: ToolValidator;

  beforeEach(() => {
    validator = new ToolValidator({
      strictMode: true,
      coerceTypes: true,
      removeAdditional: true,
      customFormats: {
        phone: /^\+?[1-9]\d{1,14}$/,
        'hex-color': /^#[0-9A-Fa-f]{6}$/,
      },
    });
  });

  describe('validateParameters', () => {
    it('should validate simple object schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          active: { type: 'boolean' },
        },
        required: ['name', 'age'],
      };

      const validParams = {
        name: 'John',
        age: 30,
        active: true,
      };

      const result = validator.validateParameters(schema, validParams);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing required fields', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['name', 'email'],
      };

      const invalidParams = {
        name: 'John',
        // Missing email
      };

      const result = validator.validateParameters(schema, invalidParams);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'email',
          message: expect.stringContaining('required'),
        })
      );
    });

    it('should fail validation for incorrect types', () => {
      const schema = {
        type: 'object',
        properties: {
          count: { type: 'number' },
        },
      };

      const invalidParams = {
        count: 'not a number',
      };

      const result = validator.validateParameters(schema, invalidParams);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'count',
          constraint: 'type',
        })
      );
    });

    it('should validate nested objects', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              address: {
                type: 'object',
                properties: {
                  street: { type: 'string' },
                  city: { type: 'string' },
                },
                required: ['street', 'city'],
              },
            },
            required: ['name', 'address'],
          },
        },
        required: ['user'],
      };

      const validParams = {
        user: {
          name: 'John',
          address: {
            street: '123 Main St',
            city: 'New York',
          },
        },
      };

      const result = validator.validateParameters(schema, validParams);
      expect(result.valid).toBe(true);
    });

    it('should validate arrays', () => {
      const schema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 5,
          },
        },
      };

      const validParams = {
        tags: ['tag1', 'tag2', 'tag3'],
      };

      const result = validator.validateParameters(schema, validParams);
      expect(result.valid).toBe(true);
    });

    it('should validate array length constraints', () => {
      const schema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 4,
          },
        },
      };

      const tooFew = { items: [1] };
      const tooMany = { items: [1, 2, 3, 4, 5] };
      const justRight = { items: [1, 2, 3] };

      expect(validator.validateParameters(schema, tooFew).valid).toBe(false);
      expect(validator.validateParameters(schema, tooMany).valid).toBe(false);
      expect(validator.validateParameters(schema, justRight).valid).toBe(true);
    });

    it('should validate string patterns', () => {
      const schema = {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            pattern: '^[\\w.-]+@[\\w.-]+\\.\\w+$',
          },
        },
      };

      const valid = { email: 'test@example.com' };
      const invalid = { email: 'not-an-email' };

      expect(validator.validateParameters(schema, valid).valid).toBe(true);
      expect(validator.validateParameters(schema, invalid).valid).toBe(false);
    });

    it('should validate string length constraints', () => {
      const schema = {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 20,
          },
        },
      };

      const tooShort = { username: 'ab' };
      const tooLong = { username: 'a'.repeat(21) };
      const valid = { username: 'validuser' };

      expect(validator.validateParameters(schema, tooShort).valid).toBe(false);
      expect(validator.validateParameters(schema, tooLong).valid).toBe(false);
      expect(validator.validateParameters(schema, valid).valid).toBe(true);
    });

    it('should validate number constraints', () => {
      const schema = {
        type: 'object',
        properties: {
          age: {
            type: 'number',
            minimum: 0,
            maximum: 120,
          },
          score: {
            type: 'number',
            exclusiveMinimum: 0,
            exclusiveMaximum: 100,
          },
        },
      };

      const valid = { age: 25, score: 50 };
      const invalidAge = { age: -5, score: 50 };
      const invalidScore = { age: 25, score: 100 };

      expect(validator.validateParameters(schema, valid).valid).toBe(true);
      expect(validator.validateParameters(schema, invalidAge).valid).toBe(false);
      expect(validator.validateParameters(schema, invalidScore).valid).toBe(false);
    });

    it('should validate enum values', () => {
      const schema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'active', 'completed'],
          },
        },
      };

      const valid = { status: 'active' };
      const invalid = { status: 'cancelled' };

      expect(validator.validateParameters(schema, valid).valid).toBe(true);
      expect(validator.validateParameters(schema, invalid).valid).toBe(false);
    });

    it('should validate format strings', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          url: { type: 'string', format: 'url' },
          date: { type: 'string', format: 'date' },
          uuid: { type: 'string', format: 'uuid' },
        },
      };

      const valid = {
        email: 'test@example.com',
        url: 'https://example.com',
        date: '2024-01-01',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
      };

      const invalid = {
        email: 'not-email',
        url: 'not-url',
        date: 'not-date',
        uuid: 'not-uuid',
      };

      expect(validator.validateParameters(schema, valid).valid).toBe(true);
      expect(validator.validateParameters(schema, invalid).valid).toBe(false);
    });

    it('should validate custom formats', () => {
      const schema = {
        type: 'object',
        properties: {
          phone: { type: 'string', format: 'phone' },
          color: { type: 'string', format: 'hex-color' },
        },
      };

      const valid = {
        phone: '+14155552671',
        color: '#FF5733',
      };

      const invalid = {
        phone: '123',
        color: 'red',
      };

      expect(validator.validateParameters(schema, valid).valid).toBe(true);
      expect(validator.validateParameters(schema, invalid).valid).toBe(false);
    });

    it('should validate oneOf schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          value: {
            oneOf: [{ type: 'string' }, { type: 'number' }],
          },
        },
      };

      const validString = { value: 'text' };
      const validNumber = { value: 42 };
      const invalid = { value: true };

      expect(validator.validateParameters(schema, validString).valid).toBe(true);
      expect(validator.validateParameters(schema, validNumber).valid).toBe(true);
      expect(validator.validateParameters(schema, invalid).valid).toBe(false);
    });

    it('should validate allOf schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          data: {
            allOf: [
              {
                type: 'object',
                properties: { a: { type: 'string' } },
                required: ['a'],
              },
              {
                type: 'object',
                properties: { b: { type: 'number' } },
                required: ['b'],
              },
            ],
          },
        },
      };

      const valid = { data: { a: 'text', b: 42 } };
      const invalid = { data: { a: 'text' } }; // Missing b

      expect(validator.validateParameters(schema, valid).valid).toBe(true);
      expect(validator.validateParameters(schema, invalid).valid).toBe(false);
    });
  });

  describe('sanitizeParameters', () => {
    it('should coerce string to number when enabled', () => {
      const schema = {
        type: 'object',
        properties: {
          age: { type: 'number' },
        },
      };

      const params = { age: '25' };
      const sanitized = validator.sanitizeParameters(schema, params);

      expect(sanitized.age).toBe(25);
      expect(typeof sanitized.age).toBe('number');
    });

    it('should coerce string to boolean', () => {
      const schema = {
        type: 'object',
        properties: {
          active: { type: 'boolean' },
        },
      };

      const params1 = { active: 'true' };
      const params2 = { active: 'false' };
      const params3 = { active: '1' };
      const params4 = { active: '0' };

      expect(validator.sanitizeParameters(schema, params1).active).toBe(true);
      expect(validator.sanitizeParameters(schema, params2).active).toBe(false);
      expect(validator.sanitizeParameters(schema, params3).active).toBe(true);
      expect(validator.sanitizeParameters(schema, params4).active).toBe(false);
    });

    it('should remove additional properties when configured', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };

      const params = {
        name: 'John',
        extra: 'should be removed',
        another: 123,
      };

      const sanitized = validator.sanitizeParameters(schema, params);

      expect(sanitized.name).toBe('John');
      expect(sanitized.extra).toBeUndefined();
      expect(sanitized.another).toBeUndefined();
    });

    it('should apply default values', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          status: { type: 'string', default: 'pending' },
          count: { type: 'number', default: 0 },
        },
      };

      const params = { name: 'John' };
      const sanitized = validator.sanitizeParameters(schema, params);

      expect(sanitized.name).toBe('John');
      expect(sanitized.status).toBe('pending');
      expect(sanitized.count).toBe(0);
    });

    it('should trim strings when configured', () => {
      const validatorWithTrim = new ToolValidator({
        trimStrings: true,
      });

      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const params = { name: '  John Doe  ' };
      const sanitized = validatorWithTrim.sanitizeParameters(schema, params);

      expect(sanitized.name).toBe('John Doe');
    });

    it('should handle null and undefined values', () => {
      const schema = {
        type: 'object',
        properties: {
          optional: { type: ['string', 'null'] },
          required: { type: 'string' },
        },
      };

      const params1 = { optional: null, required: 'value' };
      const params2 = { required: 'value' };

      const sanitized1 = validator.sanitizeParameters(schema, params1);
      const sanitized2 = validator.sanitizeParameters(schema, params2);

      expect(sanitized1.optional).toBeNull();
      expect(sanitized2.optional).toBeUndefined();
    });
  });

  describe('getSchemaInfo', () => {
    it('should extract schema information', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'User name' },
          age: { type: 'number', description: 'User age' },
          email: { type: 'string', format: 'email' },
        },
        required: ['name', 'email'],
      };

      const info = validator.getSchemaInfo(schema);

      expect(info.type).toBe('object');
      expect(info.requiredFields).toEqual(['name', 'email']);
      expect(info.properties).toHaveProperty('name');
      expect(info.properties).toHaveProperty('age');
      expect(info.properties).toHaveProperty('email');
    });

    it('should handle complex nested schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                },
              },
            },
          },
        },
      };

      const info = validator.getSchemaInfo(schema);

      expect(info.properties).toHaveProperty('user');
      expect(info.properties.user).toHaveProperty('type', 'object');
    });
  });

  describe('strict mode', () => {
    it('should enforce strict validation when enabled', () => {
      const strictValidator = new ToolValidator({
        strictMode: true,
        coerceTypes: false,
      });

      const schema = {
        type: 'object',
        properties: {
          count: { type: 'number' },
        },
      };

      const params = { count: '10' }; // String instead of number

      const result = strictValidator.validateParameters(schema, params);
      expect(result.valid).toBe(false);
    });

    it('should allow type coercion when strict mode is disabled', () => {
      const lenientValidator = new ToolValidator({
        strictMode: false,
        coerceTypes: true,
      });

      const schema = {
        type: 'object',
        properties: {
          count: { type: 'number' },
        },
      };

      const params = { count: '10' };

      const result = lenientValidator.validateParameters(schema, params);
      expect(result.valid).toBe(true);
    });
  });
});

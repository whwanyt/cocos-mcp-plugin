import { z } from 'zod';
import { JsonObject, JsonValue } from '../../types';

export const TOOL_INPUT_VALIDATOR: unique symbol = Symbol('toolInputValidator');

export interface JsonSchemaWithValidator extends JsonObject {
  [TOOL_INPUT_VALIDATOR]?: z.ZodType<unknown>;
}

export interface ToolInputValidationSuccess {
  success: true;
  data: JsonObject;
}

export interface ToolInputValidationFailure {
  success: false;
  issues: JsonObject[];
}

export type ToolInputValidationResult = ToolInputValidationSuccess | ToolInputValidationFailure;

// EN: MCP still receives JSON Schema; the hidden symbol keeps the runtime Zod validator off the wire.
// ZH: MCP 对外仍接收 JSON Schema；隐藏 symbol 用于保存运行时 Zod validator，且不会被序列化。
export function attachInputValidator<TSchema extends JsonObject>(
  schema: TSchema,
  validator: z.ZodType<unknown>,
): TSchema {
  Object.defineProperty(schema, TOOL_INPUT_VALIDATOR, {
    value: validator,
    enumerable: false,
    configurable: false,
  });
  return schema;
}

export function getInputValidator(schema: JsonObject): z.ZodType<unknown> {
  return (schema as JsonSchemaWithValidator)[TOOL_INPUT_VALIDATOR] ?? zodFromJsonSchema(schema);
}

export function validateToolInput(schema: JsonObject, args: JsonObject): ToolInputValidationResult {
  const parsed = getInputValidator(schema).safeParse(args);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.map(String).join('.') : '<root>',
        message: issue.message,
        code: issue.code,
      })),
    };
  }

  if (!isPlainObject(parsed.data)) {
    return {
      success: false,
      issues: [{
        path: '<root>',
        message: 'Tool arguments must be a JSON object',
        code: 'invalid_type',
      }],
    };
  }

  return {
    success: true,
    data: parsed.data as JsonObject,
  };
}

export function zodFromJsonSchema(schema: JsonObject): z.ZodType<unknown> {
  const type = readString(schema.type);
  const base = createBaseValidator(type, schema);
  return applyEnumConstraint(base, schema);
}

function createBaseValidator(type: string | undefined, schema: JsonObject): z.ZodType<unknown> {
  if (type === 'object' || (type === undefined && isPlainObject(schema.properties))) {
    const required = new Set(readStringArray(schema.required));
    const shape: Record<string, z.ZodType<unknown>> = {};
    for (const [key, value] of Object.entries(readProperties(schema))) {
      const childValidator = getInputValidator(value);
      shape[key] = required.has(key) ? childValidator : childValidator.optional();
    }
    return z.object(shape).passthrough();
  }

  if (type === 'array') {
    const itemSchema = isJsonObject(schema.items) ? schema.items : undefined;
    return z.array(itemSchema ? getInputValidator(itemSchema) : z.unknown());
  }

  if (type === 'string') {
    return z.string();
  }

  if (type === 'number' || type === 'integer') {
    let validator = type === 'integer' ? z.number().int() : z.number();
    const minimum = readNumber(schema.minimum);
    const maximum = readNumber(schema.maximum);
    if (minimum !== undefined) {
      validator = validator.min(minimum);
    }
    if (maximum !== undefined) {
      validator = validator.max(maximum);
    }
    return validator;
  }

  if (type === 'boolean') {
    return z.boolean();
  }

  if (type === 'null') {
    return z.null();
  }

  return z.unknown();
}

function applyEnumConstraint(validator: z.ZodType<unknown>, schema: JsonObject): z.ZodType<unknown> {
  const enumValues = readJsonArray(schema.enum);
  if (enumValues.length === 0) {
    return validator;
  }
  return validator.refine(
    (value) => enumValues.some((entry) => sameJsonValue(entry, value)),
    { message: `Expected one of: ${enumValues.map((value) => JSON.stringify(value)).join(', ')}` },
  );
}

function readProperties(schema: JsonObject): Record<string, JsonObject> {
  if (!isPlainObject(schema.properties)) {
    return {};
  }

  const properties: Record<string, JsonObject> = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    if (isJsonObject(value)) {
      properties[key] = value;
    }
  }
  return properties;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function readJsonArray(value: unknown): JsonValue[] {
  return Array.isArray(value) ? value.filter(isJsonValue) : [];
}

function isJsonObject(value: unknown): value is JsonObject {
  return isPlainObject(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (isPlainObject(value)) {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

function sameJsonValue(left: JsonValue, right: unknown): boolean {
  if (right === undefined || typeof right === 'function' || typeof right === 'symbol') {
    return false;
  }

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch (_error) {
    return false;
  }
}

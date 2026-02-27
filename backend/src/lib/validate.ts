import { z, type ZodTypeAny } from "zod";

const passthroughSchema = z.object({}).passthrough();

type RequestSchemaInput = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

/**
 * Builds a standard request schema shape consumed by the validate middleware.
 * Defaults each missing part (body/params/query) to a passthrough object.
 */
export function requestSchema(input: RequestSchemaInput) {
  return z.object({
    body: input.body ?? passthroughSchema,
    params: input.params ?? passthroughSchema,
    query: input.query ?? passthroughSchema,
  });
}

// Equivalent nullable-object form supported by local structured decoders.
// Runtime Zod validation remains authoritative for the returned data.
export function localStructuredSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(localStructuredSchema);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const alternatives = record["anyOf"];
  if (Array.isArray(alternatives) && alternatives.length === 2) {
    const object = alternatives.find((item) => item?.type === "object");
    const nullable = alternatives.find((item) => item?.type === "null");
    if (object && nullable && Object.keys(record).length === 1)
      return {
        ...(localStructuredSchema(object) as Record<string, unknown>),
        type: ["object", "null"],
      };
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, localStructuredSchema(item)]),
  );
}

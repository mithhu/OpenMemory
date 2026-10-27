export const DEFAULT_DESTINATION: string;
export function destinationOrigin(value: string): string;
export function webUrl(value: string): string;
export function buildHandoff(
  destination: string,
  input: { url: string; title?: string; note?: string },
): string;

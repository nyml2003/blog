/** Encode a query object without relying on a host URL implementation. */
export function encodeQuery(
  parameters: Readonly<Record<string, string | number | undefined>>,
): string {
  return Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
}

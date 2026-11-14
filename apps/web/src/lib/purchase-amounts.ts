export function cents(value: string): bigint {
  if (!/^\d{1,18}(?:\.\d{1,2})?$/.test(value)) return BigInt(0);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}
export function decimalAmount(value: bigint): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  return (
    (negative ? "-" : "") +
    String(absolute / BigInt(100)) +
    "." +
    String(absolute % BigInt(100)).padStart(2, "0")
  );
}

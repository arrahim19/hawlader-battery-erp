"use client";

type Category = { label: string; color: string; amount: bigint };
function point(radius: number, fraction: number) {
  const angle = fraction * Math.PI * 2 - Math.PI / 2;
  return `${100 + radius * Math.cos(angle)} ${100 + radius * Math.sin(angle)}`;
}
function segment(start: number, fraction: number) {
  const end = start + Math.min(fraction, 0.99999999);
  const large = fraction > 0.5 ? 1 : 0;
  return `M ${point(100, start)} A 100 100 0 ${large} 1 ${point(100, end)} L ${point(82.6, end)} A 82.6 82.6 0 ${large} 0 ${point(82.6, start)} Z`;
}

export function ExpenseDonut({
  categories,
  totalLabel,
}: {
  categories: Category[];
  totalLabel: string;
}) {
  const total = categories.reduce(
    (sum, category) => sum + category.amount,
    BigInt(0),
  );
  return (
    <div className="expense-donut">
      <svg
        viewBox="-1 -1 202 202"
        role="img"
        aria-label={`Expense breakdown, total ${totalLabel}`}
      >
        <circle
          cx="100"
          cy="100"
          r="91.3"
          fill="none"
          stroke="#eef1f6"
          strokeWidth="17.4"
        />
        {categories.map((category, index) => {
          const fraction = total
            ? Number((category.amount * BigInt(100000000)) / total) / 100000000
            : 0;
          const previous = categories
            .slice(0, index)
            .reduce((sum, item) => sum + item.amount, BigInt(0));
          const start = total
            ? Number((previous * BigInt(100000000)) / total) / 100000000
            : 0;
          if (!fraction) return null;
          return (
            <path
              key={category.label}
              d={segment(start, fraction)}
              fill={category.color}
            />
          );
        })}
      </svg>
      <div className="expense-donut-label">
        <strong>{totalLabel}</strong>
        <small>Total</small>
      </div>
    </div>
  );
}

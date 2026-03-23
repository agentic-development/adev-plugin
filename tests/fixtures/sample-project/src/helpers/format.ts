export const formatDate = (d: Date): string => d.toISOString();

export const formatCurrency = (amount: number): string =>
  `$${amount.toFixed(2)}`;

export const formatPercent = (value: number): string =>
  `${(value * 100).toFixed(1)}%`;

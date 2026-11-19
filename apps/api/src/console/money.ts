/** Cents as dollars for messages, e.g. 1800 as $18.00. */
export const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** DRF remains in the financial inventory but has no billing or collection work. */
export function isBalanceOnlyAccountType(value: unknown): boolean {
  return value === 'DRF';
}

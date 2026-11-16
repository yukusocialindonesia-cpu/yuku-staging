/**
 * Format number to Indonesian Rupiah (Rp)
 */
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format compact numbers for display
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('id-ID').format(num);
}

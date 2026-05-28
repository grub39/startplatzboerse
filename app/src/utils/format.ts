export function formatDate(value: string) {
  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatCurrency(value: number) {
  return `${Number(value).toLocaleString('de-DE', { maximumFractionDigits: 0 })} EUR`;
}
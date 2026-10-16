export function parseManufactureMonth(value: string): string | null {
  const match = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(value);
  return match ? `${match[2]}-${match[1]}-01` : null;
}

export function formatManufactureMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value);
  return match ? `${match[2]}/${match[1]}` : value;
}

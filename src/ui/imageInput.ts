export function pickImage<T extends { type: string }>(files: readonly T[]): { file: T; extra: number } | null {
  const images = files.filter((f) => f.type.startsWith('image/'));
  return images.length ? { file: images[0]!, extra: images.length - 1 } : null;
}

export function carriesFiles(types: readonly string[] | null | undefined): boolean {
  return Boolean(types?.includes('Files'));
}

export function downloadUrlData(file: { type: string; name: string }, url: string): string {
  return `${file.type}:${file.name}:${url}`;
}

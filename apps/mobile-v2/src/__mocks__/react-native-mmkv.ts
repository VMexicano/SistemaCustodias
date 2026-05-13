export class MMKV {
  private storage: Map<string, string> = new Map();

  getString(key: string): string | undefined {
    return this.storage.get(key);
  }

  set(key: string, value: string | boolean | number): void {
    this.storage.set(key, String(value));
  }

  delete(key: string): void {
    this.storage.delete(key);
  }

  contains(key: string): boolean {
    return this.storage.has(key);
  }

  clearAll(): void {
    this.storage.clear();
  }
}

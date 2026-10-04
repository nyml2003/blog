export class Container {
  private readonly values = new Map<string, unknown>();

  bind<T>(token: string, value: T): this {
    if (this.values.has(token)) throw new Error(`duplicate service: ${token}`);
    this.values.set(token, value);
    return this;
  }

  override<T>(token: string, value: T): this {
    this.values.set(token, value);
    return this;
  }

  get<T>(token: string): T {
    if (!this.values.has(token)) throw new Error(`missing service: ${token}`);
    return this.values.get(token) as T;
  }

  has(token: string): boolean {
    return this.values.has(token);
  }
}

export {};

declare global {
  interface Request {
    json<T = unknown>(): Promise<T>;
  }
}

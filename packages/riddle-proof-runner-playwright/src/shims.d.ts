declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string | number, encoding?: string): string;
  export function writeFileSync(
    path: string | number,
    data: string | Uint8Array,
    options?: { encoding?: string } | string,
  ): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function statSync(path: string): { size: number };
}

declare module "node:path" {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function relative(from: string, to: string): string;
}

declare module "node:process" {
  export const env: Record<string, string | undefined>;
  export const argv: string[];
  export function exit(code?: number): never;
}

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  stdout: {
    write(data: string): void;
  };
  exit(code?: number): never;
};

declare interface Buffer extends Uint8Array {
  readonly length: number;
}

declare var Buffer: {
  from(data: Uint8Array | string | ArrayLike<number>): Buffer;
};

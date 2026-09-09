import { cp, mkdir, rm } from 'node:fs/promises';

const source = new URL('../apps/merchant/dist/', import.meta.url);
const target = new URL('../dist/', import.meta.url);

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log('Cloudflare Pages output prepared at ./dist');

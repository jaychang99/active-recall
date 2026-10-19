import type { Prisma } from '../generated/prisma/client';

/** Prisma Json columns must not receive undefined/NaN. Round-trip through JSON to be safe. */
export function toJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

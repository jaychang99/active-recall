import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'recall:isPublic';
/** Marks a route (or controller) as reachable without a bearer token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

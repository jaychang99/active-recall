import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' }, jsc: { transform: { legacyDecorator: true, decoratorMetadata: true }, target: 'es2022' } })],
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.spec.ts'] } },
      {
        extends: true,
        test: { name: 'integration', include: ['test/**/*.e2e-spec.ts'], globalSetup: ['test/global-setup.ts'], fileParallelism: false, testTimeout: 60_000, hookTimeout: 120_000 },
      },
    ],
  },
});

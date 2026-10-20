import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'src/generated/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // PrismaService deliberately merges a class (the DI token) with an interface (the extended client type).
  { files: ['src/prisma/prisma.service.ts'], rules: { '@typescript-eslint/no-unsafe-declaration-merging': 'off' } },
);

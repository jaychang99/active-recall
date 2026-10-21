import { describe, expect, it, vi } from 'vitest';
import { STUDY_SETTING_LIMITS } from '@recall/contracts';
import { AdminService } from './admin.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { FsrsService } from '../fsrs/fsrs.service';
import type { SubjectsService } from '../subjects/subjects.service';

describe('data manager settings limits', () => {
  for (const [field, { min }] of Object.entries(STUDY_SETTING_LIMITS)) {
    it(`${field}: applies the same hard boundary to data manager updates`, async () => {
      const settings = { id: 'settings', userId: 'owner' };
      const update = vi.fn().mockResolvedValue(settings);
      const prisma = { appSettings: { findUnique: vi.fn().mockResolvedValue(settings), update } };
      const service = new AdminService(prisma as unknown as PrismaService, {} as FsrsService, {} as SubjectsService);
      await service.update('owner', 'settings', settings.id, { [field]: 100_000 });
      expect(update).toHaveBeenCalledWith({ where: { id: 'settings', userId: 'owner' }, data: { [field]: 100_000 } });
      update.mockClear();
      for (const value of [100_001, min - 1, 1.5]) {
        await expect(service.update('owner', 'settings', settings.id, { [field]: value })).rejects.toThrow();
      }
      expect(update).not.toHaveBeenCalled();
    });
  }
});

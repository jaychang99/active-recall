import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { STUDY_SETTING_LIMITS, STUDY_SETTING_MAX } from '@recall/contracts';
import { describe, expect, it } from 'vitest';
import { UpdateSettingsDto } from './settings.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const validate = (value: Record<string, unknown>) => pipe.transform(value, { type: 'body', metatype: UpdateSettingsDto });

describe('study settings hard limits', () => {
  it('preserves both mobile submit side choices through settings validation', async () => {
    for (const mobileSubmitOnRight of [false, true]) {
      await expect(validate({ mobileSubmitOnRight })).resolves.toMatchObject({ mobileSubmitOnRight });
    }
  });
  for (const [field, { min }] of Object.entries(STUDY_SETTING_LIMITS)) {
    it(`${field}: accepts 100,000, rejects 100,001 and preserves the lower/integer bound`, async () => {
      await expect(validate({ [field]: 100_000 })).resolves.toMatchObject({ [field]: 100_000 });
      await expect(validate({ [field]: '100000' })).resolves.toMatchObject({ [field]: 100_000 });
      await expect(validate({ [field]: min })).resolves.toMatchObject({ [field]: min });
      for (const value of [100_001, min - 1, 1.5]) {
        await expect(validate({ [field]: value })).rejects.toBeInstanceOf(BadRequestException);
      }
    });
  }

  it('accepts all large settings together and preserves the retention percentage range', async () => {
    const settings = Object.fromEntries(Object.keys(STUDY_SETTING_LIMITS).map((key) => [key, STUDY_SETTING_MAX]));
    await expect(validate(settings)).resolves.toMatchObject(settings);
    await expect(validate({ requestRetention: 0.9 })).resolves.toMatchObject({ requestRetention: 0.9 });
    await expect(validate({ requestRetention: 1 })).rejects.toBeInstanceOf(BadRequestException);
  });
});

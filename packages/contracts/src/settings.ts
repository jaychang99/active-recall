/** Integer study settings share the same hard maximum across the web and API. Defaults are separate. */
export const STUDY_SETTING_MAX = 100_000;

export const STUDY_SETTING_LIMITS = {
  newCardsPerDay: { min: 0, max: STUDY_SETTING_MAX },
  reviewsPerDay: { min: 0, max: STUDY_SETTING_MAX },
  dailyReviewGoal: { min: 0, max: STUDY_SETTING_MAX },
  leechThreshold: { min: 1, max: STUDY_SETTING_MAX },
  maximumInterval: { min: 1, max: STUDY_SETTING_MAX },
} as const;

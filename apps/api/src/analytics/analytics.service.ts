import { Injectable } from '@nestjs/common';
import type { Question } from '@recall/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { FsrsService, deserializeCard, type SerializedCard } from '../fsrs/fsrs.service';
import { addDays, dayKey, dayKeyOffset, endOfDayInTz, startOfDayInTz } from '../common/time';
import { CardStatus, Prisma } from '../generated/prisma/client';

export interface OverviewFilter {
  deckId?: string;
  subject?: string;
  days?: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly fsrs: FsrsService,
  ) {}

  private scope(f: OverviewFilter): Prisma.QuestionWhereInput {
    return {
      deletedAt: null,
      deck: { deletedAt: null },
      ...(f.deckId ? { deckId: f.deckId } : {}),
      ...(f.subject ? { subjects: { some: { deletedAt: null, subject: { name: f.subject, deletedAt: null } } } } : {}),
    };
  }

  async overview(f: OverviewFilter) {
    const settings = await this.settings.get();
    const tz = settings.timezone;
    const params = { requestRetention: settings.requestRetention, maximumInterval: settings.maximumInterval, enableFuzz: settings.enableFuzz };
    const now = new Date();
    const dayStart = startOfDayInTz(now, tz);
    const dayEnd = endOfDayInTz(now, tz);
    const days = Math.min(365, Math.max(7, f.days ?? 30));
    const since = startOfDayInTz(addDays(dayStart, -(days - 1) + 0.5), tz);
    const scope = this.scope(f);

    const [questions, logs, allLogsForStreak, practices, exams] = await Promise.all([
      this.prisma.question.findMany({ where: scope, select: { id: true, deckId: true, type: true, payloadJson: true, card: true, deck: { select: { id: true, title: true, subject: true } } } }),
      this.prisma.reviewLog.findMany({
        where: { undone: false, deletedAt: null, reviewedAt: { gte: since }, question: scope },
        select: { questionId: true, rating: true, reviewedAt: true, isCorrect: true, elapsedMs: true, previousStatus: true, revealedBeforeAnswer: true, hintUsed: true, question: { select: { type: true } } },
      }),
      this.prisma.reviewLog.findMany({ where: { undone: false, deletedAt: null, question: scope }, select: { reviewedAt: true }, orderBy: { reviewedAt: 'desc' }, take: 5000 }),
      this.prisma.practiceLog.findMany({ where: { deletedAt: null, createdAt: { gte: since }, question: scope }, select: { isCorrect: true, createdAt: true } }),
      this.prisma.examAttempt.findMany({ where: { deletedAt: null, submittedAt: { not: null }, ...(f.deckId ? { deckId: f.deckId } : {}) }, orderBy: { submittedAt: 'desc' }, take: 10, select: { id: true, title: true, submittedAt: true, scoreJson: true, deck: { select: { id: true, title: true } } } }),
    ]);

    // --- card state & due forecast ---
    const states = { new: 0, learning: 0, review: 0, relearning: 0, suspended: 0, flagged: 0, buried: 0, total: questions.length };
    const forecast = new Map<string, number>();
    const forecastDays = 30;
    for (let i = 0; i < forecastDays; i++) forecast.set(dayKeyOffset(dayKey(now, tz), i), 0);
    let dueNow = 0;
    let overdue = 0;
    const retrievabilities: number[] = [];
    const leeches: { questionId: string; lapses: number; prompt: string; deck: string; type: string }[] = [];
    const difficultyBuckets = [0, 0, 0, 0, 0]; // 1-2,2-4,4-6,6-8,8-10
    const stabilityBuckets = { '<1d': 0, '1-7d': 0, '1-4w': 0, '1-6mo': 0, '6mo+': 0 };
    for (const q of questions) {
      const c = q.card;
      const status = c?.status ?? CardStatus.NEW;
      if (c?.suspended) states.suspended++;
      if (c?.flagged) states.flagged++;
      if (c?.buriedUntil && c.buriedUntil > now) states.buried++;
      if (status === CardStatus.NEW) states.new++;
      else if (status === CardStatus.LEARNING) states.learning++;
      else if (status === CardStatus.REVIEW) states.review++;
      else states.relearning++;
      if (c && status !== CardStatus.NEW && !c.suspended) {
        if (c.dueAt <= dayEnd) dueNow++;
        if (c.dueAt < dayStart) overdue++;
        const key = c.dueAt < dayStart ? dayKey(now, tz) : dayKey(c.dueAt, tz);
        if (forecast.has(key)) forecast.set(key, (forecast.get(key) ?? 0) + 1);
        const card = deserializeCard(c.stateJson as unknown as SerializedCard);
        const r = this.fsrs.retrievability(params, card, now);
        if (r !== null) retrievabilities.push(r);
        const d = Math.min(4, Math.max(0, Math.floor((c.difficulty - 1) / 2)));
        difficultyBuckets[d]!++;
        const s = c.stability;
        if (s < 1) stabilityBuckets['<1d']++;
        else if (s < 7) stabilityBuckets['1-7d']++;
        else if (s < 28) stabilityBuckets['1-4w']++;
        else if (s < 180) stabilityBuckets['1-6mo']++;
        else stabilityBuckets['6mo+']++;
      }
      if (c && c.lapses >= settings.leechThreshold) leeches.push({ questionId: q.id, lapses: c.lapses, prompt: (q.payloadJson as unknown as Question).prompt.slice(0, 120), deck: q.deck.title, type: q.type });
    }

    // --- daily series ---
    const series = new Map<string, { day: string; reviews: number; correct: number; gradable: number; again: number; minutes: number; newCards: number; practice: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const key = dayKeyOffset(dayKey(now, tz), -i);
      series.set(key, { day: key, reviews: 0, correct: 0, gradable: 0, again: 0, minutes: 0, newCards: 0, practice: 0 });
    }
    const grade = { again: 0, hard: 0, good: 0, easy: 0 };
    const byType = new Map<string, { type: string; total: number; correct: number; gradable: number; again: number }>();
    let totalMs = 0;
    let revealed = 0;
    let hints = 0;
    const reviewedTodayQ = new Set<string>();
    for (const l of logs) {
      const key = dayKey(l.reviewedAt, tz);
      const s = series.get(key);
      if (s) {
        s.reviews++;
        if (l.isCorrect !== null) {
          s.gradable++;
          if (l.isCorrect) s.correct++;
        }
        if (l.rating === 1) s.again++;
        s.minutes += l.elapsedMs / 60000;
        if (l.previousStatus === CardStatus.NEW) s.newCards++;
      }
      if (l.rating === 1) grade.again++;
      else if (l.rating === 2) grade.hard++;
      else if (l.rating === 3) grade.good++;
      else grade.easy++;
      const t = byType.get(l.question.type) ?? { type: l.question.type, total: 0, correct: 0, gradable: 0, again: 0 };
      t.total++;
      if (l.isCorrect !== null) {
        t.gradable++;
        if (l.isCorrect) t.correct++;
      }
      if (l.rating === 1) t.again++;
      byType.set(l.question.type, t);
      totalMs += l.elapsedMs;
      if (l.revealedBeforeAnswer) revealed++;
      if (l.hintUsed) hints++;
      if (l.reviewedAt >= dayStart) reviewedTodayQ.add(l.questionId);
    }
    for (const p of practices) {
      const s = series.get(dayKey(p.createdAt, tz));
      if (s) s.practice++;
    }

    // --- streak (consecutive days with >= 1 review, counting today or yesterday as the anchor) ---
    const daysWith = new Set(allLogsForStreak.map((l) => dayKey(l.reviewedAt, tz)));
    const today = dayKey(now, tz);
    let streak = 0;
    let cursor = daysWith.has(today) ? today : dayKeyOffset(today, -1);
    while (daysWith.has(cursor)) {
      streak++;
      cursor = dayKeyOffset(cursor, -1);
    }
    let longest = 0;
    {
      const sorted = [...daysWith].sort();
      let run = 0;
      let prev: string | null = null;
      for (const d of sorted) {
        run = prev && dayKeyOffset(prev, 1) === d ? run + 1 : 1;
        longest = Math.max(longest, run);
        prev = d;
      }
    }

    const gradable = logs.filter((l) => l.isCorrect !== null);
    const correct = gradable.filter((l) => l.isCorrect).length;
    const todayLogs = logs.filter((l) => l.reviewedAt >= dayStart);
    const todayGradable = todayLogs.filter((l) => l.isCorrect !== null);
    const newToday = new Set(todayLogs.filter((l) => l.previousStatus === CardStatus.NEW).map((l) => l.questionId)).size;

    // --- hardest questions: most Again ratings in window ---
    const againBy = new Map<string, number>();
    for (const l of logs) if (l.rating === 1) againBy.set(l.questionId, (againBy.get(l.questionId) ?? 0) + 1);
    const qById = new Map(questions.map((q) => [q.id, q]));
    const hardest = [...againBy.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, n]) => ({ questionId: id, again: n, prompt: (qById.get(id)?.payloadJson as unknown as Question | undefined)?.prompt.slice(0, 120) ?? '', deck: qById.get(id)?.deck.title ?? '', type: qById.get(id)?.type ?? '' }));

    // --- per deck ---
    const deckMap = new Map<string, { id: string; title: string; subject: string; total: number; new: number; learning: number; review: number; relearning: number; dueToday: number; reviewsInWindow: number; accuracy: number | null; gradable: number; correct: number }>();
    for (const q of questions) {
      const d = deckMap.get(q.deckId) ?? { id: q.deck.id, title: q.deck.title, subject: q.deck.subject, total: 0, new: 0, learning: 0, review: 0, relearning: 0, dueToday: 0, reviewsInWindow: 0, accuracy: null, gradable: 0, correct: 0 };
      d.total++;
      const status = q.card?.status ?? CardStatus.NEW;
      if (status === CardStatus.NEW) d.new++;
      else if (status === CardStatus.LEARNING) d.learning++;
      else if (status === CardStatus.REVIEW) d.review++;
      else d.relearning++;
      if (q.card && status !== CardStatus.NEW && !q.card.suspended && q.card.dueAt <= dayEnd) d.dueToday++;
      deckMap.set(q.deckId, d);
    }
    for (const l of logs) {
      const q = qById.get(l.questionId);
      const d = q && deckMap.get(q.deckId);
      if (!d) continue;
      d.reviewsInWindow++;
      if (l.isCorrect !== null) {
        d.gradable++;
        if (l.isCorrect) d.correct++;
      }
    }
    for (const d of deckMap.values()) d.accuracy = d.gradable ? d.correct / d.gradable : null;

    const retention = retrievabilities.length ? retrievabilities.reduce((a, b) => a + b, 0) / retrievabilities.length : null;

    return {
      generatedAt: now.toISOString(),
      timezone: tz,
      windowDays: days,
      filter: { deckId: f.deckId ?? null, subject: f.subject ?? null },
      today: {
        reviewed: todayLogs.length,
        uniqueCards: reviewedTodayQ.size,
        newIntroduced: newToday,
        due: dueNow,
        overdue,
        goal: settings.dailyReviewGoal,
        accuracy: todayGradable.length ? todayGradable.filter((l) => l.isCorrect).length / todayGradable.length : null,
        gradable: todayGradable.length,
        minutes: Math.round(todayLogs.reduce((a, l) => a + l.elapsedMs, 0) / 60000),
      },
      window: {
        reviews: logs.length,
        last7: logs.filter((l) => l.reviewedAt >= addDays(dayStart, -6)).length,
        last30: logs.filter((l) => l.reviewedAt >= addDays(dayStart, -29)).length,
        accuracy: gradable.length ? correct / gradable.length : null,
        gradable: gradable.length,
        correct,
        avgSeconds: logs.length ? Math.round(totalMs / logs.length / 1000) : null,
        totalMinutes: Math.round(totalMs / 60000),
        revealedBeforeAnswerRate: logs.length ? revealed / logs.length : null,
        hintRate: logs.length ? hints / logs.length : null,
        practiceAnswers: practices.length,
        practiceAccuracy: practices.filter((p) => p.isCorrect !== null).length ? practices.filter((p) => p.isCorrect).length / practices.filter((p) => p.isCorrect !== null).length : null,
      },
      streak: { current: streak, longest, activeDays: daysWith.size },
      states,
      estimatedRetention: { value: retention, cards: retrievabilities.length, label: 'FSRS retrievability estimate (not measured accuracy)' },
      gradeDistribution: grade,
      byType: [...byType.values()].map((t) => ({ ...t, accuracy: t.gradable ? t.correct / t.gradable : null, errorRate: t.gradable ? 1 - t.correct / t.gradable : null })),
      series: [...series.values()],
      forecast: [...forecast.entries()].map(([day, due]) => ({ day, due })),
      difficultyBuckets: ['1-2', '3-4', '5-6', '7-8', '9-10'].map((label, i) => ({ label, count: difficultyBuckets[i]! })),
      stabilityBuckets: Object.entries(stabilityBuckets).map(([label, count]) => ({ label, count })),
      leeches: leeches.sort((a, b) => b.lapses - a.lapses).slice(0, 20),
      hardest,
      decks: [...deckMap.values()].sort((a, b) => b.dueToday - a.dueToday),
      exams: exams.map((e) => ({ id: e.id, title: e.title, deck: e.deck, submittedAt: e.submittedAt, score: e.scoreJson })),
    };
  }

  /** Review-activity heatmap for the last N days (default 365). */
  async heatmap(f: OverviewFilter) {
    const settings = await this.settings.get();
    const tz = settings.timezone;
    const now = new Date();
    const days = Math.min(730, Math.max(30, f.days ?? 365));
    const since = startOfDayInTz(addDays(startOfDayInTz(now, tz), -(days - 1) + 0.5), tz);
    const logs = await this.prisma.reviewLog.findMany({ where: { undone: false, deletedAt: null, reviewedAt: { gte: since }, question: this.scope(f) }, select: { reviewedAt: true } });
    const counts = new Map<string, number>();
    for (const l of logs) {
      const k = dayKey(l.reviewedAt, tz);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const out: { day: string; count: number }[] = [];
    const today = dayKey(now, tz);
    for (let i = days - 1; i >= 0; i--) {
      const k = dayKeyOffset(today, -i);
      out.push({ day: k, count: counts.get(k) ?? 0 });
    }
    return { timezone: tz, days: out, max: Math.max(0, ...counts.values()) };
  }
}

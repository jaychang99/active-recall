import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { SchemasController } from './schemas/schemas.controller';
import { SettingsModule } from './settings/settings.module';
import { DecksModule } from './decks/decks.module';
import { QuestionsModule } from './questions/questions.module';
import { ImportsModule } from './imports/imports.module';
import { FsrsModule } from './fsrs/fsrs.module';
import { ReviewsModule } from './reviews/reviews.module';
import { StudyModule } from './study/study.module';
import { NotesModule } from './notes/notes.module';
import { ExamsModule } from './exams/exams.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CardsModule } from './cards/cards.module';
import { SubjectsModule } from './subjects/subjects.module';
import { ExportsModule } from './exports/exports.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    FsrsModule,
    SubjectsModule,
    DecksModule,
    QuestionsModule,
    ImportsModule,
    ReviewsModule,
    StudyModule,
    NotesModule,
    ExamsModule,
    AnalyticsModule,
    CardsModule,
    ExportsModule,
    AdminModule,
  ],
  controllers: [HealthController, SchemasController],
})
export class AppModule {}

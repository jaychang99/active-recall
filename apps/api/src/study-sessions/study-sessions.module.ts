import { Module } from '@nestjs/common';
import { StudyModule } from '../study/study.module';
import { StudySessionsController } from './study-sessions.controller';
import { StudySessionsService } from './study-sessions.service';

@Module({ imports: [StudyModule], controllers: [StudySessionsController], providers: [StudySessionsService] })
export class StudySessionsModule {}

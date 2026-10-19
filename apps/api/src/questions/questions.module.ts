import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { NotesModule } from '../notes/notes.module';

@Module({ imports: [NotesModule], controllers: [QuestionsController], providers: [QuestionsService], exports: [QuestionsService] })
export class QuestionsModule {}

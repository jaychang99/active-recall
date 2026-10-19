import { Module } from '@nestjs/common';
import { DecksController } from './decks.controller';
import { DecksService } from './decks.service';
import { NotesModule } from '../notes/notes.module';

@Module({ imports: [NotesModule], controllers: [DecksController], providers: [DecksService], exports: [DecksService] })
export class DecksModule {}

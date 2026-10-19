import { Global, Module } from '@nestjs/common';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';

@Global()
@Module({ controllers: [SubjectsController], providers: [SubjectsService], exports: [SubjectsService] })
export class SubjectsModule {}

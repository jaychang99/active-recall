import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { ImportsModule } from '../imports/imports.module';

@Module({ imports: [ImportsModule], controllers: [ExportsController], providers: [ExportsService] })
export class ExportsModule {}

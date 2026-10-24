import { Module } from '@nestjs/common';
import { LlmLinksController } from './llm-links.controller';
import { LlmLinksService } from './llm-links.service';

@Module({ controllers: [LlmLinksController], providers: [LlmLinksService] })
export class LlmLinksModule {}

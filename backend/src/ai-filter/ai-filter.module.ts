import { Module } from '@nestjs/common';
import { AiFilterController } from './ai-filter.controller';
import { AiFilterService } from './ai-filter.service';

@Module({
  controllers: [AiFilterController],
  providers: [AiFilterService],
})
export class AiFilterModule {}

import { Module } from '@nestjs/common';
import { AiFilterController } from './ai-filter.controller';
import { AiFilterService } from './ai-filter.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AiFilterController],
  providers: [AiFilterService],
})
export class AiFilterModule {}

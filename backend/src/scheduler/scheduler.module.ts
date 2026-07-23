import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ScheduleSettingsController } from './schedule-settings.controller';
import { RefreshModule } from '../refresh/refresh.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [RefreshModule, DatabaseModule],
  controllers: [ScheduleSettingsController],
  providers: [SchedulerService],
})
export class SchedulerModule {}

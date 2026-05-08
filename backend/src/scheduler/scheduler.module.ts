import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { RefreshModule } from '../refresh/refresh.module';

@Module({
  imports: [RefreshModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}

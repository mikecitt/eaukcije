import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RefreshService } from '../refresh/refresh.service';

@Injectable()
export class SchedulerService {
  constructor(private readonly refreshService: RefreshService) {}

  @Cron('0 0 * * *')
  async midnight() {
    await this.scheduledRefresh('00:00');
  }

  @Cron('0 12 * * *')
  async noon() {
    await this.scheduledRefresh('12:00');
  }

  private async scheduledRefresh(label: string) {
    console.log(`[scheduler] ${label} — starting refresh`);
    try {
      const { newCount, updatedCount, failedCount } = await this.refreshService.runRefresh();
      console.log(`[scheduler] ${label} — done: ${newCount} new, ${updatedCount} updated${failedCount ? `, ${failedCount} failed` : ''}`);
    } catch (err) {
      console.error(`[scheduler] ${label} — error:`, err.message);
    }
  }
}

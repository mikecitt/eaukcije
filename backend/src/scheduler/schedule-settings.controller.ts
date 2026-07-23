import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('api/scheduler')
@UseGuards(AdminGuard)
export class ScheduleSettingsController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Get('settings')
  async getSettings() {
    return {
      presets: this.schedulerService.getPresets(),
      current: await this.schedulerService.getCurrentSchedule(),
    };
  }

  @Put('settings')
  async updateSettings(@Body() body: { preset: string; cron?: string }) {
    return this.schedulerService.updateSchedule(body?.preset, body?.cron);
  }
}

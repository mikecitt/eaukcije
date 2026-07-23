import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DatabaseService } from '../database/database.service';
import { RefreshService } from '../refresh/refresh.service';

export const SCHEDULE_PRESETS = [
  { id: 'every_6h', label: 'Svakih 6 sati', cron: '0 */6 * * *' },
  { id: 'every_12h', label: 'Svakih 12 sati (podrazumevano)', cron: '0 0,12 * * *' },
  { id: 'daily_midnight', label: 'Jednom dnevno u ponoć', cron: '0 0 * * *' },
  { id: 'custom', label: 'Prilagođeno (cron izraz)', cron: null as string | null },
];

const DEFAULT_PRESET = 'every_12h';
const JOB_NAME = 'auto-refresh';
const TIMEZONE = 'Europe/Belgrade';
const PRESET_KEY = 'refresh_schedule_preset';
const CRON_KEY = 'refresh_schedule_cron';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private refreshInProgress = false;

  constructor(
    private readonly refreshService: RefreshService,
    private readonly db: DatabaseService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit() {
    const { rows } = await this.db.query('SELECT value FROM meta WHERE key = $1', [CRON_KEY]);
    const fallback = SCHEDULE_PRESETS.find(p => p.id === DEFAULT_PRESET)!.cron!;
    const cron = rows[0]?.value || fallback;
    try {
      this.installJob(cron);
    } catch (err) {
      console.error(`[scheduler] Invalid persisted cron "${cron}" (${err.message}); falling back to default schedule.`);
      this.installJob(fallback);
    }
  }

  getPresets() {
    return SCHEDULE_PRESETS;
  }

  async getCurrentSchedule() {
    const { rows } = await this.db.query(
      'SELECT key, value FROM meta WHERE key IN ($1, $2)',
      [PRESET_KEY, CRON_KEY],
    );
    const values = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const defaultCron = SCHEDULE_PRESETS.find(p => p.id === DEFAULT_PRESET)!.cron!;
    const matchedPreset = SCHEDULE_PRESETS.find(p => p.id === values[PRESET_KEY]);
    const preset = matchedPreset?.id ?? DEFAULT_PRESET;
    const cron = preset === 'custom'
      ? values[CRON_KEY] || defaultCron
      : matchedPreset?.cron ?? defaultCron;

    let nextRun: string | null = null;
    try {
      const job = this.schedulerRegistry.getCronJob(JOB_NAME);
      nextRun = job.nextDate().toISO();
    } catch {
      nextRun = null;
    }

    return { preset, cron, timezone: TIMEZONE, nextRun };
  }

  async updateSchedule(preset: string, customCron?: string) {
    if (!preset) {
      throw new BadRequestException('Nedostaje izabrani raspored.');
    }

    let cron: string;
    if (preset === 'custom') {
      cron = (customCron || '').trim();
      if (!cron) {
        throw new BadRequestException('Unesite cron izraz za prilagođeni raspored.');
      }
    } else {
      const found = SCHEDULE_PRESETS.find(p => p.id === preset && p.cron);
      if (!found) {
        throw new BadRequestException('Nepoznat raspored.');
      }
      cron = found.cron!;
    }

    this.validateCron(cron);

    await this.db.query(
      `INSERT INTO meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [PRESET_KEY, preset],
    );
    await this.db.query(
      `INSERT INTO meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [CRON_KEY, cron],
    );

    this.installJob(cron);

    return this.getCurrentSchedule();
  }

  private validateCron(expr: string) {
    try {
      new CronJob(expr, () => {}, null, false, TIMEZONE);
    } catch (err) {
      throw new BadRequestException(`Neispravan cron izraz: ${err.message}`);
    }
  }

  private installJob(cron: string) {
    if (this.schedulerRegistry.doesExist('cron', JOB_NAME)) {
      this.schedulerRegistry.deleteCronJob(JOB_NAME);
    }
    const job = new CronJob(cron, () => { void this.scheduledRefresh(); }, null, true, TIMEZONE);
    this.schedulerRegistry.addCronJob(JOB_NAME, job);
  }

  private async scheduledRefresh() {
    if (this.refreshInProgress) {
      console.log('[scheduler] skipping tick — previous refresh still in progress');
      return;
    }
    this.refreshInProgress = true;
    console.log('[scheduler] starting refresh');
    try {
      const { newCount, updatedCount, failedCount } = await this.refreshService.runRefresh();
      console.log(`[scheduler] done: ${newCount} new, ${updatedCount} updated${failedCount ? `, ${failedCount} failed` : ''}`);
    } catch (err) {
      console.error('[scheduler] error:', err.message);
    } finally {
      this.refreshInProgress = false;
    }
  }
}

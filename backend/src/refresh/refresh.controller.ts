import { Controller, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { RefreshService } from './refresh.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('api/refresh')
@UseGuards(AdminGuard)
export class RefreshController {
  constructor(private readonly refreshService: RefreshService) {}

  @Post()
  async refresh(@Res() res: Response) {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const result = await this.refreshService.runRefresh((message, pct) => {
        const type = pct < 10 ? 'status' : 'progress';
        send(pct < 10
          ? { type, message }
          : { type, message, current: pct, total: 100 }
        );
      });
      send({ type: 'done', ...result });
    } catch (err) {
      console.error('Refresh route error:', err);
      send({ type: 'error', message: err.message });
    }

    res.end();
  }
}

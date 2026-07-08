import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiFilterService } from './ai-filter.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('api/ai-filter')
@UseGuards(AdminGuard)
export class AiFilterController {
  constructor(private readonly aiFilterService: AiFilterService) {}

  @Post()
  filter(@Body() body: { description: string; ids: string[] }) {
    return this.aiFilterService.filter(body.description, body.ids);
  }
}

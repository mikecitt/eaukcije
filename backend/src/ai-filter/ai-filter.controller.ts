import { Controller, Post, Body } from '@nestjs/common';
import { AiFilterService } from './ai-filter.service';

@Controller('api/ai-filter')
export class AiFilterController {
  constructor(private readonly aiFilterService: AiFilterService) {}

  @Post()
  filter(@Body() body: { description: string; ids: string[] }) {
    return this.aiFilterService.filter(body.description, body.ids);
  }
}

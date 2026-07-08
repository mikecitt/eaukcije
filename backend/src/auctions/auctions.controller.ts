import { Controller, Get, Delete, Body, UseGuards } from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('api/auctions')
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  @Get()
  findAll() {
    return this.auctionsService.findAll();
  }

  @Delete()
  @UseGuards(AdminGuard)
  deleteAll(@Body() body: { password: string }) {
    return this.auctionsService.deleteAll(body?.password);
  }
}

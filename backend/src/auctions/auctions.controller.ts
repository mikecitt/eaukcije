import { Controller, Get, Delete, Body } from '@nestjs/common';
import { AuctionsService } from './auctions.service';

@Controller('api/auctions')
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  @Get()
  findAll() {
    return this.auctionsService.findAll();
  }

  @Delete()
  deleteAll(@Body() body: { password: string }) {
    return this.auctionsService.deleteAll(body?.password);
  }
}

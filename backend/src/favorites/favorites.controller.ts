import { Controller, Get, Post, Delete, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { FavoritesService } from './favorites.service';

@Controller('api/favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  list(@Req() req: Request) {
    const user = (req as any).user;
    return this.favoritesService.list(user.sub);
  }

  @Post(':auctionId')
  add(@Req() req: Request, @Param('auctionId') auctionId: string) {
    const user = (req as any).user;
    return this.favoritesService.add(user.sub, auctionId);
  }

  @Delete(':auctionId')
  remove(@Req() req: Request, @Param('auctionId') auctionId: string) {
    const user = (req as any).user;
    return this.favoritesService.remove(user.sub, auctionId);
  }
}

import { Module } from '@nestjs/common';
import { EaukcijaService } from './eaukcija.service';

@Module({
  providers: [EaukcijaService],
  exports: [EaukcijaService],
})
export class EaukcijaModule {}

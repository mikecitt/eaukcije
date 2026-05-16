import { Module } from '@nestjs/common';
import { RefreshController } from './refresh.controller';
import { RefreshService } from './refresh.service';
import { DatabaseModule } from '../database/database.module';
import { EaukcijaModule } from '../eaukcija/eaukcija.module';

@Module({
  imports: [DatabaseModule, EaukcijaModule],
  controllers: [RefreshController],
  providers: [RefreshService],
  exports: [RefreshService],
})
export class RefreshModule {}

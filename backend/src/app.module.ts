import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuctionsModule } from './auctions/auctions.module';
import { RefreshModule } from './refresh/refresh.module';
import { AiFilterModule } from './ai-filter/ai-filter.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'frontend'),
      exclude: ['/api/(.*)'],
    }),
    DatabaseModule,
    AuctionsModule,
    RefreshModule,
    AiFilterModule,
    SchedulerModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

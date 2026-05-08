import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '2mb' }));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`\n  EAukcije: http://localhost:${port}\n`);
}

bootstrap();

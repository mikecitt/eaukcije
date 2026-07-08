import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET nije podešen u .env — obavezan za prijavu korisnika.');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`\n  EAukcije: http://localhost:${port}\n`);
}

bootstrap();

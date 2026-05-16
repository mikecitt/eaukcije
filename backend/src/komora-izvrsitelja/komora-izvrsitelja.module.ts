import { Module } from '@nestjs/common';
import { KomoraIzvrsiteljaService } from './komora-izvrsitelja.service';

@Module({
  providers: [KomoraIzvrsiteljaService],
  exports:   [KomoraIzvrsiteljaService],
})
export class KomoraIzvrsiteljaModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UserRequestHistory } from './models/request-history.model';
import { RequestHistoryController } from './request-history.controller';
import { RequestHistoryService } from './request-history.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserRequestHistory]), AuthModule],
  controllers: [RequestHistoryController],
  providers: [RequestHistoryService],
})
export class RequestHistoryModule {}

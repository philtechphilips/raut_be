import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LocalRequestController } from './local-request.controller';
import { LocalRequestService } from './local-request.service';

@Module({
  imports: [AuthModule],
  controllers: [LocalRequestController],
  providers: [LocalRequestService],
  exports: [LocalRequestService],
})
export class LocalRequestModule {}

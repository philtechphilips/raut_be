import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CliAuthService } from './cli-auth.service';
import { CliPollDto } from './dto/cli-poll.dto';
import { CliApproveDto } from './dto/cli-approve.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { CurrentUserPayload } from './decorators/current-user.decorator';

@Controller('auth/cli')
export class CliAuthController {
  constructor(private readonly cliAuth: CliAuthService) {}

  @Post('device')
  @HttpCode(HttpStatus.OK)
  startDevice() {
    const frontend =
      process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return this.cliAuth.startSession(frontend);
  }

  @Post('poll')
  @HttpCode(HttpStatus.OK)
  poll(@Body() dto: CliPollDto) {
    return this.cliAuth.poll(dto.device_code);
  }

  @Post('approve')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CliApproveDto,
  ) {
    return this.cliAuth.approve(dto.user_code, user);
  }
}

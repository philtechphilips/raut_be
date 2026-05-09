import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { LocalRequestService, LocalResponse } from './local-request.service';

@Controller('dashboard/local-requests')
@UseGuards(JwtAuthGuard)
export class LocalRequestController {
  constructor(private readonly service: LocalRequestService) {}

  @Post()
  async delegate(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { url: string; method: string; headers: Record<string, string>; body?: string },
  ) {
    try {
      const response = await this.service.addRequest(user.id, body);
      return { success: true, response };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @Get('pending')
  async getPending(@CurrentUser() user: CurrentUserPayload) {
    const pending = this.service.getPendingRequests(user.id);
    return { pending };
  }

  @Post('respond/:id')
  async respond(
    @Param('id') requestId: string,
    @Body() body: LocalResponse,
  ) {
    const found = this.service.resolveRequest(requestId, body);
    return { ok: found };
  }
}

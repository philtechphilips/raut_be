import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { RequestHistoryService } from './request-history.service';
import { AppendRequestHistoryDto } from './dto/append-request-history.dto';

@Controller('dashboard/request-history')
@UseGuards(JwtAuthGuard)
export class RequestHistoryController {
  constructor(private readonly requestHistoryService: RequestHistoryService) {}

  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const take = limit ? parseInt(limit, 10) : 100;
    const skip = offset ? parseInt(offset, 10) : 0;
    const entries = await this.requestHistoryService.listEntries(user.id, take, skip);
    return { entries };
  }

  @Post()
  async append(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AppendRequestHistoryDto,
  ) {
    await this.requestHistoryService.append(user.id, dto);
    return { ok: true };
  }

  @Delete()
  async clear(@CurrentUser() user: CurrentUserPayload) {
    await this.requestHistoryService.clear(user.id);
    return { ok: true };
  }
}

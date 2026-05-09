import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';

@Controller('admin/monitoring')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('metrics')
  async getMetrics(@CurrentUser() user: CurrentUserPayload) {
    // 1. Enforce strict administrator authorization check
    await this.adminService.verifyAdminAccess(user.id, user.email);

    // 2. Fetch full metrics payload
    return this.adminService.getMonitorMetrics();
  }

  @Put('users/:id/role')
  async updateUserRole(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') targetUserId: string,
    @Body('role') newRole: string,
  ) {
    // 1. Enforce strict administrator authorization check
    await this.adminService.verifyAdminAccess(user.id, user.email);

    // 2. Safely perform role switch
    return this.adminService.updateUserRole(targetUserId, newRole);
  }
}

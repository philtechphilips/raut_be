import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getWelcome(): string {
    return 'Welcome to Rauts API v1';
  }
}

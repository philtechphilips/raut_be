import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { EnrichEndpointDto } from './dto/enrich-endpoint.dto';
import { AnalyzeProjectDto } from './dto/analyze-project.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('enrich-endpoint')
  enrichEndpoint(@Body() dto: EnrichEndpointDto) {
    return this.ai.enrichEndpoint(dto);
  }

  @Post('analyze-project')
  analyzeProject(@Body() dto: AnalyzeProjectDto) {
    return this.ai.analyzeProject(dto);
  }
}

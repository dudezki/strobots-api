import { Controller, Get, Query } from '@nestjs/common';
import { GeminiService } from './gemini.service';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Get('prompt')
  async getResponse(@Query('prompt') prompt: string): Promise<string> {
    return this.geminiService.generateResponse(prompt);
  }
}

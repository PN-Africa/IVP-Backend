import { Controller, Post, Body } from '@nestjs/common';
import { EmailService } from './email.service'; // Adjust path if necessary

@Controller('settings') 
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('add-domain')
  async addDomain(@Body('domain') domain: string) {
    return await this.emailService.createDomain(domain);
  }
}
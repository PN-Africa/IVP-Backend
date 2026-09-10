import { Controller, Post, Body } from '@nestjs/common';
import { EmailService } from './email.service'; // Adjust path if necessary

@Controller('settings') // This means the route will be /settings/...
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('add-domain')
  async addDomain(@Body('domain') domain: string) {
    // This is where you pass the domain (e.g., "ivpafrica.com") to the service
    return await this.emailService.createDomain(domain);
  }
}
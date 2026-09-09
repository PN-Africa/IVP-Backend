import { 
  Controller, 
  Post,
  Get,
  Param, 
  UseGuards, 
  Request, 
  HttpCode, 
  HttpStatus 
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  // Rule 1: User must be logged in (AuthGuard enforces valid JWT)
  @UseGuards(AuthGuard('jwt')) 
  @UseGuards(AuthGuard('jwt'), RolesGuard) // Uncomment if using RolesGuard
  @Roles('TALENT')                         // Ensure only TALENT role hits this endpoint
  @Post('apply/:jobId')
  @HttpCode(HttpStatus.CREATED)
  async applyForJob(
    @Request() req: any, 
    @Param('jobId') jobId: string
  ) {
    // req.user is populated by your JwtStrategy (contains id, email, role)
    const userId = req.user.id; 
    
    return this.applicationsService.applyForJob(userId, jobId);
  }

  // GET: /applications/my-applications
  @UseGuards(AuthGuard('jwt'))
  @Get('my-applications')
  async getMyApplications(@Request() req: any) {
    return this.applicationsService.getMyApplications(req.user.id);
  }
}
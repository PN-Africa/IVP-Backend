import { 
  Controller, Post, Body, Patch, Param, Get, Query, 
  UseGuards, UsePipes, ValidationPipe, Request, HttpCode, HttpStatus, Delete 
} from '@nestjs/common';
import { 
  ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse, 
  ApiCreatedResponse, ApiParam, ApiForbiddenResponse 
} from '@nestjs/swagger';
import { JobsService, SavedJobsService } from './jobs.service'; // Added SavedJobsService
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role, ApplicationStatus } from '@prisma/client';
import { ProfileCompletedGuard } from '../auth/guards/profile-completed.guard'; 
import { FilterApplicantsDto } from './dto/filter-applicants.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { ScheduleInterviewDto } from './dto/schedule-interview.dto';
import { FillJobDto } from './dto/fill-job.dto';
import { ActiveSubscriptionGuard } from '../subscriptions/guards/active-subscription.guard';
import { SearchJobsDto } from './dto/search-jobs.dto';

@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get('admin/filled-jobs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all filled jobs across the platform (Admin only)' })
  @ApiOkResponse({ description: 'List of filled jobs retrieved successfully.' })
  @ApiForbiddenResponse({ description: 'Only platform administrators can access this endpoint.' })
  getFilledJobsForAdmin() {
    return this.jobsService.getAdminFilledJobs();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, ProfileCompletedGuard, ActiveSubscriptionGuard)
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Create a new job posting (Employers only)' })
  @ApiCreatedResponse({ description: 'Job created successfully.' })
  createJob(@GetUser('id') employerId: string, @Body() dto: CreateJobDto) {
    return this.jobsService.createJob(employerId, dto);
  }

  @Get(':id/applicants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Get applicants for a specific job posting' })
  @ApiParam({ name: 'id', description: 'The UUID of the job' })
  @ApiOkResponse({ description: 'List of applicants retrieved successfully.' })
  getApplicants(
    @Param('id') jobId: string,
    @GetUser('id') employerId: string,
    @Query() filters: FilterApplicantsDto,
  ) {
    return this.jobsService.getJobApplicants(jobId, employerId, filters);
  }

  @Patch(':id/applicants/:applicationId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Update the status of a specific job application' })
  @ApiParam({ name: 'id', description: 'The UUID of the job' })
  @ApiParam({ name: 'applicationId', description: 'The UUID of the application' })
  @ApiOkResponse({ description: 'Application status updated successfully.' })
  updateApplicationStatus(
    @Param('id') jobId: string,
    @Param('applicationId') applicationId: string,
    @GetUser('id') employerId: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.jobsService.updateApplicationStatus(jobId, applicationId, employerId, dto.status);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Update an existing job posting' })
  @ApiParam({ name: 'id', description: 'The UUID of the job to update' })
  @ApiOkResponse({ description: 'Job updated successfully.' })
  updateJob(
    @Param('id') jobId: string,
    @GetUser('id') employerId: string,
    @Body() dto: UpdateJobDto,
  ) {
    return this.jobsService.updateJob(jobId, employerId, dto);
  }

  @Patch(':id/close')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Close a job posting manually' })
  @ApiParam({ name: 'id', description: 'The UUID of the job to close' })
  @ApiOkResponse({ description: 'Job has been closed.' })
  closeJob(@Param('id') jobId: string, @GetUser('id') employerId: string) {
    return this.jobsService.closeJob(jobId, employerId);
  }

  @Get('my-postings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Get all job postings created by the authenticated employer' })
  @ApiOkResponse({ description: 'Employer job postings retrieved successfully.' })
  getEmployerJobs(@GetUser('id') employerId: string) {
    return this.jobsService.getEmployerJobs(employerId);
  }

  @Patch(':id/applicants/:applicationId/shortlist')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Shortcut: Mark a candidate as SHORTLISTED' })
  @ApiParam({ name: 'id', description: 'The UUID of the job' })
  @ApiParam({ name: 'applicationId', description: 'The UUID of the application' })
  @ApiOkResponse({ description: 'Candidate has been shortlisted.' })
  shortlistCandidate(
    @Param('id') jobId: string,
    @Param('applicationId') applicationId: string,
    @GetUser('id') employerId: string,
  ) {
    return this.jobsService.updateApplicationStatus(
      jobId,
      applicationId,
      employerId,
      ApplicationStatus.SHORTLISTED, 
    );
  }
  
  @Patch(':id/applicants/:applicationId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Shortcut: Mark a candidate as REJECTED' })
  @ApiParam({ name: 'id', description: 'The UUID of the job' })
  @ApiParam({ name: 'applicationId', description: 'The UUID of the application' })
  @ApiOkResponse({ description: 'Candidate has been rejected.' })
  rejectCandidate(
    @Param('id') jobId: string,
    @Param('applicationId') applicationId: string,
    @GetUser('id') employerId: string,
  ) {
    return this.jobsService.updateApplicationStatus(
      jobId,
      applicationId,
      employerId,
      ApplicationStatus.REJECTED,
    );
  }

  @Post(':id/applicants/:applicationId/interview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Schedule an interview with an applicant' })
  @ApiParam({ name: 'id', description: 'The UUID of the job' })
  @ApiParam({ name: 'applicationId', description: 'The UUID of the application' })
  @ApiCreatedResponse({ description: 'Interview scheduled successfully.' })
  scheduleInterview(
    @Param('id') jobId: string,
    @Param('applicationId') applicationId: string,
    @GetUser('id') employerId: string,
    @Body() dto: ScheduleInterviewDto,
  ) {
    return this.jobsService.scheduleInterview(jobId, applicationId, employerId, dto);
  }

  @Get('interviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Get all scheduled interviews for the authenticated employer' })
  @ApiOkResponse({ description: 'List of interviews retrieved successfully.' })
  getEmployerInterviews(@GetUser('id') employerId: string) {
    return this.jobsService.getEmployerInterviews(employerId);
  }

  @Patch(':id/fill')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Mark a job as FILLED (Optionally link the hired candidate)' })
  @ApiParam({ name: 'id', description: 'The UUID of the job' })
  @ApiOkResponse({ description: 'Job marked as filled successfully.' })
  markJobAsFilled(
    @Param('id') jobId: string,
    @GetUser('id') employerId: string,
    @Body() dto: FillJobDto,
  ) {
    return this.jobsService.markJobAsFilled(jobId, employerId, dto);
  }

  @Patch('interviews/:interviewId/reschedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Reschedule an existing interview' })
  @ApiParam({ name: 'interviewId', description: 'The UUID of the interview' })
  @ApiOkResponse({ description: 'Interview rescheduled successfully.' })
  rescheduleInterview(
    @Param('interviewId') interviewId: string,
    @GetUser('id') employerId: string,
    @Body() dto: ScheduleInterviewDto,
  ) {
    return this.jobsService.updateInterview(interviewId, employerId, 'RESCHEDULE', dto);
  }

  @Get('talent/interviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TALENT) 
  @ApiOperation({ summary: 'Get all scheduled interviews for the authenticated talent' })
  @ApiOkResponse({ description: 'List of interviews retrieved successfully.' })
  getTalentInterviews(@GetUser('id') userId: string) {
    return this.jobsService.getTalentInterviews(userId);
  }

  @Patch('interviews/:interviewId/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Cancel an existing interview' })
  @ApiParam({ name: 'interviewId', description: 'The UUID of the interview' })
  @ApiOkResponse({ description: 'Interview cancelled successfully.' })
  cancelInterview(
    @Param('interviewId') interviewId: string,
    @GetUser('id') employerId: string,
  ) {
    return this.jobsService.updateInterview(interviewId, employerId, 'CANCEL');
  }

  @Get('search')
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: 'Search and filter active jobs' })
  @ApiOkResponse({ description: 'Returns a paginated list of matching jobs.' })
  async searchJobs(@Query() query: SearchJobsDto) {
    return this.jobsService.searchJobs(query);
  }
} // <--- JobsController NOW CLOSES HERE

@ApiTags('Saved Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard) // <--- Switched to your JwtAuthGuard
@Controller('jobs/saved')
export class SavedJobsController {
  constructor(private readonly savedJobsService: SavedJobsService) {}

  @Post(':jobId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a job posting to the user profile' })
  @ApiParam({ name: 'jobId', description: 'The UUID of the job to save' })
  @ApiCreatedResponse({ description: 'Job successfully saved.' })
  async saveJob(@Request() req: any, @Param('jobId') jobId: string) {
    return this.savedJobsService.saveJob(req.user.userId, jobId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all jobs saved by the authenticated user' })
  @ApiOkResponse({ description: 'List of saved jobs retrieved successfully.' })
  async getSavedJobs(@Request() req: any) {
    return this.savedJobsService.getSavedJobs(req.user.userId);
  }

  @Delete(':jobId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a job from the user’s saved jobs list' })
  @ApiParam({ name: 'jobId', description: 'The UUID of the job to unsave' })
  @ApiOkResponse({ description: 'Job successfully removed from saved list.' })
  async removeSavedJob(@Request() req: any, @Param('jobId') jobId: string) {
    return this.savedJobsService.removeSavedJob(req.user.userId, jobId);
  }
}
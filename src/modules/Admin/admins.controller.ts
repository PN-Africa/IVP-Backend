import { Controller, Post, Put, Body, Get, Query, Patch, Param, UseGuards, Req, Delete, Res, UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from './admin.service';
import { AdminDashboardService } from './admin.service';
import { DashboardService } from './admin.service';
import { AdminContentService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, AccountStatus } from '@prisma/client';
import type { Response } from 'express';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { AdminEmployerService } from './admin.service';
import { VerifyEmployerDto } from './dto/verify-employer.dto';
import { AdminJobService } from './admin.service';
import { GetJobsFilterDto, UpdateJobStatusDto } from './dto/admin-job.dto';
import { AdminReportsService, AdminAuditService } from './admin.service';
import { GetAuditLogsDto } from './dto/admin-audit.dto';
import { GetReportFilterDto, ExportReportDto } from './dto/admin-report.dto';
import { AdminNotificationService } from './admin.service';
import { CreateBroadcastDto } from './dto/admin-notification.dto';
import {
  CreateFaqDto,
  UpdateFaqDto,
  UpdateAboutUsDto,
  UpdateContactInfoDto,
  CreateAnnouncementDto,
  UpdateAnnouncementStatusDto,
} from './dto/admin-content.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('admin')
export class AdminController {
  constructor(
    private authService: AdminAuthService,
    private adminDashboardService: AdminDashboardService,
    private readonly dashboardService: DashboardService,
  ) {}

  // --- AUTH ENDPOINTS ---
  @Post('auth/request-login')
  async requestLogin(@Body('email') email: string) {
    return this.authService.requestAdminLogin(email);
  }

  @Post('auth/verify-login')
  async verifyLogin(@Body('token') token: string) {
    return this.authService.verifyAdminLogin(token);
  }

  // --- DASHBOARD ENDPOINTS ---
  
  @Get('dashboard/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN) // Changed to Role.ADMIN to match your enum usage
  async getDashboardStats() {
    return this.dashboardService.getDashboardStats();
  }
  
  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getUsers(
    @Query('search') search?: string,
    @Query('role') role?: Role,
    @Query('status') status?: AccountStatus,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminDashboardService.getAllUsers({
      search, role, status, verificationStatus, startDate, endDate
    });
  }

  @Get('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getUserDetails(@Param('id') id: string) {
    return this.adminDashboardService.getUserDetails(id);
  }

  // Rules 5, 6, 7, 8: Update Status (Activate, Deactivate, Suspend)
  @Patch('users/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateStatus(
    @Param('id') id: string,
    @Body() updateUserStatusDto: UpdateUserStatusDto,
    @Req() req: any, // Extract admin info from JWT
  ) {
    // Assuming your JwtStrategy assigns the decoded token to req.user.id or req.user.sub
    const adminId = req.user.id || req.user.sub; 
    return this.adminDashboardService.updateUserStatus(adminId, id, updateUserStatusDto.status);
  }

  // Rule 9: Resend verification email
  @Post('users/:id/resend-verification')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async resendVerification(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const adminId = req.user.id || req.user.sub;
    return this.adminDashboardService.resendVerificationEmail(adminId, id);
  }

  // Rule 10: Trigger Password Reset
  @Post('users/:id/reset-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async resetPassword(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const adminId = req.user.id || req.user.sub;
    return this.adminDashboardService.resetUserPassword(adminId, id);
  }
}

// --- EMPLOYER VERIFICATION ---

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)  // Changed 'ADMIN' to Role.ADMIN for consistency
@Controller('admin/employers')
export class AdminEmployerController {
  constructor(private readonly adminEmployerService: AdminEmployerService) {}

  // Rule 1: Review employer verification requests
  @Get('pending-verifications')
  async getPendingVerifications() {
    return this.adminEmployerService.getPendingRequests();
  }

  // Rules 2, 3, 4, 5: Approve or reject requests with optional reason
  @Patch(':id/verify')
  async verifyEmployer(
    @Req() req,
    @Param('id') employerId: string,
    @Param('id') id: string,
    @Body() verifyDto: VerifyEmployerDto
  ) {

    const adminId = req.user.sub;
    return this.adminEmployerService.updateVerificationStatus(
      id, 
      employerId,
      verifyDto.status, 
      verifyDto.rejectionReason
    );
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/jobs')
export class AdminJobController {
  constructor(private readonly adminJobService: AdminJobService) {}

  // Rule 1, 2, 3, 7: Get all jobs with search, status filter & application count
  @Get()
  async getAllJobs(@Query() filters: GetJobsFilterDto) {
    return this.adminJobService.getAllJobs(filters);
  }

  @Get(':id')
  async getJobDetails(@Param('id') id: string) {
    return this.adminJobService.getJobDetails(id);
  }

  // Rule 4, 5, 6: Update status (PUBLISHED, HIDDEN, CLOSED, etc.)
  @Patch(':id/status')
  async updateJobStatus(
    @GetUser('id') adminId: string, 
    @Param('id') id: string, 
    @Body() updateJobStatusDto: UpdateJobStatusDto 
  ) {
    return this.adminJobService.updateJobStatus(adminId, id, updateJobStatusDto);
  }

  // Rule 5: Delete inappropriate job posting
  @Delete(':id')
  async deleteJob(@Param('id') id: string) {
    return this.adminJobService.deleteJob(id);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reportsService: AdminReportsService) {}

  @Get('summary')
  async getSummary(@Query() filters: GetReportFilterDto) {
    return this.reportsService.getAnalyticsSummary(filters);
  }

  @Get('export')
  async exportReport(
    @Query() filters: ExportReportDto,
    @Res() res: Response
  ) {
    const csvData = await this.reportsService.generateCsvReport(filters.type, filters);
    
    // Generate a filename with today's date
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${filters.type.toLowerCase()}-report-${timestamp}.csv`;

    // Set headers so the client downloads it as a CSV file
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    
    return res.send(csvData);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/content')
export class AdminContentController {
  constructor(private readonly contentService: AdminContentService) {}

  // --- RULE 1: FAQ ENDPOINTS ---
  @Get('faqs')
  async getFaqs() {
    return this.contentService.getAllFaqs();
  }

  @Post('faqs')
  async createFaq(@Body() dto: CreateFaqDto) {
    return this.contentService.createFaq(dto);
  }

  @Put('faqs/:id')
  async updateFaq(@Param('id') id: string, @Body() dto: UpdateFaqDto) {
    return this.contentService.updateFaq(id, dto);
  }

  @Delete('faqs/:id')
  async deleteFaq(@Param('id') id: string) {
    return this.contentService.deleteFaq(id);
  }

  // --- RULE 2: ABOUT US ENDPOINTS ---
  @Get('about-us')
  async getAboutUs() {
    return this.contentService.getAboutUs();
  }

  @Put('about-us')
  async updateAboutUs(@Body() dto: UpdateAboutUsDto) {
    return this.contentService.updateAboutUs(dto);
  }

  // --- RULE 3: CONTACT US ENDPOINTS ---
  @Get('contact-info')
  async getContactInfo() {
    return this.contentService.getContactInfo();
  }

  @Put('contact-info')
  async updateContactInfo(@Body() dto: UpdateContactInfoDto) {
    return this.contentService.updateContactInfo(dto);
  }

  // --- RULE 4: ANNOUNCEMENTS ENDPOINTS ---
  @Get('announcements')
  async getAnnouncements() {
    return this.contentService.getAllAnnouncements();
  }

  @Post('announcements')
  async createAnnouncement(@Body() dto: CreateAnnouncementDto) {
    return this.contentService.createAnnouncement(dto);
  }

  @Patch('announcements/:id/status')
  async updateAnnouncementStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementStatusDto,
  ) {
    return this.contentService.updateAnnouncementStatus(id, dto);
  }

  @Delete('announcements/:id')
  async deleteAnnouncement(@Param('id') id: string) {
    return this.contentService.deleteAnnouncement(id);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly auditService: AdminAuditService) {}

  @Get()
  async getAuditLogs(@Query() filters: GetAuditLogsDto) {
    return this.auditService.getLogs(filters);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/notifications')
export class AdminNotificationController {
  constructor(private readonly notificationService: AdminNotificationService) {}

  @Post('broadcast')
  async sendBroadcast(@Req() req: any, @Body() dto: CreateBroadcastDto) {
    // FIX: Safely extract the adminId checking both id and sub
    const adminId = req.user?.id || req.user?.sub;
    
    if (!adminId) {
      throw new UnauthorizedException('Admin ID not found in token');
    }

    return this.notificationService.sendBroadcast(adminId, dto);
  }

  @Get('history')
  async getBroadcastHistory() {
    return this.notificationService.getBroadcastHistory();
  }
}
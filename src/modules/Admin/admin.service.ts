import { Injectable, UnauthorizedException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; 
import { EmailService } from '../email/email.service'; 
import { JwtService } from '@nestjs/jwt'; 
import { AccountStatus, Role, Prisma } from '@prisma/client';
import { GetJobsFilterDto, UpdateJobStatusDto } from './dto/admin-job.dto';
import { CreateBroadcastDto, TargetAudience } from './dto/admin-notification.dto';
import { GetAuditLogsDto } from './dto/admin-audit.dto';
import { GetReportFilterDto, ReportType } from './dto/admin-report.dto';
import {
  CreateFaqDto,
  UpdateFaqDto,
  UpdateAboutUsDto,
  UpdateContactInfoDto,
  CreateAnnouncementDto,
  UpdateAnnouncementStatusDto,
} from './dto/admin-content.dto';
import * as crypto from 'crypto';

@Injectable()
export class AdminAuthService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private jwtService: JwtService,
  ) {}

  async requestAdminLogin(email: string) {
    // 1. Check Allowlist
    const allowedEmails = process.env.ADMIN_EMAILS?.split(',') || [];
    if (!allowedEmails.includes(email)) {
      throw new UnauthorizedException('You do not have permission to access the admin portal.');
    }

    // 2. Generate secure random token (expires in 15 mins)
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    // 3. Upsert the Admin User (Creates them if they don't exist yet)
    await this.prisma.user.upsert({
      where: { email },
      update: {
        adminLoginToken: token,
        adminLoginTokenExpiry: expiry,
        role: 'ADMIN',
      },
      create: {
        email,
        role: 'ADMIN',
        status: 'ACTIVE',
        adminLoginToken: token,
        adminLoginTokenExpiry: expiry,
        // Add a random dummy password that can never be guessed
        passwordHash: crypto.randomBytes(32).toString('hex'), 
      },
    });

    // 4. Send the Magic Link Email
    await this.emailService.sendAdminLoginEmail(email, token);
    
    return { message: 'Welcome back, A login link has been sent to your email.' };
  }

  async verifyAdminLogin(token: string) {
    // 1. Find user with this token where it hasn't expired
    const user = await this.prisma.user.findFirst({
      where: {
        adminLoginToken: token,
        adminLoginTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired login link. Please request a new one.');
    }

    // 2. Clear the token so it can't be reused
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        adminLoginToken: null,
        adminLoginTokenExpiry: null,
      },
    });

    // 1. Create the payload. Make sure this matches what your JwtStrategy expects!
    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role 
    };
    const accessToken = this.jwtService.sign(payload);

    // 3. Return the token alongside the user data
    return { 
      message: 'Login successful',
      access_token: accessToken, 
      user: { 
        id: user.id, 
        email: user.email, 
        role: user.role 
      } 
    };
  }
}

@Injectable()
export class AdminAuditService {
  constructor(private prisma: PrismaService) {}

  // Internal method used by other services to record actions
  async logAction(
    adminId: string,
    action: string,
    entity: string,
    entityId?: string,
    details?: any,
  ) {
    return this.prisma.auditLog.create({
      data: {
        adminId,
        action,
        entity,
        entityId,
        details: details ? (details as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  // Rule 1 & 5: View, search, and filter logs
  async getLogs(filters: GetAuditLogsDto) {
    const { search, action, entity, startDate, endDate, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.AuditLogWhereInput = {
      ...(action && { action: { equals: action, mode: 'insensitive' } }),
      ...(entity && { entity: { equals: entity, mode: 'insensitive' } }),
      ...(startDate && endDate && {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
      ...(search && {
        OR: [
          { action: { contains: search, mode: 'insensitive' } },
          { entity: { contains: search, mode: 'insensitive' } },
          { admin: { email: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where: whereClause }),
      this.prisma.auditLog.findMany({
        where: whereClause,
        include: {
          admin: { // Rule 2: Include the user who performed the action
            select: { id: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' }, // Latest first
        skip,
        take: limit,
      }),
    ]);

    return {
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      data: logs, // Rule 3 & 4 included in payload
    };
  }
}


@Injectable()
export class AdminDashboardService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private auditService: AdminAuditService,
  ) {}

  
  // Rule 2 & 5: View all users and search by name, email, or role
  // Rules 1, 2, & 3: View, Search, and Filter all users
  async getAllUsers(filters: {
    search?: string;
    role?: Role;
    status?: AccountStatus;
    verificationStatus?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { search, role, status, verificationStatus, startDate, endDate } = filters;
    const where: Prisma.UserWhereInput = {};

    // Filter by Role & Status
    if (role) where.role = role;
    if (status) where.status = status;

    // Filter by Registration Date
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Search by Name, Email, Phone, Company, or ID
    if (search) {
      where.OR = [
        { id: { equals: search } },
        { email: { contains: search, mode: 'insensitive' } },
        {
          talentProfile: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { phoneNumber: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
        {
          employerProfile: {
            OR: [
              { companyName: { contains: search, mode: 'insensitive' } },
              { phoneNumber: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    // Filter by Verification Status (Checks both Employer and Talent profiles)
    if (verificationStatus) {
      where.OR = [
        ...(where.OR || []),
        { employerProfile: { verificationStatus: verificationStatus as any } },
        // Add talent verification check here if applicable to your schema
      ];
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        talentProfile: { select: { firstName: true, lastName: true } },
        employerProfile: { select: { companyName: true, verificationStatus: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Rule 4: View user profile details
  async getUserDetails(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        talentProfile: true,
        employerProfile: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUserStatus(adminId: string, userId: string, newStatus: AccountStatus) {
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundException('User not found');

  const updatedUser = await this.prisma.user.update({
    where: { id: userId },
    data: { status: newStatus },
    select: { id: true, email: true, status: true },
  });

  // Replaces the broken this.logAdminAction
  await this.auditService.logAction(
    adminId, 
    'USER_STATUS_UPDATED', 
    'USER', 
    userId, 
    { previousStatus: user.status, newStatus } 
  );

  return updatedUser;
}

  // Rule 9: Resend verification email
  async resendVerificationEmail(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Generate a new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    await this.prisma.user.update({
      where: { id: userId },
      data: { verificationToken }, // Adjust field name to match your Prisma schema
    });

    await this.emailService.sendVerificationEmail(user.email, verificationToken);
    await this.auditService.logAction(adminId, 'RESEND_VERIFICATION_EMAIL', 'USER', userId);
    
    return { message: 'Verification email resent successfully' };
  }

  // Rule 10: Reset user password
  async resetUserPassword(adminId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Generate a reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour expiry
    
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        resetPasswordToken: resetToken, // Adjust field names to match your Prisma schema
        resetPasswordExpires: resetTokenExpires,
      },
    });

    await this.emailService.sendPasswordResetEmail(user.email, resetToken);
    await this.auditService.logAction(adminId, 'INITIATED_PASSWORD_RESET', 'USER', userId);

    return { message: 'Password reset email sent to user' };
  }
}

@Injectable()
export class AdminEmployerService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private auditService: AdminAuditService,
  ) {}

  // Rule 1 & 2: Review pending requests and view documents
  async getPendingRequests() {
    return this.prisma.employerProfile.findMany({
      where: { verificationStatus: 'PENDING' },
      include: { 
        user: { select: { email: true, createdAt: true } } 
      },
      // Note: Add any document fields you have in your Prisma schema here
      // e.g., companyRegistrationNumber, taxIdUrl, registrationDocumentUrl, etc.
    });
  }

  // Rules 3, 4 & 5: Approve, Reject, and process rejection reason
  async updateVerificationStatus(adminId: string, employerId: string, status: 'APPROVED' | 'REJECTED', rejectionReason?: string) {
    const employer = await this.prisma.employerProfile.findUnique({
      where: { id: employerId },
      include: { user: true },
    });

    if (!employer) throw new NotFoundException('Employer not found');

    const updatedEmployer = await this.prisma.employerProfile.update({
      where: { id: employerId },
      data: { 
        verificationStatus: status,
        rejectionReason: status === 'REJECTED' ? rejectionReason : null,
      },
    });

    await this.emailService.sendEmployerVerificationStatusEmail(
      employer.user.email,
      employer.companyName, 
      status,
      rejectionReason
    );

    // Log the action
    await this.auditService.logAction(
      adminId,
      status === 'APPROVED' ? 'EMPLOYER_APPROVED' : 'EMPLOYER_REJECTED',
      'EMPLOYER_PROFILE',
      employerId,
      { companyName: employer.companyName, reason: rejectionReason }
    );

    return updatedEmployer;
  }
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    // Run all queries in parallel for maximum performance
    const [
      totalCandidates,
      totalEmployers,
      activeJobs,
      totalApplications,
      pendingVerifications,
      recentUsers,
    ] = await Promise.all([
      // 1. Total registered candidates (Assuming role is 'TALENT' or 'CANDIDATE')
      this.prisma.user.count({ where: { role: 'TALENT' } }),

      // 2. Total registered employers
      this.prisma.user.count({ where: { role: 'EMPLOYER' } }),

      // 3. Total active job postings
      this.prisma.job.count({ where: { status: 'PUBLISHED' } }), // Adjust status enum as needed

      // 4. Total job applications
      this.prisma.application.count(),

      // 5. Pending employer verification requests
      this.prisma.employerProfile.findMany({
        where: { verificationStatus: 'PENDING' },
        select: {
          id: true,
          companyName: true,
          createdAt: true,
          user: { select: { email: true } },
        },
        take: 5, // Just get the latest 5 for the dashboard view
        orderBy: { createdAt: 'desc' },
      }),

      // 6. Recently registered users
      this.prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      overview: {
        totalCandidates,
        totalEmployers,
        activeJobs,
        totalApplications,
        pendingVerificationCount: pendingVerifications.length,
      },
      lists: {
        pendingVerifications,
        recentUsers,
      },
    };
  }
}

@Injectable()
export class AdminJobService {
  constructor(
    private prisma: PrismaService,
    private auditService: AdminAuditService,
    
  ) {}

  // Rule 1: View all jobs
  // Rule 2: Search by title, company, or location
  // Rule 3: Filter by status
  // Rule 7: View total number of applications for each job (_count)
  async getAllJobs(filters: GetJobsFilterDto) {
    const { search, status } = filters;
    const where: Prisma.JobWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        {
          employer: {
            companyName: { contains: search, mode: 'insensitive' },
          },
        },
      ];
    }

    return this.prisma.job.findMany({
      where,
      include: {
        employer: {
          select: {
            id: true,
            companyName: true,
            logoUrl: true,
          },
        },
        _count: {
          select: { applications: true }, // Rule 7: Total application count per job
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // View single job details with applications count
  async getJobDetails(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        employer: true,
        _count: {
          select: { applications: true },
        },
      },
    });

    if (!job) throw new NotFoundException('Job posting not found');
    return job;
  }

  // Rule 4: Approve job postings (status = PUBLISHED)
  // Rule 5: Hide inappropriate job postings (status = HIDDEN)
  // Rule 6: Close job postings (status = CLOSED)
  async updateJobStatus(adminId: string, jobId: string, dto: UpdateJobStatusDto) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job posting not found');

    await this.auditService.logAction(
      adminId,
      'JOB_STATUS_UPDATED',
      'JOB',
      jobId,
      { newStatus: dto.status, title: job.title }
    );

    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: dto.status,
      },
      include: {
        employer: {
          select: { companyName: true },
        },
        _count: {
          select: { applications: true },
        },
      },
    });
  }

  // Rule 5 (Alternative): Hard remove inappropriate job postings
  async deleteJob(jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job posting not found');

    await this.prisma.job.delete({ where: { id: jobId } });
    return { message: 'Job posting deleted successfully' };
  }

}

@Injectable()
export class AdminReportsService {
  constructor(private prisma: PrismaService) {}

  // Rule 5: Helper to build date range filter
  private getDateFilter(startDate?: string, endDate?: string) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    return Object.keys(dateFilter).length > 0 ? dateFilter : undefined;
  }

  // Rules 1, 2, 3, 4: View overview statistics
  async getAnalyticsSummary(filters: GetReportFilterDto) {
    const createdAt = this.getDateFilter(filters.startDate, filters.endDate);
    const whereClause = createdAt ? { createdAt } : {};

    const [candidates, employers, jobs, applications] = await Promise.all([
      this.prisma.user.count({ where: { role: 'TALENT', ...whereClause } }),
      this.prisma.user.count({ where: { role: 'EMPLOYER', ...whereClause } }),
      this.prisma.job.count({ where: whereClause }),
      this.prisma.application.count({ 
        where: createdAt ? { appliedAt: createdAt } : {} 
      }),
    ]);

    return {
      dateRange: { 
        startDate: filters.startDate || 'All time', 
        endDate: filters.endDate || 'All time' 
      },
      metrics: { candidates, employers, jobs, applications },
    };
  }

  // Rule 6: Export to CSV
  async generateCsvReport(type: ReportType, filters: GetReportFilterDto): Promise<string> {
  
  const createdAt = this.getDateFilter(filters.startDate, filters.endDate);
  const whereClause = createdAt ? { createdAt } : {};
  
  let rawData: any[] = [];
    
    switch (type) {
      case ReportType.CANDIDATES:
        const candidates = await this.prisma.user.findMany({
          where: { role: 'TALENT', ...whereClause },
          include: { talentProfile: true },
          orderBy: { createdAt: 'desc' }
        });
        rawData = candidates.map(c => ({
          ID: c.id,
          Email: c.email,
          Status: c.status,
          FirstName: c.talentProfile?.firstName || 'N/A',
          LastName: c.talentProfile?.lastName || 'N/A',
          RegisteredAt: c.createdAt.toISOString(),
        }));
        break;

      case ReportType.EMPLOYERS:
        const employers = await this.prisma.user.findMany({
          where: { role: 'EMPLOYER', ...whereClause },
          include: { employerProfile: true },
          orderBy: { createdAt: 'desc' }
        });
        rawData = employers.map(e => ({
          ID: e.id,
          Email: e.email,
          Status: e.status,
          CompanyName: e.employerProfile?.companyName || 'N/A',
          VerificationStatus: e.employerProfile?.verificationStatus || 'N/A',
          RegisteredAt: e.createdAt.toISOString(),
        }));
        break;

      case ReportType.JOBS:
        const jobs = await this.prisma.job.findMany({
          where: whereClause,
          include: { employer: true, _count: { select: { applications: true } } },
          orderBy: { createdAt: 'desc' }
        });
        rawData = jobs.map(j => ({
          ID: j.id,
          Title: j.title,
          Company: j.employer?.companyName || 'Unknown',
          Status: j.status,
          Location: j.location,
          TotalApplications: j._count.applications,
          PostedAt: j.createdAt.toISOString(),
        }));
        break;

      case ReportType.APPLICATIONS:
      // 2. Use appliedAt instead of createdAt for the where clause
      const appWhereClause = createdAt ? { appliedAt: createdAt } : {};
      
      const applications = await this.prisma.application.findMany({
        where: appWhereClause,
        include: { 
          job: true, 
          // 3. Change 'candidate' to 'talent' to match your schema
          talentProfile: true 
        },
        // 4. Use appliedAt for ordering
        orderBy: { appliedAt: 'desc' }
      });

      // 5. Use appliedAt and talent in the map function
      // We cast (a as any) here safely to avoid strict type relation errors 
      // depending on if talent points directly to User or TalentProfile
      rawData = applications.map((a: any) => ({
        ID: a.id,
        JobTitle: a.job?.title || 'Unknown',
        Candidate: a.talent?.user?.email || a.talent?.email || a.talentId,
        Status: a.status,
        AppliedAt: a.appliedAt.toISOString(),
      }));
      break;
  }

  return this.convertToCsv(rawData);
}

  // Helper to generate safe CSV string formatting
  private convertToCsv(data: any[]): string {
    if (!data || data.length === 0) return 'No data available for the selected range.';
    
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(obj => 
      Object.values(obj).map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
    );
    
    return [headers, ...rows].join('\n');
  }
}

@Injectable()
export class AdminContentService {
  constructor(private prisma: PrismaService) {}

  // ==================== RULE 1: FAQ MANAGEMENT ====================
  async getAllFaqs() {
    return this.prisma.faq.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createFaq(dto: CreateFaqDto) {
    return this.prisma.faq.create({
      data: {
        question: dto.question,
        answer: dto.answer,
        isPublished: dto.isPublished ?? true,
      },
    });
  }

  async updateFaq(id: string, dto: UpdateFaqDto) {
    const faq = await this.prisma.faq.findUnique({ where: { id } });
    if (!faq) throw new NotFoundException('FAQ not found');

    return this.prisma.faq.update({
      where: { id },
      data: dto,
    });
  }

  async deleteFaq(id: string) {
    const faq = await this.prisma.faq.findUnique({ where: { id } });
    if (!faq) throw new NotFoundException('FAQ not found');

    await this.prisma.faq.delete({ where: { id } });
    return { message: 'FAQ deleted successfully' };
  }

  // ==================== RULE 2: ABOUT US ====================
  async getAboutUs() {
    return this.prisma.siteContent.findUnique({
      where: { key: 'ABOUT_US' },
    });
  }

  async updateAboutUs(dto: UpdateAboutUsDto) {
    return this.prisma.siteContent.upsert({
      where: { key: 'ABOUT_US' },
      update: { value: dto as any },
      create: {
        key: 'ABOUT_US',
        value: dto as any,
      },
    });
  }

  // ==================== RULE 3: CONTACT US ====================
  async getContactInfo() {
    return this.prisma.siteContent.findUnique({
      where: { key: 'CONTACT_INFO' },
    });
  }

  async updateContactInfo(dto: UpdateContactInfoDto) {
    return this.prisma.siteContent.upsert({
      where: { key: 'CONTACT_INFO' },
      update: { value: dto as any },
      create: {
        key: 'CONTACT_INFO',
        value: dto as any,
      },
    });
  }

  // ==================== RULE 4: ANNOUNCEMENTS ====================
  async getAllAnnouncements() {
    return this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAnnouncement(dto: CreateAnnouncementDto) {
    return this.prisma.announcement.create({
      data: {
        title: dto.title,
        message: dto.message,
        isPublished: dto.isPublished ?? true,
      },
    });
  }

  async updateAnnouncementStatus(id: string, dto: UpdateAnnouncementStatusDto) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) throw new NotFoundException('Announcement not found');

    return this.prisma.announcement.update({
      where: { id },
      data: { isPublished: dto.isPublished },
    });
  }

  async deleteAnnouncement(id: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) throw new NotFoundException('Announcement not found');

    await this.prisma.announcement.delete({ where: { id } });
    return { message: 'Announcement deleted successfully' };
  }
}


@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService, // Inject your actual delivery service here
  ) {}

  // Rules 1, 2, 3: Send notifications to specific groups
  async sendBroadcast(adminId: string, dto: CreateBroadcastDto) {
    // 1. Create the pending notification record
    const broadcast = await this.prisma.broadcastNotification.create({
      data: {
        title: dto.title,
        message: dto.message,
        targetAudience: dto.targetAudience,
        adminId,
        status: 'PENDING',
      },
    });

    // 2. Resolve the target audience
    const whereClause: Prisma.UserWhereInput = {};
  
    if (dto.targetAudience === TargetAudience.TALENT) {
      whereClause.role = Role.TALENT; // Use the imported Role enum
    } else if (dto.targetAudience === TargetAudience.EMPLOYER) {
      whereClause.role = Role.EMPLOYER; // Use the imported Role enum
    }
    // If 'ALL', we leave the whereClause empty to fetch everyone

    const users = await this.prisma.user.findMany({
      where: whereClause,
      select: { id: true, email: true },
    });

    // 3. Process deliveries asynchronously so we don't block the HTTP request
    this.processDeliveries(broadcast.id, users, dto.title, dto.message).catch(err => {
      this.logger.error(`Failed to process deliveries for broadcast ${broadcast.id}`, err);
    });

    return {
      message: 'Broadcast notification initiated',
      broadcastId: broadcast.id,
      targetCount: users.length,
    };
  }

  // Background processor for deliveries
  private async processDeliveries(
    broadcastId: string,
    users: { id: string; email: string }[],
    title: string,
    message: string,
  ) {
    let successCount = 0;
    let failureCount = 0;

    for (const user of users) {
      try {
        // Replace this with your actual sending mechanism (email, in-app, push, etc.)
        await this.emailService.sendEmail({
          to: user.email,
          subject: title,
          text: message,
        });
        successCount++;
      } catch (error) {
        this.logger.error(`Failed to send to ${user.email}:`, error);
        failureCount++;
      }
    }

    // 4. Update the final delivery status
    await this.prisma.broadcastNotification.update({
      where: { id: broadcastId },
      data: {
        status: 'COMPLETED',
        successCount,
        failureCount,
      },
    });
  }

  // Rule 4: Review delivery status
  async getBroadcastHistory() {
    return this.prisma.broadcastNotification.findMany({
      include: {
        admin: {
          select: { id: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
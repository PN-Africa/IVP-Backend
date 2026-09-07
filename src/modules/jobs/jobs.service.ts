import { 
  Injectable, 
  NotFoundException, 
  BadRequestException, 
  ForbiddenException, 
  ConflictException 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobStatus, ApplicationStatus, Prisma } from '@prisma/client';
import { FilterApplicantsDto } from './dto/filter-applicants.dto';
import { EmailService } from '../email/email.service';
import { ScheduleInterviewDto } from './dto/schedule-interview.dto';
import { FillJobDto } from './dto/fill-job.dto';
import { SearchJobsDto } from './dto/search-jobs.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminAuditService } from '../Admin/admin.service';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AdminAuditService,
  ) {}

  async publishJob(employerId: string, jobData: CreateJobDto) {
    const employer = await this.prisma.employerProfile.findUnique({
      where: { id: employerId },
    });

    if (employer?.verificationStatus !== 'APPROVED') {
      throw new ForbiddenException(
        'Your account must be verified by an administrator before you can publish job vacancies.'
      );
    }

    return this.prisma.job.create({
      data: {
        ...jobData,
        employerId,
      },
    });
  }

  async createJob(userId: string, dto: CreateJobDto) {
    return this.prisma.job.create({
      data: {
        ...dto,
        employer: {
          connect: { userId: userId }, 
        },
        status: dto.status || JobStatus.DRAFT,
      },
    });
  }

  async updateJob(jobId: string, userId: string, dto: UpdateJobDto) {
    const job = await this.prisma.job.findUnique({ 
      where: { id: jobId },
      include: { employer: true }
    });

    if (!job) throw new NotFoundException('Job not found');
    if (job.employer.userId !== userId) throw new ForbiddenException('You can only edit your own jobs');
    if (job.status === JobStatus.CLOSED) throw new BadRequestException('Cannot edit a closed job');

    const updatedJob = await this.prisma.job.update({
      where: { id: jobId },
      data: dto,
    });

    // --- ADDED AUDIT LOG ---
    await this.auditService.logAction(
      userId,               // The employer's user ID performing the action
      'JOB_UPDATED',        // Action type
      'JOB',                // Entity
      jobId,                // Entity ID
      { 
        previousStatus: job.status, 
        newStatus: updatedJob.status,
        updatedFields: Object.keys(dto)
      } // Passing details as JSON
    );

    return updatedJob;
  }

  async closeJob(jobId: string, userId: string) {
    const job = await this.prisma.job.findUnique({ 
      where: { id: jobId },
      include: { employer: true }
    });

    if (!job) throw new NotFoundException('Job not found');
    if (job.employer.userId !== userId) throw new ForbiddenException('You can only close your own jobs');

    const updatedJob = await this.prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.CLOSED },
    });

    // --- ADDED AUDIT LOG ---
    await this.auditService.logAction(
      userId, 
      'JOB_CLOSED', 
      'JOB', 
      jobId, 
      { previousStatus: job.status, newStatus: JobStatus.CLOSED } 
    );

    return updatedJob;
  }

  async getEmployerJobs(userId: string) {
    return this.prisma.job.findMany({
      where: { 
        employer: { userId: userId }
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getJobApplicants(jobId: string, userId: string, filters: FilterApplicantsDto) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { employer: true },
    });

    if (!job) throw new NotFoundException('Job not found');
    if (job.employer.userId !== userId) {
      throw new ForbiddenException('You can only view applicants for your own jobs');
    }

    const whereClause: any = { jobId };
    
    if (filters.status) {
      whereClause.status = filters.status;
    }

    if (filters.skill) {
      whereClause.talent = {
        skills: { has: filters.skill },
      };
    }

    return this.prisma.application.findMany({
      where: whereClause,
      include: {
        talentProfile: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
      orderBy: { appliedAt: 'desc' },
    });
  }

  async updateApplicationStatus(jobId: string, applicationId: string, userId: string, status: ApplicationStatus) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          include: {
            employer: true,
          },
        },
        talentProfile: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application?.job?.employer?.userId !== userId) {
      throw new ForbiddenException('You can only update applications for your own job postings');
    }

    const updatedApplication = await this.prisma.application.update({
      where: { id: applicationId },
      data: { status },
      include: {
        talentProfile: {
          select: {
            firstName: true,
            lastName: true,
            user: { select: { email: true } },
          },
        },
      },
    });

    const talentEmail = application?.talentProfile?.user?.email ?? '';
    const talentName = `${application?.talentProfile?.firstName ?? ''} ${application?.talentProfile?.lastName ?? ''}`.trim();
    const jobTitle = application?.job?.title ?? 'the position';
    const companyName = application?.job?.employer?.companyName ?? 'our company';

    this.emailService
      .sendApplicationStatusEmail(talentEmail, talentName, jobTitle, companyName, status)
      .catch((err) => console.error('Failed to send status notification email:', err));

    // NEW: Send in-app notification for status update
    this.notificationsService.createNotification({
      userId: application.talentProfile.userId,
      type: 'APPLICATION',
      title: 'Application Status Updated',
      description: `Your application for ${jobTitle} at ${companyName} is now marked as ${status}.`
    }).catch(err => console.error('Notification failed:', err));

    return {
      message: `Candidate status updated to ${status} successfully`,
      application: updatedApplication,
    };
  }

  async scheduleInterview(
    jobId: string,
    applicationId: string,
    userId: string,
    dto: ScheduleInterviewDto,
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: { include: { employer: true } },
        talentProfile: { include: { user: true } },
      },
    });

    if (!application) throw new NotFoundException('Application not found');
    if (application?.job?.employer?.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (application.status !== 'SHORTLISTED') {
      throw new BadRequestException('You can only schedule interviews for shortlisted candidates.');
    }

    const interview = await this.prisma.interview.create({
      data: {
        applicationId,
        scheduledAt: new Date(dto.scheduledAt),
        location: dto.location,
        instructions: dto.instructions,
      },
    });

    this.emailService.sendInterviewEmail(
      application.talentProfile.user.email,
      application.talentProfile.firstName,
      application.job.employer.companyName,
      application.job.title,
      'SCHEDULED',
      dto
    ).catch(console.error);

    this.notificationsService.createNotification({
      userId: application.talentProfile.userId,
      type: 'INTERVIEW',
      title: 'Interview Scheduled',
      description: `You have been scheduled for an interview for the ${application.job.title} role. At ${dto.scheduledAt} at ${dto.location}.`,
    }).catch(err => console.error('Notification failed:', err));

    return { message: 'Interview scheduled successfully', interview };
  }

  async getTalentInterviews(userId: string) {
    const interviews = await this.prisma.interview.findMany({
      where: {
        application: {
          talentProfile: { userId },
        },
      },
      include: {
        application: {
          select: {
            id: true,
            status: true,
            appliedAt: true,
            job: {
              select: {
                id: true,
                title: true,
                location: true,
                jobType: true,
                employer: {
                  select: {
                    companyName: true,
                    logoUrl: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' }, // Shows upcoming interviews first
    });

    if (interviews.length === 0) {
      return {
        message: 'You have no scheduled interviews at the moment.',
        data: [],
      };
    }

    return {
      message: 'Interviews retrieved successfully.',
      count: interviews.length,
      data: interviews,
    };
  }

  async getEmployerInterviews(userId: string) {
  return this.prisma.interview.findMany({
    where: {
      application: {
        job: {
          employer: { userId },
        },
      },
    },
    include: {
      application: {
        include: {
          talentProfile: {
            select: {
              firstName: true,
              lastName: true,
              user: { select: { email: true } },
            },
          },
          job: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { scheduledAt: 'asc' },
  });
}

  async updateInterview(
    interviewId: string,
    userId: string,
    action: 'RESCHEDULE' | 'CANCEL',
    dto?: ScheduleInterviewDto,
  ) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            job: { include: { employer: true } },
            talentProfile: { include: { user: true } },
          },
        },
      },
    });

    if (!interview) throw new NotFoundException('Interview not found');
    if (interview.application.job.employer.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const updatedData: any = {};
    if (action === 'CANCEL') {
      updatedData.status = 'CANCELED';
    } else if (action === 'RESCHEDULE' && dto) {
      updatedData.status = 'RESCHEDULED';
      updatedData.scheduledAt = new Date(dto.scheduledAt);
      updatedData.location = dto.location;
      updatedData.instructions = dto.instructions;
    }

    const updatedInterview = await this.prisma.interview.update({
      where: { id: interviewId },
      data: updatedData,
    });

    this.emailService.sendInterviewEmail(
      interview.application.talentProfile.user.email,
      interview.application.talentProfile.firstName,
      interview.application.job.employer.companyName,
      interview.application.job.title,
      action === 'CANCEL' ? 'CANCELED' : 'RESCHEDULED',
      dto
    ).catch(console.error);

    return { message: `Interview ${action.toLowerCase()}d successfully`, interview: updatedInterview };
  }

  async markJobAsFilled(jobId: string, userId: string, dto: FillJobDto) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        employer: true,
        applications: {
          include: { talentProfile: { include: { user: true } } }, 
        },
      },
    });

    if (!job) throw new NotFoundException('Job not found');
    if (job.employer.userId !== userId) throw new ForbiddenException('Access denied');
    if (job.status === 'FILLED') throw new BadRequestException('Job is already marked as filled');

    if (dto.applicationId) {
      const hiredApp = job.applications.find(app => app.id === dto.applicationId);
      if (!hiredApp) throw new NotFoundException('Provided application ID does not belong to this job');

      await this.prisma.application.update({
        where: { id: dto.applicationId },
        data: { status: 'ACCEPTED' },
      });

      this.emailService.sendApplicationStatusEmail(
        hiredApp.talentProfile.user.email,
        hiredApp.talentProfile.firstName,
        job.title,
        job.employer.companyName,
        'ACCEPTED'
      ).catch(console.error);

      // NEW: Notify the hired candidate
      this.notificationsService.createNotification({
        userId: hiredApp.talentProfile.userId,
        type: 'APPLICATION',
        title: 'Application Accepted',
        description: `Congratulations! Your application for ${job.title} at ${job.employer.companyName} has been ACCEPTED.`
      }).catch(err => console.error('Notification failed:', err));
    }

    const unsuccessfulApps = job.applications.filter(app => app.id !== dto.applicationId);
    
    if (unsuccessfulApps.length > 0) {
      await this.prisma.application.updateMany({
        where: { 
          jobId, 
          id: { not: dto.applicationId || '' } 
        },
        data: { status: 'REJECTED' },
      });

      unsuccessfulApps.forEach(app => {
        this.emailService.sendJobClosedEmail(
          app.talentProfile.user.email,
          app.talentProfile.firstName,
          job.employer.companyName,
          job.title
        ).catch(console.error);

        // NEW: Notify the unsuccessful candidates
        this.notificationsService.createNotification({
          userId: app.talentProfile.userId,
          type: 'APPLICATION',
          title: 'Application Update',
          description: `The position for ${job.title} at ${job.employer.companyName} has been filled by another candidate.`
        }).catch(err => console.error('Notification failed:', err));
      });
    }

    // Capture the updated job so it can be returned after logging
    const updatedJob = await this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'FILLED' },
    });

    // --- ADDED AUDIT LOG ---
    await this.auditService.logAction(
      userId, 
      'JOB_FILLED', 
      'JOB', 
      jobId, 
      { 
        previousStatus: job.status, 
        newStatus: 'FILLED',
        hiredApplicationId: dto.applicationId || null
      }
    );

    return updatedJob;
  }

  async getAdminFilledJobs() {
    return this.prisma.job.findMany({
      where: { status: 'FILLED' },
      include: { employer: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async searchJobs(query: SearchJobsDto) {
    const where: Prisma.JobWhereInput = {
      status: 'PUBLISHED',
      deadline: { gt: new Date() },
    };

    if (query.keyword) {
      where.OR = [
        { title: { contains: query.keyword, mode: 'insensitive' } },
        { description: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    if (query.jobType) where.jobType = query.jobType;
    if (query.location) where.location = { contains: query.location, mode: 'insensitive' };
    if (query.industry) where.industry = query.industry;
    if (query.experienceLevel) where.experienceLevel = query.experienceLevel;

    const getSortField = (sortBy?: string): keyof Prisma.JobOrderByWithRelationInput => {
      switch (sortBy) {
        case 'deadline':
          return 'deadline';
        case 'createdAt':
          return 'createdAt';
        case 'salary':
          return 'maxSalary'; 
        default:
          return 'createdAt';
      }
    };

    const sortOrder = query.sortOrder || 'desc';
    const sortField = getSortField(query.sortBy);

    const orderBy: Prisma.JobOrderByWithRelationInput = {
      [sortField]: sortOrder,
    };

    const jobs = await this.prisma.job.findMany({
      where,
      orderBy,
      include: {
        employer: {
          select: { companyName: true, logoUrl: true },
        },
      },
    });

    if (jobs.length === 0) {
      return {
        message: 'No jobs found matching your search criteria.',
        data: [],
      };
    }

    return {
      message: 'Jobs retrieved successfully.',
      count: jobs.length,
      data: jobs,
    };
  }
}

@Injectable()
export class SavedJobsService {
  constructor(private prisma: PrismaService) {}

  async saveJob(userId: string, jobId: string) {
    const profile = await this.getTalentProfile(userId);

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job not found.');
    }

    if (job.status !== 'PUBLISHED' || new Date() > job.deadline) {
      throw new BadRequestException('You can only save active jobs.');
    }

    const alreadySaved = await this.prisma.savedJob.findUnique({
      where: {
        talentProfileId_jobId: {
          talentProfileId: profile.id,
          jobId: job.id,
        },
      },
    });

    if (alreadySaved) {
      throw new ConflictException('You have already saved this job.');
    }

    await this.prisma.savedJob.create({
      data: {
        talentProfileId: profile.id,
        jobId: job.id,
      },
    });

    return { message: 'Job saved successfully.' };
  }

  async getSavedJobs(userId: string) {
    const profile = await this.getTalentProfile(userId);

    const savedJobs = await this.prisma.savedJob.findMany({
      where: { talentProfileId: profile.id },
      orderBy: { savedAt: 'desc' },
      include: {
        job: {
          include: {
            employer: {
              select: { companyName: true, logoUrl: true },
            },
          },
        },
      },
    });

    return {
      message: 'Saved jobs retrieved successfully.',
      count: savedJobs.length,
      data: savedJobs,
    };
  }

  async removeSavedJob(userId: string, jobId: string) {
    const profile = await this.getTalentProfile(userId);

    const savedJob = await this.prisma.savedJob.findUnique({
      where: {
        talentProfileId_jobId: {
          talentProfileId: profile.id,
          jobId: jobId,
        },
      },
    });

    if (!savedJob) {
      throw new NotFoundException('This job is not in your saved list.');
    }

    await this.prisma.savedJob.delete({
      where: { id: savedJob.id },
    });

    return { message: 'Job removed from saved list successfully.' };
  }

  private async getTalentProfile(userId: string) {
    const profile = await this.prisma.talentProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Talent profile not found.');
    }
    return profile;
  }
}
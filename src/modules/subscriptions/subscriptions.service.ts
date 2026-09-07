import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminAuditService } from '../Admin/admin.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AdminAuditService,
  ) {}

  // ================= ADMIN RULES =================

  // Admin creates a plan
  async createPlan(adminId: string, dto: CreatePlanDto) {
    const plan = await this.prisma.subscriptionPlan.create({ data: dto });

    await this.auditService.logAction(
      adminId,
      'PLAN_CREATED',
      'SUBSCRIPTION_PLAN',
      plan.id,
      { name: plan.name, price: plan.price, durationMonths: plan.durationMonths },
    );

    return plan;
  }

  // Admin edits a plan
  async updatePlan(adminId: string, planId: string, dto: Partial<CreatePlanDto>) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    const updatedPlan = await this.prisma.subscriptionPlan.update({
      where: { id: planId },
      data: dto,
    });

    await this.auditService.logAction(
      adminId,
      'PLAN_UPDATED',
      'SUBSCRIPTION_PLAN',
      planId,
      { updatedFields: Object.keys(dto) },
    );

    return updatedPlan;
  }

  // Admin activates/deactivates a plan
  async togglePlanStatus(adminId: string, planId: string, isActive: boolean) {
    const updatedPlan = await this.prisma.subscriptionPlan.update({
      where: { id: planId },
      data: { isActive },
    });

    await this.auditService.logAction(
      adminId,
      'PLAN_STATUS_UPDATED',
      'SUBSCRIPTION_PLAN',
      planId,
      { isActive },
    );

    return updatedPlan;
  }

  // Admin views all employer subscriptions globally
  async getAllEmployerSubscriptions() {
    return this.prisma.employerSubscription.findMany({
      include: {
        employer: true,
        plan: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ================= EMPLOYER RULES =================

  // Employers can view all active plans
  async getActivePlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
  }

  // Purchase, Renew, and Upgrade
  async purchaseSubscription(userId: string, planId: string) {
    // 1. Get employer profile using the authenticated userId
    const employer = await this.prisma.employerProfile.findUnique({ where: { userId } });
    if (!employer) throw new NotFoundException('Employer profile not found');

    // 2. Validate the chosen plan
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new NotFoundException('Selected plan is invalid or inactive');

    // 3. Check for existing subscription
    const existingSub = await this.prisma.employerSubscription.findFirst({
      where: { employerId: employer.id },
    });

    const now = new Date();
    let startDate = now;
    let endDate = new Date(now);

    if (existingSub && existingSub.status === 'ACTIVE' && existingSub.endDate > now) {
      if (existingSub.planId === planId) {
        // (RENEW): Add the new months to the EXISTING end date
        startDate = existingSub.startDate;
        endDate = new Date(existingSub.endDate);
        endDate.setMonth(endDate.getMonth() + plan.durationMonths);
      } else {
        // (UPGRADE): Start fresh today, override old plan
        endDate.setMonth(endDate.getMonth() + plan.durationMonths);
      }

      const updatedSub = await this.prisma.employerSubscription.update({
        where: { id: existingSub.id },
        data: { planId: plan.id, status: 'ACTIVE', startDate, endDate },
        include: { plan: true },
      });

      await this.auditService.logAction(
        userId,
        'SUBSCRIPTION_UPDATED',
        'EMPLOYER_SUBSCRIPTION',
        updatedSub.id,
        { planId: plan.id, planName: plan.name, startDate, endDate },
      );

      return updatedSub;
    }

    // (NEW PURCHASE): Create fresh record with calculated expiry
    endDate.setMonth(endDate.getMonth() + plan.durationMonths);

    this.notificationsService.createNotification({
      userId: employer.userId,
      type: 'SUBSCRIPTION',
      title: 'Subscription Activated',
      description: `You have successfully subscribed to the ${plan.name} plan. 
                    Your subscription is active until ${endDate.toDateString()}.`,
    }).catch(err => console.error('Notification failed:', err));
    
    const newSub = await this.prisma.employerSubscription.create({
      data: {
        employerId: employer.id,
        planId: plan.id,
        status: 'ACTIVE',
        startDate,
        endDate,
      },
      include: { plan: true },
    });

    await this.auditService.logAction(
      userId,
      'SUBSCRIPTION_PURCHASED',
      'EMPLOYER_SUBSCRIPTION',
      newSub.id,
      { planId: plan.id, planName: plan.name, startDate, endDate },
    );

    return newSub;
  }

  // Automated Background Check (Runs every day at midnight)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleSubscriptionLifecycles() {
    const now = new Date();
    
    // Set warning threshold to exactly 3 days from now
    const warningDate = new Date();
    warningDate.setDate(now.getDate() + 3);

    // 1. Find all active subscriptions expiring in <= 3 days that haven't expired yet
    const expiringSubs = await this.prisma.employerSubscription.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { lte: warningDate, gt: now },
      },
      include: {
        employer: { include: { user: true } },
        plan: true,
      },
    });

    // Send warning emails
    for (const sub of expiringSubs) {
      if (sub.employer?.user?.email) {
        await this.emailService.sendSubscriptionExpiryEmail(
          sub.employer.user.email,
          sub.employer.companyName,
          sub.plan.name,
          sub.endDate
        ).catch(console.error);

        // Send in-app notification for expiring subscription
        this.notificationsService.createNotification({
          userId: sub.employer.userId,
          type: 'SUBSCRIPTION',
          title: 'Subscription Expiring Soon',
          description: `Your ${sub.plan.name} subscription will expire on ${sub.endDate.toDateString()}. 
                        Please renew to avoid service interruption.`
        }).catch(err => console.error('Notification failed:', err));
      }
    }

    // Mark subscriptions as EXPIRED if the date has passed
    await this.prisma.employerSubscription.updateMany({
      where: {
        status: 'ACTIVE',
        endDate: { lte: now },
      },
      data: { status: 'EXPIRED' },
    });

    console.log(`[Cron] Processed ${expiringSubs.length} expiring warnings and updated expired plans.`);
  }

  // ================= USAGE TRACKING =================

  async getEmployerUsage(userId: string) {
    const employer = await this.prisma.employerProfile.findUnique({ 
      where: { userId } 
    });
    
    if (!employer) throw new NotFoundException('Employer profile not found');

    const activeSub = await this.prisma.employerSubscription.findFirst({
      where: {
        employerId: employer.id,
        status: 'ACTIVE',
        endDate: { gt: new Date() },
      },
      include: { plan: true },
    });

    if (!activeSub) {
      return {
        hasActivePlan: false,
        message: 'No active subscription found.',
      };
    }

    const jobsUsed = await this.prisma.job.count({
      where: {
        employerId: employer.id,
        createdAt: {
          gte: activeSub.startDate,
          lte: activeSub.endDate,
        },
      },
    });

    return {
      hasActivePlan: true,
      planName: activeSub.plan.name,
      billingCycle: {
        start: activeSub.startDate,
        end: activeSub.endDate,
      },
      limits: {
        jobs: {
          used: jobsUsed,
          total: activeSub.plan.jobLimit,
          isUnlimited: activeSub.plan.jobLimit === -1,
        },
        applications: {
          total: activeSub.plan.applicationLimit,
          isUnlimited: activeSub.plan.applicationLimit === -1,
        }
      }
    };
  }

  async getCurrentSubscription(userId: string) {
    const employer = await this.prisma.employerProfile.findUnique({ 
      where: { userId } 
    });
    
    if (!employer) throw new NotFoundException('Employer profile not found');

    const activeSub = await this.prisma.employerSubscription.findFirst({
      where: {
        employerId: employer.id,
        status: 'ACTIVE',
        endDate: { gt: new Date() },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeSub) {
      throw new NotFoundException('No active subscription found');
    }

    return activeSub;
  }
}
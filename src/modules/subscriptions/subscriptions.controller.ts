import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiBearerAuth, 
  ApiOkResponse, 
  ApiCreatedResponse, 
  ApiParam, 
  ApiBody, 
  ApiUnauthorizedResponse, 
  ApiForbiddenResponse 
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // ----------------------------------------------------
  // ADMIN ROUTES
  // ----------------------------------------------------

  @Post('admin/plans')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new subscription plan (Admin Only)' })
  @ApiCreatedResponse({ description: 'Subscription plan created successfully.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token.' })
  @ApiForbiddenResponse({ description: 'User is not an Admin.' })
  createPlan(
    @GetUser('id') adminId: string,
    @Body() dto: CreatePlanDto,
  ) {
    return this.subscriptionsService.createPlan(adminId, dto);
  }

  @Patch('admin/plans/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update an existing subscription plan (Admin Only)' })
  @ApiParam({ name: 'id', description: 'The UUID of the plan to update' })
  @ApiOkResponse({ description: 'Subscription plan updated successfully.' })
  @ApiForbiddenResponse({ description: 'User is not an Admin.' })
  updatePlan(
    @GetUser('id') adminId: string,
    @Param('id') id: string, 
    @Body() dto: Partial<CreatePlanDto>,
  ) {
    return this.subscriptionsService.updatePlan(adminId, id, dto);
  }

  @Patch('admin/plans/:id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Toggle the active/inactive status of a plan (Admin Only)' })
  @ApiParam({ name: 'id', description: 'The UUID of the plan' })
  @ApiBody({ schema: { type: 'object', properties: { isActive: { type: 'boolean', example: false } } } })
  @ApiOkResponse({ description: 'Plan status updated successfully.' })
  @ApiForbiddenResponse({ description: 'User is not an Admin.' })
  togglePlanStatus(
    @GetUser('id') adminId: string,
    @Param('id') id: string, 
    @Body('isActive') isActive: boolean,
  ) {
    return this.subscriptionsService.togglePlanStatus(adminId, id, isActive);
  }

  @Get('admin/employers')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'View all employer subscriptions (Admin Only)' })
  @ApiOkResponse({ description: 'List of all employer subscriptions retrieved successfully.' })
  @ApiForbiddenResponse({ description: 'User is not an Admin.' })
  getAllEmployerSubscriptions() {
    return this.subscriptionsService.getAllEmployerSubscriptions();
  }

  // ----------------------------------------------------
  // EMPLOYER ROUTES
  // ----------------------------------------------------

  @Get('plans')
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Get all active subscription plans available for purchase (Employers)' })
  @ApiOkResponse({ description: 'List of active plans retrieved successfully.' })
  getActivePlans() {
    return this.subscriptionsService.getActivePlans();
  }

  @Post('purchase/:planId')
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Purchase a subscription plan (Employers)' })
  @ApiParam({ name: 'planId', description: 'The UUID of the plan to purchase' })
  @ApiCreatedResponse({ description: 'Subscription purchased successfully.' })
  @ApiForbiddenResponse({ description: 'User is not an Employer.' })
  purchaseSubscription(
    @GetUser('id') userId: string,
    @Param('planId') planId: string,
  ) {
    return this.subscriptionsService.purchaseSubscription(userId, planId);
  }

  @Get('my-usage')
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Get current subscription usage (Jobs posted vs limits)' })
  @ApiOkResponse({ description: 'Usage statistics retrieved successfully.' })
  @ApiForbiddenResponse({ description: 'User is not an Employer.' })
  getMyUsage(@GetUser('id') userId: string) {
    return this.subscriptionsService.getEmployerUsage(userId);
  }

  @Get('current')
  @Roles(Role.EMPLOYER)
  @ApiOperation({ summary: 'Get current active subscription details' })
  @ApiOkResponse({ description: 'Current subscription retrieved successfully.' })
  getCurrentSubscription(@GetUser('id') userId: string) {
    return this.subscriptionsService.getCurrentSubscription(userId);
  }
}
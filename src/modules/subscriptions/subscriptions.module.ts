import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { AdminAuditService } from '../Admin/admin.service';



@Module({
  imports: [NotificationsModule, EmailModule],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    AdminAuditService,  
  ],
})
export class SubscriptionsModule {}

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;
  constructor(private configService: ConfigService) {
    // Initialize Resend with your API key
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
  }

  private get defaultFrom(): string {
    // Use your custom verified domain if set, otherwise fallback to Resend's onboarding domain for testing
    return (
      this.configService.get<string>('RESEND_FROM') ||
      'IVP Africa <onboarding@resend.dev>'
    );
  }

  /**
   * Register a new domain with Resend to send emails from custom domains
   */
  async createDomain(domainName: string) {
    try {
      const data = await this.resend.domains.create({
        name: domainName,
      });
      console.log(`[Domain Created] ${domainName}:`, data);
      return data;
    } catch (error) {
      console.error('Error creating domain in Resend:', error);
      throw new InternalServerErrorException(
        `Failed to create domain ${domainName} on Resend.`,
      );
    }
  }

  async sendVerificationEmail(email: string, token: string) {
    

    const verifyUrl = `${process.env.API_URL}/api/v1/auth/verify-email?token=${token}`;

    try {
      await this.resend.emails.send({
        from: this.defaultFrom,
        to: email,
        subject: 'Verify Your IVP Africa Account',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Welcome to IVP Africa!</h2>
            <p>You are one step away from completing your profile.</p>
            <p>Please verify your email address by clicking the button below:</p>
            <a href="${verifyUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
            <br /><br />
            <p><small>If the button doesn't work, copy and paste this link into your browser:<br/> ${verifyUrl}</small></p>
          </div>
        `,
      });
    } catch (error) {
      console.error('Error sending email:', error);
      throw new InternalServerErrorException(
        'Registration succeeded, but email failed to send.',
      );
    }
  }

  async sendPasswordResetEmail(email: string, token: string) {
    const resetUrl = `${process.env.API_URL}/api/v1/auth/reset-password?token=${token}`;

    try {
      await this.resend.emails.send({
        from: this.defaultFrom,
        to: email,
        subject: 'Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Password Reset Request</h2>
            <p>We received a request to reset your password for your IVP Africa account.</p>
            <p>Click the button below to create a new password. This link is valid for 1 hour.</p>
            <a href="${resetUrl}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
            <br /><br />
            <p><small>If you did not request this, please ignore this email.</small></p>
          </div>
        `,
      });
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw new InternalServerErrorException(
        'Failed to send password reset email.',
      );
    }
  }

  async sendApplicationStatusEmail(
    toEmail: string,
    talentName: string,
    jobTitle: string,
    companyName: string,
    status: 'SHORTLISTED' | 'REJECTED' | 'ACCEPTED' | string,
  ) {
    let subject = `Update on your application for ${jobTitle} at ${companyName}`;
    let messageBody = '';

    if (status === 'SHORTLISTED') {
      subject = `Great news! You have been shortlisted for ${jobTitle}`;
      messageBody = `Hi ${talentName},\n\nGood news! ${companyName} has reviewed your profile and shortlisted you for the ${jobTitle} position. The team will reach out with the next steps soon.\n\nBest regards,\nIVP Africa Team`;
    } else if (status === 'REJECTED') {
      subject = `Update regarding your application for ${jobTitle}`;
      messageBody = `Hi ${talentName},\n\nThank you for applying for the ${jobTitle} position at ${companyName}. After careful consideration, the team has decided not to move forward with your application at this time.\n\nWe encourage you to keep applying for other opportunities on IVP Africa.\n\nBest regards,\nIVP Africa Team`;
    } else {
      messageBody = `Hi ${talentName},\n\nYour application status for ${jobTitle} at ${companyName} has been updated to: ${status}.\n\nBest regards,\nIVP Africa Team`;
    }

    try {
      await this.resend.emails.send({
        from: this.defaultFrom,
        to: toEmail,
        subject,
        text: messageBody,
      });
      console.log(`[Email Sent] To: ${toEmail} | Subject: ${subject}`);
    } catch (error) {
      console.error('Error sending application status email:', error);
    }
  }

  async sendInterviewEmail(
    toEmail: string,
    talentName: string,
    companyName: string,
    jobTitle: string,
    action: 'SCHEDULED' | 'RESCHEDULED' | 'CANCELED',
    details?: { scheduledAt: string; location: string; instructions?: string },
  ) {
    let subject = '';
    let messageBody = '';

    if (action === 'CANCELED') {
      subject = `Interview Canceled: ${jobTitle} at ${companyName}`;
      messageBody = `Hi ${talentName},\n\nYour interview for the ${jobTitle} position at ${companyName} has been canceled. The employer will be in touch if there are any further updates.\n\nBest regards,\nIVP Africa Team`;
    } else {
      const time = new Date(details!.scheduledAt).toLocaleString();
      subject = `Interview ${action === 'RESCHEDULED' ? 'Rescheduled' : 'Invitation'}: ${companyName}`;
      messageBody = `Hi ${talentName},\n\n${companyName} has ${action.toLowerCase()} an interview with you for the ${jobTitle} position.\n\nDate & Time: ${time}\nLocation/Link: ${details!.location}\nInstructions: ${details!.instructions || 'None'}\n\nPlease ensure you are prepared.\n\nBest regards,\nIVP Africa Team`;
    }

    try {
      await this.resend.emails.send({
        from: this.defaultFrom,
        to: toEmail,
        subject,
        text: messageBody,
      });
      console.log(`[Email Sent] To: ${toEmail} | Subject: ${subject}`);
    } catch (error) {
      console.error('Error sending interview email:', error);
    }
  }

  async sendJobClosedEmail(
    toEmail: string,
    talentName: string,
    companyName: string,
    jobTitle: string,
  ) {
    const subject = `Update on your application: ${jobTitle} at ${companyName} has been filled`;
    const messageBody = `Hi ${talentName},\n\nThank you for taking the time to apply and interview for the ${jobTitle} position at ${companyName}.\n\nThis email is to inform you that the recruitment process has concluded and the position has been officially filled. While you were not selected for this specific role, we highly encourage you to keep exploring and applying to other opportunities on IVP Africa.\n\nBest regards,\nIVP Africa Team`;

    try {
      await this.resend.emails.send({
        from: this.defaultFrom,
        to: toEmail,
        subject,
        text: messageBody,
      });
      console.log(`[Email Sent] To: ${toEmail} | Subject: ${subject}`);
    } catch (error) {
      console.error('Error sending job closed email:', error);
    }
  }

  async sendSubscriptionExpiryEmail(
    toEmail: string,
    companyName: string,
    planName: string,
    expiryDate: Date,
  ) {
    const subject = `Action Required: Your ${planName} subscription is expiring soon`;
    const dateString = expiryDate.toLocaleDateString();
    const messageBody = `Hi ${companyName} team,\n\nYour ${planName} subscription is set to expire on ${dateString}.\n\nTo ensure uninterrupted access to job posting and recruitment features, please log in and renew your subscription or upgrade to a new plan before the expiry date.\n\nBest regards,\nIVP Africa Team`;

    try {
      await this.resend.emails.send({
        from: this.defaultFrom,
        to: toEmail,
        subject,
        text: messageBody,
      });
      console.log(`[Email Sent] To: ${toEmail} | Subject: ${subject}`);
    } catch (error) {
      console.error('Error sending subscription expiry email:', error);
    }
  }

  async sendApplicationReceivedEmail(
    employerEmail: string,
    jobTitle: string,
    applicantName: string,
  ) {
    const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/employer/dashboard`;

    try {
      await this.resend.emails.send({
        from: this.defaultFrom,
        to: employerEmail,
        subject: `New Application Received: ${jobTitle}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>New Job Application</h2>
            <p>Hello,</p>
            <p>Great news! <strong>${applicantName}</strong> has just applied for your job posting: <strong>${jobTitle}</strong>.</p>
            <p>Log in to your employer dashboard to review their profile, resume, and move them to the next stage of your recruitment pipeline.</p>
            <br />
            <a href="${dashboardUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Application</a>
            <br /><br />
            <p><small>Best regards,<br/>IVP Africa Team</small></p>
          </div>
        `,
      });
      console.log(`[Email Sent] To: ${employerEmail} | Subject: New Application Received for ${jobTitle}`);
    } catch (error) {
      console.error('Error sending application received email to employer:', error);
    }
  }

  async sendAdminLoginEmail(email: string, token: string) {
    // This points to your frontend admin verification page
    const loginUrl = `${process.env.FRONTEND_URL}/adminLogin/verify?token=${token}`;

    try {
      await this.resend.emails.send({
        from: this.defaultFrom,
        to: email,
        subject: 'Admin Access Verification - IVP Africa',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Admin Login Request</h2>
            <p>Someone requested access to the IVP Africa Admin Dashboard using this email address.</p>
            <p>If this was you, click the button below to log in securely. This link expires in 15 minutes.</p>
            <a href="${loginUrl}" style="background-color: #000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify & Log In</a>
            <br /><br />
            <p><small>If you did not request this, you can safely ignore this email.</small></p>
          </div>
        `,
      });
      console.log(`[Admin Email Sent] To: ${email}`);
    } catch (error) {
      console.error('Error sending admin login email:', error);
    }
  }

  async sendEmployerVerificationStatusEmail(email: string, companyName: string, status: string, rejectionReason?: string) {
    const subject = status === 'APPROVED' 
    ? 'Your Employer Account is Verified!' 
    : 'Update on Your Employer Verification Request';
      
    const html = status === 'APPROVED'
    ? `
Hi ${companyName},


       
Great news! Your account has been verified. You can now publish job vacancies on the platform.

`
    : `
Hi ${companyName},


       
Unfortunately, we could not verify your account at this time.


       
Reason: ${rejectionReason}


       
Please log in to your dashboard to provide the correct documentation or contact support for help.

`;

  try {
    await this.resend.emails.send({
      from: this.defaultFrom,
      to: email,
      subject,
      html,
    });
    console.log(`[Email Sent] To: ${email} | Subject: ${subject}`);
  } catch (error) {
    console.error('Error sending employer verification email:', error);
  }
 }

 async sendEmail(options: { to: string; subject: string; text: string; html?: string }) {
  try {
    await this.resend.emails.send({
      from: this.defaultFrom,
      to: options.to,
      subject: options.subject,
      // If HTML isn't provided, wrap the plain text in a basic div for better readability
      html: options.html || `
        
          ${options.subject}
          ${options.text}
        
      `,
    });
    console.log(`[Broadcast Email Sent] To: ${options.to} | Subject: ${options.subject}`);
  } catch (error) {
    console.error(`Error sending broadcast email to ${options.to}:`, error);
    // We throw the error so the notification service can increment the 'failureCount'
    throw error; 
  }

 }

}
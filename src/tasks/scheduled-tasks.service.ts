// src/tasks/scheduled-tasks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from '../auth/auth.service';
import { UserService } from '../user/user.service';
import { ExhibitorService } from '../exhibitor/exhibitor.service';
import { OrganizerService } from '../organizer/organizer.service';

@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private exhibitorService: ExhibitorService,
    private organizerService: OrganizerService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCleanupUnverifiedAccounts() {
    this.logger.log('Starting cleanup of unverified accounts...');
    await this.authService.cleanupUnverifiedAccounts();
    this.logger.log('Finished cleanup of unverified accounts');
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleCleanupUserTrash() {
    this.logger.log('Starting cleanup of user trash older than 30 days...');
    const deletedCount = await this.userService.cleanupTrash();
    this.logger.log(`Permanently deleted ${deletedCount} users from trash`);
  }
}
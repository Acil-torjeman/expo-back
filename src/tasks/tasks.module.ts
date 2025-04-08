// src/tasks/tasks.module.ts
import { Module } from '@nestjs/common';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { ExhibitorModule } from '../exhibitor/exhibitor.module';
import { OrganizerModule } from '../organizer/organizer.module';

@Module({
  imports: [
    AuthModule,
    UserModule,
    ExhibitorModule,
    OrganizerModule
  ],
  providers: [ScheduledTasksService],
})
export class TasksModule {}
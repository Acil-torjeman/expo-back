import { EventStatus, EventVisibility, Location } from '../entities/event.entity';

export interface EventResponse {
  id: string;
  name: string;
  type: string;
  description: string;
  imagePath?: string;
  startDate: Date;
  endDate: Date;
  openingHours: string;
  location: Location;
  organizer: {
    id: string;
    username: string;
    email: string;
  };
  allowedSectors: string[];
  allowedSubsectors: string[];
  maxExhibitors?: number;
  registrationDeadline: Date;
  plans: Array<{
    id: string;
    name: string;
  }>;
  standPricing: Record<string, number>;
  equipmentPricing: Record<string, number>;
  status: EventStatus;
  visibility: EventVisibility;
  specialConditions?: string;
  registrationsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// src/stand/stand.interface.ts
export interface StandResponse {
  id: string;
  number: string;
  area: number;
  basePrice: number;
  type: string;
  status: string;
  description?: string;
  features?: string[];
  plan: {
    id: string;
    name: string;
    organizer: {
      id: string;
      username: string;
      email: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}
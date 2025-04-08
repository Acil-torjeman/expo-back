export interface Dimensions {
  width: number;
  height: number;
  unit: string;
}

export interface PlanResponse {
  id: string;
  name: string;
  description?: string;
  pdfPath: string;
  organizer: {
    id: string;
    username: string;
    email: string;
  };
  events?: Array<{
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
  }>;
  dimensions?: Dimensions;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

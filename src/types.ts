export interface Room {
  id: string;
  name: string;     
  joinCode: string;
  hostId: string;
  status: 'active' | 'closed';
  createdAt: number;
}

export interface Order {
  id?: string;
  roomId: string;
  name: string;      
  uploadedBy: string;
  taxPercentage: number;
  total: number;
  items: Array<{ name: string; price: number; claimedBy: string[] }>;
  createdAt: number;
}
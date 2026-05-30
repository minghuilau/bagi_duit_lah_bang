export interface Room {
  id: string;
  name: string;     
  joinCode: string;
  hostId: string;
  status: 'active' | 'closed';
  createdAt: number;
  settledDebts?: string[];
}

export interface Order {
  id?: string;
  roomId: string;
  name: string;      
  uploadedBy: string;
  paidBy: string;
  taxPercentage: number;
  total: number;
  items: Array<{ name: string; price: number; claimedBy: string[] }>;
  createdAt: number;
}

export interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  method: string;
  initials: string;
  color: string;
  joinedAt: number;
}
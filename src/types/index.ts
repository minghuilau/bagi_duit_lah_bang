export interface User {
  id: string; // Firebase Auth UID or anonymous ID
  name: string;
}

export interface Room {
  id: string; // Firestore Document ID
  joinCode: string; // The 5-character code (e.g., "X7B9Q")
  hostId: string;
  status: 'active' | 'settled';
  createdAt: number; // Unix timestamp for easier sorting
}

// or
export interface Order {
  id: string;
  roomId: string;
  merchantName: string;
  taxAmount: number;
  serviceCharge: number;
  totalAmount: number;
  createdAt: number;
}

// Added items to the order
export interface OrderItem {
  id: string;
  orderId: string;
  name: string;
  price: number;
  claimedBy: string[]; 
}
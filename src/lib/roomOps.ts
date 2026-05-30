import { collection, doc, setDoc, query, where, getDocs, addDoc, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { Room, Order } from '../types';

// Helper function to generate a 5-character alphanumeric code
const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export async function createRoom(hostId: string, roomName: string): Promise<Room> {
  const roomCollectionRef = collection(db, 'rooms');
  let roomCode = generateRoomCode();
  let isUnique = false;

  // Ensure the 5-character code isn't currently being used by another active room
  while (!isUnique) {
    const q = query(
      roomCollectionRef, 
      where('joinCode', '==', roomCode), 
      where('status', '==', 'active')
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      isUnique = true;
    } else {
      roomCode = generateRoomCode(); // Try again if taken
    }
  }

  const newRoomRef = doc(roomCollectionRef);
  
  const newRoom: Room = {
    id: newRoomRef.id,
    name: roomName || 'Unnamed Room', 
    joinCode: roomCode,
    hostId: hostId,
    status: 'active',
    createdAt: Date.now()
  };

  await setDoc(newRoomRef, newRoom);
  return newRoom;
}

export async function joinRoom(joinCode: string): Promise<Room | null> {
  const roomCollectionRef = collection(db, 'rooms');
  const q = query(
    roomCollectionRef, 
    where('joinCode', '==', joinCode.toUpperCase()), 
    where('status', '==', 'active')
  );

  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.empty) {
    return null; 
  }

  const roomDoc = querySnapshot.docs[0];
  return roomDoc.data() as Room;
}

// --- Push orders to the database ---
export async function createOrder(orderData: Omit<Order, 'id'>): Promise<string> {
  const ordersCollectionRef = collection(db, 'orders');
  
  // addDoc automatically generates a unique ID for the new document
  const docRef = await addDoc(ordersCollectionRef, orderData);
  
  return docRef.id;
}

// --- NEW: Real-time listener for the Order Menu ---
export function subscribeToOrders(roomId: string, callback: (orders: Order[]) => void) {
  const q = query(
    collection(db, 'orders'),
    where('roomId', '==', roomId),
    orderBy('createdAt', 'asc') // Orders them oldest to newest
  );

  // onSnapshot listens continuously. It triggers the callback every time the database changes.
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const fetchedOrders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Order[];
    
    callback(fetchedOrders);
  });

  return unsubscribe; // We return this so React can turn off the listener when the user leaves the room
}
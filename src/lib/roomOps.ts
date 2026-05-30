// src/lib/roomOps.ts
import { collection, doc, setDoc, query, where, getDocs, addDoc, onSnapshot, orderBy, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';
import { Room, Order, Participant } from '../types';

const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const generateUserProfile = (user: any, isHost: boolean): Participant => {
  const name = user.displayName || (user.isAnonymous ? 'Guest' : 'Unknown');
  const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
  const colors = ['bg-emerald-600', 'bg-indigo-600', 'bg-orange-500', 'bg-amber-600', 'bg-rose-700', 'bg-blue-600', 'bg-cyan-600'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  return {
    id: user.uid,
    name,
    isHost,
    method: user.isAnonymous ? 'anonymous' : 'Google',
    initials,
    color,
    joinedAt: Date.now()
  };
};

export async function createRoom(user: any, roomName: string): Promise<Room> {
  const roomCollectionRef = collection(db, 'rooms');
  let roomCode = generateRoomCode();
  let isUnique = false;

  while (!isUnique) {
    const q = query(roomCollectionRef, where('joinCode', '==', roomCode), where('status', '==', 'active'));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      isUnique = true;
    } else {
      roomCode = generateRoomCode();
    }
  }

  const newRoomRef = doc(roomCollectionRef);
  const newRoom: Room = {
    id: newRoomRef.id,
    name: roomName || 'Unnamed Room', 
    joinCode: roomCode,
    hostId: user.uid,
    status: 'active',
    createdAt: Date.now(),
    settledDebts: [] // Initialize as empty array
  };

  await setDoc(newRoomRef, newRoom);

  const participantRef = doc(db, 'rooms', newRoomRef.id, 'participants', user.uid);
  await setDoc(participantRef, generateUserProfile(user, true));

  return newRoom;
}

export async function joinRoom(user: any, joinCode: string): Promise<Room | null> {
  const roomCollectionRef = collection(db, 'rooms');
  const q = query(roomCollectionRef, where('joinCode', '==', joinCode.trim().toUpperCase()), where('status', '==', 'active'));
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.empty) {
    return null; 
  }

  const roomDoc = querySnapshot.docs[0];
  const roomData = roomDoc.data() as Room;

  const participantRef = doc(db, 'rooms', roomDoc.id, 'participants', user.uid);
  await setDoc(participantRef, generateUserProfile(user, false));

  return roomData;
}

export async function createOrder(orderData: Omit<Order, 'id'>): Promise<string> {
  const ordersCollectionRef = collection(db, 'orders');
  const docRef = await addDoc(ordersCollectionRef, orderData);
  return docRef.id;
}

export function subscribeToOrders(roomId: string, callback: (orders: Order[]) => void) {
  const q = query(collection(db, 'orders'), where('roomId', '==', roomId), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const fetchedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
    callback(fetchedOrders);
  });
}

export function subscribeToParticipants(roomId: string, callback: (participants: Participant[]) => void) {
  const q = query(collection(db, 'rooms', roomId, 'participants'), orderBy('joinedAt', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const fetchedParticipants = snapshot.docs.map(doc => doc.data() as Participant);
    callback(fetchedParticipants);
  });
}

export async function toggleItemClaim(orderId: string, items: any[], itemIndex: number, userId: string) {
  const orderRef = doc(db, 'orders', orderId);
  const newItems = [...items];
  
  if (!newItems[itemIndex].claimedBy) {
    newItems[itemIndex].claimedBy = [];
  }
  
  const hasClaimed = newItems[itemIndex].claimedBy.includes(userId);
  
  if (hasClaimed) {
    newItems[itemIndex].claimedBy = newItems[itemIndex].claimedBy.filter((id: string) => id !== userId);
  } else {
    newItems[itemIndex].claimedBy.push(userId);
  }
  
  await updateDoc(orderRef, { items: newItems });
}

export async function closeRoom(roomId: string) {
  const roomRef = doc(db, 'rooms', roomId);
  await updateDoc(roomRef, { status: 'closed' });
}

export function subscribeToRoom(roomId: string, callback: (room: Room) => void) {
  const roomRef = doc(db, 'rooms', roomId);
  return onSnapshot(roomRef, (doc) => {
    if (doc.exists()) {
      callback({ id: doc.id, ...doc.data() } as Room);
    }
  });
}

// Mark a debt as settled 
export async function markDebtSettled(roomId: string, debtId: string) {
  const roomRef = doc(db, 'rooms', roomId);
  await updateDoc(roomRef, {
    settledDebts: arrayUnion(debtId)
  });
}
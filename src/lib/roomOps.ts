import { db } from './firebase';
import { collection, doc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { Room } from '../types';

// 5-character alphanumeric code generator for room join codes
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omitted easily confused chars like O, I, 1, 0
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createRoom(hostId: string): Promise<Room> {
  const roomCollectionRef = collection(db, 'rooms');
  let roomCode = generateRoomCode();
  let isUnique = false;

  // Ensure the join code doesn't collide with an existing active room
  while (!isUnique) {
    const q = query(roomCollectionRef, where('joinCode', '==', roomCode), where('status', '==', 'active'));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      isUnique = true;
    } else {
      roomCode = generateRoomCode(); // Regenerate if collision occurs
    }
  }

  const newRoomRef = doc(roomCollectionRef); // Let Firestore auto-generate the doc ID
  
  const newRoom: Room = {
    id: newRoomRef.id,
    joinCode: roomCode,
    hostId: hostId,
    status: 'active',
    createdAt: Date.now()
  };

  await setDoc(newRoomRef, newRoom);
  return newRoom;
}
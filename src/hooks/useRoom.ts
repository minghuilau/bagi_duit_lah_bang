import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Room } from '../types';

export function useRoom(roomId: string | undefined) {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If there is no room ID (e.g., user hasn't joined one yet), do nothing
    if (!roomId) {
      setRoom(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const roomRef = doc(db, 'rooms', roomId);

    // onSnapshot sets up a live WebSocket connection to this specific document.
    // Every time the database changes, this function automatically runs again.
    const unsubscribe = onSnapshot(
      roomRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setRoom({ id: docSnap.id, ...docSnap.data() } as Room);
        } else {
          setError("Room has been closed or deleted.");
        }
        setLoading(false);
      },
      (err) => {
        console.error("Real-time room error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    // Cleanup function: disconnects the listener when the user leaves the page
    return () => unsubscribe();
  }, [roomId]);

  return { room, loading, error };
}
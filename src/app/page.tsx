'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { createRoom, joinRoom, createOrder, subscribeToOrders, subscribeToParticipants, toggleItemClaim, closeRoom, subscribeToRoom, markDebtSettled } from '../lib/roomOps';
import { Room, Order, Participant } from '../types';
import { getAuth, updateProfile } from 'firebase/auth'; 
import { toPng } from 'html-to-image';

export default function LandingPage() {
  const { user, loading, loginAnon, loginGoogle, logout } = useAuth();
  
  // Core States
  const [joinCode, setJoinCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [insideDashboard, setInsideDashboard] = useState(false);

  // Dashboard View States
  const [dashboardView, setDashboardView] = useState<'lobby' | 'menu' | 'scan' | 'manual' | 'claim' | 'summary'>('lobby');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  
  const [orders, setOrders] = useState<Order[]>([]); 
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Scanning & Manual States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [manualOrderName, setManualOrderName] = useState('New Order');
  const [manualItems, setManualItems] = useState([{ name: '', price: '' }]);
  const [manualTaxPercentage, setManualTaxPercentage] = useState('');
  const [manualPaidBy, setManualPaidBy] = useState(''); 
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Guest Login States
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // PDF Export States
  const summaryRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Real-time Sync
  useEffect(() => {
    if (insideDashboard && activeRoom) {
      const unsubOrders = subscribeToOrders(activeRoom.id, setOrders);
      const unsubParts = subscribeToParticipants(activeRoom.id, setParticipants);
      const unsubRoom = subscribeToRoom(activeRoom.id, (updatedRoom) => {
        setActiveRoom(updatedRoom);
      });
      
      return () => {
        unsubOrders();
        unsubParts();
        unsubRoom();
      };
    }
  }, [insideDashboard, activeRoom?.id]);

  // Math Engine
  const calculateBalances = () => {
    const balances: Record<string, { name: string, paid: number, consumed: number }> = {};
    
    participants.forEach(p => {
      balances[p.id] = { name: p.name, paid: 0, consumed: 0 };
    });

    orders.forEach(order => {
      if (balances[order.paidBy]) {
        balances[order.paidBy].paid += order.total;
      }

      const taxMultiplier = 1 + (order.taxPercentage / 100);
      
      order.items?.forEach(item => {
        if (item.claimedBy && item.claimedBy.length > 0) {
          const costWithTax = item.price * taxMultiplier;
          const costPerPerson = costWithTax / item.claimedBy.length;
          
          item.claimedBy.forEach(userId => {
            if (balances[userId]) {
              balances[userId].consumed += costPerPerson;
            }
          });
        }
      });
    });

    const finalBalances = Object.entries(balances).map(([userId, data]) => ({
      userId,
      name: data.name,
      paid: data.paid,
      consumed: data.consumed,
      net: data.paid - data.consumed
    })).sort((a, b) => b.net - a.net);

    const transactions = [];
    const debtors = finalBalances.filter(b => b.net < -0.01).map(b => ({ ...b, debt: Math.abs(b.net) }));
    const creditors = finalBalances.filter(b => b.net > 0.01).map(b => ({ ...b, credit: b.net }));

    let d = 0;
    let c = 0;

    while (d < debtors.length && c < creditors.length) {
      const debtor = debtors[d];
      const creditor = creditors[c];
      const amount = Math.min(debtor.debt, creditor.credit);
      
      transactions.push({
        fromId: debtor.userId,
        fromName: debtor.name,
        toId: creditor.userId,
        toName: creditor.name,
        amount: amount
      });

      debtor.debt -= amount;
      creditor.credit -= amount;

      if (debtor.debt < 0.01) d++;
      if (creditor.credit < 0.01) c++;
    }

    return { balances: finalBalances, transactions };
  };

  // Export Summary
  const downloadScreenshot = async () => {
    if (!summaryRef.current) return;
    setIsExporting(true);
    
    try {
      const dataUrl = await toPng(summaryRef.current, {
        quality: 1,
        backgroundColor: '#f9fafb' 
      });
      
      const link = document.createElement('a');
      link.download = `BagiDuit_Split_${activeRoom?.name || 'Summary'}.png`;
      link.href = dataUrl;
      link.click();
      
    } catch (err) {
      console.error("Failed to export screenshot:", err);
      alert("Something went wrong while generating the image.");
    } finally {
      setIsExporting(false);
    }
  };

  // Functions
  const handleGuestLogin = async () => {
    if (!guestName.trim()) {
      setError("Please enter a name first!");
      return;
    }
    setIsLoggingIn(true);
    setError('');
    try {
      await loginAnon(); 
      const auth = getAuth();
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: guestName.trim() });
      }
    } catch (err) {
      console.error(err);
      setError("Failed to login as guest.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!user) return;
    if (!roomName.trim()) {
      setError('Please give your room a name first.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const auth = getAuth();
      const freshUser = auth.currentUser || user; 
      const room = await createRoom(freshUser, roomName); 
      setActiveRoom(room);
      setDashboardView('lobby');
      setInsideDashboard(true);
    } catch (err) {
      setError('Failed to create room.');
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!user || !joinCode) return;
    setJoining(true);
    setError('');
    try {
      const auth = getAuth();
      const freshUser = auth.currentUser || user;
      const room = await joinRoom(freshUser, joinCode); 
      if (room) {
        setActiveRoom(room);
        setDashboardView(room.status === 'closed' ? 'summary' : 'lobby');
        setInsideDashboard(true);
      } else {
        setError('Active room not found. Check the code!');
      }
    } catch (err) {
      setError('Error joining room.');
      console.error(err);
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveRoom = () => {
    setActiveRoom(null);
    setInsideDashboard(false);
    setJoinCode('');
    setRoomName('');
    setError('');
    setDashboardView('lobby');
  };

  const handleCloseSession = async () => {
    if (!activeRoom) return;
    if (!confirm("Are you sure? This will lock the room and prevent anyone from adding more items.")) return;
    
    setIsClosing(true);
    try {
      await closeRoom(activeRoom.id);
    } catch (err) {
      console.error("Failed to close room:", err);
      alert("Failed to close the session.");
    } finally {
      setIsClosing(false);
    }
  };

  const addManualItemRow = () => setManualItems([...manualItems, { name: '', price: '' }]);
  const updateManualItem = (index: number, field: 'name' | 'price', value: string) => {
    const newItems = [...manualItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setManualItems(newItems);
  };
  const removeManualItem = (index: number) => {
    const newItems = [...manualItems];
    newItems.splice(index, 1);
    setManualItems(newItems);
  };

  const handleSaveOrder = async () => {
    if (!user || !activeRoom) return;
    
    const validItems = manualItems
      .filter(item => item.name.trim() !== '' && item.price.toString().trim() !== '')
      .map(item => ({
        name: item.name,
        price: parseFloat(item.price.toString()),
        claimedBy: [] 
      }));

    if (validItems.length === 0) {
      alert("Please add at least one valid item.");
      return;
    }

    setIsSavingOrder(true);

    try {
      const taxPercentage = parseFloat(manualTaxPercentage) || 0;
      const baseTotal = validItems.reduce((sum, item) => sum + item.price, 0);
      const finalTotal = baseTotal * (1 + (taxPercentage / 100));

      await createOrder({
        roomId: activeRoom.id,
        name: manualOrderName,
        uploadedBy: user.uid,
        paidBy: manualPaidBy || user.uid,
        taxPercentage: taxPercentage,
        total: parseFloat(finalTotal.toFixed(2)),
        items: validItems,
        createdAt: Date.now()
      });

      setDashboardView('menu');
      setManualOrderName('New Order');
      setManualItems([{ name: '', price: '' }]);
      setManualTaxPercentage('');
      setManualPaidBy(user.uid);
    } catch (err) {
      console.error("Failed to save order:", err);
      alert("Failed to save order. Check console.");
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = async () => {
      const base64String = (reader.result as string).split(',')[1];
      
      try {
        const response = await fetch('/api/scan-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image: base64String, mimeType: file.type })
        });

        let data: any = null;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          try {
            data = await response.json();
          } catch (jsonErr) {
            console.error("Failed to parse response JSON context:", jsonErr);
          }
        }
        
        if (response.ok && data) {
          let safeItems = [{ name: '', price: '' }]; 
          if (data && Array.isArray(data.items)) {
            safeItems = data.items;
          } else if (Array.isArray(data)) {
            safeItems = data; 
          }

          setManualItems(safeItems);
          setManualTaxPercentage(data.taxPercentage?.toString() || '0'); 
          setManualPaidBy(user?.uid || '');
          setDashboardView('manual');
        } else {
          console.error("Scanning failed:", data?.error || 'Server returned invalid data or error response');
          alert("Failed to read receipt clearly. Try again!");
        }
      } catch (err) {
        console.error("API network configuration error:", err);
        alert("Could not link safely with receipt scanning processing systems.");
      } finally {
        setIsScanning(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 animate-pulse">Loading...</p>
      </div>
    );
  }

  // State 1: Login
  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-gray-900">Bagi Duit Lah Bang</h1>
        <p className="text-gray-500 mb-8 text-center max-w-sm">The frictionless way to split bills without the math.</p>
        
        <div className="flex flex-col gap-4 w-full max-w-xs">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium text-center">{error}</div>}
          
          {!showGuestInput ? (
            <>
              <button onClick={loginGoogle} className="flex items-center justify-center gap-3 bg-white text-gray-800 px-6 py-4 rounded-xl font-semibold border border-gray-200 hover:bg-gray-50 shadow-sm">
                Continue with Google
              </button>
              <button onClick={() => setShowGuestInput(true)} className="bg-black text-white px-6 py-4 rounded-xl font-semibold hover:bg-gray-800 shadow-lg transition-all">
                Continue as Guest
              </button>
            </>
          ) : (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 text-center">What should we call you?</label>
                <input 
                  type="text" 
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. Ahmad"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-black outline-none font-medium text-center"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleGuestLogin()}
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button 
                  onClick={() => { setShowGuestInput(false); setError(''); }} 
                  className="flex-1 bg-gray-100 text-gray-600 px-4 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                >
                  Back
                </button>
                <button 
                  onClick={handleGuestLogin} 
                  disabled={isLoggingIn}
                  className="flex-1 bg-black text-white px-4 py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors disabled:bg-gray-400"
                >
                  {isLoggingIn ? '...' : 'Join'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // State 4: Room Dashboard (Summary View)
  if (insideDashboard && activeRoom && dashboardView === 'summary') {
    const { balances: finalBalances, transactions } = calculateBalances();
    const myBalance = finalBalances.find(b => b.userId === user.uid);

    return (
      <main className="min-h-screen bg-gray-50 p-6 pb-24">
        <div className="max-w-md mx-auto">
          
          <div className="flex justify-between items-center mb-4">
            <button 
              onClick={() => activeRoom.status === 'closed' ? handleLeaveRoom() : setDashboardView('menu')} 
              className="text-sm font-medium text-gray-500 hover:text-gray-800 flex items-center"
            >
              ← {activeRoom.status === 'closed' ? 'Exit Session' : 'Back to Menu'}
            </button>

            {/* Export Summary Button */}
            <button 
              onClick={downloadScreenshot}
              disabled={isExporting}
              className="text-sm font-bold bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {isExporting ? 'Generating...' : '↓ Save Summary'}
            </button>
          </div>

          {/* NEW: We wrap the content we want to screenshot in this ref */}
          <div ref={summaryRef} className="bg-gray-50 p-2 -m-2 rounded-2xl">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 mb-6 text-center">
              {activeRoom.status === 'closed' ? (
                <span className="text-xs bg-gray-100 text-gray-500 font-bold px-3 py-1.5 rounded-full tracking-wider uppercase">
                  Session Closed
                </span>
              ) : (
                <span className="text-xs bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-full tracking-wider uppercase flex items-center justify-center gap-1.5 w-max mx-auto">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                  Live Split
                </span>
              )}
              <h1 className="text-3xl font-black text-gray-900 mt-4 mb-2">{activeRoom.name || 'Final Split'}</h1>
              <p className="text-gray-500 text-sm">All taxes and items have been calculated.</p>
              
              <div className="mt-8 pt-8 border-t border-gray-100">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Your Summary</p>
                {myBalance && myBalance.net < -0.01 ? (
                  <div>
                    <p className="text-4xl font-black text-red-500 mb-1">RM {Math.abs(myBalance.net).toFixed(2)}</p>
                    <p className="text-sm text-gray-500 font-medium">Total amount you owe</p>
                  </div>
                ) : myBalance && myBalance.net > 0.01 ? (
                  <div>
                    <p className="text-4xl font-black text-green-500 mb-1">RM {myBalance.net.toFixed(2)}</p>
                    <p className="text-sm text-gray-500 font-medium">Total amount you receive</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-4xl font-black text-gray-800 mb-1">RM 0.00</p>
                    <p className="text-sm text-gray-500 font-medium">You are perfectly settled up</p>
                  </div>
                )}
                
                {myBalance && (
                  <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl mt-6 text-sm">
                    <div className="text-left">
                      <p className="text-gray-500">You consumed</p>
                      <p className="font-bold text-gray-900">RM {myBalance.consumed.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500">You paid upfront</p>
                      <p className="font-bold text-gray-900">RM {myBalance.paid.toFixed(2)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Host Lock Button - hidden during PDF export to keep it clean */}
              {!isExporting && activeRoom.status === 'active' && activeRoom.hostId === user.uid && (
                <div className="mt-8 pt-6 border-t border-gray-100">
                  <button 
                    onClick={handleCloseSession}
                    disabled={isClosing}
                    className="w-full bg-red-600 text-white px-6 py-4 rounded-xl font-bold hover:bg-red-700 transition-colors shadow-sm disabled:bg-red-400"
                  >
                    {isClosing ? 'Locking Room...' : 'Lock Room & Finalize'}
                  </button>
                  <p className="text-center text-xs text-gray-400 mt-2">This prevents anyone from adding more items.</p>
                </div>
              )}
            </div>

            {/* Settle Up Instructions */}
            {transactions.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 px-1">How to Settle Up</h2>
                <div className="space-y-3">
                  {transactions.map((tx, idx) => {
                    const txId = `${tx.fromId}_${tx.toId}_${idx}`;
                    const isSettled = activeRoom.settledDebts?.includes(txId);
                    const amIInvolved = tx.fromId === user.uid || tx.toId === user.uid;
                    
                    return (
                      <div key={idx} className={`bg-white p-5 rounded-2xl shadow-sm border ${amIInvolved && !isSettled ? 'border-blue-300 ring-2 ring-blue-50' : 'border-gray-100'} flex justify-between items-center transition-all ${isSettled ? 'opacity-50 grayscale' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <p className={`font-medium ${isSettled ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                              <span className={tx.fromId === user.uid && !isSettled ? "font-bold text-blue-600" : "font-bold"}>{tx.fromName}</span> pays <span className={tx.toId === user.uid && !isSettled ? "font-bold text-blue-600" : "font-bold"}>{tx.toName}</span>
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-4">
                          <span className={`font-black text-lg ${isSettled ? 'text-gray-400' : 'text-gray-900'}`}>RM {tx.amount.toFixed(2)}</span>
                          
                          {!isExporting && !isSettled && (amIInvolved || activeRoom.hostId === user.uid) && (
                            <button 
                              onClick={() => markDebtSettled(activeRoom.id, txId)}
                              className="bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                            >
                              Mark Paid
                            </button>
                          )}
                          {isSettled && (
                            <span className="text-green-600 font-bold text-sm flex items-center gap-1">
                              ✓ Paid
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 px-1">Group Ledger</h2>
            <div className="space-y-3">
              {finalBalances.map((balance) => {
                const isMe = balance.userId === user.uid;
                return (
                  <div key={balance.userId} className={`bg-white p-5 rounded-2xl shadow-sm border ${isMe ? 'border-gray-300 ring-2 ring-gray-100' : 'border-gray-100'} flex justify-between items-center`}>
                    <div>
                      <h3 className="font-bold text-gray-900">{balance.name} {isMe && <span className="text-gray-400 font-normal">(You)</span>}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Consumed RM {balance.consumed.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      {balance.net > 0.01 ? (
                        <span className="text-green-600 font-bold bg-green-50 px-3 py-1 rounded-lg text-sm">Receives RM {balance.net.toFixed(2)}</span>
                      ) : balance.net < -0.01 ? (
                        <span className="text-red-500 font-bold bg-red-50 px-3 py-1 rounded-lg text-sm">Owes RM {Math.abs(balance.net).toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-lg text-sm">Settled</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Lobby View
  if (insideDashboard && activeRoom && dashboardView === 'lobby') {
    return (
      <main className="min-h-screen bg-gray-50 p-6 flex flex-col pb-24">
        <div className="max-w-md mx-auto w-full">
          
          <button onClick={handleLeaveRoom} className="mb-4 text-sm font-medium text-gray-500 hover:text-gray-800 flex items-center">
            ← Leave Room
          </button>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{activeRoom.name}</h1>
                <p className="text-sm text-gray-500 mt-1">Share this code with friends</p>
              </div>
              <span className="text-xs bg-green-50 text-green-700 font-semibold px-3 py-1.5 rounded-full border border-green-200 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                {participants.length} joined
              </span>
            </div>

            <div className="mb-6 bg-gray-50 p-6 rounded-2xl border border-dashed border-gray-300 text-center">
              <span className="text-5xl font-mono font-black tracking-widest text-gray-900 select-all">{activeRoom.joinCode}</span>
            </div>
            
            <div className="flex gap-2">
              <button onClick={() => navigator.clipboard.writeText(activeRoom.joinCode)} className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 transition text-xs font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2">
                ⎘ Copy code
              </button>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 px-1">People in this room</h2>
            <div className="space-y-2">
              {participants.map((p) => {
                const isMe = p.id === user.uid;
                return (
                  <div 
                    key={p.id} 
                    className={`flex items-center justify-between p-3 rounded-xl border ${isMe ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100 shadow-sm'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm ${p.color}`}>
                        {p.initials}
                      </div>
                      <div>
                        <h3 className={`text-sm font-bold ${isMe ? 'text-gray-900' : 'text-gray-800'}`}>
                          {p.name} {isMe && <span className="font-normal text-gray-500">(you)</span>}
                        </h3>
                        <p className={`text-xs text-gray-500`}>
                          {p.isHost ? 'Host' : 'via'} · {p.method}
                        </p>
                      </div>
                    </div>
                    <div className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full ${p.isHost ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.isHost ? 'host' : 'joined'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <button 
              onClick={() => setDashboardView('menu')}
              className="w-full bg-black text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 shadow-md transition-all"
            >
              Start ordering →
            </button>
            <p className="text-center text-sm font-medium text-gray-400">
              Waiting for more friends...
            </p>
          </div>
        </div>
      </main>
    );
  }

  // State 4: Room Dashboard (Menu, Scanner, Manual, Claim)
  if (insideDashboard && activeRoom && dashboardView !== 'lobby') {
    return (
      <main className="min-h-screen bg-gray-50 p-6 pb-24 relative">
        <div className="max-w-md mx-auto pb-16">
          {dashboardView === 'menu' && (
            <button onClick={() => setDashboardView('lobby')} className="mb-4 text-sm font-medium text-gray-500 hover:text-gray-800 flex items-center">
              ← Back to Lobby
            </button>
          )}

          {/* Minimal Header */}
          {dashboardView === 'menu' && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{activeRoom.name}</h1>
                  <p className="text-sm text-gray-500 mt-1">Code: <span className="font-mono font-bold text-gray-800">{activeRoom.joinCode}</span></p>
                </div>
                <span className="text-xs bg-green-100 text-green-800 font-semibold px-3 py-1 rounded-full">
                  {activeRoom.hostId === user.uid ? 'Host' : 'Member'}
                </span>
              </div>
            </div>
          )}

          {/* View Controller */}
          {dashboardView === 'menu' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-bold text-gray-800">Order Menu</h2>
              </div>
              
              {orders.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center bg-gray-50">
                  <p className="text-gray-500 font-medium mb-1">No orders yet</p>
                  <p className="text-sm text-gray-400">Add your first receipt to start claiming.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => {
                    const payer = participants.find(p => p.id === order.paidBy)?.name || 'Someone';
                    return (
                      <div 
                        key={order.id} 
                        onClick={() => {
                          setSelectedOrderId(order.id!);
                          setDashboardView('claim');
                        }}
                        className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
                      >
                        <div>
                          <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{order.name}</h3>
                          <p className="text-xs text-gray-500 mt-1">Paid by {payer} • {order.items?.length || 0} items</p>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <div>
                            <p className="font-bold text-gray-900">RM {order.total.toFixed(2)}</p>
                            <p className="text-xs text-gray-400 mt-1">Tax: {order.taxPercentage}%</p>
                          </div>
                          <span className="text-gray-300 group-hover:text-blue-500 text-lg">›</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mt-6">
                <button onClick={() => { setDashboardView('scan'); setManualPaidBy(user.uid); }} className="bg-white border border-gray-200 text-gray-800 px-4 py-4 rounded-xl font-semibold hover:bg-gray-50 flex flex-col items-center gap-2 shadow-sm">
                  <span className="text-xl">📷</span> Scan Receipt
                </button>
                <button onClick={() => { setDashboardView('manual'); setManualPaidBy(user.uid); }} className="bg-white border border-gray-200 text-gray-800 px-4 py-4 rounded-xl font-semibold hover:bg-gray-50 flex flex-col items-center gap-2 shadow-sm">
                  <span className="text-xl">✍️</span> Manual Entry
                </button>
              </div>
            </div>
          )}

          {/* Claiming View */}
          {dashboardView === 'claim' && selectedOrderId && (
            <div className="space-y-4">
              {orders.filter(o => o.id === selectedOrderId).map(activeOrder => (
                <div key={activeOrder.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <div>
                      <button onClick={() => setDashboardView('menu')} className="text-gray-400 hover:text-gray-800 flex items-center mb-2 text-sm font-semibold">
                        ← Back to Menu
                      </button>
                      <h2 className="text-xl font-bold text-gray-900">{activeOrder.name}</h2>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Tap an item to claim it</p>
                    {activeOrder.items?.map((item, idx) => {
                      const isClaimedByMe = item.claimedBy?.includes(user.uid);
                      
                      // Grab user profile contexts for everyone who claimed this item
                      const claimers = (item.claimedBy || [])
                        .map(uid => participants.find(p => p.id === uid))
                        .filter(Boolean) as Participant[];

                      return (
                        <div 
                          key={idx} 
                          onClick={() => toggleItemClaim(activeOrder.id!, activeOrder.items, idx, user.uid)}
                          className={`flex justify-between items-center p-4 rounded-xl border cursor-pointer transition-all ${isClaimedByMe ? 'bg-green-50 border-green-300 shadow-sm' : 'bg-gray-50 border-gray-200 hover:border-gray-300'}`}
                        >
                          <div>
                            <p className={`font-semibold ${isClaimedByMe ? 'text-green-900' : 'text-gray-800'}`}>{item.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">RM {item.price.toFixed(2)}</span>
                              
                              {/* Overlapping colored avatar bubbles for each claimer with tactile pop animation */}
                              {claimers.length > 0 && (
                                <div className="flex items-center -space-x-1.5 ml-1">
                                  {claimers.map((claimer, cIdx) => (
                                    <div 
                                      key={cIdx} 
                                      className={`w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-[9px] shadow-sm ring-2 ${isClaimedByMe ? 'ring-green-50' : 'ring-white'} ${claimer.color} animate-in zoom-in fade-in slide-in-from-right-2 duration-300 ease-out`}
                                      title={claimer.name}
                                    >
                                      {claimer.initials}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isClaimedByMe ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 bg-white'}`}>
                            {isClaimedByMe && "✓"}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="border-t border-gray-100 mt-6 pt-5 flex justify-between items-center text-sm">
                    <span className="font-semibold text-gray-500">Total (incl. {activeOrder.taxPercentage}% tax)</span>
                    <span className="font-bold text-gray-900 text-lg">RM {activeOrder.total.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Manual Entry View */}
          {dashboardView === 'manual' && (
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h2 className="text-lg font-bold text-gray-900">Add Order</h2>
                <button onClick={() => setDashboardView('menu')} className="text-gray-400 hover:text-gray-800">✕</button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Order Name</label>
                  <input 
                    type="text" 
                    value={manualOrderName}
                    onChange={(e) => setManualOrderName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                    placeholder="e.g., ZUS Coffee Run"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Items</label>
                  <div className="space-y-3">
                    {manualItems.map((item, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder={idx === 0 ? "e.g., Spanish Latte" : "Item name"}
                          value={item.name}
                          onChange={(e) => updateManualItem(idx, 'name', e.target.value)}
                          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        />
                        <div className="relative w-32 flex-shrink-0">
                          <span className="absolute left-3 top-2.5 text-gray-400 text-sm">RM</span>
                          <input 
                            type="number" 
                            placeholder="0.00"
                            value={item.price}
                            onChange={(e) => updateManualItem(idx, 'price', e.target.value)}
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          />
                        </div>
                        <button onClick={() => removeManualItem(idx)} className="px-3 text-red-400 hover:text-red-600 font-bold">×</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={addManualItemRow} className="mt-3 text-sm font-semibold text-blue-600 hover:text-blue-800">+ Add another item</button>
                </div>

                <div className="border-t pt-5 mt-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Paid By</label>
                  <select 
                    value={manualPaidBy || user?.uid || ''}
                    onChange={(e) => setManualPaidBy(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                  >
                    {participants.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.id === user?.uid ? '(You)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="border-t pt-5 mt-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Total Tax & Fees (%)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="e.g. 6 (SST) or 16 (SST + Service)"
                      value={manualTaxPercentage}
                      onChange={(e) => setManualTaxPercentage(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                    />
                    <span className="absolute right-4 top-3 text-gray-400 font-bold">%</span>
                  </div>
                </div>

                <button 
                  onClick={handleSaveOrder}
                  disabled={isSavingOrder}
                  className="w-full bg-black text-white px-6 py-4 rounded-xl font-semibold hover:bg-gray-800 transition-all mt-4 disabled:bg-gray-400"
                >
                  {isSavingOrder ? 'Saving...' : 'Save Order'}
                </button>
              </div>
            </div>
          )}

          {/* Scanner View */}
          {dashboardView === 'scan' && (
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h2 className="text-lg font-bold text-gray-900">Scan Receipt</h2>
                <button onClick={() => setDashboardView('menu')} className="text-gray-400 hover:text-gray-800">✕</button>
              </div>
              
              <div className="py-8">
                {isScanning ? (
                  <div className="animate-pulse flex flex-col items-center">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-blue-600 font-medium">Gemini is reading receipt...</p>
                  </div>
                ) : (
                  <>
                    <p className="text-gray-500 mb-6">Let Gemini AI extract the items and taxes automatically.</p>
                    <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-blue-600 text-white px-8 py-4 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-sm"
                    >
                      Open Camera / Gallery
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Universal Settle Up Button */}
        {dashboardView === 'menu' && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
            <div className="max-w-md mx-auto">
              <button 
                onClick={() => setDashboardView('summary')}
                className="w-full bg-black text-white px-6 py-4 rounded-xl font-bold hover:bg-gray-800 transition-colors shadow-sm flex justify-center items-center gap-2 text-lg"
              >
                Settle up →
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  // State 2: Standard Create/Join Menu
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 relative">
      <div className="absolute top-6 right-6">
        <button onClick={logout} className="text-sm font-medium text-red-500 hover:text-red-700">Sign Out</button>
      </div>

      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium text-center">{error}</div>}

        <div className="mb-6 text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
        <h1 className="text-2xl font-bold text-gray-900">
          Hi, {user.displayName || guestName || 'Guest'} !
        </h1>
        </div>

        <div className="mb-8 text-center">
          <h2 className="text-xl font-bold mb-4">Start a new session</h2>
          <div className="mb-4">
            <input 
              type="text" 
              placeholder="e.g., Saturday Dinner, Tealive Run" 
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none text-center font-medium"
            />
          </div>
          <button onClick={handleCreateRoom} disabled={creating} className="w-full bg-blue-600 text-white px-6 py-4 rounded-xl font-semibold hover:bg-blue-700 disabled:bg-blue-400">
            {creating ? 'Generating...' : 'Create Room'}
          </button>
        </div>

        <div className="relative flex items-center py-4">
          <div className="flex-grow border-t border-gray-200"></div>
          <span className="flex-shrink-0 mx-4 text-gray-400 text-sm">or</span>
          <div className="flex-grow border-t border-gray-200"></div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2 text-center">Join Existing Room</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="CODE" 
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none uppercase font-mono tracking-widest text-center"
              maxLength={5}
            />
            <button onClick={handleJoinRoom} disabled={joining || !joinCode} className="bg-black text-white px-6 py-3 rounded-xl font-semibold hover:bg-gray-800 disabled:bg-gray-400">
              Join
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
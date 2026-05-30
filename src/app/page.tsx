'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { createRoom, joinRoom, createOrder, subscribeToOrders, subscribeToParticipants, toggleItemClaim } from '../lib/roomOps';
import { Room, Order, Participant } from '../types';
import { getAuth, updateProfile } from 'firebase/auth'; 

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
  const [dashboardView, setDashboardView] = useState<'lobby' | 'menu' | 'scan' | 'manual' | 'claim'>('lobby');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  
  const [orders, setOrders] = useState<Order[]>([]); 
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Scanning & Manual States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [manualOrderName, setManualOrderName] = useState('New Order');
  const [manualItems, setManualItems] = useState([{ name: '', price: '' }]);
  const [manualTaxPercentage, setManualTaxPercentage] = useState('');
  const [manualPaidBy, setManualPaidBy] = useState(''); // NEW: Tracks the payer
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // Guest Login States
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Real-time Sync
  useEffect(() => {
    if (insideDashboard && activeRoom) {
      const unsubOrders = subscribeToOrders(activeRoom.id, setOrders);
      const unsubParts = subscribeToParticipants(activeRoom.id, setParticipants);
      return () => {
        unsubOrders();
        unsubParts();
      };
    }
  }, [insideDashboard, activeRoom]);

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
        setDashboardView('lobby');
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
        paidBy: manualPaidBy || user.uid, // NEW: Saves the selected payer
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

        const data = await response.json();
        
        if (response.ok) {
          let safeItems = [{ name: '', price: '' }]; 
          if (data && Array.isArray(data.items)) {
            safeItems = data.items;
          } else if (Array.isArray(data)) {
            safeItems = data; 
          }

          setManualItems(safeItems);
          setManualTaxPercentage(data.taxPercentage?.toString() || '0'); 
          setManualPaidBy(user?.uid || ''); // Default to current user
          setDashboardView('manual');
        } else {
          console.error("Scanning failed:", data?.error || 'Unknown error');
          alert("Failed to read receipt clearly. Try again!");
        }
      } catch (err) {
        console.error("API error:", err);
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
      <main className="min-h-screen bg-gray-50 p-6 pb-24">
        <div className="max-w-md mx-auto">
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
                      const claimCount = item.claimedBy?.length || 0;

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
                              {claimCount > 0 && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isClaimedByMe ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                                  {claimCount} claim{claimCount !== 1 ? 's' : ''}
                                </span>
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
                        <div className="relative w-24">
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

                {/* NEW: Paid By Selector */}
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
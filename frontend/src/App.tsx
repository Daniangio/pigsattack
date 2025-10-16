import React, { useState, useEffect, useRef } from 'react';
import { create } from 'zustand';

// --- 1. STATE MANAGEMENT (Zustand) ---
interface Player {
  name: string;
  is_eliminated: boolean;
  hand: { id: number; repr: string }[];
}

interface GameState {
  players: Player[];
  current_player: string;
  is_over: boolean;
}

interface Lobby { id: string; name: string; players: string[] }
interface Room { id: string; name: string; players: string[]; host: string; in_game: boolean }
import RoomScreen from './components/RoomScreen';

interface StoreState {
  lobbies: Lobby[];
  currentRoom: Room | null;
  currentView: 'lobby' | 'room' | 'game';
  gameState: GameState | null; // New: To hold the live game state
  setLobbies: (lobbies: Lobby[]) => void;
  setRoom: (room: Room | null) => void;
  setView: (view: 'lobby' | 'room' | 'game') => void;
  setGameState: (gameState: GameState | null) => void;
  goBackToLobby: () => void;
}

const useGameStore = create<StoreState>((set) => ({
  lobbies: [],
  currentRoom: null,
  currentView: 'lobby',
  gameState: null,
  setLobbies: (lobbies) => set({ lobbies }),
  setRoom: (room) => set({ currentRoom: room }),
  setView: (view) => set({ currentView: view }),
  setGameState: (gameState) => set({ gameState }),
  goBackToLobby: () => set({ currentRoom: null, currentView: 'lobby', gameState: null }),
}));


// --- 2. UI COMPONENTS ---

// --- LobbyScreen Component ---
interface LobbyScreenProps { sendMessage: (message: object) => void }
const LobbyScreen: React.FC<LobbyScreenProps> = ({ sendMessage }) => {
  const { lobbies } = useGameStore();
  const [roomName, setRoomName] = useState('');
  return (
    <div className="max-w-2xl mx-auto text-center">
      <h2 className="font-display text-4xl mb-6 text-bone-white">Join a Game</h2>
      <div className="bg-dirt/50 border border-moss p-4 rounded-lg text-left">
        {lobbies.length === 0 ? <p className="text-ash-gray">No active lobbies.</p> : lobbies.map((lobby) => (
          <div key={lobby.id} className="flex justify-between items-center p-3 border-b border-moss last:border-b-0">
            <div><span className="font-bold font-display text-lg">{lobby.name}</span><span className="text-sm text-ash-gray ml-3">({lobby.players.length} players)</span></div>
            <button onClick={() => sendMessage({ command: 'join_room', room_id: lobby.id })} className="bg-moss hover:bg-moss/80 px-4 py-2 rounded font-display transition-colors">Join</button>
          </div>
        ))}
      </div>
      <div className="mt-6 flex">
        <input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="New Room Name" className="flex-grow bg-night-sky/50 border border-moss p-2 rounded-l-md focus:outline-none focus:ring-2 focus:ring-moss placeholder:text-ash-gray/50 text-bone-white"/>
        <button onClick={() => { if (roomName.trim()) { sendMessage({ command: 'create_room', name: roomName }); setRoomName(''); } }} className="bg-moss hover:bg-moss/80 p-2 rounded-r-md font-display transition-colors">Create Room</button>
      </div>
    </div>
  );
};

// --- GameScreen Component (NOW WITH SURRENDER BUTTON) ---
interface GameScreenProps { sendMessage: (message: object) => void; goBackToLobby: () => void }
const GameScreen: React.FC<GameScreenProps> = ({ sendMessage, goBackToLobby }) => {
    const { currentRoom, gameState } = useGameStore();
    if (!gameState) return <div className="text-center text-xl">Loading Game State...</div>;

    const handleSurrender = () => {
        if(currentRoom) {
            sendMessage({ command: 'surrender', room_id: currentRoom.id });
            goBackToLobby(); // Optimistic update
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-4xl font-display text-blood-red animate-pulse">Game In Progress</h2>
                <button onClick={handleSurrender} className="bg-blood-red hover:bg-red-800 px-4 py-2 rounded font-display transition-colors">Surrender & Leave</button>
            </div>
            {gameState.is_over && <div className="text-center text-2xl p-4 bg-moss rounded-lg mb-4 font-display">GAME OVER!</div>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {gameState.players.map(player => (
                    <div key={player.name} className={`p-4 rounded-lg border-2 transition-all ${gameState.current_player === player.name ? 'bg-moss/80 border-bone-white shadow-lg shadow-moss/30' : 'bg-dirt/50 border-moss'}`}>
                        <h3 className={`font-bold text-lg ${player.is_eliminated ? 'line-through text-ash-gray/50' : 'text-bone-white'}`}>{player.name}</h3>
                        {!player.is_eliminated && (
                            <div className="mt-2 text-sm">Hand: {player.hand.map(c => c.repr).join(', ')}</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- 3. MAIN APP COMPONENT ---
export default function App() {
  const [clientId] = useState(() => sessionStorage.getItem('clientId') || `user_${Math.random().toString(36).substr(2, 9)}`);
  const [isConnected, setIsConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);

  const { currentView, setLobbies, setRoom, setView, setGameState, goBackToLobby, currentRoom } = useGameStore();
  
  useEffect(() => { sessionStorage.setItem('clientId', clientId) }, [clientId]);

  useEffect(() => {
    const url = `ws://localhost:8000/ws/${clientId}`;
    socket.current = new WebSocket(url);
    socket.current.onopen = () => setIsConnected(true);
    socket.current.onclose = () => setIsConnected(false);
    socket.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('Received:', message);
      switch (message.type) {
        case 'lobby_list': setLobbies(message.lobbies); break;
        case 'room_update': setRoom(message.room); if (!message.room.in_game) setView('room'); break;
        case 'game_start': setView('game'); break;
        case 'game_state': setGameState(message); break;
        case 'dismantle_room': alert("The room was dismantled."); goBackToLobby(); break;
      }
    };
    return () => socket.current?.close();
  }, [clientId, setLobbies, setRoom, setView, setGameState, goBackToLobby]);

  const sendMessage = (message: object) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message));
  };
  
  const renderView = () => {
    switch (currentView) {
      case 'room': return <RoomScreen sendMessage={sendMessage} clientId={clientId} room={currentRoom} />;
      case 'game': return <GameScreen sendMessage={sendMessage} goBackToLobby={goBackToLobby}/>;
      default: return <LobbyScreen sendMessage={sendMessage} />;
    }
  };

  return (
    <div className="min-h-screen p-4">
      <header className="flex justify-between items-center mb-8 border-b-2 border-moss/50 pb-4">
        <h1 className="text-3xl font-display text-bone-white">Pigs Attack Online</h1>
        <div className="text-ash-gray">Client ID: <span className="font-mono text-sm bg-dirt/50 p-1 rounded">{clientId}</span></div>
        <div className="text-ash-gray">Status: <span className={`font-bold ${isConnected ? 'text-green-400' : 'text-blood-red'}`}>{isConnected ? 'Connected' : 'Disconnected'}</span></div>
      </header>
      <main>{renderView()}</main>
    </div>
  );
}

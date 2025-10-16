import { create } from 'zustand';

// --- Types ---
interface Lobby {
  id: string;
  name: string;
  players: string[];
}

interface Room {
  id: string;
  name: string;
  players: string[];
  host: string;
  in_game: boolean;
}

interface GameState {
  lobbies: Lobby[];
  currentRoom: Room | null;
  currentView: 'lobby' | 'room' | 'game';
  setLobbies: (lobbies: Lobby[]) => void;
  setRoom: (room: Room | null) => void;
  setView: (view: 'lobby' | 'room' | 'game') => void;
  goBackToLobby: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  lobbies: [],
  currentRoom: null,
  currentView: 'lobby',
  setLobbies: (lobbies) => set({ lobbies }),
  setRoom: (room) => set({ currentRoom: room }),
  setView: (view) => set({ currentView: view }),
  goBackToLobby: () => set({ currentRoom: null, currentView: 'lobby' }),
}));
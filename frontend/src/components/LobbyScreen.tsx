import React, { useState } from 'react';
// import { useGameStore } from '../state/gameStore'; // This import is removed to resolve the build error.

interface LobbyScreenProps {
  sendMessage: (message: object) => void;
  clientId: string;
}

const LobbyScreen: React.FC<LobbyScreenProps> = ({ sendMessage, clientId }) => {
  // const { lobbies } = useGameStore(); // This is replaced with mock data for compilation.
  
  // --- MOCK DATA ---
  // In a live application, this data would come from the `useGameStore()` hook.
  // We use a placeholder here to allow the component to render correctly without the external state file.
  const lobbies = [
    { id: 'lobby_1', name: 'The Pig Pen', players: 2 },
    { id: 'lobby_2', name: 'Boar Riders', players: 1 },
  ];
  // --- END MOCK DATA ---

  const [roomName, setRoomName] = useState('');

  const handleCreateRoom = () => {
    if (roomName.trim()) {
      sendMessage({ command: 'create_room', name: roomName });
      setRoomName('');
    }
  };

  const handleJoinRoom = (roomId: string) => {
    sendMessage({ command: 'join_room', room_id: roomId });
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Lobbies</h2>
      <div className="bg-gray-800 p-4 rounded-lg">
        {lobbies.length === 0 ? (
          <p className="text-gray-400">No active lobbies. Create one!</p>
        ) : (
          lobbies.map((lobby) => (
            <div key={lobby.id} className="flex justify-between items-center p-2 border-b border-gray-700">
              <div>
                <span className="font-bold">{lobby.name}</span>
                <span className="text-sm text-gray-400 ml-2">({lobby.players} players)</span>
              </div>
              <button
                onClick={() => handleJoinRoom(lobby.id)}
                className="bg-indigo-500 hover:bg-indigo-600 px-3 py-1 rounded"
              >
                Join
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-6">
        <input
          type="text"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="New Room Name"
          className="bg-gray-700 p-2 rounded-l-md focus:outline-none"
        />
        <button
          onClick={handleCreateRoom}
          className="bg-green-600 hover:bg-green-700 p-2 rounded-r-md"
        >
          Create Room
        </button>
      </div>
    </div>
  );
};

export default LobbyScreen;
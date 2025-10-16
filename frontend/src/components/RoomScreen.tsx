import React from 'react';

// This component now relies on the main App component for state via props
// to avoid circular dependencies and simplify the structure.

interface RoomScreenProps {
  sendMessage: (message: object) => void;
  clientId: string;
  // We pass the entire room object down from the App component
  room: {
    id: string;
    name: string;
    players: string[];
    host: string;
    in_game: boolean;
  } | null;
}

const RoomScreen: React.FC<RoomScreenProps> = ({ sendMessage, clientId, room }) => {
  if (!room) {
    return <div className="text-red-500">Error: Not currently in a room.</div>;
  }

  const isHost = room.host === clientId;
  const canAddBot = room.players.length < 5; // Assuming max 5 players
  const canRemoveBot = room.players.some(p => p.startsWith('Bot_'));

  const handleStartGame = () => {
    sendMessage({ command: 'start_game', room_id: room.id });
  };

  const handleLeaveRoom = () => {
    sendMessage({ command: 'leave_room', room_id: room.id });
  };

  const handleAddBot = () => {
    sendMessage({ command: 'add_bot', room_id: room.id });
  };

  const handleRemoveBot = () => {
    sendMessage({ command: 'remove_bot', room_id: room.id });
  };

  return (
    <div className="bg-dirt/50 border border-moss p-6 rounded-lg max-w-md mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div>
            <h2 className="text-2xl font-display">{room.name}</h2>
            <p className="text-ash-gray text-sm">Room ID: <span className="font-mono">{room.id}</span></p>
        </div>
        <button
          onClick={handleLeaveRoom}
          className="bg-blood-red hover:bg-red-800 px-4 py-2 rounded font-display transition-colors"
        >
          Leave
        </button>
      </div>

      <h3 className="font-semibold mb-2">Players ({room.players.length}/5):</h3>
      <ul className="list-disc list-inside mb-6 bg-night-sky/50 p-3 rounded border border-moss/50">
        {room.players.map((player, index) => (
          <li key={index} className="font-mono my-1">
            {player}
            {player === room.host && <span className="text-yellow-400 text-xs ml-2 font-sans">(Host)</span>}
            {player.startsWith('Bot_') && <span className="text-cyan-400 text-xs ml-2">(Bot)</span>}
          </li>
        ))}
      </ul>

      {isHost && (
        <div className="space-y-4">
          <div className="flex space-x-4">
            <button
              onClick={handleAddBot}
              disabled={!canAddBot}
              className="flex-1 bg-moss hover:bg-moss/80 p-3 rounded font-display disabled:bg-ash-gray/20 disabled:cursor-not-allowed transition-colors"
            >
              Add Bot
            </button>
            <button
              onClick={handleRemoveBot}
              disabled={!canRemoveBot}
              className="flex-1 bg-dirt hover:bg-dirt/80 p-3 rounded font-display disabled:bg-ash-gray/20 disabled:cursor-not-allowed transition-colors"
            >
              Remove Bot
            </button>
          </div>
          <button
            onClick={handleStartGame}
            className="w-full bg-moss hover:bg-moss/80 p-3 rounded font-display disabled:bg-ash-gray/20 disabled:cursor-not-allowed transition-colors"
          >
            Start Game
          </button>
        </div>
      )}

      {!isHost && <p className="text-center text-ash-gray">Waiting for host to start the game...</p>}
    </div>
  );
};

export default RoomScreen;
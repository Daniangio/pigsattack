import { elements, showScreen, updateLobbyList, updateLobbyView, updateGameView, updatePromptView } from './ui.js';
import { initEventHandlers } from './handlers.js';

document.addEventListener('DOMContentLoaded', () => {
    const socket = io('http://localhost:8080');

    // This object will hold the client's state.
    const clientState = {
        myPlayerId: -1,
        isHost: false,
        currentPrompt: {},
        selectedCards: [],
        currentState: 'connecting',
    };

    // Initialize all button click handlers and pass them the socket and state
    initEventHandlers(socket, clientState);

    // --- Socket.IO Event Handlers ---
    socket.on('connect', () => {
        console.log('Connected to server!');
        // The server automatically sends the lobby list on connection
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server.');
        showScreen('connecting'); // Or a dedicated 'disconnected' screen
        alert('Connection to the server has been lost.');
    });

    socket.on('message', (data) => {
        console.log('Received message:', data);
        clientState.currentState = elements[data.type]?.dataset.screen || clientState.currentState;

        switch (data.type) {
            case 'lobby_list':
                updateLobbyList(data.lobbies);
                showScreen('mainMenu');
                break;
            case 'lobby_update':
                clientState.myPlayerId = data.player_id;
                clientState.isHost = data.is_host;
                updateLobbyView(data);
                showScreen('lobby');
                break;
            case 'game_start':
                showScreen('game');
                break;
            case 'game_state':
                updateGameView(data, clientState);
                break;
            case 'prompt':
                clientState.currentPrompt = data;
                updatePromptView(data, clientState);
                break;
            case 'event':
                // For now, just log events. A proper log panel would be better.
                console.log("GAME EVENT:", data.message);
                break;
        }
    });

    showScreen('connecting');
});
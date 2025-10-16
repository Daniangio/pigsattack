import { elements, updatePromptView } from './ui.js';

let socket;
let clientState;

function sendInput(value) {
    socket.emit('message', { command: 'input', value: value });
    updatePromptView(null, clientState); // Clear the prompt immediately
    clientState.selectedCards.length = 0; // Clear selections
}

export function onCardClick(cardId) {
    if (!clientState.currentPrompt.input_mode) return; // Can't select cards if not prompted

    const cardElement = elements.playerHand.querySelector(`[data-card-id='${cardId}']`);
    if (!cardElement) return;

    if (clientState.currentPrompt.input_mode === 'card_select') {
        sendInput(String(cardId));
    } else if (clientState.currentPrompt.input_mode === 'multi_card_select') {
        const index = clientState.selectedCards.indexOf(cardId);
        if (index > -1) {
            clientState.selectedCards.splice(index, 1);
            cardElement.classList.remove('selected');
        } else {
            clientState.selectedCards.push(cardId);
            cardElement.classList.add('selected');
        }
    }
}

function createLobby() {
    const lobbyName = prompt("Enter a name for your camp:", "A Desperate Shelter");
    if (lobbyName) {
        socket.emit('message', { command: 'create_lobby', name: lobbyName });
    }
}

function joinLobby(roomId) {
    socket.emit('message', { command: 'join_lobby', room_id: roomId });
}

function startGame() {
    if (clientState.isHost) {
        socket.emit('message', { command: 'start_game' });
    }
}

function leaveLobby() {
    socket.emit('message', { command: 'leave_room' });
}

function surrender() {
    if (confirm('Are you sure you want to surrender?')) {
        socket.emit('message', { command: 'surrender' });
    }
}

function addAi() {
    socket.emit('message', { command: 'add_ai' });
}

function removeAi() {
    socket.emit('message', { command: 'remove_ai' });
}

export function initEventHandlers(_socket, _clientState) {
    socket = _socket;
    clientState = _clientState;

    elements.createLobbyBtn.addEventListener('click', createLobby);
    elements.startGameBtn.addEventListener('click', startGame);
    elements.leaveLobbyBtn.addEventListener('click', leaveLobby);
    elements.surrenderBtn.addEventListener('click', surrender);
    elements.addAiBtn.addEventListener('click', addAi);
    elements.removeAiBtn.addEventListener('click', removeAi);

    // Use event delegation for dynamically created elements
    elements.lobbyList.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.dataset.roomId) {
            joinLobby(e.target.dataset.roomId);
        }
    });

    elements.playerHand.addEventListener('click', (e) => {
        const cardDiv = e.target.closest('.card');
        if (cardDiv && cardDiv.dataset.cardId) {
            onCardClick(Number(cardDiv.dataset.cardId));
        }
    });

    elements.promptArea.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') return;

        if (clientState.currentPrompt.input_mode === 'multi_card_select') {
            sendInput(clientState.selectedCards.join(' '));
        } else if (clientState.currentPrompt.choices) {
            const choice = clientState.currentPrompt.choices.find(c => c.text === e.target.textContent);
            if (choice) {
                sendInput(choice.value);
            }
        }
    });
}
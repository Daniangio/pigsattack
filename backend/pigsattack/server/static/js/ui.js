import { onCardClick } from './handlers.js';

// --- DOM Elements ---
export const elements = {
    screens: {
        connecting: document.getElementById('connecting-screen'),
        mainMenu: document.getElementById('main-menu-screen'),
        lobby: document.getElementById('lobby-screen'),
        game: document.getElementById('game-screen'),
    },
    createLobbyBtn: document.getElementById('create-lobby-btn'),
    lobbyList: document.getElementById('lobby-list'),
    lobbyNameTitle: document.getElementById('lobby-name'),
    playerListLobby: document.getElementById('player-list-lobby'),
    lobbyStatus: document.getElementById('lobby-status'),
    startGameBtn: document.getElementById('start-game-btn'),
    leaveLobbyBtn: document.getElementById('leave-lobby-btn'),
    aiControls: document.getElementById('ai-controls'),
    addAiBtn: document.getElementById('add-ai-btn'),
    removeAiBtn: document.getElementById('remove-ai-btn'),
    aiCount: document.getElementById('ai-count'),
    surrenderBtn: document.getElementById('surrender-btn'),
    gameInfo: document.getElementById('game-info'),
    playmat: document.getElementById('playmat'),
    promptArea: document.getElementById('prompt-area'),
    playerHand: document.getElementById('player-hand'),
};

// --- UI Update Functions ---

export function showScreen(screenName) {
    for (const key in elements.screens) {
        elements.screens[key].classList.remove('active');
    }
    if (elements.screens[screenName]) {
        elements.screens[screenName].classList.add('active');
    }
}

export function updateLobbyList(lobbies) {
    elements.lobbyList.innerHTML = ''; // Clear existing list
    if (lobbies.length === 0) {
        elements.lobbyList.innerHTML = '<p class="status-text">No active camps. Time to start your own.</p>';
    } else {
        lobbies.forEach(lobby => {
            const lobbyItem = document.createElement('li');
            lobbyItem.className = 'lobby-item';
            lobbyItem.innerHTML = `
                <span class="lobby-name">'${lobby.name}'</span>
                <span class="lobby-players">(${lobby.players}/${lobby.max_players})</span>
            `;
            const joinBtn = document.createElement('button');
            joinBtn.textContent = 'Join Camp';
            joinBtn.dataset.roomId = lobby.id; // Use data attribute
            lobbyItem.appendChild(joinBtn);
            elements.lobbyList.appendChild(lobbyItem);
        });
    }
}

export function updateLobbyView(data) {
    elements.lobbyNameTitle.textContent = `'${data.room_name || 'Unnamed Camp'}'`;
    const totalPlayers = data.num_players + data.num_ai;
    elements.playerListLobby.textContent = `Survivors in camp: ${totalPlayers} (${data.num_players} human, ${data.num_ai} lost souls)`;
    elements.aiCount.textContent = data.num_ai;

    if (data.is_host) {
        elements.startGameBtn.style.display = 'inline-block';
        elements.aiControls.style.display = 'block';
        elements.lobbyStatus.textContent = "You are the camp leader. When you're ready, start the ordeal.";
        elements.startGameBtn.disabled = totalPlayers < data.min_players;
        elements.addAiBtn.disabled = totalPlayers >= data.max_players;
        elements.removeAiBtn.disabled = data.num_ai <= 0;
    } else {
        elements.startGameBtn.style.display = 'none';
        elements.aiControls.style.display = 'none';
        elements.lobbyStatus.textContent = `Waiting for the camp leader to begin... (You are Survivor #${data.player_id + 1})`;
    }
}

export function updateGameView(data, clientState) {
    const myGameIndex = data.players.findIndex(p => p.player_index === clientState.myPlayerId);

    elements.gameInfo.innerHTML = `
        <span>Turn: Player ${data.current_player_index + 1}</span> |
        <span>Deck: ${data.deck_size} cards</span> |
        <span>Discard: ${data.discard_pile_top}</span>
        ${data.is_nightfall ? ' | <span style="color: var(--accent-color);">NIGHTFALL</span>' : ''}
    `;

    elements.playmat.innerHTML = '';
    data.players.forEach((p, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-info';
        if (p.is_eliminated) playerDiv.classList.add('eliminated');
        if (index === data.current_player_index) playerDiv.classList.add('current-player');
        playerDiv.innerHTML = `
            <h4>${p.name} ${index === myGameIndex ? '(You)' : ''}</h4>
            <div>Cards: ${p.hand.length}</div>
            <div>${p.has_barricade ? 'Has Barricade' : ''}</div>
            <div>${p.is_eliminated ? 'ELIMINATED' : ''}</div>
        `;
        elements.playmat.appendChild(playerDiv);
    });

    elements.playerHand.innerHTML = '';
    const myPlayerData = data.players[myGameIndex];
    if (myPlayerData && myPlayerData.hand) {
        myPlayerData.hand.forEach(card => {
            const isSelected = clientState.selectedCards.includes(card.id);
            const cardDiv = document.createElement('div');
            cardDiv.className = 'card';
            cardDiv.textContent = card.repr;
            cardDiv.dataset.cardId = card.id;
            if (isSelected) cardDiv.classList.add('selected');
            elements.playerHand.appendChild(cardDiv);
        });
    }
}

export function updatePromptView(prompt, clientState) {
    elements.promptArea.innerHTML = '';
    if (!prompt || !prompt.prompt_text) {
        clientState.currentPrompt = {};
        clientState.selectedCards.length = 0;
        return;
    }

    const promptText = document.createElement('p');
    promptText.textContent = prompt.prompt_text;
    elements.promptArea.appendChild(promptText);
}
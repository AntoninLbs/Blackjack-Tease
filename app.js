// ========== FIREBASE CONFIG ==========
const firebaseConfig = {
    apiKey: "AIzaSyAu5EpLZC8qoJwWrizBYUnUOW823nV515Q",
    authDomain: "blackjack-tease.firebaseapp.com",
    databaseURL: "https://blackjack-tease-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "blackjack-tease",
    storageBucket: "blackjack-tease.firebasestorage.app",
    messagingSenderId: "193161343098",
    appId: "1:193161343098:web:293b2d54631e5d0e900bc3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ========== CONFIG ==========
const EMOJIS = ['😎', '🤠', '🥳', '😈', '🤩', '🧐', '🤪', '😏', '🦊', '🐸', '🦄', '👻', '🎃', '🤑', '🥴'];
const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const GORGEES_PAR_DEMI = 7;
const GORGEES_PAR_CULSEC = 15;

// ========== STATE ==========
let gameRef = null;
let playersRef = null;
let myId = localStorage.getItem('bjt_myId') || ('p' + Math.random().toString(36).substr(2, 8));
localStorage.setItem('bjt_myId', myId);

let myName = '', myEmoji = '', roomCode = '', isHost = false;
let selectedBet = { amount: 2, type: 'normal' };
let localState = { players: {} };
let currentScreen = 'screen-home';
let resultShown = false;

// ========== INIT ==========
function init() {
    renderEmojiPicker('create-emoji-picker');
    renderEmojiPicker('join-emoji-picker');
    
    document.getElementById('join-code').addEventListener('input', function() {
        this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    
    tryReconnect();
    console.log('✅ Firebase initialisé');
}

// ========== RECONNEXION AUTO ==========
function tryReconnect() {
    var savedRoom = localStorage.getItem('bjt_roomCode');
    var savedName = localStorage.getItem('bjt_myName');
    var savedEmoji = localStorage.getItem('bjt_myEmoji');
    
    if (savedRoom && savedName && savedEmoji) {
        showLoading('Reconnexion...');
        roomCode = savedRoom;
        myName = savedName;
        myEmoji = savedEmoji;
        
        gameRef = db.ref('games/' + roomCode);
        playersRef = gameRef.child('players');
        
        gameRef.once('value').then(function(snapshot) {
            var data = snapshot.val();
            
            if (!data) {
                clearSession();
                hideLoading();
                return;
            }
            
            if (data.players && data.players[myId]) {
                isHost = data.host === myId;
                subscribeToGame();
                hideLoading();
                toast('Reconnecté ! 🔄', 'success');
            } else {
                var joinStatus = data.status === 'lobby' ? 'waiting' : 'spectating';
                playersRef.child(myId).set({
                    id: myId, name: myName, emoji: myEmoji, isHost: false,
                    bet: '', hand: '', status: joinStatus,
                    totalGorgees: 0, totalDemi: 0, totalCulSec: 0, joined: Date.now()
                }).then(function() {
                    subscribeToGame();
                    hideLoading();
                    toast(joinStatus === 'spectating' ? 'Reconnecté ! Tu joueras au prochain tour' : 'Reconnecté ! 🔄', joinStatus === 'spectating' ? 'info' : 'success');
                });
            }
        }).catch(function() {
            clearSession();
            hideLoading();
        });
    }
}

function saveSession() {
    localStorage.setItem('bjt_roomCode', roomCode);
    localStorage.setItem('bjt_myName', myName);
    localStorage.setItem('bjt_myEmoji', myEmoji);
}

function clearSession() {
    localStorage.removeItem('bjt_roomCode');
    localStorage.removeItem('bjt_myName');
    localStorage.removeItem('bjt_myEmoji');
    roomCode = '';
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ========== UI HELPERS ==========
function showLoading(text) {
    document.getElementById('loading-text').textContent = text || 'Connexion...';
    document.getElementById('loading').style.display = 'flex';
}

function hideLoading() { 
    document.getElementById('loading').style.display = 'none'; 
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    document.getElementById(id).classList.add('active');
    currentScreen = id;
    updateRoomCodeDisplay();
}

function updateRoomCodeDisplay() {
    document.querySelectorAll('.game-room-code').forEach(function(el) {
        el.textContent = roomCode;
    });
}

function toast(msg, type) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast ' + (type || 'info') + ' show';
    setTimeout(function() { t.classList.remove('show'); }, 2500);
}

// ========== EMOJI ==========
function renderEmojiPicker(containerId) {
    document.getElementById(containerId).innerHTML = EMOJIS.map(function(e) {
        return '<div class="emoji-option" onclick="selectEmoji(\'' + containerId + '\', \'' + e + '\')">' + e + '</div>';
    }).join('');
}

function selectEmoji(containerId, emoji) {
    document.querySelectorAll('#' + containerId + ' .emoji-option').forEach(function(el) {
        el.classList.toggle('selected', el.textContent === emoji);
    });
    myEmoji = emoji;
}

// ========== CREATE ROOM ==========
function createRoom() {
    myName = document.getElementById('create-name').value.trim();
    if (!myName) return toast('Entre ton pseudo !', 'error');
    if (!myEmoji) return toast('Choisis un emoji !', 'error');
    
    showLoading('Création...');
    roomCode = generateRoomCode();
    isHost = true;
    
    gameRef = db.ref('games/' + roomCode);
    playersRef = gameRef.child('players');
    
    var ts = Date.now();
    
    gameRef.set({
        code: roomCode, host: myId, status: 'lobby', round: 0,
        deck: '', dealer: '', dealerHand: '', currentPlayer: '',
        playerOrder: '', created: ts, updated: ts
    }).then(function() {
        return playersRef.child(myId).set({
            id: myId, name: myName, emoji: myEmoji, isHost: true,
            bet: '', hand: '', status: 'waiting',
            totalGorgees: 0, totalDemi: 0, totalCulSec: 0, joined: ts
        });
    }).then(function() {
        saveSession();
        subscribeToGame();
        hideLoading();
        document.getElementById('lobby-code').textContent = roomCode;
        showScreen('screen-lobby');
        toast('Partie créée ! 🎉', 'success');
    }).catch(function(err) {
        hideLoading();
        toast('Erreur: ' + err.message, 'error');
    });
}

// ========== JOIN ROOM ==========
function joinRoom() {
    var code = document.getElementById('join-code').value.trim().toUpperCase();
    myName = document.getElementById('join-name').value.trim();
    
    if (!code || code.length !== 4) return toast('Code invalide !', 'error');
    if (!myName) return toast('Entre ton pseudo !', 'error');
    if (!myEmoji) return toast('Choisis un emoji !', 'error');
    
    showLoading('Recherche...');
    roomCode = code;
    isHost = false;
    
    gameRef = db.ref('games/' + roomCode);
    playersRef = gameRef.child('players');
    
    gameRef.once('value').then(function(snapshot) {
        var data = snapshot.val();
        
        if (!data) {
            hideLoading();
            toast('Partie introuvable !', 'error');
            return;
        }
        
        var joinStatus = data.status === 'lobby' ? 'waiting' : 'spectating';
        
        return playersRef.child(myId).set({
            id: myId, name: myName, emoji: myEmoji, isHost: false,
            bet: '', hand: '', status: joinStatus,
            totalGorgees: 0, totalDemi: 0, totalCulSec: 0, joined: Date.now()
        });
    }).then(function() {
        saveSession();
        subscribeToGame();
        hideLoading();
        document.getElementById('lobby-code').textContent = roomCode;
        
        gameRef.once('value').then(function(snapshot) {
            var data = snapshot.val();
            if (data && data.status !== 'lobby') {
                toast('Tu joueras à la prochaine manche !', 'info');
            } else {
                toast('Tu as rejoint ! 🎉', 'success');
            }
        });
    }).catch(function(err) {
        hideLoading();
        toast('Erreur: ' + err.message, 'error');
    });
}

function copyCode() {
    navigator.clipboard.writeText(roomCode).catch(function() {});
    toast('Code copié !', 'success');
}

// ========== QUITTER LA PARTIE ==========
function leaveGame() {
    if (!confirm('Vraiment quitter la partie ?')) return;
    
    var wasHost = isHost;
    
    if (playersRef && myId) {
        playersRef.child(myId).remove().then(function() {
            if (wasHost) {
                gameRef.once('value').then(function(snapshot) {
                    var data = snapshot.val();
                    if (data && data.players) {
                        var remainingPlayers = Object.keys(data.players);
                        if (remainingPlayers.length > 0) {
                            var newHost = remainingPlayers[0];
                            gameRef.update({ host: newHost });
                            playersRef.child(newHost).update({ isHost: true });
                        } else {
                            gameRef.remove();
                        }
                    }
                });
            }
        });
    }
    
    clearSession();
    if (gameRef) gameRef.off();
    gameRef = null;
    playersRef = null;
    localState = { players: {} };
    isHost = false;
    
    showScreen('screen-home');
    toast('Tu as quitté la partie', 'info');
}

// ========== SUBSCRIBE ==========
function subscribeToGame() {
    gameRef.on('value', function(snapshot) {
        var data = snapshot.val();
        if (!data) {
            clearSession();
            showScreen('screen-home');
            toast('La partie a été fermée', 'error');
            return;
        }
        
        if (!data.players || !data.players[myId]) {
            clearSession();
            if (gameRef) gameRef.off();
            showScreen('screen-home');
            toast('Tu as été retiré de la partie', 'error');
            return;
        }
        
        isHost = data.host === myId;
        
        Object.keys(data).forEach(function(k) {
            if (k !== 'players') localState[k] = data[k];
        });
        
        if (data.players) localState.players = data.players;
        
        handleStateUpdate();
    });
}

function handleStateUpdate() {
    if (!localState.status) return;
    
    switch (localState.status) {
        case 'lobby': updateLobby(); break;
        case 'betting': updateBetting(); break;
        case 'playing': updateGame(); break;
        case 'results': updateResults(); break;
    }
}

// ========== LOBBY ==========
function updateLobby() {
    if (currentScreen !== 'screen-lobby') showScreen('screen-lobby');
    
    var players = [];
    if (localState.players) {
        Object.keys(localState.players).forEach(function(id) {
            var p = localState.players[id];
            if (p && p.id && p.name) players.push(p);
        });
    }
    
    document.getElementById('players-lobby').innerHTML = players.map(function(p) {
        return '<div class="player-lobby-card ' + (p.id === myId ? 'is-me' : '') + '">' +
            '<span class="avatar">' + (p.emoji || '❓') + '</span>' +
            '<span class="name">' + p.name + '</span>' +
            (p.isHost ? '<span class="host-badge">👑 Hôte</span>' : '') +
        '</div>';
    }).join('');
    
    document.getElementById('btn-start-game').style.display = (isHost && players.length >= 2) ? 'block' : 'none';
    document.getElementById('waiting-text').textContent = players.length < 2 ? 
        'En attente d\'autres joueurs...' : 
        isHost ? 'Prêt à lancer !' : 'En attente du lancement...';
}

// ========== START GAME ==========
function hostStartGame() {
    if (!isHost) return;
    
    showLoading('Lancement...');
    
    var deck = createDeck();
    var players = [];
    if (localState.players) {
        Object.keys(localState.players).forEach(function(id) {
            var p = localState.players[id];
            if (p && p.id && p.name) players.push(p);
        });
    }
    
    var randomDealer = players[Math.floor(Math.random() * players.length)].id;
    var order = players.filter(function(p) { return p.id !== randomDealer; }).map(function(p) { return p.id; });
    
    gameRef.update({
        status: 'betting', deck: JSON.stringify(deck), dealer: randomDealer,
        playerOrder: JSON.stringify(order), round: 1, dealerHand: '',
        currentPlayer: '', updated: Date.now()
    }).then(function() {
        hideLoading();
        toast('Partie lancée ! 🎲', 'success');
    });
}

function createDeck() {
    var deck = [];
    SUITS.forEach(function(suit) {
        VALUES.forEach(function(value) {
            deck.push({suit: suit, value: value});
        });
    });
    for (var i = deck.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = deck[i];
        deck[i] = deck[j];
        deck[j] = temp;
    }
    return deck;
}

// ========== BETTING ==========
function updateBetting() {
    if (currentScreen !== 'screen-bet') showScreen('screen-bet');
    
    var dealer = localState.players && localState.dealer ? localState.players[localState.dealer] : null;
    document.getElementById('bet-dealer-info').textContent = 'Banquier: ' + (dealer ? dealer.emoji + ' ' + dealer.name : '???');
    
    var amIDealer = localState.dealer === myId;
    var me = localState.players ? localState.players[myId] : null;
    var amSpectating = me && me.status === 'spectating';
    
    var betOptions = document.getElementById('bet-options');
    var confirmBtn = document.getElementById('btn-confirm-bet');
    
    if (amSpectating) {
        betOptions.innerHTML = '<div style="text-align:center; padding:1.5rem; grid-column:span 3;"><div style="font-size:2.5rem;">👀</div><div>Tu regardes cette manche</div><div style="color:var(--text-muted); font-size:0.8rem;">Tu joueras à la prochaine !</div></div>';
        confirmBtn.style.display = 'none';
        document.getElementById('bet-waiting').style.display = 'none';
    } else if (amIDealer) {
        betOptions.innerHTML = '<div style="text-align:center; padding:1.5rem; grid-column:span 3;"><div style="font-size:2.5rem;">🎩</div><div>Tu es la BANQUE !</div><div style="color:var(--text-muted); font-size:0.8rem;">Attends les mises...</div></div>';
        confirmBtn.style.display = 'none';
    } else {
        renderBetOptions();
        confirmBtn.style.display = 'block';
        confirmBtn.disabled = me && me.status === 'ready';
        document.getElementById('bet-waiting').style.display = (me && me.status === 'ready') ? 'block' : 'none';
    }
    
    if (isHost) setTimeout(checkAllBets, 500);
}

function renderBetOptions() {
    var html = '<div class="bet-custom"><label>Nombre de gorgées</label><div class="bet-input-row"><button class="btn-adjust" onclick="adjustBet(-1)">−</button><input type="number" id="bet-amount-input" min="1" max="50" value="' + selectedBet.amount + '" onchange="updateBetAmount(this.value)"><button class="btn-adjust" onclick="adjustBet(1)">+</button></div></div>' +
        '<div class="bet-specials"><div class="bet-option demi ' + (selectedBet.type==='demi'?'selected':'') + '" onclick="selectBetType(\'demi\')"><span class="number">½</span><span class="label">cul sec (' + GORGEES_PAR_DEMI + 'g)</span></div>' +
        '<div class="bet-option special ' + (selectedBet.type==='culsec'?'selected':'') + '" onclick="selectBetType(\'culsec\')"><span class="number">🍺</span><span class="label">cul sec (' + GORGEES_PAR_CULSEC + 'g)</span></div></div>';
    document.getElementById('bet-options').innerHTML = html;
}

function adjustBet(delta) {
    var input = document.getElementById('bet-amount-input');
    var newVal = Math.max(1, Math.min(50, parseInt(input.value) + delta));
    input.value = newVal;
    selectedBet = {amount: newVal, type: 'normal'};
    document.querySelectorAll('.bet-option').forEach(function(e) { e.classList.remove('selected'); });
}

function updateBetAmount(val) {
    var amount = Math.max(1, Math.min(50, parseInt(val) || 1));
    document.getElementById('bet-amount-input').value = amount;
    selectedBet = {amount: amount, type: 'normal'};
    document.querySelectorAll('.bet-option').forEach(function(e) { e.classList.remove('selected'); });
}

function selectBetType(type) {
    selectedBet = {amount: 0, type: type};
    document.querySelectorAll('.bet-option').forEach(function(e) { e.classList.remove('selected'); });
    document.querySelector('.bet-option.' + (type === 'culsec' ? 'special' : type)).classList.add('selected');
}

function confirmBet() {
    playersRef.child(myId).update({ bet: JSON.stringify(selectedBet), status: 'ready' });
    toast('Mise enregistrée !', 'success');
}

function checkAllBets() {
    if (!isHost || localState.status !== 'betting') return;
    
    var order = JSON.parse(localState.playerOrder || '[]');
    if (order.length === 0) return;
    
    var allReady = order.every(function(id) {
        var p = localState.players ? localState.players[id] : null;
        if (!p) return true;
        if (p.status === 'spectating') return true;
        return p.status === 'ready';
    });
    
    if (allReady) startDealing();
}

// ========== DEALING ==========
function startDealing() {
    if (!isHost) return;
    
    var deck = JSON.parse(localState.deck || '[]');
    var order = JSON.parse(localState.playerOrder || '[]');
    
    var activeOrder = order.filter(function(id) {
        var p = localState.players ? localState.players[id] : null;
        return p && p.status !== 'spectating';
    });
    
    if (activeOrder.length === 0) {
        toast('Pas assez de joueurs !', 'error');
        return;
    }
    
    var updates = {};
    
    activeOrder.forEach(function(id) {
        var hands = [[deck.pop(), deck.pop()]];
        updates['players/' + id + '/hands'] = JSON.stringify(hands);
        updates['players/' + id + '/activeHand'] = 0;
        updates['players/' + id + '/handResults'] = '[]';
        updates['players/' + id + '/status'] = 'playing';
        updates['players/' + id + '/doubledHidden'] = '';
    });
    
    var dealerHand = [deck.pop(), deck.pop()];
    
    updates['status'] = 'playing';
    updates['deck'] = JSON.stringify(deck);
    updates['dealerHand'] = JSON.stringify(dealerHand);
    updates['currentPlayer'] = activeOrder[0];
    updates['activePlayerOrder'] = JSON.stringify(activeOrder);
    updates['updated'] = Date.now();
    
    gameRef.update(updates);
}

// ========== GAME ==========
function updateGame() {
    if (currentScreen !== 'screen-game') showScreen('screen-game');
    
    var deck = JSON.parse(localState.deck || '[]');
    var dealerHand = JSON.parse(localState.dealerHand || '[]');
    var activeOrder = JSON.parse(localState.activePlayerOrder || localState.playerOrder || '[]');
    var currentPlayer = localState.currentPlayer;
    var isMyTurn = currentPlayer === myId;
    var amIDealer = localState.dealer === myId;
    var isDealerTurn = currentPlayer === 'dealer';
    var isReveal = currentPlayer === 'reveal';
    var gameEnded = currentPlayer === 'done';
    
    var me = localState.players ? localState.players[myId] : null;
    var amSpectating = me && me.status === 'spectating';
    
    document.getElementById('game-deck-count').textContent = deck.length;
    document.getElementById('game-round-info').textContent = 'Tour ' + (localState.round || 1);
    
    var dealer = localState.players ? localState.players[localState.dealer] : null;
    document.getElementById('game-dealer-name').textContent = (dealer ? dealer.emoji + ' ' + dealer.name : '???');
    
    var dealerRevealed = isDealerTurn || isReveal || gameEnded;
    
    document.getElementById('dealer-cards').innerHTML = dealerHand.map(function(c, i) {
        if (i === 1 && !dealerRevealed) return '<div class="card hidden"></div>';
        return renderCard(c);
    }).join('');
    
    document.getElementById('dealer-score').textContent = dealerRevealed ? calcScore(dealerHand) : (dealerHand[0] ? getCardValue(dealerHand[0]) : '?');
    
    var myGame = document.getElementById('my-game');
    
    if (amIDealer || amSpectating) {
        myGame.style.display = 'none';
    } else if (me) {
        myGame.style.display = 'block';
        document.getElementById('my-avatar').textContent = me.emoji;
        document.getElementById('my-name').textContent = me.name;
        
        var bet = JSON.parse(me.bet || '{"amount":2,"type":"normal"}');
        var betText = bet.type === 'culsec' ? (bet.doubled ? '🍺🍺 2 Cul sec' : '🍺 Cul sec') : bet.type === 'demi' ? '½ cul sec' : bet.amount + ' gorgées';
        document.getElementById('my-bet').textContent = betText;
        
        var hands = JSON.parse(me.hands || '[[]]');
        var activeHand = me.activeHand || 0;
        var doubledHidden = JSON.parse(me.doubledHidden || '{}');
        
        var handsHtml = hands.map(function(hand, idx) {
            var isActive = idx === activeHand && isMyTurn;
            var score = calcScore(hand);
            var isBust = score > 21;
            var isHidden = doubledHidden[idx] && !gameEnded && !isReveal;
            
            var cardsHtml = hand.map(function(c, cardIdx) {
                if (isHidden && cardIdx === hand.length - 1) return '<div class="card hidden"></div>';
                return renderCard(c);
            }).join('');
            
            var displayScore = isHidden ? calcScore(hand.slice(0, -1)) + '?' : score;
            
            return '<div class="hand-container ' + (isActive ? 'active-hand' : '') + ' ' + (isBust && !isHidden ? 'bust-hand' : '') + '">' +
                (hands.length > 1 ? '<div class="hand-label">Main ' + (idx + 1) + '</div>' : '') +
                '<div class="cards-row">' + cardsHtml + '</div>' +
                '<div class="score-badge ' + (isBust && !isHidden ? 'bust' : '') + '">' + displayScore + (isBust && !isHidden ? ' 💥' : '') + '</div>' +
            '</div>';
        }).join('');
        
        document.getElementById('my-cards').innerHTML = handsHtml;
        document.getElementById('my-score').style.display = 'none';
        
        myGame.className = 'my-game';
        if (isMyTurn) myGame.classList.add('active');
    }
    
    var actionsBar = document.getElementById('actions-bar');
    var gameWaiting = document.getElementById('game-waiting');
    
    if (isMyTurn && !gameEnded && !isDealerTurn && !isReveal && me && !amSpectating) {
        var hands = JSON.parse(me.hands || '[[]]');
        var activeHand = me.activeHand || 0;
        var currentHand = hands[activeHand] || [];
        var canDbl = currentHand.length === 2;
        var canSplt = canSplit();
        
        actionsBar.style.display = 'grid';
        actionsBar.innerHTML = '<button class="btn btn-success" onclick="playerHit()">🃏 Carte</button>' +
            '<button class="btn btn-secondary" onclick="playerStand()">✋ Stop</button>' +
            (canDbl ? '<button class="btn btn-accent" onclick="playerDouble()">💰 Doubler</button>' : '') +
            (canSplt ? '<button class="btn" onclick="playerSplit()">✂️ Split</button>' : '');
        gameWaiting.style.display = 'none';
    } else if (isDealerTurn && amIDealer) {
        var dealerScore = calcScore(dealerHand);
        actionsBar.style.display = 'grid';
        if (dealerScore >= 17) {
            actionsBar.innerHTML = '<button class="btn btn-secondary" onclick="dealerStand()" style="grid-column: span 2;">✋ Rester (' + dealerScore + ')</button>';
        } else {
            actionsBar.innerHTML = '<button class="btn btn-success" onclick="dealerHit()">🃏 Tirer</button><button class="btn btn-secondary" disabled>✋ Reste (min 17)</button>';
        }
        gameWaiting.style.display = 'none';
    } else if (isReveal && isHost) {
        actionsBar.style.display = 'grid';
        actionsBar.innerHTML = '<button class="btn btn-success" onclick="hostValidateResults()" style="grid-column: span 2;">✅ Voir les résultats</button>';
        gameWaiting.style.display = 'none';
    } else {
        actionsBar.style.display = 'none';
        gameWaiting.style.display = gameEnded ? 'none' : 'block';
        if (amSpectating) {
            document.getElementById('waiting-player').textContent = 'Tu regardes cette manche';
        } else if (isDealerTurn) {
            document.getElementById('waiting-player').textContent = (dealer ? dealer.name : '???') + ' (Banque)';
        } else if (isReveal) {
            document.getElementById('waiting-player').textContent = 'validation...';
        } else {
            var waitingP = localState.players ? localState.players[currentPlayer] : null;
            document.getElementById('waiting-player').textContent = waitingP ? waitingP.name : '???';
        }
    }
    
    var others = activeOrder.filter(function(id) { return id !== myId; }).map(function(id) { 
        return localState.players ? localState.players[id] : null; 
    }).filter(function(p) { return p && p.status !== 'spectating'; });
    
    document.getElementById('other-players').innerHTML = others.map(function(p) {
        var hands = JSON.parse(p.hands || '[[]]');
        var cls = p.id === currentPlayer ? 'active' : '';
        var pDoubledHidden = JSON.parse(p.doubledHidden || '{}');
        
        var handsHtml = hands.map(function(hand, idx) {
            var score = calcScore(hand);
            var isBust = score > 21;
            var isHidden = pDoubledHidden[idx] && !gameEnded && !isReveal;
            
            var miniCardsHtml = hand.map(function(c, cardIdx) {
                if (isHidden && cardIdx === hand.length - 1) return '<div class="mini-card" style="background:linear-gradient(135deg, #c1121f, #780000);color:white;">?</div>';
                return '<div class="mini-card" style="color:' + (['♥','♦'].indexOf(c.suit) >= 0 ? '#e63946' : '#1d3557') + '">' + c.value + '</div>'; 
            }).join('');
            
            return '<div class="other-hand">' +
                (hands.length > 1 ? '<div style="font-size:0.6rem;color:var(--text-muted);">M' + (idx+1) + '</div>' : '') +
                '<div class="mini-cards">' + miniCardsHtml + '</div>' +
                '<div style="font-weight:600;' + (isBust && !isHidden ? 'color:var(--primary);' : '') + '">' + (isHidden ? '?' : score) + '</div>' +
            '</div>';
        }).join('');
        
        return '<div class="other-player ' + cls + '"><div class="avatar">' + p.emoji + '</div><div>' + p.name + '</div>' + handsHtml + '</div>';
    }).join('');
}

function renderCard(c) {
    var red = ['♥','♦'].indexOf(c.suit) >= 0;
    return '<div class="card ' + (red ? 'red' : 'black') + '"><span class="card-value">' + c.value + '</span><span class="card-suit">' + c.suit + '</span></div>';
}

function getCardValue(c) {
    if (c.value === 'A') return 11;
    if (['K','Q','J'].indexOf(c.value) >= 0) return 10;
    return parseInt(c.value);
}

function calcScore(hand) {
    if (!hand || hand.length === 0) return 0;
    var score = 0, aces = 0;
    hand.forEach(function(c) {
        score += getCardValue(c);
        if (c.value === 'A') aces++;
    });
    while (score > 21 && aces > 0) { score -= 10; aces--; }
    return score;
}

// ========== PLAYER ACTIONS ==========
function getMyHands() {
    var me = localState.players ? localState.players[myId] : null;
    if (!me) return { hands: [[]], activeHand: 0 };
    return { hands: JSON.parse(me.hands || '[[]]'), activeHand: me.activeHand || 0 };
}

function canSplit() {
    var data = getMyHands();
    var hand = data.hands[data.activeHand];
    if (!hand || hand.length !== 2) return false;
    return getCardValue(hand[0]) === getCardValue(hand[1]);
}

function playerHit() {
    var me = localState.players[myId];
    var hands = JSON.parse(me.hands || '[[]]');
    var activeHand = me.activeHand || 0;
    var deck = JSON.parse(localState.deck || '[]');
    
    hands[activeHand].push(deck.pop());
    var score = calcScore(hands[activeHand]);
    
    var updates = { deck: JSON.stringify(deck), updated: Date.now() };
    updates['players/' + myId + '/hands'] = JSON.stringify(hands);
    
    if (score > 21) {
        toast('Brûlé ! 💥', 'error');
        gameRef.update(updates).then(function() {
            setTimeout(function() { moveToNextHand(); }, 500);
        });
    } else {
        gameRef.update(updates);
    }
}

function playerStand() {
    toast('Tu restes', 'info');
    moveToNextHand();
}

function playerDouble() {
    var deck = JSON.parse(localState.deck || '[]');
    var me = localState.players[myId];
    var hands = JSON.parse(me.hands || '[[]]');
    var activeHand = me.activeHand || 0;
    var bet = JSON.parse(me.bet || '{"amount":2,"type":"normal"}');
    var doubledHidden = JSON.parse(me.doubledHidden || '{}');
    
    if (hands[activeHand].length !== 2) {
        toast('Double uniquement avec 2 cartes !', 'error');
        return;
    }
    
    if (bet.type === 'demi') bet.type = 'culsec';
    else if (bet.type === 'culsec') { bet.type = 'culsec'; bet.doubled = true; }
    else bet.amount *= 2;
    
    hands[activeHand].push(deck.pop());
    doubledHidden[activeHand] = true;
    
    var updates = { deck: JSON.stringify(deck), updated: Date.now() };
    updates['players/' + myId + '/hands'] = JSON.stringify(hands);
    updates['players/' + myId + '/bet'] = JSON.stringify(bet);
    updates['players/' + myId + '/doubledHidden'] = JSON.stringify(doubledHidden);
    
    toast('Doublé ! 💰', 'info');
    
    gameRef.update(updates).then(function() {
        setTimeout(function() { moveToNextHand(); }, 300);
    });
}

function playerSplit() {
    if (!canSplit()) {
        toast('Split impossible !', 'error');
        return;
    }
    
    var deck = JSON.parse(localState.deck || '[]');
    var me = localState.players[myId];
    var hands = JSON.parse(me.hands || '[[]]');
    var activeHand = me.activeHand || 0;
    
    var card1 = hands[activeHand][0];
    var card2 = hands[activeHand][1];
    
    hands[activeHand] = [card1, deck.pop()];
    hands.push([card2, deck.pop()]);
    
    var updates = { deck: JSON.stringify(deck), updated: Date.now() };
    updates['players/' + myId + '/hands'] = JSON.stringify(hands);
    
    toast('Split ! ✂️ Tu as ' + hands.length + ' mains', 'success');
    gameRef.update(updates);
}

function moveToNextHand() {
    var me = localState.players[myId];
    var hands = JSON.parse(me.hands || '[[]]');
    var activeHand = me.activeHand || 0;
    
    if (activeHand < hands.length - 1) {
        playersRef.child(myId).update({ activeHand: activeHand + 1 });
        toast('Main ' + (activeHand + 2) + '/' + hands.length, 'info');
    } else {
        signalNext();
    }
}

function signalNext() {
    if (isHost) {
        moveNext();
    } else {
        playersRef.child(myId).update({ actionDone: Date.now() });
    }
}

function moveNext() {
    var activeOrder = JSON.parse(localState.activePlayerOrder || localState.playerOrder || '[]');
    var currentPlayer = localState.currentPlayer;
    
    activeOrder = activeOrder.filter(function(id) {
        return localState.players && localState.players[id];
    });
    
    var idx = activeOrder.indexOf(currentPlayer);
    
    if (idx < activeOrder.length - 1) {
        gameRef.update({ currentPlayer: activeOrder[idx + 1], updated: Date.now() });
    } else {
        // Vérifier si tous les joueurs ont bust
        var allBust = true;
        for (var i = 0; i < activeOrder.length; i++) {
            var p = localState.players[activeOrder[i]];
            if (!p || p.status === 'spectating') continue;
            var hands = JSON.parse(p.hands || '[[]]');
            for (var j = 0; j < hands.length; j++) {
                if (calcScore(hands[j]) <= 21) {
                    allBust = false;
                    break;
                }
            }
            if (!allBust) break;
        }
        
        if (allBust) {
            toast('Tous bust ! La banque gagne ! 💥', 'info');
            gameRef.update({ currentPlayer: 'reveal', updated: Date.now() });
        } else {
            gameRef.update({ currentPlayer: 'dealer', updated: Date.now() });
        }
    }
}

setInterval(function() {
    if (!isHost || !localState || localState.status !== 'playing') return;
    if (!localState.currentPlayer || localState.currentPlayer === 'dealer' || localState.currentPlayer === 'done' || localState.currentPlayer === 'reveal') return;
    
    var player = localState.players ? localState.players[localState.currentPlayer] : null;
    
    if (!player) {
        moveNext();
        return;
    }
    
    if (player.actionDone) {
        moveNext();
    }
}, 500);

// ========== DEALER ==========
function dealerHit() {
    if (localState.dealer !== myId) return;
    
    var dealerHand = JSON.parse(localState.dealerHand || '[]');
    var score = calcScore(dealerHand);
    
    if (score >= 17) {
        toast('Tu dois rester à ' + score + ' !', 'error');
        return;
    }
    
    var deck = JSON.parse(localState.deck || '[]');
    dealerHand.push(deck.pop());
    score = calcScore(dealerHand);
    
    var updates = { deck: JSON.stringify(deck), dealerHand: JSON.stringify(dealerHand), updated: Date.now() };
    
    if (score > 21) {
        updates['currentPlayer'] = 'reveal';
        gameRef.update(updates).then(function() { toast('Banque brûlée ! 💥', 'error'); });
    } else if (score >= 17) {
        updates['currentPlayer'] = 'reveal';
        gameRef.update(updates).then(function() { toast('Banque à ' + score + ', tu dois rester', 'info'); });
    } else {
        gameRef.update(updates);
    }
}

function dealerStand() {
    if (localState.dealer !== myId) return;
    
    var dealerHand = JSON.parse(localState.dealerHand || '[]');
    var score = calcScore(dealerHand);
    
    if (score < 17) {
        toast('Tu dois tirer jusqu\'à 17 minimum !', 'error');
        return;
    }
    
    gameRef.update({ currentPlayer: 'reveal', updated: Date.now() });
    toast('Banque reste à ' + score, 'info');
}

function hostValidateResults() {
    if (!isHost) return;
    calculateResults(JSON.parse(localState.dealerHand || '[]'));
}

function calculateResults(dealerHand) {
    if (!isHost) return;
    
    var dealerScore = calcScore(dealerHand);
    var dealerBust = dealerScore > 21;
    var activeOrder = JSON.parse(localState.activePlayerOrder || localState.playerOrder || '[]');
    var dealerGorgees = 0, dealerDemi = 0, dealerCulSec = 0;
    
    var updates = {};
    var roundRecap = [];
    var dealerDrinksFrom = [];
    
    activeOrder.forEach(function(id) {
        var p = localState.players[id];
        if (!p || p.status === 'spectating') return;
        
        var hands = JSON.parse(p.hands || '[[]]');
        var bet = JSON.parse(p.bet || '{"amount":2,"type":"normal"}');
        
        var addGorgees = 0, addDemi = 0, addCulSec = 0;
        var gaveGorgees = 0, gaveDemi = 0, gaveCulSec = 0;
        var handResults = [];
        var wonCount = 0, lostCount = 0;
        var culSecMultiplier = bet.doubled ? 2 : 1;
        
        hands.forEach(function(hand) {
            var score = calcScore(hand);
            var bust = score > 21;
            var result = 'push';
            
            if (bust) {
                result = 'lost';
                lostCount++;
                if (bet.type === 'culsec') addCulSec += culSecMultiplier;
                else if (bet.type === 'demi') addDemi++;
                else addGorgees += bet.amount;
            } else if (dealerBust || score > dealerScore) {
                result = 'won';
                wonCount++;
                if (bet.type === 'culsec') { dealerCulSec += culSecMultiplier; gaveCulSec += culSecMultiplier; }
                else if (bet.type === 'demi') { dealerDemi++; gaveDemi++; }
                else { dealerGorgees += bet.amount; gaveGorgees += bet.amount; }
            } else if (score < dealerScore) {
                result = 'lost';
                lostCount++;
                if (bet.type === 'culsec') addCulSec += culSecMultiplier;
                else if (bet.type === 'demi') addDemi++;
                else addGorgees += bet.amount;
            }
            
            handResults.push(result);
        });
        
        var status = 'push';
        if (wonCount > 0 && lostCount === 0) status = 'won';
        else if (lostCount > 0 && wonCount === 0) status = 'lost';
        else if (wonCount > 0 && lostCount > 0) status = 'mixed';
        
        roundRecap.push({ id: id, name: p.name, emoji: p.emoji, bet: bet, status: status, drinks: { gorgees: addGorgees, demi: addDemi, culSec: addCulSec } });
        
        if (gaveGorgees > 0 || gaveDemi > 0 || gaveCulSec > 0) {
            dealerDrinksFrom.push({ name: p.name, emoji: p.emoji, gorgees: gaveGorgees, demi: gaveDemi, culSec: gaveCulSec });
        }
        
        updates['players/' + id + '/status'] = status;
        updates['players/' + id + '/handResults'] = JSON.stringify(handResults);
        updates['players/' + id + '/totalGorgees'] = (p.totalGorgees || 0) + addGorgees;
        updates['players/' + id + '/totalDemi'] = (p.totalDemi || 0) + addDemi;
        updates['players/' + id + '/totalCulSec'] = (p.totalCulSec || 0) + addCulSec;
        updates['players/' + id + '/doubledHidden'] = '{}';
    });
    
    var dealer = localState.players[localState.dealer];
    if (dealer) {
        updates['players/' + localState.dealer + '/totalGorgees'] = (dealer.totalGorgees || 0) + dealerGorgees;
        updates['players/' + localState.dealer + '/totalDemi'] = (dealer.totalDemi || 0) + dealerDemi;
        updates['players/' + localState.dealer + '/totalCulSec'] = (dealer.totalCulSec || 0) + dealerCulSec;
    }
    
    updates['roundRecap'] = JSON.stringify(roundRecap);
    updates['dealerDrinksFrom'] = JSON.stringify(dealerDrinksFrom);
    updates['dealerRoundDrinks'] = JSON.stringify({ gorgees: dealerGorgees, demi: dealerDemi, culSec: dealerCulSec });
    updates['status'] = 'results';
    updates['currentPlayer'] = 'done';
    updates['dealerHand'] = JSON.stringify(dealerHand);
    updates['updated'] = Date.now();
    
    gameRef.update(updates);
}

// ========== RESULTS ==========
function updateResults() {
    if (currentScreen !== 'screen-results') {
        showScreen('screen-results');
        if (!resultShown) {
            resultShown = true;
            var me = localState.players ? localState.players[myId] : null;
            if (me && me.status !== 'spectating') showMyResult();
        }
    }
    
    var roundRecap = JSON.parse(localState.roundRecap || '[]');
    var dealer = localState.players ? localState.players[localState.dealer] : null;
    
    var recapHtml = roundRecap.map(function(r) {
        var betText = r.bet.type === 'culsec' ? (r.bet.doubled ? '2 cul sec' : '1 cul sec') : r.bet.type === 'demi' ? '½ cul sec' : r.bet.amount + ' gorgées';
        var resultText = '', resultClass = '';
        if (r.status === 'won') { resultText = '✅ Gagne'; resultClass = 'won'; }
        else if (r.status === 'lost') { resultText = '❌ Perd'; resultClass = 'lost'; }
        else if (r.status === 'mixed') { resultText = '🔀 Mix'; resultClass = 'push'; }
        else { resultText = '🤝 Égalité'; resultClass = 'push'; }
        
        return '<div class="round-recap-item"><span class="avatar">' + r.emoji + '</span><span class="name">' + r.name + '</span><span class="bet">' + betText + '</span><span class="result ' + resultClass + '">' + resultText + '</span></div>';
    }).join('');
    
    if (dealer) {
        var dealerHand = JSON.parse(localState.dealerHand || '[]');
        var dealerScore = calcScore(dealerHand);
        recapHtml += '<div class="round-recap-item dealer"><span class="avatar">' + dealer.emoji + '</span><span class="name">' + dealer.name + '</span><span class="bet">🎰 Banque</span><span class="result">' + dealerScore + (dealerScore > 21 ? ' 💥' : '') + '</span></div>';
    }
    
    document.getElementById('round-recap').innerHTML = recapHtml;
    
    var dealerDrinksFrom = JSON.parse(localState.dealerDrinksFrom || '[]');
    var dealerRoundDrinks = JSON.parse(localState.dealerRoundDrinks || '{}');
    
    var drinksHtml = '<div class="round-drinks-title">🍺 Ce tour, qui boit ?</div>';
    var anyoneDrinks = false;
    
    roundRecap.forEach(function(r) {
        if (r.drinks.gorgees > 0 || r.drinks.demi > 0 || r.drinks.culSec > 0) {
            anyoneDrinks = true;
            drinksHtml += '<div class="round-drinks-item"><span class="avatar">' + r.emoji + '</span><span class="name">' + r.name + '</span><span class="drinks">' + formatRoundDrinks(r.drinks) + '</span></div>';
        }
    });
    
    if (dealer && (dealerRoundDrinks.gorgees > 0 || dealerRoundDrinks.demi > 0 || dealerRoundDrinks.culSec > 0)) {
        anyoneDrinks = true;
        var detailText = dealerDrinksFrom.map(function(d) {
            if (d.gorgees > 0) return d.gorgees + ' de ' + d.name;
            if (d.demi > 0) return '½ de ' + d.name;
            if (d.culSec > 0) return d.culSec + ' cul sec de ' + d.name;
            return '';
        }).join(', ');
        
        drinksHtml += '<div class="round-drinks-item"><span class="avatar">' + dealer.emoji + '</span><span class="name">' + dealer.name + ' (Banque)</span><span class="drinks">' + formatRoundDrinks(dealerRoundDrinks) + '</span></div>';
        if (detailText) drinksHtml += '<div class="round-drinks-detail">(' + detailText + ')</div>';
    }
    
    if (!anyoneDrinks) drinksHtml += '<div class="round-drinks-item"><span style="flex:1;text-align:center;color:var(--success);">Personne ne boit ! 🎉</span></div>';
    
    document.getElementById('round-drinks').innerHTML = drinksHtml;
    
    var players = [];
    if (localState.players) {
        Object.keys(localState.players).forEach(function(id) {
            var p = localState.players[id];
            if (p && p.id && p.name) players.push(p);
        });
    }
    
    var sorted = players.slice().sort(function(a, b) { 
        var scoreA = (a.totalGorgees || 0) + (a.totalDemi || 0) * GORGEES_PAR_DEMI + (a.totalCulSec || 0) * GORGEES_PAR_CULSEC;
        var scoreB = (b.totalGorgees || 0) + (b.totalDemi || 0) * GORGEES_PAR_DEMI + (b.totalCulSec || 0) * GORGEES_PAR_CULSEC;
        return scoreB - scoreA;
    });
    
    document.getElementById('scoreboard').innerHTML = sorted.map(function(p, i) {
        var rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1);
        var totalScore = (p.totalGorgees || 0) + (p.totalDemi || 0) * GORGEES_PAR_DEMI + (p.totalCulSec || 0) * GORGEES_PAR_CULSEC;
        return '<div class="score-item ' + (i===0?'first':'') + '"><span class="rank">' + rank + '</span><span class="avatar">' + p.emoji + '</span><div class="info"><div class="name">' + p.name + (p.id===localState.dealer?' (Banque)':'') + '</div><div class="total-score">' + totalScore + ' gorgées</div></div><span class="drinks">' + formatDrinks(p) + '</span></div>';
    }).join('');
    
    document.getElementById('btn-next-round').style.display = isHost ? 'block' : 'none';
}

function formatRoundDrinks(d) {
    var gorgees = d.gorgees || 0, demi = d.demi || 0, culSec = d.culSec || 0;
    while (demi >= 2) { demi -= 2; culSec += 1; }
    var parts = [];
    if (gorgees > 0) parts.push(gorgees + ' 🍺');
    if (demi > 0) parts.push(demi + ' ½');
    if (culSec > 0) parts.push(culSec + ' 🍻');
    return parts.length > 0 ? parts.join(' + ') : '0';
}

function formatDrinks(p) {
    var gorgees = p.totalGorgees || 0, demi = p.totalDemi || 0, culSec = p.totalCulSec || 0;
    while (demi >= 2) { demi -= 2; culSec += 1; }
    var parts = [];
    if (gorgees > 0) parts.push(gorgees + ' 🍺');
    if (demi > 0) parts.push(demi + ' ½');
    if (culSec > 0) parts.push(culSec + ' 🍻');
    return parts.length > 0 ? parts.join(' + ') : '0';
}

function showMyResult() {
    var me = localState.players ? localState.players[myId] : null;
    if (!me || me.id === localState.dealer || me.status === 'spectating') return;
    
    var hands = JSON.parse(me.hands || '[[]]');
    var handResults = JSON.parse(me.handResults || '[]');
    var bet = JSON.parse(me.bet || '{}');
    
    var wonCount = handResults.filter(function(r) { return r === 'won'; }).length;
    var lostCount = handResults.filter(function(r) { return r === 'lost'; }).length;
    var totalHands = hands.length;
    var culSecMultiplier = bet.doubled ? 2 : 1;
    
    var icon, title, drinkText, drinkClass = '';
    
    if (me.status === 'won') {
        icon = '🎉'; title = totalHands > 1 ? 'Tu as gagné ' + wonCount + '/' + totalHands + ' mains !' : 'Tu as gagné !';
        drinkText = 'Safe !'; drinkClass = 'safe';
    } else if (me.status === 'mixed') {
        icon = '😬'; title = 'Mix : ' + wonCount + ' gagné, ' + lostCount + ' perdu';
        if (bet.type === 'culsec') drinkText = (lostCount * culSecMultiplier) + ' 🍻 CUL SEC !';
        else if (bet.type === 'demi') drinkText = lostCount + ' ½ CUL SEC !';
        else drinkText = '+' + (lostCount * bet.amount) + ' gorgées';
    } else if (me.status === 'lost') {
        icon = '😅'; title = totalHands > 1 ? 'Perdu ' + lostCount + '/' + totalHands + ' mains...' : 'Perdu...';
        if (bet.type === 'culsec') drinkText = (lostCount * culSecMultiplier) + ' 🍻 CUL SEC !';
        else if (bet.type === 'demi') drinkText = lostCount + ' ½ CUL SEC !';
        else drinkText = '+' + (lostCount * bet.amount) + ' gorgées';
    } else {
        icon = '🤝'; title = 'Égalité !'; drinkText = 'Safe !'; drinkClass = 'safe';
    }
    
    document.getElementById('result-icon').textContent = icon;
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-subtitle').textContent = totalHands > 1 ? hands.map(function(h, i) { return 'M' + (i+1) + ': ' + calcScore(h); }).join(' | ') : 'Score: ' + calcScore(hands[0]);
    document.getElementById('result-drinks').textContent = drinkText;
    document.getElementById('result-drinks').className = 'result-drinks ' + drinkClass;
    document.getElementById('result-overlay').style.display = 'flex';
}

function closeResultOverlay() {
    document.getElementById('result-overlay').style.display = 'none';
}

// ========== NEXT ROUND ==========
function nextRound() {
    if (!isHost) return;
    
    resultShown = false;
    var deck = JSON.parse(localState.deck || '[]');
    var currentDealer = localState.dealer;
    var newDealer = currentDealer;
    
    var players = [];
    Object.keys(localState.players).forEach(function(id) {
        var p = localState.players[id];
        if (p && p.id && p.name) players.push(p);
    });
    
    var updates = {};
    
    if (deck.length < 15) {
        deck = createDeck();
        var currentIdx = players.findIndex(function(p) { return p.id === currentDealer; });
        var nextIdx = (currentIdx + 1) % players.length;
        newDealer = players[nextIdx].id;
        if (newDealer === currentDealer && players.length > 1) {
            nextIdx = (nextIdx + 1) % players.length;
            newDealer = players[nextIdx].id;
        }
        toast('Nouveau paquet ! Nouveau croupier ! 🎲', 'info');
    }
    
    var newOrder = players.filter(function(p) { return p.id !== newDealer; }).map(function(p) { return p.id; });
    
    updates['status'] = 'betting';
    updates['deck'] = JSON.stringify(deck);
    updates['dealer'] = newDealer;
    updates['playerOrder'] = JSON.stringify(newOrder);
    updates['activePlayerOrder'] = '';
    updates['dealerHand'] = '';
    updates['currentPlayer'] = '';
    updates['round'] = (localState.round || 1) + 1;
    updates['updated'] = Date.now();
    
    players.forEach(function(p) {
        updates['players/' + p.id + '/hands'] = '';
        updates['players/' + p.id + '/activeHand'] = 0;
        updates['players/' + p.id + '/handResults'] = '';
        updates['players/' + p.id + '/bet'] = '';
        updates['players/' + p.id + '/status'] = 'waiting';
        updates['players/' + p.id + '/actionDone'] = null;
        updates['players/' + p.id + '/doubledHidden'] = '';
    });
    
    gameRef.update(updates);
}

function showFinalScores() {
    document.getElementById('results-title').textContent = '🏆 Scores finaux !';
    document.getElementById('btn-next-round').style.display = 'none';
}

init();

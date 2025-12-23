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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ========== CONFIG ==========
const EMOJIS = ['😎', '🤠', '🥳', '😈', '🤩', '🧐', '🤪', '😏', '🦊', '🐸', '🦄', '👻', '🎃', '🤑', '🥴'];
const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

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
let unsubscribers = [];

// ========== INIT ==========
function init() {
    renderEmojiPicker('create-emoji-picker');
    renderEmojiPicker('join-emoji-picker');
    
    document.getElementById('join-code').addEventListener('input', function() {
        this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    
    console.log('✅ Firebase initialisé');
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
    
    // Créer la room
    gameRef.set({
        code: roomCode,
        host: myId,
        status: 'lobby',
        round: 0,
        deck: '',
        dealer: '',
        dealerHand: '',
        currentPlayer: '',
        playerOrder: '',
        created: ts,
        updated: ts
    }).then(function() {
        // Ajouter le joueur
        return playersRef.child(myId).set({
            id: myId,
            name: myName,
            emoji: myEmoji,
            isHost: true,
            bet: '',
            hand: '',
            status: 'waiting',
            totalGorgees: 0,
            totalDemi: 0,
            totalCulSec: 0,
            joined: ts
        });
    }).then(function() {
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
    
    // Vérifier si la room existe
    gameRef.once('value').then(function(snapshot) {
        var data = snapshot.val();
        
        if (!data) {
            hideLoading();
            toast('Partie introuvable !', 'error');
            return;
        }
        
        if (data.status !== 'lobby') {
            hideLoading();
            toast('Partie déjà en cours !', 'error');
            return;
        }
        
        // Rejoindre
        return playersRef.child(myId).set({
            id: myId,
            name: myName,
            emoji: myEmoji,
            isHost: false,
            bet: '',
            hand: '',
            status: 'waiting',
            totalGorgees: 0,
            totalDemi: 0,
            totalCulSec: 0,
            joined: Date.now()
        });
    }).then(function() {
        subscribeToGame();
        hideLoading();
        document.getElementById('lobby-code').textContent = roomCode;
        showScreen('screen-lobby');
        toast('Tu as rejoint ! 🎉', 'success');
    }).catch(function(err) {
        hideLoading();
        toast('Erreur: ' + err.message, 'error');
    });
}

function copyCode() {
    navigator.clipboard.writeText(roomCode).catch(function() {});
    toast('Code copié !', 'success');
}

// ========== SUBSCRIBE ==========
function subscribeToGame() {
    // Écouter les changements du jeu
    gameRef.on('value', function(snapshot) {
        var data = snapshot.val();
        if (!data) return;
        
        // Mettre à jour localState (sauf players)
        Object.keys(data).forEach(function(k) {
            if (k !== 'players') localState[k] = data[k];
        });
        
        // Mettre à jour players
        if (data.players) {
            localState.players = data.players;
        }
        
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
        status: 'betting',
        deck: JSON.stringify(deck),
        dealer: randomDealer,
        playerOrder: JSON.stringify(order),
        round: 1,
        dealerHand: '',
        currentPlayer: '',
        updated: Date.now()
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
    // Mélanger
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
    
    var dealer = null;
    if (localState.players && localState.dealer) {
        dealer = localState.players[localState.dealer];
    }
    document.getElementById('bet-dealer-info').textContent = 'Banquier: ' + (dealer ? dealer.emoji : '?') + ' ' + (dealer ? dealer.name : '???');
    
    var amIDealer = localState.dealer === myId;
    var betOptions = document.getElementById('bet-options');
    var confirmBtn = document.getElementById('btn-confirm-bet');
    
    if (amIDealer) {
        betOptions.innerHTML = '<div style="text-align:center; padding:1.5rem; grid-column:span 3;">' +
            '<div style="font-size:2.5rem;">🎩</div>' +
            '<div>Tu es la BANQUE !</div>' +
            '<div style="color:var(--text-muted); font-size:0.8rem;">Attends les mises...</div>' +
        '</div>';
        confirmBtn.style.display = 'none';
    } else {
        renderBetOptions();
        confirmBtn.style.display = 'block';
        var me = localState.players ? localState.players[myId] : null;
        confirmBtn.disabled = me && me.status === 'ready';
        document.getElementById('bet-waiting').style.display = (me && me.status === 'ready') ? 'block' : 'none';
    }
    
    if (isHost) setTimeout(checkAllBets, 500);
}

function renderBetOptions() {
    var html = '<div class="bet-custom">' +
        '<label>Nombre de gorgées</label>' +
        '<div class="bet-input-row">' +
            '<button class="btn-adjust" onclick="adjustBet(-1)">−</button>' +
            '<input type="number" id="bet-amount-input" min="1" max="50" value="' + selectedBet.amount + '" onchange="updateBetAmount(this.value)">' +
            '<button class="btn-adjust" onclick="adjustBet(1)">+</button>' +
        '</div>' +
    '</div>' +
    '<div class="bet-specials">' +
        '<div class="bet-option demi ' + (selectedBet.type==='demi'?'selected':'') + '" onclick="selectBetType(\'demi\')">' +
            '<span class="number">½</span><span class="label">cul sec</span>' +
        '</div>' +
        '<div class="bet-option special ' + (selectedBet.type==='culsec'?'selected':'') + '" onclick="selectBetType(\'culsec\')">' +
            '<span class="number">🍺</span><span class="label">cul sec</span>' +
        '</div>' +
    '</div>';
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
    playersRef.child(myId).update({
        bet: JSON.stringify(selectedBet),
        status: 'ready'
    });
    toast('Mise enregistrée !', 'success');
}

function checkAllBets() {
    if (!isHost || localState.status !== 'betting') return;
    
    var order = JSON.parse(localState.playerOrder || '[]');
    if (order.length === 0) return;
    
    var allReady = order.every(function(id) {
        return localState.players && localState.players[id] && localState.players[id].status === 'ready';
    });
    
    if (allReady) startDealing();
}

// ========== DEALING ==========
function startDealing() {
    if (!isHost) return;
    
    var deck = JSON.parse(localState.deck || '[]');
    var order = JSON.parse(localState.playerOrder || '[]');
    
    var updates = {};
    
    order.forEach(function(id) {
        var hand = [deck.pop(), deck.pop()];
        updates['players/' + id + '/hand'] = JSON.stringify(hand);
        updates['players/' + id + '/status'] = 'playing';
    });
    
    var dealerHand = [deck.pop(), deck.pop()];
    
    updates['status'] = 'playing';
    updates['deck'] = JSON.stringify(deck);
    updates['dealerHand'] = JSON.stringify(dealerHand);
    updates['currentPlayer'] = order[0];
    updates['updated'] = Date.now();
    
    gameRef.update(updates);
}

// ========== GAME ==========
function updateGame() {
    if (currentScreen !== 'screen-game') showScreen('screen-game');
    
    var deck = JSON.parse(localState.deck || '[]');
    var dealerHand = JSON.parse(localState.dealerHand || '[]');
    var order = JSON.parse(localState.playerOrder || '[]');
    var currentPlayer = localState.currentPlayer;
    var isMyTurn = currentPlayer === myId;
    var amIDealer = localState.dealer === myId;
    var isDealerTurn = currentPlayer === 'dealer';
    var isReveal = currentPlayer === 'reveal';
    var gameEnded = currentPlayer === 'done';
    
    document.getElementById('game-deck-count').textContent = deck.length;
    document.getElementById('game-round-info').textContent = 'Tour ' + (localState.round || 1);
    
    var dealer = localState.players ? localState.players[localState.dealer] : null;
    document.getElementById('game-dealer-name').textContent = (dealer ? dealer.emoji : '?') + ' ' + (dealer ? dealer.name : '???');
    
    var dealerRevealed = isDealerTurn || isReveal || gameEnded;
    
    document.getElementById('dealer-cards').innerHTML = dealerHand.map(function(c, i) {
        if (i === 1 && !dealerRevealed) return '<div class="card hidden"></div>';
        return renderCard(c);
    }).join('');
    
    document.getElementById('dealer-score').textContent = dealerRevealed ? calcScore(dealerHand) : (dealerHand[0] ? getCardValue(dealerHand[0]) : '?');
    
    var myGame = document.getElementById('my-game');
    var me = localState.players ? localState.players[myId] : null;
    
    if (amIDealer) {
        myGame.style.display = 'none';
    } else if (me) {
        myGame.style.display = 'block';
        document.getElementById('my-avatar').textContent = me.emoji;
        document.getElementById('my-name').textContent = me.name;
        
        var bet = JSON.parse(me.bet || '{"amount":2,"type":"normal"}');
        document.getElementById('my-bet').textContent = bet.type === 'culsec' ? '🍺 Cul sec' : bet.type === 'demi' ? '½ cul sec' : bet.amount + ' gorgées';
        
        var myHand = JSON.parse(me.hand || '[]');
        document.getElementById('my-cards').innerHTML = myHand.map(function(c) { return renderCard(c); }).join('');
        document.getElementById('my-score').textContent = calcScore(myHand);
        
        myGame.className = 'my-game';
        if (isMyTurn) myGame.classList.add('active');
        if (me.status === 'won') myGame.classList.add('won');
        if (me.status === 'lost' || me.status === 'bust') myGame.classList.add('lost');
    }
    
    var actionsBar = document.getElementById('actions-bar');
    var gameWaiting = document.getElementById('game-waiting');
    
    // Actions pour le joueur normal
    if (isMyTurn && !gameEnded && !isDealerTurn && !isReveal) {
        actionsBar.style.display = 'grid';
        actionsBar.innerHTML = '<button class="btn btn-success" onclick="playerHit()">🃏 Carte</button>' +
            '<button class="btn btn-secondary" onclick="playerStand()">✋ Stop</button>' +
            '<button class="btn btn-accent" onclick="playerDouble()" id="btn-double">💰 Doubler</button>' +
            '<button class="btn" onclick="playerSplit()" id="btn-split" style="display:none;">✂️ Split</button>';
        var myHand2 = JSON.parse(me ? me.hand || '[]' : '[]');
        document.getElementById('btn-double').style.display = myHand2.length === 2 ? 'block' : 'none';
        gameWaiting.style.display = 'none';
    }
    // Actions pour le dealer (banque)
    else if (isDealerTurn && amIDealer) {
        actionsBar.style.display = 'grid';
        actionsBar.innerHTML = '<button class="btn btn-success" onclick="dealerHit()">🃏 Tirer</button>' +
            '<button class="btn btn-secondary" onclick="dealerStand()">✋ Rester</button>';
        gameWaiting.style.display = 'none';
    }
    // Phase reveal - host valide
    else if (isReveal && isHost) {
        actionsBar.style.display = 'grid';
        actionsBar.innerHTML = '<button class="btn btn-success" onclick="hostValidateResults()" style="grid-column: span 2;">✅ Voir les résultats</button>';
        gameWaiting.style.display = 'none';
    }
    // Attente
    else {
        actionsBar.style.display = 'none';
        gameWaiting.style.display = gameEnded ? 'none' : 'block';
        if (isDealerTurn) {
            document.getElementById('waiting-player').textContent = (dealer ? dealer.name : '???') + ' (Banque)';
        } else if (isReveal) {
            document.getElementById('waiting-player').textContent = 'validation...';
        } else {
            var waitingP = localState.players ? localState.players[currentPlayer] : null;
            document.getElementById('waiting-player').textContent = waitingP ? waitingP.name : '???';
        }
    }
    
    // Other players
    var others = order.filter(function(id) { return id !== myId; }).map(function(id) { 
        return localState.players ? localState.players[id] : null; 
    }).filter(function(p) { return p; });
    
    document.getElementById('other-players').innerHTML = others.map(function(p) {
        var hand = JSON.parse(p.hand || '[]');
        var cls = p.id === currentPlayer ? 'active' : '';
        if (p.status === 'won') cls = 'won';
        if (p.status === 'lost' || p.status === 'bust') cls = 'lost';
        return '<div class="other-player ' + cls + '">' +
            '<div class="avatar">' + p.emoji + '</div>' +
            '<div>' + p.name + '</div>' +
            '<div class="mini-cards">' + hand.map(function(c) { 
                return '<div class="mini-card" style="color:' + (['♥','♦'].indexOf(c.suit) >= 0 ? '#e63946' : '#1d3557') + '">' + c.value + '</div>'; 
            }).join('') + '</div>' +
            '<div style="font-weight:600;">' + calcScore(hand) + '</div>' +
        '</div>';
    }).join('');
}

function renderCard(c) {
    var red = ['♥','♦'].indexOf(c.suit) >= 0;
    return '<div class="card ' + (red ? 'red' : 'black') + '">' +
        '<span class="card-value">' + c.value + '</span>' +
        '<span class="card-suit">' + c.suit + '</span>' +
    '</div>';
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
function playerHit() {
    var deck = JSON.parse(localState.deck || '[]');
    var me = localState.players[myId];
    var hand = JSON.parse(me ? me.hand || '[]' : '[]');
    
    hand.push(deck.pop());
    var score = calcScore(hand);
    
    var updates = {
        deck: JSON.stringify(deck),
        updated: Date.now()
    };
    updates['players/' + myId + '/hand'] = JSON.stringify(hand);
    
    if (score > 21) {
        updates['players/' + myId + '/status'] = 'bust';
        gameRef.update(updates).then(function() {
            toast('Brûlé ! 💥', 'error');
            setTimeout(signalNext, 800);
        });
    } else if (score === 21) {
        gameRef.update(updates).then(function() {
            toast('21 ! 🎯', 'success');
            setTimeout(signalNext, 500);
        });
    } else {
        gameRef.update(updates);
    }
}

function playerStand() {
    toast('Tu restes', 'info');
    signalNext();
}

function playerDouble() {
    var deck = JSON.parse(localState.deck || '[]');
    var me = localState.players[myId];
    var hand = JSON.parse(me ? me.hand || '[]' : '[]');
    var bet = JSON.parse(me ? me.bet || '{"amount":2}' : '{"amount":2}');
    
    bet.amount *= 2;
    hand.push(deck.pop());
    var score = calcScore(hand);
    
    var updates = {
        deck: JSON.stringify(deck),
        updated: Date.now()
    };
    updates['players/' + myId + '/hand'] = JSON.stringify(hand);
    updates['players/' + myId + '/bet'] = JSON.stringify(bet);
    updates['players/' + myId + '/status'] = score > 21 ? 'bust' : 'playing';
    
    gameRef.update(updates).then(function() {
        toast('Doublé ! 💰', 'info');
        setTimeout(signalNext, 800);
    });
}

function playerSplit() {
    toast('Split pas encore dispo !', 'info');
}

function signalNext() {
    if (isHost) {
        moveNext();
    } else {
        playersRef.child(myId).update({ actionDone: Date.now() });
    }
}

function moveNext() {
    var order = JSON.parse(localState.playerOrder || '[]');
    var idx = order.indexOf(localState.currentPlayer);
    
    if (idx < order.length - 1) {
        gameRef.update({ currentPlayer: order[idx + 1], updated: Date.now() });
    } else {
        gameRef.update({ currentPlayer: 'dealer', updated: Date.now() });
    }
}

// Host: surveiller les signaux des joueurs
setInterval(function() {
    if (!isHost || !localState || localState.status !== 'playing') return;
    if (!localState.currentPlayer || localState.currentPlayer === 'dealer' || localState.currentPlayer === 'done') return;
    
    var player = localState.players ? localState.players[localState.currentPlayer] : null;
    if (player && (player.status === 'bust' || player.actionDone)) {
        moveNext();
    }
}, 500);

// ========== DEALER MANUAL PLAY ==========
function dealerHit() {
    var amIDealer = localState.dealer === myId;
    if (!amIDealer) return;
    
    var deck = JSON.parse(localState.deck || '[]');
    var dealerHand = JSON.parse(localState.dealerHand || '[]');
    
    dealerHand.push(deck.pop());
    var score = calcScore(dealerHand);
    
    var updates = {
        deck: JSON.stringify(deck),
        dealerHand: JSON.stringify(dealerHand),
        updated: Date.now()
    };
    
    if (score > 21) {
        updates['currentPlayer'] = 'reveal';
        gameRef.update(updates).then(function() {
            toast('Banque brûlée ! 💥', 'error');
        });
    } else if (score === 21) {
        updates['currentPlayer'] = 'reveal';
        gameRef.update(updates).then(function() {
            toast('Banque à 21 ! 🎯', 'success');
        });
    } else {
        gameRef.update(updates);
    }
}

function dealerStand() {
    var amIDealer = localState.dealer === myId;
    if (!amIDealer) return;
    
    gameRef.update({
        currentPlayer: 'reveal',
        updated: Date.now()
    });
    toast('Banque reste', 'info');
}

function hostValidateResults() {
    if (!isHost) return;
    var dealerHand = JSON.parse(localState.dealerHand || '[]');
    calculateResults(dealerHand);
}

function calculateResults(dealerHand) {
    if (!isHost) return;
    
    var dealerScore = calcScore(dealerHand);
    var dealerBust = dealerScore > 21;
    var order = JSON.parse(localState.playerOrder || '[]');
    var dealerGorgees = 0, dealerDemi = 0, dealerCulSec = 0;
    
    var updates = {};
    
    order.forEach(function(id) {
        var p = localState.players[id];
        var hand = JSON.parse(p.hand || '[]');
        var score = calcScore(hand);
        var bet = JSON.parse(p.bet || '{"amount":2,"type":"normal"}');
        var bust = p.status === 'bust' || score > 21;
        
        var status = 'push';
        var addGorgees = 0, addDemi = 0, addCulSec = 0;
        
        if (bust) {
            status = 'lost';
            if (bet.type === 'culsec') addCulSec = 1;
            else if (bet.type === 'demi') addDemi = 1;
            else addGorgees = bet.amount;
        } else if (dealerBust || score > dealerScore) {
            status = 'won';
            if (bet.type === 'culsec') dealerCulSec += 1;
            else if (bet.type === 'demi') dealerDemi += 1;
            else dealerGorgees += bet.amount;
        } else if (score < dealerScore) {
            status = 'lost';
            if (bet.type === 'culsec') addCulSec = 1;
            else if (bet.type === 'demi') addDemi = 1;
            else addGorgees = bet.amount;
        }
        
        updates['players/' + id + '/status'] = status;
        updates['players/' + id + '/totalGorgees'] = (p.totalGorgees || 0) + addGorgees;
        updates['players/' + id + '/totalDemi'] = (p.totalDemi || 0) + addDemi;
        updates['players/' + id + '/totalCulSec'] = (p.totalCulSec || 0) + addCulSec;
    });
    
    var dealer = localState.players[localState.dealer];
    updates['players/' + localState.dealer + '/totalGorgees'] = (dealer ? dealer.totalGorgees || 0 : 0) + dealerGorgees;
    updates['players/' + localState.dealer + '/totalDemi'] = (dealer ? dealer.totalDemi || 0 : 0) + dealerDemi;
    updates['players/' + localState.dealer + '/totalCulSec'] = (dealer ? dealer.totalCulSec || 0 : 0) + dealerCulSec;
    
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
            showMyResult();
        }
    }
    
    var players = [];
    if (localState.players) {
        Object.keys(localState.players).forEach(function(id) {
            var p = localState.players[id];
            if (p && p.id && p.name) players.push(p);
        });
    }
    
    var sorted = players.slice().sort(function(a, b) { 
        var scoreA = (a.totalGorgees || 0) + (a.totalDemi || 0) * 5 + (a.totalCulSec || 0) * 10;
        var scoreB = (b.totalGorgees || 0) + (b.totalDemi || 0) * 5 + (b.totalCulSec || 0) * 10;
        return scoreB - scoreA;
    });
    
    document.getElementById('scoreboard').innerHTML = sorted.map(function(p, i) {
        var rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1);
        var drinks = formatDrinks(p);
        return '<div class="score-item ' + (i===0?'first':'') + '">' +
            '<span class="rank">' + rank + '</span>' +
            '<span class="avatar">' + p.emoji + '</span>' +
            '<div class="info"><div class="name">' + p.name + (p.id===localState.dealer?' (Banque)':'') + '</div></div>' +
            '<span class="drinks">' + drinks + '</span>' +
        '</div>';
    }).join('');
    
    document.getElementById('btn-next-round').style.display = isHost ? 'block' : 'none';
}

function formatDrinks(p) {
    var parts = [];
    if (p.totalGorgees > 0) parts.push(p.totalGorgees + ' 🍺');
    if (p.totalDemi > 0) parts.push(p.totalDemi + ' ½');
    if (p.totalCulSec > 0) parts.push(p.totalCulSec + ' 🍻');
    return parts.length > 0 ? parts.join(' + ') : '0';
}

function showMyResult() {
    var me = localState.players ? localState.players[myId] : null;
    if (!me || me.id === localState.dealer) return;
    
    var hand = JSON.parse(me.hand || '[]');
    var score = calcScore(hand);
    var bet = JSON.parse(me.bet || '{}');
    
    var icon, title, drinkText, drinkClass = '';
    
    if (me.status === 'won') {
        icon = '🎉';
        title = 'Tu as gagné !';
        drinkText = 'Safe !';
        drinkClass = 'safe';
    } else if (me.status === 'lost' || me.status === 'bust') {
        icon = '😅';
        title = me.status === 'bust' ? 'Brûlé !' : 'Perdu...';
        if (bet.type === 'culsec') drinkText = '🍻 CUL SEC !';
        else if (bet.type === 'demi') drinkText = '½ CUL SEC !';
        else drinkText = '+' + bet.amount + ' gorgées';
    } else {
        icon = '🤝';
        title = 'Égalité !';
        drinkText = 'Safe !';
        drinkClass = 'safe';
    }
    
    document.getElementById('result-icon').textContent = icon;
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-subtitle').textContent = 'Score: ' + score;
    document.getElementById('result-drinks').textContent = drinkText;
    document.getElementById('result-drinks').className = 'result-drinks ' + drinkClass;
    document.getElementById('result-overlay').style.display = 'flex';
}

function closeResultOverlay() {
    document.getElementById('result-overlay').style.display = 'none';
}

function nextRound() {
    if (!isHost) return;
    
    resultShown = false;
    var deck = JSON.parse(localState.deck || '[]');
    var newDealer = localState.dealer;
    var newOrder = JSON.parse(localState.playerOrder || '[]');
    
    if (deck.length < 15) {
        deck = createDeck();
        var players = [];
        Object.keys(localState.players).forEach(function(id) {
            var p = localState.players[id];
            if (p && p.id && p.name) players.push(p);
        });
        newDealer = players[Math.floor(Math.random() * players.length)].id;
        newOrder = players.filter(function(p) { return p.id !== newDealer; }).map(function(p) { return p.id; });
        toast('Nouveau paquet ! 🎲', 'info');
    }
    
    var updates = {
        status: 'betting',
        deck: JSON.stringify(deck),
        dealer: newDealer,
        playerOrder: JSON.stringify(newOrder),
        dealerHand: '',
        currentPlayer: '',
        round: (localState.round || 1) + 1,
        updated: Date.now()
    };
    
    newOrder.concat([newDealer]).forEach(function(id) {
        updates['players/' + id + '/hand'] = '';
        updates['players/' + id + '/bet'] = '';
        updates['players/' + id + '/status'] = 'waiting';
        updates['players/' + id + '/actionDone'] = null;
    });
    
    gameRef.update(updates);
}

function showFinalScores() {
    document.getElementById('results-title').textContent = '🏆 Scores finaux !';
    document.getElementById('btn-next-round').style.display = 'none';
}

// ========== START ==========
init();

// ========== CONFIG ==========
const EMOJIS = ['😎', '🤠', '🥳', '😈', '🤩', '🧐', '🤪', '😏', '🦊', '🐸', '🦄', '👻', '🎃', '🤑', '🥴'];
const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const ROOM_PREFIX = 'bjt5_'; // Préfixe unique v5

// ========== STATE ==========
let gun, gameRef, playersRef;
let myId = localStorage.getItem('bjt_myId') || ('p' + Math.random().toString(36).substr(2, 8));
localStorage.setItem('bjt_myId', myId);

let myName = '', myEmoji = '', roomCode = '', isHost = false;
let selectedBet = { amount: 2, type: 'normal' };
let localState = { players: {} };
let currentScreen = 'screen-home';
let resultShown = false;

// ========== INIT ==========
function init() {
    gun = Gun({ 
        peers: ['https://gun-manhattan.herokuapp.com/gun'],
        localStorage: true
    });
    
    renderEmojiPicker('create-emoji-picker');
    renderEmojiPicker('join-emoji-picker');
    
    document.getElementById('join-code').addEventListener('input', function() {
        this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
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
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    currentScreen = id;
}

function toast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast ' + (type || 'info') + ' show';
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ========== EMOJI ==========
function renderEmojiPicker(containerId) {
    document.getElementById(containerId).innerHTML = EMOJIS.map(e => 
        '<div class="emoji-option" onclick="selectEmoji(\'' + containerId + '\', \'' + e + '\')">' + e + '</div>'
    ).join('');
}

function selectEmoji(containerId, emoji) {
    document.querySelectorAll('#' + containerId + ' .emoji-option').forEach(el => {
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
    
    gameRef = gun.get(ROOM_PREFIX + roomCode);
    playersRef = gameRef.get('players');
    
    const ts = Date.now();
    gameRef.put({ 
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
    });
    
    playersRef.get(myId).put({ 
        id: myId, 
        name: myName, 
        emoji: myEmoji, 
        isHost: true, 
        bet: '', 
        hand: '', 
        status: 'waiting', 
        totalDrinks: 0, 
        joined: ts 
    });
    
    subscribeToGame();
    
    setTimeout(function() { 
        hideLoading(); 
        document.getElementById('lobby-code').textContent = roomCode; 
        showScreen('screen-lobby'); 
        toast('Partie créée ! 🎉', 'success'); 
    }, 500);
}

// ========== JOIN ROOM ==========
function joinRoom() {
    var code = document.getElementById('join-code').value.trim().toUpperCase();
    myName = document.getElementById('join-name').value.trim();
    
    if (!code || code.length !== 4) return toast('Code invalide !', 'error');
    if (!myName) return toast('Entre ton pseudo !', 'error');
    if (!myEmoji) return toast('Choisis un emoji !', 'error');
    
    showLoading('Recherche de la partie...');
    roomCode = code;
    isHost = false;
    
    gameRef = gun.get(ROOM_PREFIX + roomCode);
    playersRef = gameRef.get('players');
    
    var attempts = 0;
    var maxAttempts = 12;
    
    function tryFind() {
        attempts++;
        console.log('Tentative ' + attempts + ' pour ' + roomCode);
        
        gameRef.once(function(data) {
            console.log('Data reçue:', data);
            
            if (data && data.code === roomCode) {
                if (data.status !== 'lobby') { 
                    hideLoading(); 
                    toast('Partie déjà en cours !', 'error'); 
                    return; 
                }
                
                playersRef.get(myId).put({ 
                    id: myId, 
                    name: myName, 
                    emoji: myEmoji, 
                    isHost: false, 
                    bet: '', 
                    hand: '', 
                    status: 'waiting', 
                    totalDrinks: 0, 
                    joined: Date.now() 
                });
                
                subscribeToGame();
                
                setTimeout(function() { 
                    hideLoading(); 
                    document.getElementById('lobby-code').textContent = roomCode; 
                    showScreen('screen-lobby'); 
                    toast('Tu as rejoint ! 🎉', 'success'); 
                }, 300);
                
            } else if (attempts < maxAttempts) {
                setTimeout(tryFind, 500);
            } else {
                hideLoading(); 
                toast('Partie introuvable ! Vérifie le code.', 'error');
            }
        });
    }
    
    tryFind();
}

function copyCode() {
    navigator.clipboard.writeText(roomCode).catch(function() {});
    toast('Code copié !', 'success');
}

// ========== SUBSCRIBE ==========
function subscribeToGame() {
    gameRef.on(function(data, key) {
        if (!data || key === 'players') return;
        Object.keys(data).forEach(function(k) { 
            if (k !== '_' && k !== 'players') localState[k] = data[k]; 
        });
        handleStateUpdate();
    });
    
    playersRef.map().on(function(player, id) {
        if (!player || !id || id === '_') return;
        localState.players[id] = Object.assign({}, localState.players[id] || {}, player);
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
    
    var players = Object.values(localState.players || {}).filter(function(p) { return p && p.id && p.name; });
    
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
    var players = Object.values(localState.players).filter(function(p) { return p && p.id && p.name; });
    var randomDealer = players[Math.floor(Math.random() * players.length)].id;
    var order = players.filter(function(p) { return p.id !== randomDealer; }).map(function(p) { return p.id; });
    
    gameRef.put({ 
        status: 'betting', 
        deck: JSON.stringify(deck), 
        dealer: randomDealer, 
        playerOrder: JSON.stringify(order), 
        round: 1, 
        dealerHand: '', 
        currentPlayer: '', 
        updated: Date.now() 
    });
    
    setTimeout(function() { 
        hideLoading(); 
        toast('Partie lancée ! 🎲', 'success'); 
    }, 300);
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
    
    var dealer = Object.values(localState.players || {}).find(function(p) { return p.id === localState.dealer; });
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
    document.getElementById('bet-options').innerHTML = 
        '<div class="bet-option ' + (selectedBet.amount===1?'selected':'') + '" onclick="selectBet(1,\'normal\',this)"><span class="number">1</span><span class="label">gorgée</span></div>' +
        '<div class="bet-option ' + (selectedBet.amount===2&&selectedBet.type==='normal'?'selected':'') + '" onclick="selectBet(2,\'normal\',this)"><span class="number">2</span><span class="label">gorgées</span></div>' +
        '<div class="bet-option ' + (selectedBet.amount===3?'selected':'') + '" onclick="selectBet(3,\'normal\',this)"><span class="number">3</span><span class="label">gorgées</span></div>' +
        '<div class="bet-option ' + (selectedBet.amount===5&&selectedBet.type==='normal'?'selected':'') + '" onclick="selectBet(5,\'normal\',this)"><span class="number">5</span><span class="label">gorgées</span></div>' +
        '<div class="bet-option demi ' + (selectedBet.type==='demi'?'selected':'') + '" onclick="selectBet(5,\'demi\',this)"><span class="number">½</span><span class="label">cul sec</span></div>' +
        '<div class="bet-option special ' + (selectedBet.type==='culsec'?'selected':'') + '" onclick="selectBet(10,\'culsec\',this)"><span class="number">🍺</span><span class="label">cul sec</span></div>';
}

function selectBet(amount, type, el) {
    selectedBet = {amount: amount, type: type};
    document.querySelectorAll('.bet-option').forEach(function(e) { e.classList.remove('selected'); });
    el.classList.add('selected');
}

function confirmBet() {
    playersRef.get(myId).put({ bet: JSON.stringify(selectedBet), status: 'ready' });
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
    
    order.forEach(function(id) {
        var hand = [deck.pop(), deck.pop()];
        playersRef.get(id).put({ hand: JSON.stringify(hand), status: 'playing' });
    });
    
    var dealerHand = [deck.pop(), deck.pop()];
    
    gameRef.put({ 
        status: 'playing', 
        deck: JSON.stringify(deck), 
        dealerHand: JSON.stringify(dealerHand), 
        currentPlayer: order[0], 
        updated: Date.now() 
    });
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
    var gameEnded = currentPlayer === 'done';
    
    document.getElementById('game-deck-count').textContent = deck.length;
    document.getElementById('game-round-info').textContent = 'Tour ' + (localState.round || 1);
    
    var dealer = localState.players ? localState.players[localState.dealer] : null;
    document.getElementById('game-dealer-name').textContent = (dealer ? dealer.emoji : '?') + ' ' + (dealer ? dealer.name : '???');
    
    document.getElementById('dealer-cards').innerHTML = dealerHand.map(function(c, i) {
        if (i === 1 && !gameEnded) return '<div class="card hidden"></div>';
        return renderCard(c);
    }).join('');
    
    document.getElementById('dealer-score').textContent = gameEnded ? calcScore(dealerHand) : (dealerHand[0] ? getCardValue(dealerHand[0]) : '?');
    
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
    
    if (isMyTurn && !gameEnded) {
        actionsBar.style.display = 'grid';
        gameWaiting.style.display = 'none';
        var myHand2 = JSON.parse(me ? me.hand || '[]' : '[]');
        document.getElementById('btn-double').style.display = myHand2.length === 2 ? 'block' : 'none';
        document.getElementById('btn-split').style.display = myHand2.length === 2 && getCardValue(myHand2[0]) === getCardValue(myHand2[1]) ? 'block' : 'none';
    } else {
        actionsBar.style.display = 'none';
        gameWaiting.style.display = gameEnded ? 'none' : 'block';
        var waitingP = localState.players ? localState.players[currentPlayer] : null;
        document.getElementById('waiting-player').textContent = currentPlayer === 'dealer' ? 'le croupier' : (waitingP ? waitingP.name : '???');
    }
    
    var others = order.filter(function(id) { return id !== myId; }).map(function(id) { return localState.players ? localState.players[id] : null; }).filter(function(p) { return p; });
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
    var hand = JSON.parse(localState.players[myId] ? localState.players[myId].hand || '[]' : '[]');
    
    hand.push(deck.pop());
    var score = calcScore(hand);
    
    gameRef.put({ deck: JSON.stringify(deck), updated: Date.now() });
    playersRef.get(myId).put({ hand: JSON.stringify(hand) });
    
    if (score > 21) { 
        toast('Brûlé ! 💥', 'error'); 
        playersRef.get(myId).put({ status: 'bust' }); 
        setTimeout(signalNext, 800); 
    } else if (score === 21) { 
        toast('21 ! 🎯', 'success'); 
        setTimeout(signalNext, 500); 
    }
}

function playerStand() { 
    toast('Tu restes', 'info'); 
    signalNext(); 
}

function playerDouble() {
    var deck = JSON.parse(localState.deck || '[]');
    var hand = JSON.parse(localState.players[myId] ? localState.players[myId].hand || '[]' : '[]');
    var bet = JSON.parse(localState.players[myId] ? localState.players[myId].bet || '{"amount":2}' : '{"amount":2}');
    
    bet.amount *= 2;
    hand.push(deck.pop());
    var score = calcScore(hand);
    
    gameRef.put({ deck: JSON.stringify(deck), updated: Date.now() });
    playersRef.get(myId).put({ 
        hand: JSON.stringify(hand), 
        bet: JSON.stringify(bet), 
        status: score > 21 ? 'bust' : 'playing' 
    });
    
    toast('Doublé ! 💰', 'info');
    setTimeout(signalNext, 800);
}

function playerSplit() { 
    toast('Split pas encore dispo !', 'info'); 
}

function signalNext() {
    if (isHost) {
        moveNext();
    } else {
        playersRef.get(myId).put({ actionDone: Date.now() });
    }
}

function moveNext() {
    var order = JSON.parse(localState.playerOrder || '[]');
    var idx = order.indexOf(localState.currentPlayer);
    
    if (idx < order.length - 1) { 
        gameRef.put({ currentPlayer: order[idx + 1], updated: Date.now() }); 
    } else { 
        gameRef.put({ currentPlayer: 'dealer', updated: Date.now() }); 
        setTimeout(dealerPlay, 500); 
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

function dealerPlay() {
    if (!isHost) return;
    
    var deck = JSON.parse(localState.deck || '[]');
    var dealerHand = JSON.parse(localState.dealerHand || '[]');
    
    function draw() {
        var score = calcScore(dealerHand);
        if (score < 17) {
            dealerHand.push(deck.pop());
            gameRef.put({ 
                deck: JSON.stringify(deck), 
                dealerHand: JSON.stringify(dealerHand), 
                updated: Date.now() 
            });
            setTimeout(draw, 800);
        } else { 
            calculateResults(dealerHand); 
        }
    }
    
    setTimeout(draw, 800);
}

function calculateResults(dealerHand) {
    if (!isHost) return;
    
    var dealerScore = calcScore(dealerHand);
    var dealerBust = dealerScore > 21;
    var order = JSON.parse(localState.playerOrder || '[]');
    var dealerDrinks = 0;
    
    order.forEach(function(id) {
        var p = localState.players[id];
        var hand = JSON.parse(p.hand || '[]');
        var score = calcScore(hand);
        var bet = JSON.parse(p.bet || '{"amount":2}');
        var bust = p.status === 'bust' || score > 21;
        
        var status = 'push', drinks = 0;
        
        if (bust) { 
            status = 'lost'; 
            drinks = bet.amount; 
        } else if (dealerBust || score > dealerScore) { 
            status = 'won'; 
            dealerDrinks += bet.amount; 
        } else if (score < dealerScore) { 
            status = 'lost'; 
            drinks = bet.amount; 
        }
        
        playersRef.get(id).put({ 
            status: status, 
            totalDrinks: (p.totalDrinks || 0) + drinks 
        });
    });
    
    var dealer = localState.players[localState.dealer];
    playersRef.get(localState.dealer).put({ 
        totalDrinks: (dealer ? dealer.totalDrinks || 0 : 0) + dealerDrinks 
    });
    
    gameRef.put({ 
        status: 'results', 
        currentPlayer: 'done', 
        dealerHand: JSON.stringify(dealerHand), 
        updated: Date.now() 
    });
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
    
    var players = Object.values(localState.players || {}).filter(function(p) { return p && p.id && p.name; });
    var sorted = players.slice().sort(function(a, b) { return (b.totalDrinks || 0) - (a.totalDrinks || 0); });
    
    document.getElementById('scoreboard').innerHTML = sorted.map(function(p, i) {
        var rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1);
        return '<div class="score-item ' + (i===0?'first':'') + '">' +
            '<span class="rank">' + rank + '</span>' +
            '<span class="avatar">' + p.emoji + '</span>' +
            '<div class="info"><div class="name">' + p.name + (p.id===localState.dealer?' (Banque)':'') + '</div></div>' +
            '<span class="drinks">' + (p.totalDrinks || 0) + ' 🍺</span>' +
        '</div>';
    }).join('');
    
    document.getElementById('btn-next-round').style.display = isHost ? 'block' : 'none';
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
        drinkText = bet.type === 'culsec' ? '🍺 CUL SEC !' : bet.type === 'demi' ? '½ CUL SEC !' : '+' + bet.amount + ' gorgées'; 
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
        var players = Object.values(localState.players).filter(function(p) { return p && p.id && p.name; });
        newDealer = players[Math.floor(Math.random() * players.length)].id;
        newOrder = players.filter(function(p) { return p.id !== newDealer; }).map(function(p) { return p.id; });
        toast('Nouveau paquet ! 🎲', 'info');
    }
    
    newOrder.concat([newDealer]).forEach(function(id) { 
        playersRef.get(id).put({ 
            hand: '', 
            bet: '', 
            status: 'waiting', 
            actionDone: null 
        }); 
    });
    
    gameRef.put({ 
        status: 'betting', 
        deck: JSON.stringify(deck), 
        dealer: newDealer, 
        playerOrder: JSON.stringify(newOrder), 
        dealerHand: '', 
        currentPlayer: '', 
        round: (localState.round || 1) + 1, 
        updated: Date.now() 
    });
}

function showFinalScores() {
    document.getElementById('results-title').textContent = '🏆 Scores finaux !';
    document.getElementById('btn-next-round').style.display = 'none';
}

// ========== START ==========
init();

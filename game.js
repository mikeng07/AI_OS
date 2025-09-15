// Game client for Mini MMORPG
class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // WebSocket connection
        this.socket = null;
        this.isConnected = false;
        
        // Game state
        this.playerId = null;
        this.players = {};
        this.avatars = {};
        this.myPlayer = null;
        
        // Avatar image cache
        this.avatarImages = {};
        this.loadedAvatars = new Set();
        
        // Camera system
        this.camera = {
            x: 0,
            y: 0
        };
        
        // Input handling
        this.keysPressed = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false
        };
        this.movementInterval = null;
        
        // Initialize the game
        this.init();
    }
    
    init() {
        // Set canvas size to fill the window
        this.resizeCanvas();
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Setup keyboard controls
        this.setupKeyboardControls();
        
        // Load the world map
        this.loadWorldMap();
        
        // Connect to game server
        this.connectToServer();
    }
    
    resizeCanvas() {
        // Set canvas resolution to match display size
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Disable image smoothing to keep pixel-perfect rendering
        this.ctx.imageSmoothingEnabled = false;
        
        // Redraw after resize
        if (this.worldImage) {
            this.render();
        }
    }
    
    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            console.log('World map loaded successfully');
            console.log(`World dimensions: ${this.worldImage.width}x${this.worldImage.height}`);
            this.render();
        };
        this.worldImage.onerror = () => {
            console.error('Failed to load world map');
        };
        this.worldImage.src = 'world.jpg';
    }
    
    render() {
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (!this.worldImage) {
            return;
        }
        
        // Update camera to center on player
        this.updateCamera();
        
        // Draw the world map with camera offset
        this.drawWorldMap();
        
        // Draw all players
        this.drawPlayers();
        
        // Draw username labels
        this.drawUsernames();
    }
    
    updateCamera() {
        if (!this.myPlayer) {
            return;
        }
        
        // Center camera on player position
        this.camera.x = this.myPlayer.x - this.canvas.width / 2;
        this.camera.y = this.myPlayer.y - this.canvas.height / 2;
        
        // Clamp camera to world boundaries
        this.camera.x = Math.max(0, Math.min(this.camera.x, this.worldWidth - this.canvas.width));
        this.camera.y = Math.max(0, Math.min(this.camera.y, this.worldHeight - this.canvas.height));
    }
    
    drawWorldMap() {
        // Calculate which part of the world map to draw
        const sourceX = Math.floor(this.camera.x);
        const sourceY = Math.floor(this.camera.y);
        const sourceWidth = Math.min(this.canvas.width, this.worldWidth - sourceX);
        const sourceHeight = Math.min(this.canvas.height, this.worldHeight - sourceY);
        
        // Draw the visible portion of the world map
        this.ctx.drawImage(
            this.worldImage,
            sourceX, sourceY, sourceWidth, sourceHeight,  // source
            0, 0, sourceWidth, sourceHeight               // destination
        );
    }
    
    drawPlayers() {
        for (const playerId in this.players) {
            const player = this.players[playerId];
            this.drawPlayer(player);
        }
    }
    
    drawPlayer(player) {
        // Convert world coordinates to screen coordinates
        const screenX = player.x - this.camera.x;
        const screenY = player.y - this.camera.y;
        
        // Skip if player is outside visible area
        if (screenX < -100 || screenX > this.canvas.width + 100 || 
            screenY < -100 || screenY > this.canvas.height + 100) {
            return;
        }
        
        // Get avatar image
        const avatarName = player.avatar;
        if (!this.avatarImages[avatarName]) {
            // Draw a placeholder circle if avatar not loaded
            this.ctx.fillStyle = player.id === this.playerId ? '#ff0000' : '#0000ff';
            this.ctx.beginPath();
            this.ctx.arc(screenX, screenY, 16, 0, Math.PI * 2);
            this.ctx.fill();
            return;
        }
        
        // Get the correct direction and frame
        let direction = player.facing || 'south';
        const animationFrame = player.animationFrame || 0;
        
        // Handle west direction by flipping east frames
        let flipHorizontal = false;
        if (direction === 'west') {
            direction = 'east';
            flipHorizontal = true;
        }
        
        const avatarFrames = this.avatarImages[avatarName][direction];
        if (!avatarFrames || !avatarFrames[animationFrame]) {
            return;
        }
        
        const avatarImg = avatarFrames[animationFrame];
        if (!avatarImg.complete) {
            return; // Image still loading
        }
        
        // Draw the avatar
        this.ctx.save();
        
        if (flipHorizontal) {
            this.ctx.scale(-1, 1);
            this.ctx.drawImage(avatarImg, -screenX - avatarImg.width/2, screenY - avatarImg.height/2);
        } else {
            this.ctx.drawImage(avatarImg, screenX - avatarImg.width/2, screenY - avatarImg.height/2);
        }
        
        this.ctx.restore();
    }
    
    drawUsernames() {
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 2;
        
        for (const playerId in this.players) {
            const player = this.players[playerId];
            
            // Convert world coordinates to screen coordinates
            const screenX = player.x - this.camera.x;
            const screenY = player.y - this.camera.y;
            
            // Skip if player is outside visible area
            if (screenX < -100 || screenX > this.canvas.width + 100 || 
                screenY < -100 || screenY > this.canvas.height + 100) {
                continue;
            }
            
            // Draw username above the player (offset by avatar height)
            const textY = screenY - 40; // Offset above the avatar
            
            // Draw text outline
            this.ctx.strokeText(player.username, screenX, textY);
            // Draw text fill
            this.ctx.fillText(player.username, screenX, textY);
        }
    }
    
    connectToServer() {
        console.log('Connecting to game server...');
        this.socket = new WebSocket('wss://codepath-mmorg.onrender.com');
        
        this.socket.onopen = () => {
            console.log('Connected to game server');
            this.isConnected = true;
            this.joinGame();
        };
        
        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleServerMessage(message);
            } catch (error) {
                console.error('Failed to parse server message:', error);
            }
        };
        
        this.socket.onclose = () => {
            console.log('Disconnected from game server');
            this.isConnected = false;
            // Attempt to reconnect after 3 seconds
            setTimeout(() => this.connectToServer(), 3000);
        };
        
        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    joinGame() {
        if (!this.isConnected) {
            console.error('Cannot join game: not connected to server');
            return;
        }
        
        const joinMessage = {
            action: 'join_game',
            username: 'Mike'
            // Note: Not providing custom avatar, will use server default
        };
        
        console.log('Sending join game message:', joinMessage);
        this.socket.send(JSON.stringify(joinMessage));
    }
    
    handleServerMessage(message) {
        console.log('Received server message:', message);
        
        switch (message.action) {
            case 'join_game':
                if (message.success) {
                    this.handleJoinGameSuccess(message);
                } else {
                    console.error('Failed to join game:', message.error);
                }
                break;
            
            case 'players_moved':
                this.handlePlayersMove(message);
                break;
                
            case 'player_joined':
                this.handlePlayerJoined(message);
                break;
                
            case 'player_left':
                this.handlePlayerLeft(message);
                break;
                
            default:
                console.log('Unknown message type:', message.action);
        }
    }
    
    handleJoinGameSuccess(message) {
        console.log('Successfully joined game!');
        this.playerId = message.playerId;
        this.players = message.players;
        this.avatars = message.avatars;
        this.myPlayer = this.players[this.playerId];
        
        console.log('My player:', this.myPlayer);
        console.log('All players:', this.players);
        console.log('Available avatars:', this.avatars);
        
        // Load avatar images and start rendering
        this.loadAvatarImages();
    }
    
    handlePlayersMove(message) {
        // Update player positions
        for (const playerId in message.players) {
            if (this.players[playerId]) {
                this.players[playerId] = { ...this.players[playerId], ...message.players[playerId] };
            }
        }
        
        // Update our player reference
        if (this.playerId && this.players[this.playerId]) {
            this.myPlayer = this.players[this.playerId];
        }
        
        this.render();
    }
    
    handlePlayerJoined(message) {
        console.log('Player joined:', message.player.username);
        this.players[message.player.id] = message.player;
        if (message.avatar) {
            this.avatars[message.avatar.name] = message.avatar;
        }
        this.render();
    }
    
    handlePlayerLeft(message) {
        console.log('Player left:', message.playerId);
        delete this.players[message.playerId];
        this.render();
    }
    
    loadAvatarImages() {
        console.log('Loading avatar images...');
        
        for (const avatarName in this.avatars) {
            if (this.loadedAvatars.has(avatarName)) {
                continue; // Already loaded
            }
            
            const avatar = this.avatars[avatarName];
            this.avatarImages[avatarName] = {};
            
            // Load images for each direction
            for (const direction in avatar.frames) {
                this.avatarImages[avatarName][direction] = [];
                
                // Load each frame for this direction
                avatar.frames[direction].forEach((frameData, frameIndex) => {
                    const img = new Image();
                    img.onload = () => {
                        console.log(`Loaded avatar ${avatarName} ${direction} frame ${frameIndex}`);
                        this.render(); // Re-render when image loads
                    };
                    img.onerror = () => {
                        console.error(`Failed to load avatar ${avatarName} ${direction} frame ${frameIndex}`);
                    };
                    img.src = frameData;
                    this.avatarImages[avatarName][direction][frameIndex] = img;
                });
            }
            
            this.loadedAvatars.add(avatarName);
        }
        
        // Initial render
        this.render();
    }
    
    setupKeyboardControls() {
        // Handle keydown events
        window.addEventListener('keydown', (event) => {
            this.handleKeyDown(event);
        });
        
        // Handle keyup events
        window.addEventListener('keyup', (event) => {
            this.handleKeyUp(event);
        });
    }
    
    handleKeyDown(event) {
        // Only handle arrow keys
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            return;
        }
        
        // Prevent default browser behavior (like scrolling)
        event.preventDefault();
        
        // If key is already pressed, ignore (prevents repeat keydown events)
        if (this.keysPressed[event.key]) {
            return;
        }
        
        // Mark key as pressed
        this.keysPressed[event.key] = true;
        
        // Start continuous movement if not already started
        this.startContinuousMovement();
    }
    
    handleKeyUp(event) {
        // Only handle arrow keys
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            return;
        }
        
        // Prevent default browser behavior
        event.preventDefault();
        
        // Mark key as released
        this.keysPressed[event.key] = false;
        
        // Check if any movement keys are still pressed
        const anyKeyPressed = Object.values(this.keysPressed).some(pressed => pressed);
        
        if (!anyKeyPressed) {
            // No movement keys pressed, stop continuous movement
            this.stopContinuousMovement();
        }
    }
    
    startContinuousMovement() {
        // If already running, don't start another interval
        if (this.movementInterval) {
            return;
        }
        
        // Send initial move command immediately
        this.sendMoveCommandForActiveKeys();
        
        // Start sending move commands continuously
        this.movementInterval = setInterval(() => {
            this.sendMoveCommandForActiveKeys();
        }, 100); // Send move command every 100ms while key is held
    }
    
    stopContinuousMovement() {
        // Clear the movement interval
        if (this.movementInterval) {
            clearInterval(this.movementInterval);
            this.movementInterval = null;
        }
        
        // Send stop command
        this.sendStopCommand();
    }
    
    sendMoveCommand(key) {
        if (!this.isConnected) {
            return;
        }
        
        // Map arrow keys to movement directions
        const keyToDirection = {
            ArrowUp: 'up',
            ArrowDown: 'down',
            ArrowLeft: 'left',
            ArrowRight: 'right'
        };
        
        const direction = keyToDirection[key];
        if (direction) {
            const moveMessage = {
                action: 'move',
                direction: direction
            };
            
            console.log('Sending move command:', moveMessage);
            this.socket.send(JSON.stringify(moveMessage));
        }
    }
    
    sendMoveCommandForActiveKeys() {
        if (!this.isConnected) {
            return;
        }
        
        // Priority order: Up, Down, Left, Right
        const keyPriority = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        
        for (const key of keyPriority) {
            if (this.keysPressed[key]) {
                this.sendMoveCommand(key);
                break; // Send command for first active key found
            }
        }
    }
    
    sendStopCommand() {
        if (!this.isConnected) {
            return;
        }
        
        const stopMessage = {
            action: 'stop'
        };
        
        console.log('Sending stop command:', stopMessage);
        this.socket.send(JSON.stringify(stopMessage));
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    const game = new GameClient();
    console.log('Mini MMORPG client started');
});
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
        
        // Animation system
        this.animationTimer = 0;
        this.lastFrameTime = 0;
        
        // Smooth movement interpolation
        this.playerPositions = {}; // Stores interpolated positions
        this.playerTargets = {};   // Stores target positions from server
        
        // UI state
        this.showMinimap = true;
        this.zoomLevel = 1.0;
        this.cameraEasing = 0.1;
        
        // Audio context for sound effects
        this.audioContext = null;
        this.sounds = {};
        
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
        
        // Setup mouse controls
        this.setupMouseControls();
        
        // Setup audio
        this.setupAudio();
        
        // Start animation loop
        this.startAnimationLoop();
        
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
    
    render(currentTime = 0) {
        // Calculate delta time for smooth animations
        const deltaTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;
        this.animationTimer += deltaTime;
        
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (!this.worldImage) {
            return;
        }
        
        // Update smooth player positions
        this.updatePlayerInterpolation(deltaTime);
        
        // Update camera with smooth easing
        this.updateCameraSmooth();
        
        // Apply zoom
        this.ctx.save();
        this.ctx.scale(this.zoomLevel, this.zoomLevel);
        
        // Draw the world map with camera offset
        this.drawWorldMap();
        
        // Draw visual effects (trails, particles)
        this.drawVisualEffects();
        
        // Draw all players with smooth positions
        this.drawPlayers();
        
        // Draw username labels
        this.drawUsernames();
        
        this.ctx.restore();
        
        // Draw UI overlays (not affected by zoom)
        this.drawUI();
        
        // Draw minimap
        if (this.showMinimap) {
            this.drawMinimap();
        }
    }
    
    updateCameraSmooth() {
        if (!this.myPlayer) {
            return;
        }
        
        // Get player's interpolated position
        const playerPos = this.playerPositions[this.playerId] || this.myPlayer;
        
        // Target camera position (center on player)
        const targetX = playerPos.x - (this.canvas.width / this.zoomLevel) / 2;
        const targetY = playerPos.y - (this.canvas.height / this.zoomLevel) / 2;
        
        // Smooth camera easing
        this.camera.x += (targetX - this.camera.x) * this.cameraEasing;
        this.camera.y += (targetY - this.camera.y) * this.cameraEasing;
        
        // Clamp camera to world boundaries
        const maxX = this.worldWidth - (this.canvas.width / this.zoomLevel);
        const maxY = this.worldHeight - (this.canvas.height / this.zoomLevel);
        
        this.camera.x = Math.max(0, Math.min(this.camera.x, maxX));
        this.camera.y = Math.max(0, Math.min(this.camera.y, maxY));
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
        // Use interpolated position if available
        const playerPos = this.playerPositions[player.id] || player;
        
        // Convert world coordinates to screen coordinates
        const screenX = (playerPos.x - this.camera.x);
        const screenY = (playerPos.y - this.camera.y);
        
        // Skip if player is outside visible area (with margin for zoom)
        const margin = 200;
        if (screenX < -margin || screenX > (this.canvas.width / this.zoomLevel) + margin || 
            screenY < -margin || screenY > (this.canvas.height / this.zoomLevel) + margin) {
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
        
        // Calculate animation frame based on movement
        let direction = player.facing || 'south';
        let animationFrame = 0;
        
        if (player.isMoving) {
            // Cycle through animation frames based on time
            const frameSpeed = 200; // ms per frame
            const numFrames = 3; // Most avatars have 3 frames per direction
            animationFrame = Math.floor(this.animationTimer / frameSpeed) % numFrames;
        }
        
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
        
        // Add glow effect for current player
        if (player.id === this.playerId) {
            this.ctx.shadowColor = '#ffff00';
            this.ctx.shadowBlur = 10;
            this.ctx.globalCompositeOperation = 'lighter';
            
            if (flipHorizontal) {
                this.ctx.drawImage(avatarImg, -screenX - avatarImg.width/2, screenY - avatarImg.height/2);
            } else {
                this.ctx.drawImage(avatarImg, screenX - avatarImg.width/2, screenY - avatarImg.height/2);
            }
            
            this.ctx.shadowBlur = 0;
            this.ctx.globalCompositeOperation = 'source-over';
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
            this.playSound('connect');
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
        this.playSound('join');
        this.render();
    }
    
    handlePlayerLeft(message) {
        console.log('Player left:', message.playerId);
        delete this.players[message.playerId];
        delete this.playerPositions[message.playerId];
        delete this.playerTargets[message.playerId];
        this.playSound('leave');
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
        
        // Add keyboard shortcuts
        window.addEventListener('keydown', (event) => {
            this.handleKeyboardShortcuts(event);
        });
    }
    
    handleKeyboardShortcuts(event) {
        switch (event.key.toLowerCase()) {
            case 'm':
                this.showMinimap = !this.showMinimap;
                event.preventDefault();
                break;
            case 'r':
                this.zoomLevel = 1.0;
                event.preventDefault();
                break;
            case '+':
            case '=':
                this.zoomLevel = Math.min(this.zoomLevel + 0.2, 3.0);
                event.preventDefault();
                break;
            case '-':
                this.zoomLevel = Math.max(this.zoomLevel - 0.2, 0.5);
                event.preventDefault();
                break;
        }
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
    
    // ===== NEW ENHANCED FEATURES =====
    
    setupMouseControls() {
        // Click-to-move functionality
        this.canvas.addEventListener('click', (event) => {
            this.handleCanvasClick(event);
        });
        
        // Zoom with mouse wheel
        this.canvas.addEventListener('wheel', (event) => {
            this.handleMouseWheel(event);
        });
    }
    
    handleCanvasClick(event) {
        if (!this.isConnected || !this.myPlayer) {
            return;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        
        // Convert screen coordinates to world coordinates
        const worldX = (clickX / this.zoomLevel) + this.camera.x;
        const worldY = (clickY / this.zoomLevel) + this.camera.y;
        
        // Clamp to world boundaries
        const targetX = Math.max(0, Math.min(worldX, this.worldWidth));
        const targetY = Math.max(0, Math.min(worldY, this.worldHeight));
        
        // Send click-to-move command
        const moveMessage = {
            action: 'move',
            x: Math.floor(targetX),
            y: Math.floor(targetY)
        };
        
        console.log('Sending click-to-move command:', moveMessage);
        this.socket.send(JSON.stringify(moveMessage));
        
        // Play movement sound
        this.playSound('move');
    }
    
    handleMouseWheel(event) {
        event.preventDefault();
        
        const zoomSpeed = 0.1;
        const minZoom = 0.5;
        const maxZoom = 3.0;
        
        if (event.deltaY < 0) {
            // Zoom in
            this.zoomLevel = Math.min(this.zoomLevel + zoomSpeed, maxZoom);
        } else {
            // Zoom out
            this.zoomLevel = Math.max(this.zoomLevel - zoomSpeed, minZoom);
        }
        
        this.render();
    }
    
    setupAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.createSounds();
        } catch (error) {
            console.log('Audio not supported:', error);
        }
    }
    
    createSounds() {
        // Create simple sound effects using Web Audio API
        this.sounds.move = this.createTone(220, 0.1, 0.05); // Movement sound
        this.sounds.connect = this.createTone(440, 0.2, 0.1); // Connection sound
        this.sounds.join = this.createTone(330, 0.15, 0.08); // Player join sound
        this.sounds.leave = this.createTone(165, 0.15, 0.08); // Player leave sound
    }
    
    createTone(frequency, duration, volume) {
        return () => {
            if (!this.audioContext) return;
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        };
    }
    
    playSound(soundName) {
        if (this.sounds[soundName]) {
            this.sounds[soundName]();
        }
    }
    
    startAnimationLoop() {
        const animate = (currentTime) => {
            this.render(currentTime);
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }
    
    updatePlayerInterpolation(deltaTime) {
        // Smooth interpolation for player positions
        for (const playerId in this.players) {
            const player = this.players[playerId];
            
            if (!this.playerPositions[playerId]) {
                this.playerPositions[playerId] = { x: player.x, y: player.y };
                this.playerTargets[playerId] = { x: player.x, y: player.y };
            }
            
            // Update target if server position changed
            if (this.playerTargets[playerId].x !== player.x || this.playerTargets[playerId].y !== player.y) {
                this.playerTargets[playerId] = { x: player.x, y: player.y };
            }
            
            // Smooth interpolation
            const current = this.playerPositions[playerId];
            const target = this.playerTargets[playerId];
            const lerpSpeed = 0.15;
            
            current.x += (target.x - current.x) * lerpSpeed;
            current.y += (target.y - current.y) * lerpSpeed;
        }
    }
    
    drawVisualEffects() {
        // Draw player trails
        this.ctx.globalAlpha = 0.3;
        for (const playerId in this.playerPositions) {
            const pos = this.playerPositions[playerId];
            const player = this.players[playerId];
            
            if (player && player.isMoving) {
                const screenX = pos.x - this.camera.x;
                const screenY = pos.y - this.camera.y;
                
                this.ctx.fillStyle = player.id === this.playerId ? '#ffff00' : '#00ffff';
                this.ctx.beginPath();
                this.ctx.arc(screenX, screenY, 8, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        this.ctx.globalAlpha = 1.0;
    }
    
    drawUI() {
        // Status panel
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(10, 10, 300, 100);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '14px Arial';
        
        const playerCount = Object.keys(this.players).length;
        const myPos = this.myPlayer ? `(${Math.floor(this.myPlayer.x)}, ${Math.floor(this.myPlayer.y)})` : '(0, 0)';
        const connectionStatus = this.isConnected ? 'Connected' : 'Disconnected';
        const zoomText = `${Math.floor(this.zoomLevel * 100)}%`;
        
        this.ctx.fillText(`Status: ${connectionStatus}`, 20, 30);
        this.ctx.fillText(`Players: ${playerCount}`, 20, 50);
        this.ctx.fillText(`Position: ${myPos}`, 20, 70);
        this.ctx.fillText(`Zoom: ${zoomText}`, 20, 90);
        
        // Controls hint
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(10, this.canvas.height - 80, 350, 70);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '12px Arial';
        this.ctx.fillText('Controls: Arrow keys or click to move', 20, this.canvas.height - 60);
        this.ctx.fillText('Mouse wheel: Zoom in/out', 20, this.canvas.height - 45);
        this.ctx.fillText('M: Toggle minimap', 20, this.canvas.height - 30);
        this.ctx.fillText('R: Reset zoom', 20, this.canvas.height - 15);
    }
    
    drawMinimap() {
        const minimapSize = 150;
        const minimapX = this.canvas.width - minimapSize - 10;
        const minimapY = 10;
        
        // Minimap background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);
        
        // Draw world map scaled down
        if (this.worldImage) {
            this.ctx.drawImage(
                this.worldImage,
                minimapX, minimapY,
                minimapSize, minimapSize
            );
        }
        
        // Draw players on minimap
        for (const playerId in this.players) {
            const player = this.players[playerId];
            const mapX = minimapX + (player.x / this.worldWidth) * minimapSize;
            const mapY = minimapY + (player.y / this.worldHeight) * minimapSize;
            
            this.ctx.fillStyle = player.id === this.playerId ? '#ff0000' : '#00ff00';
            this.ctx.beginPath();
            this.ctx.arc(mapX, mapY, 3, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Draw camera view rectangle
        if (this.myPlayer) {
            const viewWidth = (this.canvas.width / this.zoomLevel) / this.worldWidth * minimapSize;
            const viewHeight = (this.canvas.height / this.zoomLevel) / this.worldHeight * minimapSize;
            const viewX = minimapX + (this.camera.x / this.worldWidth) * minimapSize;
            const viewY = minimapY + (this.camera.y / this.worldHeight) * minimapSize;
            
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(viewX, viewY, viewWidth, viewHeight);
        }
        
        // Minimap border
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    const game = new GameClient();
    console.log('Mini MMORPG client started');
});
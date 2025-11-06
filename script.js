class SnakeGame {
    constructor() {
        console.log('Initializing Snake Game...');
        this.canvas = document.getElementById('game-board');
        if (!this.canvas) {
            console.error('Canvas element not found!');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.gridSize = 20;
        this.tileCount = 20;
        this.tileSize = this.canvas.width / this.tileCount;
        
        this.snake = [
            { x: 10, y: 10 }
        ];
        this.direction = { x: 0, y: 0 };
        this.nextDirection = { x: 0, y: 0 };
        this.food = { x: 15, y: 15 }; 
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
        this.gameRunning = false;
        this.gamePaused = false;
        this.gameReady = false;
        this.gameSpeed = 120;
        this.lastRenderTime = 0;
        this.accumulator = 0;
        
        this.particles = [];
        this.foodAnimation = 0;
   
        this.audioContext = null;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Web Audio API not supported');
        }
        
        console.log('Canvas found, initializing game...');
        this.init();
    }
    
    init() {
        console.log('Setting up canvas...');
        this.setupCanvas();
        console.log('Setting up event listeners...');
        this.setupEventListeners();
        console.log('Generating food...');
        this.food = this.generateFood();
        console.log('Updating score display...');
        this.updateScoreDisplay();
        console.log('Showing overlay...');
        this.showOverlay('READY TO PLAY?', 'Press START GAME to begin');
        console.log('Drawing initial game state...');
        this.draw();
        console.log('Game initialization complete!');
    }
    
    setupCanvas() {
        this.canvas.width = 500;
        this.canvas.height = 500;
        
        if (window.innerWidth <= 480) {
            const size = Math.min(window.innerWidth - 40, 350);
            this.canvas.width = size;
            this.canvas.height = size;
            this.tileSize = size / this.tileCount;
        } else {
            this.tileSize = this.canvas.width / this.tileCount;
        }
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
        
        document.getElementById('play-button').addEventListener('click', () => this.startGame());
        document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('restart-btn').addEventListener('click', () => this.restartGame());
        
        document.getElementById('up-btn').addEventListener('click', () => {
            if (!this.gameRunning && this.gameReady) {
                this.startMoving(0, -1);
            } else if (this.gameRunning) {
                this.changeDirection(0, -1);
            }
        });
        
        document.getElementById('down-btn').addEventListener('click', () => {
            if (!this.gameRunning && this.gameReady) {
                this.startMoving(0, 1);
            } else if (this.gameRunning) {
                this.changeDirection(0, 1);
            }
        });
        
        document.getElementById('left-btn').addEventListener('click', () => {
            if (!this.gameRunning && this.gameReady) {
                this.startMoving(-1, 0);
            } else if (this.gameRunning) {
                this.changeDirection(-1, 0);
            }
        });
        
        document.getElementById('right-btn').addEventListener('click', () => {
            if (!this.gameRunning && this.gameReady) {
                this.startMoving(1, 0);
            } else if (this.gameRunning) {
                this.changeDirection(1, 0);
            }
        });
        
        let touchStartX = 0;
        let touchStartY = 0;
        
        this.canvas.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            if (!this.gameReady && !this.gameRunning) return;
            
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            
            if (!this.gameRunning && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    if (deltaX > 0) {
                        this.startMoving(1, 0);
                    } else {
                        this.startMoving(-1, 0);
                    }
                } else {
                    if (deltaY > 0) {
                        this.startMoving(0, 1);
                    } else {
                        this.startMoving(0, -1);
                    }
                }
                return;
            }
            
            if (!this.gameRunning || this.gamePaused) return;
            
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                if (deltaX > 0) {
                    this.changeDirection(1, 0);
                } else {
                    this.changeDirection(-1, 0);
                }
            } else {
                if (deltaY > 0) {
                    this.changeDirection(0, 1);
                } else {
                    this.changeDirection(0, -1);
                }
            }
        });
    }
    
    handleKeyPress(e) {
        if (e.code === 'Space') {
            e.preventDefault();
            if (this.gameRunning) {
                this.togglePause();
            }
            return;
        }
        
        if (e.code === 'KeyP') {
            e.preventDefault();
            this.togglePause();
            return;
        }
        
        if (!this.gameReady && !this.gameRunning) return;
        
        if (!this.gameRunning && (e.code.startsWith('Arrow') || e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD')) {
           
            switch (e.code) {
                case 'ArrowUp':
                case 'KeyW':
                    this.startMoving(0, -1);
                    break;
                case 'ArrowDown':
                case 'KeyS':
                    this.startMoving(0, 1);
                    break;
                case 'ArrowLeft':
                case 'KeyA':
                    this.startMoving(-1, 0);
                    break;
                case 'ArrowRight':
                case 'KeyD':
                    this.startMoving(1, 0);
                    break;
            }
            return;
        }
        
        if (!this.gameRunning || this.gamePaused) return;
        
        switch (e.code) {
            case 'ArrowUp':
            case 'KeyW':
                e.preventDefault();
                this.changeDirection(0, -1);
                break;
            case 'ArrowDown':
            case 'KeyS':
                e.preventDefault();
                this.changeDirection(0, 1);
                break;
            case 'ArrowLeft':
            case 'KeyA':
                e.preventDefault();
                this.changeDirection(-1, 0);
                break;
            case 'ArrowRight':
            case 'KeyD':
                e.preventDefault();
                this.changeDirection(1, 0);
                break;
        }
    }
    
    startMoving(x, y) {
        this.direction = { x, y };
        this.nextDirection = { x, y };
        this.gameRunning = true;
        this.gameReady = false;
        this.hideOverlay();
        this.gameLoop();
    }
    
    changeDirection(x, y) {
        if (this.direction.x === -x && this.direction.y === -y) return;
        this.nextDirection = { x, y };
    }
    
    startGame() {
        console.log('🎮 START GAME BUTTON PRESSED!');
        
      
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        this.snake = [{ x: 10, y: 10 }];
        this.direction = { x: 1, y: 0 };  
        this.nextDirection = { x: 1, y: 0 };
        this.food = this.generateFood();
        this.score = 0;
        this.gameRunning = true; 
        this.gamePaused = false;
        this.gameReady = false;
        this.gameSpeed = 120;
        this.particles = [];
        this.lastRenderTime = performance.now();
        this.accumulator = 0;
        this.updateScoreDisplay();
        console.log('🚀 Hiding overlay and starting game loop...');
        this.hideOverlay();
        this.draw();
        console.log('✅ Game should be starting now!');
        requestAnimationFrame((time) => this.gameLoop(time));  
    }
    
    togglePause() {
        if (!this.gameRunning) return;
        
        this.gamePaused = !this.gamePaused;
        
        if (this.gamePaused) {
            this.showOverlay('PAUSED', 'Press SPACE to continue');
        } else {
            this.hideOverlay();
            this.gameLoop();
        }
    }
    
    restartGame() {
        this.snake = [{ x: 10, y: 10 }];
        this.direction = { x: 0, y: 0 };
        this.nextDirection = { x: 0, y: 0 };
        this.food = this.generateFood();
        this.score = 0;
        this.gameRunning = false;
        this.gamePaused = false;
        this.gameReady = false;
        this.gameSpeed = 120;
        this.particles = [];
        this.updateScoreDisplay();
        this.showOverlay('READY TO PLAY?', 'Press START GAME to begin');
        this.draw();
    }
    
    gameLoop(currentTime = 0) {
        if (!this.gameRunning || this.gamePaused) return;
        
        const deltaTime = currentTime - this.lastRenderTime;
        this.lastRenderTime = currentTime;
        
        this.accumulator += deltaTime;
        
        while (this.accumulator >= this.gameSpeed) {
            this.update();
            this.accumulator -= this.gameSpeed;
        }
        
        this.draw();
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    update() {
        this.direction = { ...this.nextDirection };
        
        if (this.direction.x === 0 && this.direction.y === 0) return;
        
        const head = { ...this.snake[0] };
        head.x += this.direction.x;
        head.y += this.direction.y;
        
        if (this.checkCollision(head)) {
            this.gameOver();
            return;
        }
        
        this.snake.unshift(head);
        
        if (head.x === this.food.x && head.y === this.food.y) {
            this.eatFood();
        } else {
            this.snake.pop();
        }
        
        this.updateParticles();
        this.foodAnimation += 0.1;
    }
    
    checkCollision(head) {
        if (head.x < 0 || head.x >= this.tileCount || 
            head.y < 0 || head.y >= this.tileCount) {
            return true;
        }
        
        for (let i = 1; i < this.snake.length; i++) {
            if (head.x === this.snake[i].x && head.y === this.snake[i].y) {
                return true;
            }
        }
        
        return false;
    }
    
    eatFood() {
        this.score += 10;
        this.updateScoreDisplay();
        this.createFoodParticles(this.food.x, this.food.y);
        this.playEatSound();
        this.food = this.generateFood();
        
        if (this.score % 30 === 0) {
            this.gameSpeed = Math.max(40, this.gameSpeed - 8);
        }
    }
    
    playEatSound() {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.1);
    }
    
    generateFood() {
        let newFood;
        do {
            newFood = {
                x: Math.floor(Math.random() * this.tileCount),
                y: Math.floor(Math.random() * this.tileCount)
            };
        } while (this.snake.some(segment => segment.x === newFood.x && segment.y === newFood.y));
        
        return newFood;
    }
    
    createFoodParticles(x, y) {
        const centerX = x * this.tileSize + this.tileSize / 2;
        const centerY = y * this.tileSize + this.tileSize / 2;
        
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            this.particles.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(angle) * 3,
                vy: Math.sin(angle) * 3,
                life: 1,
                color: `hsl(${Math.random() * 60 + 30}, 100%, 50%)`
            });
        }
    }
    
    updateParticles() {
        this.particles = this.particles.filter(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.life -= 0.02;
            particle.vx *= 0.98;
            particle.vy *= 0.98;
            return particle.life > 0;
        });
    }
    
    draw() {
        
        this.ctx.fillStyle = '#0f3460';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.drawGrid();
        this.drawFood();
        this.drawSnake();
        this.drawParticles();
    }
    
    drawGrid() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        
        for (let i = 0; i <= this.tileCount; i++) {
            const pos = i * this.tileSize;
            this.ctx.beginPath();
            this.ctx.moveTo(pos, 0);
            this.ctx.lineTo(pos, this.canvas.height);
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, pos);
            this.ctx.lineTo(this.canvas.width, pos);
            this.ctx.stroke();
        }
    }
    
    drawSnake() {
        this.snake.forEach((segment, index) => {
            const x = segment.x * this.tileSize;
            const y = segment.y * this.tileSize;
            
            if (index === 0) {
                this.ctx.fillStyle = '#4ade80';
            } else {
                this.ctx.fillStyle = '#22c55e';
            }
            
            this.ctx.fillRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
            
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
            
            if (index === 0) {
                this.ctx.fillStyle = 'white';
                const eyeSize = 3;
                const eyeOffset = 5;
                
                if (this.direction.x === 1) {
                    this.ctx.fillRect(x + this.tileSize - eyeOffset, y + eyeOffset, eyeSize, eyeSize);
                    this.ctx.fillRect(x + this.tileSize - eyeOffset, y + this.tileSize - eyeOffset - eyeSize, eyeSize, eyeSize);
                } else if (this.direction.x === -1) {
                    this.ctx.fillRect(x + eyeOffset - eyeSize, y + eyeOffset, eyeSize, eyeSize);
                    this.ctx.fillRect(x + eyeOffset - eyeSize, y + this.tileSize - eyeOffset - eyeSize, eyeSize, eyeSize);
                } else if (this.direction.y === 1) {
                    this.ctx.fillRect(x + eyeOffset, y + this.tileSize - eyeOffset, eyeSize, eyeSize);
                    this.ctx.fillRect(x + this.tileSize - eyeOffset - eyeSize, y + this.tileSize - eyeOffset, eyeSize, eyeSize);
                } else if (this.direction.y === -1) {
                    this.ctx.fillRect(x + eyeOffset, y + eyeOffset - eyeSize, eyeSize, eyeSize);
                    this.ctx.fillRect(x + this.tileSize - eyeOffset - eyeSize, y + eyeOffset - eyeSize, eyeSize, eyeSize);
                }
            }
        });
    }
    
    drawFood() {
        const x = this.food.x * this.tileSize + this.tileSize / 2;
        const y = this.food.y * this.tileSize + this.tileSize / 2;
        
        this.ctx.fillStyle = '#ff6b6b';
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.tileSize / 2 - 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
    
    drawParticles() {
        this.particles.forEach(particle => {
            this.ctx.globalAlpha = particle.life;
            this.ctx.fillStyle = particle.color;
            this.ctx.fillRect(particle.x - 2, particle.y - 2, 4, 4);
        });
        this.ctx.globalAlpha = 1;
    }
    
    gameOver() {
        this.gameRunning = false;
        
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('snakeHighScore', this.highScore);
            this.updateScoreDisplay();
            this.showOverlay(' NEW HIGH SCORE! ', `Score: ${this.score} - Press START GAME to play again`);
        } else {
            this.showOverlay('GAME OVER', `Score: ${this.score} - Press START GAME to try again`);
        }
    }
    
    updateScoreDisplay() {
        document.getElementById('current-score').textContent = this.score;
        document.getElementById('high-score').textContent = this.highScore;
    }
    
    showOverlay(title, message) {
        document.getElementById('overlay-title').textContent = title;
        document.getElementById('overlay-message').textContent = message;
        document.getElementById('game-overlay').classList.remove('hidden');
    }
    
    hideOverlay() {
        const overlay = document.getElementById('game-overlay');
        console.log('👻 Hiding overlay element:', overlay);
        overlay.classList.add('hidden');
        console.log('✨ Overlay classes:', overlay.className);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, creating Snake Game...');
    try {
        new SnakeGame();
    } catch (error) {
        console.error('Error creating Snake Game:', error);
        alert('Failed to start Snake Game: ' + error.message);
    }
});

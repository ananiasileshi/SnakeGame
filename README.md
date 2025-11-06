# 🐍 Snake Game

A modern, smooth Snake Game built with vanilla JavaScript, HTML5 Canvas, and CSS. Features smooth animations, particle effects, sound effects, and responsive controls for both desktop and mobile devices.

![Snake Game](https://img.shields.io/badge/JavaScript-ES6+-yellow) ![HTML5](https://img.shields.io/badge/HTML5-Canvas-orange) ![CSS3](https://img.shields.io/badge/CSS3-Modern-blue)

## ✨ Features

- **Smooth Gameplay**: Frame-rate independent movement with fixed timestep game loop
- **Visual Effects**: 
  - Particle explosions when eating food
  - Animated food with pulsing effect
  - Snake eyes that follow movement direction
  - Subtle grid overlay
- **Audio**: Web Audio API sound effects for eating food
- **Responsive Design**: Adapts to different screen sizes, including mobile devices
- **Multiple Control Methods**:
  - Arrow keys (↑ ↓ ← →)
  - WASD keys
  - On-screen buttons for mobile
  - Touch swipe controls
- **Score Tracking**: Current score and high score persistence using localStorage
- **Progressive Difficulty**: Game speed increases as you collect more food
- **Pause Functionality**: Press SPACE or P to pause/resume

## 🎮 How to Play

1. Open `index.html` in your web browser
2. Click **START GAME** or press any arrow key to begin
3. Guide the snake to eat the red food
4. Avoid hitting walls or the snake's own body
5. Score increases by 10 points for each food eaten
6. Game speed increases every 30 points

### Controls

**Desktop:**
- **Arrow Keys** or **WASD**: Move the snake
- **SPACE** or **P**: Pause/Resume
- **START GAME**: Begin new game
- **RESTART**: Reset to initial state

**Mobile:**
- **Swipe**: Change direction
- **On-screen buttons**: Directional controls
- **Pause/Restart buttons**: Game control

## 🚀 Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- No dependencies or build tools required!

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/snake-game.git
```

2. Navigate to the project directory:
```bash
cd snake-game
```

3. Open `index.html` in your browser:
```bash
# On Windows
start index.html

# On macOS
open index.html

# On Linux
xdg-open index.html
```

Or simply double-click the `index.html` file.

## 📁 Project Structure

```
Snake Game/
│
├── index.html      # Main HTML file with game structure
├── style.css       # Styling with modern UI design
├── script.js       # Game logic and Canvas rendering
└── README.md       # Project documentation
```

## 🎯 Game Mechanics

### Scoring System
- **+10 points** per food eaten
- **High score** automatically saved to browser storage

### Speed Progression
- Initial speed: 120ms per update
- Speed increases every 30 points
- Minimum speed: 40ms per update

### Collision Detection
- Walls: Game over when snake hits any edge
- Self-collision: Game over when snake intersects itself

## 🛠️ Technical Details

### Technologies Used
- **HTML5 Canvas**: For game rendering
- **Vanilla JavaScript (ES6+)**: Game logic using OOP approach
- **CSS3**: Modern styling with Orbitron font
- **Web Audio API**: Dynamic sound generation
- **localStorage**: Persistent high score storage

### Key Features Implementation
- **Fixed Timestep Game Loop**: Ensures consistent physics regardless of frame rate
- **Particle System**: Custom particle effects for visual feedback
- **Responsive Canvas**: Automatically adjusts size for mobile devices
- **Touch Events**: Full touch gesture support for mobile gameplay

### Browser Compatibility
- Chrome/Edge 88+
- Firefox 85+
- Safari 14+
- Mobile browsers with touch support

## 🎨 Customization

You can easily customize the game by modifying:

**Colors** (in `script.js`):
```javascript
this.ctx.fillStyle = '#0f3460';  // Background color
this.ctx.fillStyle = '#4ade80';  // Snake head color
this.ctx.fillStyle = '#22c55e';  // Snake body color
this.ctx.fillStyle = '#ff6b6b';  // Food color
```

**Game Speed** (in `script.js`):
```javascript
this.gameSpeed = 120;  // Initial speed in milliseconds
```

**Grid Size** (in `script.js`):
```javascript
this.tileCount = 20;  // Number of tiles (20x20 grid)
```

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 👨‍💻 Author

Created with ❤️ by [Your Name]

## 🙏 Acknowledgments

- Classic Snake game for the inspiration
- Orbitron font from Google Fonts
- Web Audio API for sound generation

---

**Enjoy the game! 🎮🐍**

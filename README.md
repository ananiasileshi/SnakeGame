# Neon Serpent

Neon Serpent is a browser-based arcade game inspired by classic snake gameplay, built with vanilla JavaScript and HTML5 canvas rendering. The project focuses on polished presentation, responsive controls, deterministic game logic, and replayable arcade mechanics.

## Overview

This project delivers a modern arcade experience with a compact engine, daily seeded runs, ghost comparisons, rewind support, and a browser-based interface designed for desktop and touch devices. It is intended to be lightweight, fast, and easy to run without a build tool or dependency installation.

## Features

- Deterministic game engine and reproducible game states
- Daily seeded challenge flow
- Replay encoding and shareable run data
- Rewind mechanic for recovery during play
- AI ghost comparison for competitive sessions
- Responsive controls for keyboard, touch, and gamepad input
- CRT inspired visual presentation and arcade cabinet styling
- Local high score tracking and persistent settings
- Lightweight structure with no external runtime dependencies

## Project Structure

- `index.html` contains the application shell and arcade interface
- `style.css` defines the cabinet styling, screen effects, and layout
- `package.json` defines the project metadata and test script
- `src/` contains the game engine, rendering, AI, and replay logic
- `test/` contains the validation suite for engine behavior and replay encoding

## Requirements

- Modern web browser
- Python 3 for serving local files, or another local static server
- Node.js for running the project test script

## Getting Started

1. Open the project directory in a terminal.
2. Start a local static server:

```bash
python3 -m http.server 8080
```

3. Open the following URL in a browser:

```text
http://localhost:8080
```

## Testing

Run the project validation checks with:

```bash
node test/run.mjs
```

The project also provides a script alias in `package.json`:

```bash
npm test
```

## Controls

- Arrow keys or WASD to move
- Space to pause
- R to rewind
- A and B actions through the cabinet controls
- Touch and on-screen controls supported for mobile play
- Debug and service controls are included for development and testing

## Notes

This project is intended as a self-contained front-end application. The engine is designed to be deterministic and transparent, which makes debugging, replay validation, and score verification more reliable than in a typical browser game loop.

## License

This project is distributed for educational and development purposes. Please review the repository policies before publication or redistribution.

# Lightweight VTT - Multiplayer

A high-performance, modular Virtual Tabletop (VTT) built for tabletop RPGs, optimized for sci-fi games like Traveller using Geomorph spaceship plans. It features real-time multiplayer synchronization, dynamic Line of Sight (LoS), Fog of War, and strict wall collision detection.

## Tech Stack
* **Build Tool:** Vite
* **Graphics Engine:** PixiJS (v7.3.2)
* **Database & Hosting:** Firebase Realtime Database & Firebase Storage
* **PDF Rendering:** PDF.js
* **Architecture:** Vanilla JavaScript (ES6 Modules)

## File Structure

The codebase utilizes Separation of Concerns, ensuring UI, graphics, database, and math logic are safely isolated.

```text
/VTT-Light
├── index.html           # Main HTML structure, CSS styling, and CDN scripts (PDF.js)
├── package.json         # NPM dependencies (PixiJS, Firebase) and Vite run scripts
├── firebase.json        # Firebase hosting configuration (configured to serve the /dist folder)
└── /src
    ├── main.js          # The orchestrator. Connects Firebase listeners, boots UI, and attaches the canvas.
    ├── state.js         # Centralized memory. Holds active tokens, walls, lights, and map data.
    ├── firebase.js      # Cloud connection. Initializes DB/Storage and exports references.
    ├── math.js          # Pure mathematics. Handles raycasting, wall snapping, and token collisions.
    ├── renderer.js      # Graphics engine. Initializes PixiJS, draws tokens, and handles Fog of War masking.
    ├── input.js         # Canvas interactivity. Handles panning, zooming, and dragging tokens/walls.
    └── ui.js            # DOM control. Manages HTML buttons, file uploads, and prep/play mode toggles.

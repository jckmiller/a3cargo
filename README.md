# A3 Shipping Pro - 3D Container Loading Tool

An interactive 3D visualization tool for planning and visualizing container loading configurations. Built with Three.js and TypeScript, with a Node.js/Express REST API backend and SQLite storage.

![A3 Shipping Pro](https://img.shields.io/badge/3D-Visualization-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue) ![Three.js](https://img.shields.io/badge/Three.js-0.163-green) ![Vite](https://img.shields.io/badge/Vite-5.1-purple)

## Features

- 🏗️ **Interactive 3D Container Visualization** - View and manipulate cargo items in a realistic 3D container environment
- 📦 **Multiple Container Types** - Support for various standard shipping container sizes (20ft, 40ft, etc.)
- 🎯 **Drag & Drop Placement** - Easily position cargo items with intuitive mouse controls; hold Shift to force floor-level placement
- 🔄 **Item Rotation** - Rotate items horizontally (Y-axis) or tip them forward/sideways to optimize packing
- 📊 **Real-time Statistics** - Track weight, volume utilization, and item placement
- 🏷️ **3D Item Tags** - Toggle in-scene text labels showing item name, category, weight, and dimensions
- 🌓 **Dark/Light Theme** - Switch between themes for comfortable viewing
- 📋 **Load Plan Generation** - Generate step-by-step loading instructions
- 📸 **Image Export** - Export your container layout as PNG images
- 🖨️ **Printable Manifest** - Generate detailed packing manifests
- ☁️ **Cloud Save/Load** - Save the current container load to the server as a named project and reload it from any browser
- ⬆️ **Local Import** - Import a previously exported `.json` layout file directly from disk
- 📚 **Item Library** - Pick from a built-in library of common cargo presets (pallets, boxes, drums, machinery, etc.) and save your own custom presets
- 🔐 **Authentication & Roles** - JWT-based login with admin, editor, and viewer roles; admins can manage users in-app

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/jckmiller/a3cargo.git

# Navigate to project directory
cd a3cargo

# Install frontend dependencies
npm install

# Install API dependencies
cd api && npm install && cd ..
```

### Development

```bash
# Terminal 1 — start the API server (port 3001)
cd api && node server.js

# Terminal 2 — start the Vite dev server (port 3000)
npm run dev
```

Vite proxies all `/api/*` requests to `http://localhost:3001` so the frontend works identically to production.

### Build for Production

```bash
# Build the project
npm run build

# Preview the production build
npm run preview
```

## Usage

1. **Sign In** - Log in with your username and password (default admin: `admin` / `123123`)
2. **Select Container Type** - Choose your shipping container size from the dropdown
3. **Add Cargo Items** - Use the "Add Custom Item" panel to create items with custom dimensions and weight, or switch to the **Library** tab to add common cargo presets (pallets, boxes, drums, machinery, and more)
4. **Position Items** - Drag and drop items within the container; hold Shift while dragging to force floor-level placement
5. **Rotate Items** - Press `R` to rotate a selected item 90° horizontally, `T` to tip it forward (swaps length and height), or use the toolbar buttons
6. **Save/Load** - Use the 💾 **Save** button to save your load as a named cloud project; use 📂 **Load** to open a previously saved project. Use ⬆ **Import** to load a layout from a local `.json` file
7. **Generate Reports** - Export load plans, manifests, or images for documentation

### Keyboard Shortcuts

| Key / Input | Action |
|-------------|--------|
| `Click` | Select item |
| `Drag` | Move item (auto-stacks) |
| `Shift+Drag` | Force floor-level placement |
| `R` | Rotate selected item 90° horizontally (swaps L/W) |
| `T` | Tip selected item forward (swaps L/H) |
| `E` | Edit selected item |
| `L` | Toggle 3D item tags |
| `Dbl-Click` | Show item details |
| `Delete` | Remove selected item |
| `Right-Drag` | Rotate camera |
| `Scroll` | Zoom in/out |

## Technology Stack

### Frontend
- **Three.js** - 3D graphics and rendering
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast development and build tool
- **CSS3** - Modern styling with CSS variables

### Backend
- **Node.js / Express** - REST API server
- **SQLite (better-sqlite3)** - Persistent storage for users and projects
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT-based authentication

## Project Structure

```
├── src/
│   ├── main.ts          # Application entry point
│   ├── game.ts          # Main container visualization app
│   ├── auth.ts          # Login overlay and token management
│   ├── definitions.ts   # Type definitions and constants
│   ├── entities.ts      # 3D object creation functions
│   ├── ui.ts            # UI components and interactions
│   ├── labels.ts        # 3D label management
│   ├── loadplan.ts      # Load plan generation
│   ├── logo.ts          # Logo fetch/cache utility
│   ├── utils.ts         # Utility functions
│   ├── libs/
│   │   ├── api.ts          # REST API client (fetch wrapper + JWT)
│   │   └── persistence.ts  # Local storage utilities
│   └── styles/
│       └── index.css    # Application styles
├── api/
│   ├── server.js        # Express app (entry point)
│   ├── db.js            # SQLite schema, migrations, prepared statements
│   ├── package.json     # API dependencies
│   ├── middleware/
│   │   └── auth.js      # JWT verification middleware
│   └── routes/
│       ├── auth.js      # POST /login, GET /me
│       ├── projects.js  # CRUD for saved container loads
│       └── users.js     # Admin-only user management
├── deploy/              # VPS deployment scripts
│   └── README.md        # Deployment guide
├── index.html           # Main HTML file
├── package.json         # Frontend dependencies
├── tsconfig.json        # TypeScript configuration
└── vite.config.ts       # Vite configuration (includes /api proxy)
```

## License

This project is open source and available under the [MIT License](LICENSE).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

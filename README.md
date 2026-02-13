# A3 Shipping Pro - 3D Container Loading Tool

An interactive 3D visualization tool for planning and visualizing container loading configurations. Built with Three.js and TypeScript.

![A3 Shipping Pro](https://img.shields.io/badge/3D-Visualization-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue) ![Three.js](https://img.shields.io/badge/Three.js-0.163-green) ![Vite](https://img.shields.io/badge/Vite-5.1-purple)

## Features

- 🏗️ **Interactive 3D Container Visualization** - View and manipulate cargo items in a realistic 3D container environment
- 📦 **Multiple Container Types** - Support for various standard shipping container sizes (20ft, 40ft, etc.)
- 🎯 **Drag & Drop Placement** - Easily position cargo items with intuitive mouse controls
- 🔄 **Item Rotation** - Rotate items on multiple axes to optimize packing
- 📊 **Real-time Statistics** - Track weight, volume utilization, and item placement
- 🏷️ **3D Labels** - Toggle item labels for easy identification
- 🌓 **Dark/Light Theme** - Switch between themes for comfortable viewing
- 📋 **Load Plan Generation** - Generate step-by-step loading instructions
- 📸 **Image Export** - Export your container layout as PNG images
- 🖨️ **Printable Manifest** - Generate detailed packing manifests

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/jckmiller/create-an-interactive-3-d-visualization-tool-for-v8-2.git

# Navigate to project directory
cd create-an-interactive-3-d-visualization-tool-for-v8-2

# Install dependencies
npm install
```

### Development

```bash
# Start the development server
npm run dev
```

This will start a local development server at `http://localhost:3000` with hot module reloading.

### Build for Production

```bash
# Build the project
npm run build

# Preview the production build
npm run preview
```

## Usage

1. **Select Container Type** - Choose your shipping container size from the dropdown
2. **Add Cargo Items** - Use the "Add Item" panel to create new cargo items with dimensions and weight
3. **Position Items** - Drag and drop items within the container, or use manual position controls
4. **Rotate Items** - Press `R` to rotate selected items, or use the rotation buttons
5. **Generate Reports** - Export load plans, manifests, or images for documentation

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Rotate selected item (Y-axis) |
| `T` | Tip selected item forward |
| `E` | Edit selected item |
| `L` | Toggle 3D labels |
| `Delete` | Remove selected item |

## Technology Stack

- **Three.js** - 3D graphics and rendering
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast development and build tool
- **CSS3** - Modern styling with CSS variables

## Project Structure

```
├── src/
│   ├── main.ts          # Application entry point
│   ├── game.ts          # Main container visualization app
│   ├── definitions.ts   # Type definitions and constants
│   ├── entities.ts      # 3D object creation functions
│   ├── ui.ts            # UI components and interactions
│   ├── utils.ts         # Utility functions
│   ├── labels.ts        # 3D label management
│   ├── loadplan.ts      # Load plan generation
│   ├── libs/
│   │   └── persistence.ts  # Local storage utilities
│   └── styles/
│       └── index.css    # Application styles
├── index.html           # Main HTML file
├── package.json         # Project dependencies
├── tsconfig.json        # TypeScript configuration
└── vite.config.ts       # Vite configuration
```

## License

This project is open source and available under the [MIT License](LICENSE).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

# Nasa_app_2025

## 🚀 Overview
This project is an **Asteroid Impact Simulator** that allows users to select an impact location on a map and input parameters (diameter, velocity, angle). It calculates and visualizes the resulting **impact energy, crater size, tsunami propagation, and seismic magnitude**. It also integrates with NASA’s **NeoWs API** to fetch real PHA (Potentially Hazardous Asteroid) data and match the closest asteroid.

---

## 📂 File Structure
- **index.html**: Base structure with Google Maps, input form, and results sections
- **map.js**: Initializes Google Maps, handles click events, fetches elevation, determines ocean vs land
- **pha-match-and-sim.js**: Extracts PHA candidates, matches with input, includes physics calculations
- **sim.js**: Manages UI rendering, draws layers on the map, summarizes impact effects

---

## ⚙️ Features
1. Map-based Impact Point Selection (Elevation API: ocean/land)
2. User Input: diameter (m), velocity (m/s), angle (°)
3. NASA NeoWs API Integration
4. Impact Physics: Energy, Crater, Seismic (M, MMI), Tsunami
5. Visualization Filters (Crater / Tsunami / Seismic)

---

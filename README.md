# Nasa_app_2025 README

## Overview
This project is an **Meteor Madness** has two demonstration model **(3D visualization rendering model, Potentially Hazardous Asterodis impact stimulator)** that allows users to select an impact location on a map and input parameters (diameter, velocity, angle). It calculates and visualizes the resulting **impact energy, crater size, tsunami propagation, and seismic magnitude**. It also integrates with NASA’s **NeoWs API** to fetch real PHA (Potentially Hazardous Asteroid) data and match the closest asteroid.
And 3D visualization have realistic calculation algorithm using **Top 5 the most dangerous PHAs** NASA data exported by csv and JSON file for orbital calculation and velocity. 

---

# Demonstration Website
## https://meteor-madness-labqueens.netlify.app/solar-system3d-main/

---

## File Structure
launcher
- **index.html**: Base structure with Google Maps, input form, and results sections
- **map.js**: Initializes Google Maps, handles click events, fetches elevation, determines ocean vs land
- **pha-match-and-sim.js**: Extracts PHA candidates, matches with input, includes physics calculations
- **sim.js**: Manages UI rendering, draws layers on the map, summarizes impact effects

3D visualization
- Open sources beside **orbit,js, orbits_points** this to add top 5 PHAs and PHAs orbit into solar system.
- Editing the open source code for migration/update

## Features

1. Map-based Impact Point Selection (Elevation API: ocean/land)
2. User Input: diameter (m), velocity (m/s), angle (°)
3. NASA NeoWs API Integration
4. Impact Physics: Energy, Crater, Seismic (M, MMI), Tsunami
5. Visualization Filters (Crater / Tsunami / Seismic)

---

# Algorithm Calculation

## 1. Asteroid Candidate Matching (PHA Matching)

- **Log-scale diameter difference:**

$$
d_D = \left|\log(D_{\text{user}}) - \log(D_{\text{api}})\right|
$$

- **Velocity difference (normalized):**

$$
d_V = \frac{|V_{\text{user}} - V_{\text{api}}|}{v_{\text{scale}}}
$$

- **Final matching score:**

$$
\text{score} = w_D \cdot d_D + w_V \cdot d_V
$$


## 2. Impact Energy

- **Basic kinetic energy:**

$$
E = \frac{1}{2} \rho_i V v^2
$$

Where:

$$
\rho_i \text{ is the impactor density}
$$

$$
V = \frac{\pi}{6} d^3 \text{ is the spherical volume}
$$

$$
v \text{ is the velocity}
$$




## 3. Crater Scaling Law

- Based on Collins et al. (2005) scaling laws, the **transient crater diameter** is given by:

$$
D_{\text{tc}} = C \cdot \left(\frac{\rho_i}{\rho_t}\right)^{1/3} d^{0.78} v^{0.44} g^{-0.22} \sin(\theta)^{1/3}
$$

Where:

$$
\rho_t \text{ is the target density}
$$

$$
d \text{ is the impactor diameter}
$$

$$
v \text{ is the velocity}
$$

$$
g \text{ is the gravitational acceleration}
$$

$$
\theta \text{ is the impact angle}
$$



## 4. Crater Depth

- **Simple crater depth:**

$$
h \approx \max\left(\frac{D_{\text{tc}}}{2} + \frac{0.07 D_{\text{tc}}^4}{D_{\text{fr}}^3} - 0.1 \cdot \frac{D_{\text{tc}}}{2}, \ 0.2 D_{\text{fr}}\right) \cdot \left(1 + \frac{\text{elev}}{1000}\right)
$$

- **Complex crater depth:**

$$
h \approx 0.4 \cdot \left(\frac{D_{\text{fr}}}{1000}\right)^{0.3} \cdot 1000 \cdot \left(1 + \frac{\text{elev}}{1000}\right)
$$



## 5. Seismic Magnitude

- **Energy-to-magnitude relation:**

$$
M = 0.67 \cdot \log_{10}(E) - 5.87
$$

This is converted into **MMI (Modified Mercalli Intensity)** levels (ranging from Weak to Severe).



## 6. Tsunami Approximation

- **Shallow water wave speed:**

$$
c = \sqrt{g h}
$$

- **Wave amplitude decay:**

$$
A(r) \approx \frac{D_{\text{tc}}}{14.1} \cdot \left(\frac{R_{\text{ref}}}{r}\right)^p \cdot \left(1 - \frac{\text{elev}}{5000}\right)
$$

Where:

$$
R_{\text{ref}} = 0.75 D_{\text{tc}}
$$

$$
p \approx 1.0 \text{ is the attenuation factor}
$$




## 7. PHA Orbital Calculations

- PHAs are matched not only by size/velocity but also by **orbital elements** (Keplerian parameters) provided by NASA NeoWs API:  
  - **a**: semi-major axis  
  - **e**: eccentricity  
  - **i**: inclination  
  - **Ω (Omega)**: longitude of ascending node  
  - **ω (omega)**: argument of periapsis  
  - **M₀**: mean anomaly at epoch  

From these parameters, the position of the asteroid is computed using **Kepler's Equation**:

$$
M = E - e \sin(E)
$$

- **True anomaly (\(\nu\)):**

$$
\tan\left(\frac{\nu}{2}\right) = \sqrt{\frac{1+e}{1-e}} \cdot \tan\left(\frac{E}{2}\right)
$$

- **Heliocentric position vector \((x, y, z)\):**

$$
\begin{bmatrix} x \\ y \\ z \end{bmatrix}
= R_z(\Omega) \cdot R_x(i) \cdot R_z(\omega) \cdot \begin{bmatrix} r \cos\nu \\ r \sin\nu \\ 0 \end{bmatrix}
$$

Where:

$$
r = \frac{a (1 - e^2)}{1 + e \cos\nu}
$$

This allows for the simulation of the asteroid's orbit relative to Earth and determination of close approaches.

## 8. Coordinate Calculation and Scaling

### Coordinate Transformation and Normalization

The asteroids' orbital data is provided in a set of 3D coordinates. These coordinates need to be transformed and normalized to fit the visualization space. Here's a breakdown of how this is handled:

### Bounding Box Calculation
The first step is to calculate the bounding box of the asteroid's trajectory, which gives the minimum and maximum X, Y, and Z values:

$$
\text{minX} = \min(x_1, x_2, \dots, x_n), \quad \text{maxX} = \max(x_1, x_2, \dots, x_n)
$$

Similarly, the same calculation is performed for the Y and Z coordinates.

### Center Calculation
Once the bounding box is calculated, the center of the asteroid's orbit is computed as the average of the minimum and maximum values for each coordinate axis:

$$
\text{center}_x = \frac{\text{minX} + \text{maxX}}{2}, \quad \text{center}_y = \frac{\text{minY} + \text{maxY}}{2}, \quad \text{center}_z = \frac{\text{minZ} + \text{maxZ}}{2}
$$

### Scaling
The size of the asteroid's orbit is then scaled to fit the target visualization space. The scaling factor is computed as the ratio of the target radius to the orbital radius:

$$
\text{scale} = \frac{\text{targetRadius}}{\text{radius}}
$$

### Coordinate Adjustment
Each asteroid’s coordinates \((x, y, z)\) are adjusted to center the orbit and scale it:

$$
x' = (x - \text{center}_x) \times \text{scale}, \quad y' = (y - \text{center}_y) \times \text{scale}, \quad z' = (z - \text{center}_z) \times \text{scale}
$$

This normalization ensures that all asteroids are placed and scaled appropriately within the **3D visualization space**, making it easy to observe their orbits relative to each other and Earth.


---

## Summary
- **Log-scale difference** for candidate matching  
- **Kinetic energy law** for impact energy  
- **Scaling laws** for crater size/depth  
- **Empirical relation** for seismic magnitude  
- **Shallow-water model** for tsunami height & arrival  
- **Keplerian orbital mechanics** for PHA trajectory and visualization




### Reference / Open Source
1. https://neal.fun/asteroid-launcher/
2. https://github.com/ankitjha2603/solar-system3D
3. https://eprints.soton.ac.uk/412703/
4. https://impact.ese.ic.ac.uk/ImpactEarth/ImpactEffects/effects.pdf (main reference)
5. https://www.researchgate.net/publication/313857682_Population_Vulnerability_Models_for_Asteroid_Impact_Risk_Assessment
6. https://www.osti.gov/biblio/6852629

# Lily App - Part 4: Plant Management (5 Screens)

## Screen 1: Plant Photos Gallery

**Purpose**: View all photos of a plant

**Header**:
- Back button
- Title: "Photos"
- Add photo button (camera icon)

**Photo Grid** (3 columns):
- Square thumbnails
- Tap to view full screen with date
- Full screen has: Close, date, share, delete options

**Empty State**:
- Camera illustration
- "No photos yet"
- "Capture your plant's growth"
- "Add Photo" button

---

## Screen 2: Plant Edit Screen

**Purpose**: Edit plant information

**Header**:
- Cancel button (left)
- Title: "Edit Plant"
- Save button (right, sage green)

**Photo Section**:
- Current plant photo (large, centered)
- "Change Photo" overlay button

**Form Fields**:
- **Name**: Text input (required)
- **Description**: Multiline text (optional)
- **Category**: Dropdown picker

**Care Ratings** (sliders 1-5):
- 💧 Watering needs
- ☀️ Light needs
- 💨 Humidity
- 🐾 Pet toxicity: Toggle (Toxic / Non-toxic)

**Schedule Section**:
- Watering frequency: Number picker + "days"
- Fertilization frequency: Number picker + "days"

**Reminders Toggle**:
- "Enable reminders" switch

**Delete Button** (bottom, coral text):
- Shows confirmation dialog

---

## Screen 3: Add Plant Modal

**Purpose**: Choose how to add a plant

**Presentation**: Bottom sheet or full modal

**Header**:
- Title: "Add Plant"
- Close button (X)

**Three Option Cards**:

**Card 1 - AI Identification**:
- Camera icon with sparkles
- "Identify with AI"
- "Take a photo and let AI identify your plant"

**Card 2 - Scan Card**:
- Card/tag icon
- "Scan nursery card"
- "Scan the care tag from your plant"

**Card 3 - Manual Entry**:
- Pencil icon
- "Add manually"
- "Enter your plant details yourself"

---

## Screen 4: AI Identification - Camera

**Purpose**: Capture plant photo for AI identification

**Full Screen Camera**:
- Live camera feed
- Viewfinder overlay (rounded rectangle, center)
- Guide text: "Position your plant in the frame"

**Controls** (bottom):
- Capture button (large, white, center)
- Gallery button (left): "Choose from gallery"
- Flash toggle (right)

**Top Bar**:
- Close button (X, left)

---

## Screen 5: AI Identification - Results

**Purpose**: Show identification results

**Header**:
- Back button (to retake)
- Title: "Plant Identified"

**Photo Section**:
- Captured image (rounded)
- Confidence badge: "98% match"

**Identification Info**:
- Plant name (large): "Monstera Deliciosa"
- Common name: "Swiss Cheese Plant"
- Category badge: "Tropical"

**Suggested Care Section**:
- 💧 Water: "Every 7-10 days"
- ☀️ Light: "Bright indirect"
- 💨 Humidity: "High (60%+)"
- 🐾 Pet Safe: "⚠️ Toxic to pets"

**Actions**:
- "Add to Collection" button (sage green, primary)
- "Edit Details" link
- "Try Again" link

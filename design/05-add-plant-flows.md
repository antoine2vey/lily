# Lily App - Part 5: Add Plant Flows (5 Screens)

## Screen 1: Card Scanner - Camera

**Purpose**: Scan nursery care card

**Full Screen Camera**:
- Live camera feed
- Card-shaped outline overlay (credit card proportions)
- Guide text: "Align the care card within the frame"

**Controls**:
- Close button (X, top left)
- Help button (?, top right) → shows example cards
- Capture button (bottom center)
- Flash toggle

**Auto-capture indicator**:
- Border turns green when card detected
- "Hold steady..." text

---

## Screen 2: Card Scanner - Results

**Purpose**: Show extracted card information

**Header**:
- Back button
- Title: "Card Scanned"

**Scanned Card Preview**:
- Small image of scanned card
- "Rescan" link

**Extracted Information**:
- Plant name (if detected)
- Care instructions:
  - 💧 Water: "When soil is dry"
  - ☀️ Light: "Low to bright indirect"
  - 🌡️ Temperature: "65-85°F"

**Editable Fields**:
- All extracted fields can be modified
- Empty fields shown for manual entry

**Actions**:
- "Add to Collection" button (sage green)
- "Edit Details" link

---

## Screen 3: Manual Add - Step 1 (Photo & Basics)

**Purpose**: Enter basic plant info

**Header**:
- Back/Cancel button
- Title: "Add Plant"
- Step indicator: "Step 1 of 3"

**Progress Bar**: 33% filled

**Photo Section**:
- Large photo placeholder (dashed border)
- Camera icon + "Add Photo" text
- Tapping opens photo picker

**Form Fields**:
- **Plant Name** (required): Text input
- **Category** (required): Dropdown
  - Options: Tropical, Succulent, Flowering, Fern, Cactus, Herb, Vine, Other

**Navigation**:
- "Next" button (disabled until required fields filled)

---

## Screen 4: Manual Add - Step 2 (Care Ratings)

**Purpose**: Set plant care requirements

**Header**:
- Back button
- Title: "Add Plant"
- Step indicator: "Step 2 of 3"

**Progress Bar**: 66% filled

**Instructions**:
- "Set your plant's care needs"

**Care Rating Sliders**:

**💧 Watering Needs**:
- Slider 1-5
- Labels: "Drought tolerant" ←→ "Loves water"

**☀️ Light Needs**:
- Slider 1-5
- Labels: "Low light" ←→ "Direct sun"

**💨 Humidity**:
- Slider 1-5
- Labels: "Dry air OK" ←→ "High humidity"

**🐾 Pet Safety**:
- Toggle: "Non-toxic" / "Toxic to pets"

**Navigation**:
- "Back" text button
- "Next" button

---

## Screen 5: Manual Add - Step 3 (Schedule)

**Purpose**: Set watering and fertilization schedule

**Header**:
- Back button
- Title: "Add Plant"
- Step indicator: "Step 3 of 3"

**Progress Bar**: 100% filled

**Watering Schedule**:
- "Water every [X] days"
- Number picker (1-60)
- Quick presets: 3 / 7 / 14 days

**Fertilization Schedule**:
- "Fertilize every [X] days"
- Number picker (7-90)
- Quick presets: 14 / 30 / 60 days

**Reminders Toggle**:
- "Enable care reminders"
- Subtext: "We'll notify you when it's time"

**Notes Field** (optional):
- Multiline text
- Placeholder: "Any special care instructions..."

**Navigation**:
- "Back" text button
- "Add Plant" button (sage green)

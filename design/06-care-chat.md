# Lily App - Part 6: Care & AI Chat (5 Screens)

## Screen 1: Care Tab - Today View

**Purpose**: Show today's care tasks and upcoming schedule

**Header**:
- Title: "Care"
- Calendar icon (right)
- Date: "Today, Dec 10"

**Overdue Section** (coral tinted, if any):
- "⚠️ Overdue" header with count
- Plant rows: Thumbnail | Name | "Overdue by X days" | "Water Now" button

**Today Section**:
- "Today" header with count
- Plant rows: Thumbnail | Name | Care icon (💧/🌱) | Action button

**This Week Section**:
- Grouped by day: "Tomorrow - 2 plants", "Wednesday - 1 plant"
- Expandable to see plant details

**Empty State** (if all done):
- Happy plant illustration
- "All caught up! 🌿"
- "Your plants are well cared for"

---

## Screen 2: Care History Timeline

**Purpose**: View all care logs for a specific plant

**Header**:
- Back button
- Title: "Care History"
- Plant name subtitle
- Filter icon

**Filter Options**:
- All | 💧 Watering | 🌱 Fertilization

**Timeline View**:
- Vertical timeline line (sage green)
- Entries grouped by date

**Log Entry**:
- Date header: "December 10, 2024"
- Time: "2:30 PM"
- Care type icon in timeline circle
- Action text: "Watered"
- Notes (if any)
- Photo thumbnail (if attached)

**Add Log Button** (floating, bottom right)

---

## Screen 3: Add Care Log Modal

**Purpose**: Record watering or fertilization

**Presentation**: Bottom sheet

**Header**:
- Handle bar
- Title: "Log Care"
- Close button (X)

**Plant Selector** (if from Care tab):
- Dropdown with plant thumbnail and name

**Care Type Toggle**:
- Segmented control: [💧 Water] [🌱 Fertilize]

**Date & Time**:
- Date picker (default: Today)
- Time picker (default: Now)
- "Now" quick button

**Notes Field**:
- "Notes (optional)"
- Multiline input
- Placeholder: "How did your plant look?"

**Add Photo** (optional):
- Camera/gallery button
- Thumbnail preview if added

**Save Button**:
- "Save Log" (sage green, full width)

---

## Screen 4: AI Chat Screen

**Purpose**: Chat with AI plant assistant

**Header**:
- Back button
- Plant info: Thumbnail + Name + Health dot
- More menu (...)

**Chat Area**:
- AI messages: Left-aligned, sage green bubbles, Lily avatar
- User messages: Right-aligned, white bubbles
- Timestamps below messages
- Image messages show inline preview

**Suggested Prompts** (chips above input):
- "Why are my leaves yellowing?"
- "How often should I water?"
- "Is this a disease?"

**Input Bar** (bottom, sticky):
- Text input: "Ask about your plant..."
- Attachment button (camera icon, left)
- Send button (arrow, right, sage green)

---

## Screen 5: Chat - Image Attachment

**Purpose**: Send image in chat

**State: Image Selected**:
- Image preview above input bar
- Remove button (X) on preview
- Caption input: "Add a caption (optional)..."
- Send button active

**Image Picker Options** (bottom sheet):
- "📷 Take Photo"
- "🖼️ Choose from Library"
- "Cancel"

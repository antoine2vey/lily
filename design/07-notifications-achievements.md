# Lily App - Part 7: Notifications & Achievements (5 Screens)

## Screen 1: Notification Center

**Purpose**: View all notifications

**Header**:
- Back/Close button
- Title: "Notifications"
- "Mark all read" button (right)

**Filter** (optional):
- Tabs: [All] [Unread]

**Notification List** (grouped by date):
- "Today", "Yesterday", "Earlier"

**Notification Item**:
- Icon (40px, colored background):
  - 💧 Blue for water
  - 🌱 Green for fertilize
  - 🏆 Yellow for achievements
- Title (bold): "Time to water Monstera"
- Body: "It's been 7 days since last watering"
- Timestamp: "2h ago"
- Unread dot (blue) if unread
- Tap → deep links to plant or action

---

## Screen 2: Notification Settings

**Purpose**: Configure notification preferences

**Header**:
- Back button
- Title: "Notifications"

**Section: Care Reminders**:
- **Watering reminders**: Toggle (default ON)
  - "Get notified when plants need water"
- **Fertilization reminders**: Toggle (default ON)
  - "Reminders for fertilization"
- **Reminder timing**: Dropdown
  - "Day before" / "Same day" / "Both"

**Section: Other**:
- **Achievement alerts**: Toggle (default ON)
- **Tips & recommendations**: Toggle (default ON)
- **Product updates**: Toggle (default OFF)

**Section: Quiet Hours** (optional):
- Toggle to enable
- Start time: "10:00 PM"
- End time: "8:00 AM"

---

## Screen 3: Achievements Gallery

**Purpose**: View all achievements

**Header**:
- Back button
- Title: "Achievements"
- Stats: "8/15 Unlocked"

**Progress Bar**:
- Overall progress (sage green)
- "8 of 15 achievements unlocked"

**Achievement Grid** (3 columns):
- **Unlocked**: Full color + checkmark
- **Locked**: Grayscale + lock icon
- Badge name below each

**Categories**:
- Getting Started
- Plant Collector
- Care Expert
- AI Explorer

---

## Screen 4: Achievement Detail - Unlocked

**Purpose**: View unlocked achievement details

**Presentation**: Modal or full screen

**Badge Display**:
- Large badge (120px, full color)
- Subtle glow effect

**Info**:
- Name: "Plant Collector"
- Description: "Added 10 plants to your collection"
- Unlock date: "December 5, 2024"

**Actions**:
- "Share" button (sage green)
- "Close" button

---

## Screen 5: Achievement Detail - Locked

**Purpose**: View locked achievement with progress

**Badge Display**:
- Large badge (grayscale)
- Lock icon overlay

**Info**:
- Name: "Plant Collector"
- Description: "Add 10 plants to your collection"
- Status: "Locked"

**Progress Section**:
- Progress bar: 4/10
- "4 of 10 plants added"
- "6 more to unlock!"

**Tip**:
- "💡 Try scanning a nursery card to quickly add plants"

**Action**:
- "Add Plant" button (helps user progress)

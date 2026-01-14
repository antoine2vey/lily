# Lily App - Part 3: Home & Plants List (5 Screens)

## Screen 1: Home Dashboard

**Purpose**: Main dashboard with overview and today's tasks

**Header**:
- Greeting: "Good morning, [Name]"
- User avatar (right)
- Notification bell with badge

**Today's Care Card**:
- Mint gradient background
- "3 plants need water today"
- Horizontal scroll of plant thumbnails needing care
- "Water All" button

**Plant Stats Row** (3 boxes):
- Total Plants: 12
- Healthy: 10
- Needs Attention: 2

**Recent Activity Section**:
- "You watered Monstera - 2h ago"
- "Fern was fertilized - Yesterday"
- "View all" link

**Achievement Progress Card**:
- Mini progress toward next achievement

**Bottom Tab Bar**:
- [Home] [Plants] [+] [Care] [Profile]
- Floating "+" button in center

---

## Screen 2: Home Empty State

**Purpose**: Welcome new users with no plants

**Elements**:
- Same header as dashboard
- Large illustration: Empty pot with small sprout
- Headline: "Your garden awaits"
- Subtext: "Add your first plant to start your care journey"
- "Add Your First Plant" button (sage green, large)

---

## Screen 3: Plants List - Grid View

**Purpose**: View plant collection in grid layout

**Header**:
- Title: "My Plants"
- Search icon → expands to search bar
- View toggle (grid/list)

**Filter Chips** (horizontal scroll):
- All | Healthy | Needs Attention | Sick

**Sort Dropdown**:
- Recently Added | Name (A-Z) | Health

**Plant Grid** (2 columns):
- Plant card:
  - Square photo (rounded corners)
  - Plant name
  - Health status dot (top right of photo)
  - Next watering badge: "💧 2 days"

**Floating "+" Button** (bottom right)

---

## Screen 4: Plants List - List View

**Purpose**: Alternative list layout

**Header**: Same as grid view (toggle switched)

**Plant List Items**:
- Row: [Thumbnail] [Name + Category] [Health + Next watering] [Chevron]
- Thumbnail: 56px circular
- Swipe actions: Water | Edit | Delete

---

## Screen 5: Plant Detail

**Purpose**: Full plant profile

**Hero Section**:
- Full-width plant image (parallax scroll)
- Back button, More menu (...) overlay

**Plant Info Card** (overlapping hero):
- Plant name (large): "Monstera Deliciosa"
- Category badge: "Tropical"
- Health status pill: "Healthy"

**Care Schedule Section**:
- Water card: "Every 7 days" + progress ring + "Next: Tomorrow"
- Fertilize card: "Every 30 days" + progress ring + "Next: Dec 15"

**Quick Actions Row**:
- [💧 Water] [🌱 Fertilize] [📷 Photo] [💬 Chat]

**Care Ratings Section**:
- 💧 Watering: ████░ 4/5
- ☀️ Light: ███░░ 3/5
- 💨 Humidity: ██░░░ 2/5
- 🐾 Pet Safe: ✓ Non-toxic

**Photo Gallery** (horizontal scroll):
- Thumbnails + "+" to add

**Care History Preview**:
- Recent 2-3 logs
- "See all" link

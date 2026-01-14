# Figma Design Prompt for Lily Plant Care App

## Design Brief

Create a complete mobile app design system and user flow screens for **Lily**, a plant care management app. The design should feel **fresh, calming, and approachable** - like a digital greenhouse companion.

---

## Brand & Visual Identity

**App Name**: Lily
**Tagline**: "Your plants, thriving"

### Color Palette (Light & Greenish with Multiple Tones)

```
Primary Colors:
- Sage Green: #78A55A (primary actions, CTAs)
- Mint: #A8D5BA (secondary elements, backgrounds)
- Forest: #2D5A3D (text, icons, emphasis)

Neutral Tones:
- Cream White: #FAFDF7 (main background)
- Soft Gray: #F0F4EC (cards, containers)
- Warm Gray: #6B7B6E (secondary text)

Accent Colors:
- Soft Yellow: #F5E6A3 (sunlight indicators, achievements)
- Coral: #E8A598 (alerts, needs attention)
- Sky Blue: #A5C4D4 (water indicators)

Health Status Colors:
- Thriving: #4CAF50
- Healthy: #78A55A
- Needs Attention: #FFB74D
- Sick: #E57373
- Recovering: #64B5F6
```

### Typography

- **Headlines**: SF Pro Display (or similar) - Bold, rounded
- **Body**: SF Pro Text - Regular, clean
- **Accent**: A friendly rounded sans-serif for badges/labels

### Design Principles

1. Light, airy feel with plenty of white space
2. Soft shadows and rounded corners (16-24px radius)
3. Organic shapes and plant-inspired illustrations
4. Gentle gradients from mint to sage
5. Friendly empty states with plant illustrations
6. Micro-interactions for care actions (water droplet animations, leaf growth)

---

## Screen Specifications

### 1. Onboarding & Authentication (5 screens)

#### 1.1 Splash Screen
- Lily logo (leaf-inspired)
- Soft gradient background (cream to mint)
- App tagline

#### 1.2 Welcome/Intro Carousel (3 slides)
- Slide 1: "Track your plant family" - Illustration of plant collection
- Slide 2: "Never forget to water" - Watering reminder illustration
- Slide 3: "AI-powered plant care" - Plant identification illustration
- Progress dots, Skip button, Next button

#### 1.3 Magic Link Login
- Headline: "Let's grow together"
- Email input field with leaf icon
- "Send Magic Link" button (sage green, full width)
- Subtle plant illustration in background

#### 1.4 Check Your Email
- Email sent confirmation illustration (envelope with leaf)
- "We sent a link to [email]"
- "Open email app" button
- "Resend link" text button
- "Use different email" link

#### 1.5 Username Setup
- Headline: "What should we call you?"
- Username input with availability check (✓ available, ✗ taken)
- Character limit indicator
- "Continue" button
- Skip option

---

### 2. Main Navigation (Tab Bar)

**Bottom Tab Bar** (5 tabs):
```
[Home] [Plants] [+] [Care] [Profile]
   🏠      🌿     ➕    💧     👤
```

- Floating center "+" button for adding plants (sage green, elevated)
- Active state: filled icon + sage green
- Inactive state: outline icon + warm gray
- Subtle top border or shadow

---

### 3. Home Dashboard (3 screens)

#### 3.1 Home - With Plants
- Header: "Good morning, [Name]" with avatar
- Weather/light widget (optional)
- **Today's Care** card:
  - "3 plants need water today"
  - Horizontal scroll of plant thumbnails needing care
  - Quick "Water All" button
- **Plant Stats** row:
  - Total plants: 12
  - Healthy: 10
  - Needs attention: 2
- **Recent Activity** feed:
  - "You watered Monstera - 2h ago"
  - "Fern was fertilized - Yesterday"
- **Achievement Progress** mini-card

#### 3.2 Home - Empty State
- Friendly illustration (empty pot with sprout)
- "Your garden awaits"
- "Add your first plant to get started"
- Large "+" button

#### 3.3 Home - Notifications Badge
- Bell icon in header with red badge count
- Tapping opens notification center

---

### 4. Plants Collection (6 screens)

#### 4.1 Plants List - Grid View
- Search bar with filter icon
- Filter chips: All | Healthy | Needs Attention | Sick
- Sort dropdown: Recently Added | Name | Health
- Grid of plant cards (2 columns):
  - Plant photo (square, rounded)
  - Plant name
  - Health status dot
  - Days until watering badge
- Floating "+" button

#### 4.2 Plants List - List View Toggle
- Same filters
- List items with:
  - Thumbnail | Name | Health | Next watering
  - Swipe actions: Water, Edit, Delete

#### 4.3 Plant Detail
- Hero image (full width, with parallax scroll)
- Back button, Edit button, More menu (...)
- **Plant Info Card**:
  - Name (large)
  - Category badge (Tropical, Succulent, etc.)
  - Health status pill
- **Care Schedule** section:
  - Water: "Every 7 days" - Next: "Tomorrow"
  - Fertilize: "Every 30 days" - Next: "Dec 15"
  - Progress rings showing cycle
- **Quick Actions** row:
  - [💧 Water] [🌱 Fertilize] [📷 Photo] [💬 Chat]
- **Care Ratings** (visual sliders/bars):
  - 💧 Watering needs: ████░ 4/5
  - ☀️ Light needs: ███░░ 3/5
  - 💨 Humidity: ██░░░ 2/5
  - 🐾 Pet safe: ✓ Non-toxic
- **Photo Gallery** horizontal scroll
- **Care History** recent logs preview
- **AI Chat** entry point

#### 4.4 Plant Photos Gallery
- Grid of photos (3 columns)
- Tap to view full screen with date
- Add photo button
- Delete/share options

#### 4.5 Plant Edit Screen
- Editable fields:
  - Photo (tap to change)
  - Name
  - Description (multiline)
  - Category dropdown
  - Care ratings (sliders)
  - Watering frequency (days picker)
  - Fertilization frequency
  - Reminders toggle
- Save/Cancel buttons

#### 4.6 Plant Settings
- Reminder settings per plant
- Delete plant (with confirmation)

---

### 5. Add Plant Flow (6 screens)

#### 5.1 Add Plant Modal
- Bottom sheet or full screen
- Three options as large cards:
  - 📷 "Identify with AI" - Take a photo
  - 🏷️ "Scan nursery card" - Scan care tag
  - ✏️ "Add manually" - Enter details yourself
- Each card has illustration and description

#### 5.2 AI Identification - Camera
- Full screen camera view
- Viewfinder overlay (rounded rectangle)
- "Point at your plant"
- Capture button (large, centered)
- Gallery picker option
- Flash toggle

#### 5.3 AI Identification - Processing
- Captured image preview
- Loading animation (growing leaf)
- "Identifying your plant..."

#### 5.4 AI Identification - Results
- Plant photo at top
- **Identified as**: "Monstera Deliciosa"
- Confidence badge: "98% match"
- **Suggested Care**:
  - Category: Tropical
  - Water: Every 7-10 days
  - Light: Bright indirect
  - Humidity: High
  - Pet safe: No (toxic)
- "Add to collection" button
- "Try again" link
- "Edit details" option

#### 5.5 Card Scanner - Camera
- Camera with card outline overlay
- "Align the care card within the frame"
- Auto-capture or manual button

#### 5.6 Manual Add Form
- Step indicator (1/3, 2/3, 3/3)
- **Step 1**: Photo + Name + Category
- **Step 2**: Care ratings (interactive sliders)
- **Step 3**: Watering/fertilization schedule
- Progress bar
- Next/Back buttons

---

### 6. Care & Reminders (5 screens)

#### 6.1 Care Tab - Today View
- Date header with calendar icon
- **Overdue** section (coral background):
  - Plants that needed care yesterday
- **Today** section:
  - List of plants needing care today
  - Each item: Photo | Name | Care type icon | "Water" button
- **This Week** section:
  - Upcoming care schedule
- Empty state: "All caught up! 🌿"

#### 6.2 Care History (per plant)
- Timeline view
- Each entry:
  - Date/time
  - Care type icon (💧 or 🌱)
  - Notes (if any)
  - Photo thumbnail (if any)
- Filter by: All | Watering | Fertilization
- Add log button

#### 6.3 Add Care Log Modal
- Plant selector (if from general view)
- Care type toggle: Water | Fertilize
- Date picker (default: now)
- Notes field (optional)
- Add photo option
- Save button

#### 6.4 Care Log Detail
- Full photo (if attached)
- Care type and date
- Notes
- Edit/Delete options

#### 6.5 Quick Water Confirmation
- Bottom sheet popup
- Plant thumbnail and name
- "Mark as watered?"
- Optional notes field
- "Confirm" button with water droplet animation
- Next watering date preview

---

### 7. AI Plant Chat (4 screens)

#### 7.1 Chat Screen
- Plant header (thumbnail + name + health)
- Chat interface:
  - AI messages: Left-aligned, sage green bubbles
  - User messages: Right-aligned, white bubbles
  - Timestamps
  - Image messages with preview
- Input bar:
  - Text field
  - Camera/gallery button
  - Send button
- Suggested prompts (chips):
  - "Why are leaves yellowing?"
  - "How often should I water?"
  - "Is this a disease?"

#### 7.2 Chat - Image Attachment
- Image preview before sending
- Caption field
- Send/Cancel

#### 7.3 Chat - AI Thinking
- Typing indicator animation
- "Lily is thinking..."

#### 7.4 Chat History
- List of past conversations
- Date headers
- Message previews

---

### 8. Notifications (3 screens)

#### 8.1 Notification Center
- Header: "Notifications"
- Mark all as read button
- Filter: All | Unread
- Notification cards:
  - Icon (💧 water, 🌱 fertilize, 🏆 achievement)
  - Title: "Time to water Monstera"
  - Body: "It's been 7 days since last watering"
  - Timestamp
  - Unread dot indicator
- Empty state: "No notifications yet"

#### 8.2 Notification Detail
- Full notification content
- Related plant link
- Action button (if applicable)

#### 8.3 Notification Settings
- Toggle switches:
  - Watering reminders
  - Fertilization reminders
  - Achievement alerts
  - Tips & recommendations
- Quiet hours setting

---

### 9. Achievements (3 screens)

#### 9.1 Achievements Gallery
- Header with total count: "8/15 Unlocked"
- Progress bar
- Grid of achievement badges:
  - Unlocked: Full color with checkmark
  - Locked: Grayscale with lock icon
- Categories:
  - Getting Started
  - Plant Collector
  - Care Expert
  - AI Explorer

#### 9.2 Achievement Detail
- Large badge illustration
- Achievement name
- Description
- Unlock date (if unlocked)
- Progress (if in progress): "4/10 plants"
- Share button

#### 9.3 Achievement Unlock Animation
- Full screen celebration
- Badge reveal animation
- Confetti/particles
- Achievement name and description
- "Share" and "Continue" buttons

---

### 10. Profile & Settings (6 screens)

#### 10.1 Profile Tab
- Profile header:
  - Avatar (editable)
  - Name
  - Username
  - Bio
  - Join date
- **Stats Row**:
  - Plants: 12
  - Care logs: 156
  - Achievements: 8/15
- **Quick Links**:
  - Edit Profile
  - Subscription
  - Settings
  - Help & Support
- Sign out button

#### 10.2 Edit Profile
- Avatar picker
- Name field
- Bio field (multiline, character limit)
- Save button

#### 10.3 Settings Screen
- Sections:
  - **Notifications** → Notification preferences
  - **Appearance** → Theme (light/dark/system)
  - **Account** → Email, password, delete account
  - **About** → Version, terms, privacy, licenses
- Each item with chevron indicator

#### 10.4 Subscription Status
- Current plan card:
  - Free tier or Premium badge
  - Usage meters:
    - AI Chats: 3/10 used
    - Plant IDs: 2/5 used
    - Card Scans: 5/10 used
  - Reset date
- "Upgrade to Premium" button (if free)
- Manage subscription link (if premium)

#### 10.5 Upgrade Screen
- Premium benefits list:
  - ✓ Unlimited AI chats
  - ✓ Unlimited plant identification
  - ✓ Unlimited card scans
  - ✓ Priority support
  - ✓ Early access to features
- Pricing: "$4.99/month"
- Annual option: "$39.99/year (Save 33%)"
- "Start Free Trial" button
- Terms and restore purchase links

#### 10.6 Usage Limit Modal
- Warning illustration
- "You've reached your limit"
- Usage breakdown
- "Upgrade for unlimited" button
- "Wait until [reset date]" option

---

### 11. Empty & Error States (4 screens)

#### 11.1 No Plants Empty State
- Illustration: Empty pot with soil
- "Your garden is empty"
- "Add your first plant to get started"
- Add plant button

#### 11.2 No Care History Empty State
- Illustration: Watering can
- "No care logs yet"
- "Log your first watering or fertilization"

#### 11.3 Network Error
- Illustration: Wilted plant
- "Connection lost"
- "Check your internet and try again"
- Retry button

#### 11.4 Generic Error
- Illustration: Confused plant
- "Something went wrong"
- Error details (collapsible)
- Retry / Go home buttons

---

### 12. Micro-interactions & Animations

**Specify animations for**:
- Water button: Ripple effect, droplet animation
- Fertilize button: Sparkle/growth effect
- Achievement unlock: Badge reveal with confetti
- Plant health change: Smooth color transition
- Pull to refresh: Watering can animation
- Loading states: Growing leaf spinner
- Tab switching: Smooth crossfade
- Card interactions: Subtle scale on press

---

## User Flow Diagrams

### Flow 1: First-Time User
```
Splash → Welcome Carousel → Magic Link → Check Email →
Username Setup → Home (Empty) → Add Plant Modal
```

### Flow 2: Daily Care
```
Home → Today's Care Card → Tap Plant →
Quick Water → Confirmation → Updated Schedule
```

### Flow 3: Add Plant via AI
```
Tap "+" → Choose "Identify with AI" → Camera →
Capture → Processing → Results → Add to Collection → Plant Detail
```

### Flow 4: Chat with AI
```
Plant Detail → Tap "Chat" → Chat Screen →
Type/Attach Photo → Send → AI Response
```

### Flow 5: Upgrade Flow
```
Use Feature → Limit Modal → Tap Upgrade →
Subscription Screen → Select Plan → Checkout → Success
```

---

## Deliverables Checklist

### Design System
- [ ] Color palette with all shades
- [ ] Typography scale
- [ ] Icon set (outline + filled)
- [ ] Button styles (primary, secondary, ghost, disabled)
- [ ] Input fields (default, focus, error, success)
- [ ] Card styles
- [ ] Badge/pill styles
- [ ] Health status indicators
- [ ] Care rating visualizations

### Components
- [ ] Bottom tab bar
- [ ] Plant card (grid + list variants)
- [ ] Care log item
- [ ] Notification item
- [ ] Achievement badge
- [ ] Chat bubbles
- [ ] Modal/bottom sheet
- [ ] Empty state template
- [ ] Loading states

### Screens
40+ screens as specified above

### Prototypes
- [ ] Onboarding flow
- [ ] Add plant flow
- [ ] Daily care flow
- [ ] AI chat interaction

---

## Export Specifications

- **Frame size**: 390 x 844 (iPhone 14 Pro)
- **Also design for**: 428 x 926 (iPhone 14 Pro Max)
- **Android variant**: 360 x 800
- **Export**: 1x, 2x, 3x for assets
- **Handoff**: Use Figma Dev Mode or export specs

---

## App Features Reference

### Core Features
- Magic link authentication (passwordless)
- Plant collection management (CRUD)
- AI plant identification (photo-based)
- Nursery card scanning
- Watering & fertilization reminders
- Care history logging
- AI chat assistant (per plant)
- Push notifications
- Achievement system (15 achievements)
- Subscription tiers (Free/Premium)

### Premium Features (Usage Limited on Free)
- AI plant identification: 5/month free
- Nursery card scans: 10/month free
- AI chat messages: 10/month free
- Unlimited with Premium ($4.99/month)

### Plant Data Model
- Name, description, photo
- Category (Tropical, Succulent, Flowering, etc.)
- Health status (Thriving, Healthy, Needs Attention, Sick, Recovering)
- Care ratings (1-5): Watering, Lighting, Humidity, Pet Toxicity
- Watering frequency (days)
- Fertilization frequency (days)
- Last watered/fertilized dates
- Next watering/fertilization dates
- Reminders enabled toggle

### Achievement Types
1. First Plant Added
2. Watering Novice (5 waterings)
3. Plant Collector (10+ plants)
4. Dedicated Caretaker (100+ care logs)
5. Photo Pro (50+ photos)
6. Scan Champ (20+ card scans)
7. Fertilizer Guru (30+ fertilizations)
8. AI Conversationalist (50+ chats)
9. Disease Detective
10. Growth Tracker
11. Reminder Rescuer
12. Share Sprout
13. Rare Collector
14. History Hero
15. Attention Alert

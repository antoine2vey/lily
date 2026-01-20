# User Settings Implementation Plan

## Overview

Implement settings screens based on the HTML mockups in `~/Downloads/lily_screens/`. This includes the main settings hub and sub-screens for notifications.

## API Status

| Feature | API Status | Implementation |
|---------|------------|----------------|
| Email display | ✅ `getUserSettings` | Read-only display |
| Subscription | ✅ `getCurrentSubscription` | Show tier badge |
| Notifications | ✅ `updateUserSettings` | 3 toggles: soilAlerts, wateringReminders, ads |
| Theme | ❌ None needed | Client-side (AsyncStorage) |
| Logout | ✅ `logout` | Functional |
| Delete Account | ❌ Admin only | Placeholder (disabled) |
| Password | ❌ N/A | Skip (magic link auth) |
| Help/Contact | ❌ None needed | External URLs |

## Design Reference Files

- `general_app_settings/code.html` - Main settings screen
- `notification_settings/code.html` - Notification preferences
- `theme_selection_menu/code.html` - Theme picker modal

## Screens to Implement

### 1. Main Settings Screen (`/(app)/settings.tsx`)

Based on `general_app_settings` design:

**Sections:**
- **Account**: Email (display only), Subscription status (with tier badge)
- **Appearance**: Theme (opens modal)
- **Notifications**: Link to notification settings screen
- **Support**: Help Center, Contact Us (external links via `Linking.openURL`)
- **Danger Zone**: Logout button (functional), Delete Account (disabled/placeholder)
- **Footer**: Version number

**Skipped from design:**
- Password row (not applicable - magic link auth)

**Design Pattern:**
- Section headers: uppercase, small, slate-500 color
- Cards: white bg, rounded-2xl, ring-1 border
- Row items: icon in primary/10 circle, label, chevron right
- 64px min height per row

### 2. Notification Settings Screen (`/(app)/settings/notifications.tsx`)

Based on `notification_settings` design:

**Sections:**
- **Care Reminders**:
  - Watering reminders toggle → `wateringReminders`
  - Soil alerts toggle → `soilAlerts` (mapped from design's "Fertilization")
- **Updates & Alerts**:
  - Promotional messages toggle → `ads`

**Note**: The API only supports 3 notification settings (`soilAlerts`, `wateringReminders`, `ads`). The design shows more options but we'll implement only what the API supports.

### 3. Theme Selection Modal

Based on `theme_selection_menu` design:

- Bottom sheet modal with 3 options: Light, Dark, System
- Radio button style selection
- Uses React Native appearance API + AsyncStorage for persistence

## Files to Create

```
packages/app/
├── app/(app)/
│   ├── settings.tsx              # Main settings
│   └── settings/
│       └── notifications.tsx     # Notification settings
├── src/components/
│   ├── settings/
│   │   ├── SettingsSection.tsx   # Section with header + card
│   │   ├── SettingsRow.tsx       # Clickable row with icon
│   │   └── SettingsToggle.tsx    # Row with Switch
│   └── ui/
│       └── ThemeModal.tsx        # Theme picker bottom sheet
```

## Files to Modify

```
packages/app/
├── app/(app)/index.tsx           # Add settings icon to header
└── src/components/ui/index.ts    # Export new components
```

## Component Specifications

### SettingsSection
```typescript
type Props = {
  title: string
  children: ReactNode
}
```
Renders section header + white card container.

### SettingsRow
```typescript
type Props = {
  icon: MaterialIconName
  label: string
  value?: string          // Optional right-side text
  badge?: string          // e.g., "Pro" badge
  onPress: () => void
  showChevron?: boolean
  destructive?: boolean   // Red text for delete actions
}
```

### SettingsToggle
```typescript
type Props = {
  icon: MaterialIconName
  label: string
  description?: string
  value: boolean
  onValueChange: (value: boolean) => void
  disabled?: boolean
}
```

### ThemeModal
```typescript
type Props = {
  visible: boolean
  onClose: () => void
  currentTheme: 'light' | 'dark' | 'system'
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void
}
```
Bottom sheet with radio options.

## API Integration

**Fetch settings:**
```typescript
const { data: settings } = useEffectQuery(
  'users',
  'getUserSettings',
  { urlParams: { id: userId } },
  { enabled: !!userId }
)
```

**Update notifications:**
```typescript
const mutation = useEffectMutation('users', 'updateUserSettings')

mutation.mutate({
  urlParams: { id: userId },
  payload: { notifications: { wateringReminders: true } }
})
```

## Navigation Flow

```
Home → [gear icon] → Settings
                        ├── Push Notifications → Notification Settings
                        ├── Theme → Theme Modal (bottom sheet)
                        ├── Help Center → External URL
                        ├── Contact Us → External URL
                        └── Logout → Auth logout
```

## Styling (from mockups)

- Font: Plus Jakarta Sans (already configured)
- Primary: `#80ac53`
- Background: `bg-background-light` / `bg-background-dark`
- Cards: `bg-white dark:bg-[#1e2936]` with `rounded-2xl` and `ring-1 ring-slate-900/5`
- Section headers: `text-xs font-bold uppercase tracking-wider text-slate-500`
- Icons: 24px in `rounded-full bg-primary/10` container (40x40)

## Implementation Order

1. Create reusable components (`SettingsSection`, `SettingsRow`, `SettingsToggle`)
2. Create main settings screen with static content
3. Add navigation from home screen
4. Create notification settings screen with API integration
5. Create theme modal with persistence
6. Wire up all navigation and actions

## Verification

1. Navigate: Home → Settings via gear icon
2. Verify sections render with correct styling matching mockups
3. Verify email and subscription badge display correctly
4. Navigate: Settings → Notifications
5. Toggle each notification setting (watering, soil, ads), verify API calls succeed
6. Open theme modal, select theme, verify it persists after app restart
7. Tap Help Center / Contact Us, verify external links open
8. Verify Delete Account is disabled with explanatory text
9. Tap Logout, verify redirect to login screen
10. Test dark mode appearance throughout all screens

---

## Design Reference (HTML Mockups)

### Main Settings Screen (`general_app_settings`)

Key structure:
```html
<!-- Header -->
<header class="sticky top-0 z-50 bg-background-light/80 backdrop-blur-md border-b border-slate-200/50 px-4 py-3">
  <button class="flex items-center justify-center text-primary size-10 rounded-full">
    <span class="material-symbols-outlined">arrow_back_ios_new</span>
  </button>
  <h1 class="text-lg font-bold">Settings</h1>
</header>

<!-- Section Pattern -->
<section>
  <h4 class="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2 ml-3">Account</h4>
  <div class="bg-white dark:bg-[#1e2936] rounded-2xl overflow-hidden shadow-sm ring-1 ring-slate-900/5">
    <!-- Row Item -->
    <div class="flex items-center gap-4 p-4 min-h-[64px] border-b border-slate-100">
      <div class="flex items-center justify-center rounded-full bg-primary/10 text-primary size-10">
        <span class="material-symbols-outlined">mail</span>
      </div>
      <div class="flex-1">
        <p class="text-slate-900 text-base font-medium">Email</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-slate-400 text-sm">jane@plantlover.com</span>
        <span class="material-symbols-outlined text-slate-400 text-[20px]">chevron_right</span>
      </div>
    </div>

    <!-- Subscription with Badge -->
    <div class="flex items-center gap-4 p-4 min-h-[64px]">
      <div class="flex items-center justify-center rounded-full bg-primary/10 text-primary size-10">
        <span class="material-symbols-outlined">loyalty</span>
      </div>
      <div class="flex-1">
        <p class="text-slate-900 text-base font-medium">Subscription</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-primary font-semibold text-sm bg-primary/10 px-2 py-0.5 rounded-md">Pro</span>
        <span class="material-symbols-outlined text-slate-400 text-[20px]">chevron_right</span>
      </div>
    </div>
  </div>
</section>

<!-- Delete Account Button -->
<button class="w-full bg-white text-[#FF6B6B] hover:bg-red-50 font-bold text-base py-4 rounded-2xl shadow-sm ring-1 ring-slate-900/5">
  Delete Account
</button>

<!-- Version Footer -->
<p class="text-slate-400 text-xs font-medium">Version 1.0.2</p>
```

### Notification Settings (`notification_settings`)

Key structure:
```html
<!-- Toggle Row Pattern -->
<div class="flex items-center justify-between p-4 border-b border-gray-100">
  <div class="flex items-center gap-4">
    <div class="flex items-center justify-center w-10 h-10 rounded-xl bg-forest-green/10 text-forest-green">
      <span class="material-symbols-outlined">water_drop</span>
    </div>
    <div>
      <p class="font-medium leading-tight">Watering reminders</p>
      <p class="text-xs text-warm-gray mt-0.5">Alerts when plants are thirsty</p>
    </div>
  </div>

  <!-- Toggle Switch -->
  <label class="relative inline-flex items-center cursor-pointer">
    <input type="checkbox" checked class="sr-only peer" />
    <div class="w-11 h-6 bg-gray-200 rounded-full peer
                peer-checked:after:translate-x-full
                after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all
                peer-checked:bg-sage-green"></div>
  </label>
</div>
```

### Theme Selection Modal (`theme_selection_menu`)

Key structure:
```html
<!-- Bottom Sheet -->
<div class="w-full bg-white rounded-t-lg shadow-2xl pb-8">
  <!-- Drag Handle -->
  <div class="flex flex-col items-center pt-3 pb-2">
    <div class="h-1.5 w-12 rounded-full bg-gray-200"></div>
  </div>

  <!-- Header -->
  <div class="flex flex-col items-center px-6 pt-2 pb-6">
    <h3 class="text-2xl font-bold">Appearance</h3>
    <p class="text-sm font-medium mt-1 opacity-70">Choose how your garden looks</p>
  </div>

  <!-- Radio Option -->
  <label class="relative group cursor-pointer block">
    <input type="radio" name="theme_selection" value="light" checked class="peer sr-only" />
    <div class="flex items-center gap-4 bg-cardbg p-4 rounded-[1.5rem] border-2 border-transparent
                peer-checked:border-sage peer-checked:bg-white shadow-sm peer-checked:shadow-md">
      <div class="flex items-center justify-center rounded-full bg-white size-12
                  peer-checked:bg-sage peer-checked:text-white">
        <span class="material-symbols-outlined">light_mode</span>
      </div>
      <div class="flex-1">
        <p class="text-lg font-bold">Light Mode</p>
      </div>
      <div class="size-8 rounded-full border-2 border-forest/10
                  peer-checked:bg-sage peer-checked:border-sage peer-checked:text-white">
        <span class="material-symbols-outlined">check</span>
      </div>
    </div>
  </label>

  <!-- Done Button -->
  <button class="w-full h-14 rounded-full bg-sage text-white text-lg font-bold">
    Done
  </button>
</div>
```

### Color Palette (from mockups)

```
Primary: #80ac53 (sage green)
Background Light: #f7f7f6
Background Dark: #191d15
Surface Dark: #1e2936
Text Main: slate-900
Text Secondary: slate-400/500
Destructive: #FF6B6B (coral)
```

### Icon Mappings (Material Symbols)

| Feature | Icon Name |
|---------|-----------|
| Email | `mail` |
| Password | `lock` |
| Subscription | `loyalty` |
| Theme | `contrast` |
| Notifications | `notifications` |
| Help | `help` |
| Contact | `chat_bubble` |
| Watering | `water_drop` |
| Fertilization | `compost` |
| Achievements | `emoji_events` |
| Tips | `lightbulb` |
| Updates | `new_releases` |
| Quiet Hours | `bedtime` |
| Light Mode | `light_mode` |
| Dark Mode | `dark_mode` |
| System | `devices` |
| Back | `arrow_back_ios_new` |
| Chevron | `chevron_right` |
| Check | `check` |

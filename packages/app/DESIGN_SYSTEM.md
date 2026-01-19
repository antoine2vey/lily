# Lily Design System

A comprehensive design system extracted from the Lily app mockups for consistent UI implementation.

---

## Color Palette

### Primary Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Primary Green** | `#5B8C5A` | Primary buttons, active states, icons, navigation |
| **Primary Green Dark** | `#4A7A49` | Button pressed states, emphasis |
| **Primary Green Light** | `#6B9C6A` | Hover states |

### Secondary Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Coral/Salmon** | `#E8997E` | Destructive actions, delete buttons |
| **Coral Dark** | `#D88A6F` | Destructive button pressed states |

### Background Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Background** | `#F8FAF8` | Main app background |
| **Surface** | `#FFFFFF` | Cards, modals, sheets |
| **Surface Tinted** | `#F0F5F0` | Subtle green-tinted backgrounds |
| **Input Background** | `#E8F0E8` | Input fields, dropdowns |

### Text Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Text Primary** | `#1A1A1A` | Headlines, important text |
| **Text Secondary** | `#4A5568` | Body text, descriptions |
| **Text Muted** | `#9CA3AF` | Timestamps, placeholders |
| **Text Inverse** | `#FFFFFF` | Text on dark/colored backgrounds |

### Status Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Success** | `#5B8C5A` | Healthy status, success states |
| **Warning** | `#F59E0B` | Attention needed, overdue |
| **Error** | `#EF4444` | Errors, critical alerts |
| **Info** | `#3B82F6` | Informational, water-related |

### Semantic Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Water Blue** | `#60A5FA` | Watering actions, hydration |
| **Fertilizer Orange** | `#F59E0B` | Fertilization actions |
| **Prune Red** | `#F87171` | Pruning actions |
| **Mist Teal** | `#5EEAD4` | Misting actions |
| **Achievement Gold** | `#FCD34D` | Achievement badges, rewards |

---

## Typography

### Font Family
- **Primary**: System font (SF Pro on iOS, Roboto on Android)
- **Fallback**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

### Type Scale
| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| **Display** | 32px | 700 | 1.2 | Splash screen title |
| **H1** | 28px | 700 | 1.3 | Page titles ("Good morning, Alex") |
| **H2** | 24px | 600 | 1.3 | Section headers, modal titles |
| **H3** | 20px | 600 | 1.4 | Card titles, plant names |
| **H4** | 18px | 600 | 1.4 | Subsection headers |
| **Body Large** | 16px | 400 | 1.5 | Primary body text |
| **Body** | 14px | 400 | 1.5 | Standard body text |
| **Body Small** | 12px | 400 | 1.4 | Secondary info, timestamps |
| **Caption** | 11px | 500 | 1.3 | Labels, section headers (uppercase) |
| **Button** | 16px | 600 | 1 | Button text |

### Special Styles
- **Section Headers**: 11px, uppercase, letter-spacing: 0.5px, color: Text Muted (e.g., "ACCOUNT", "APPEARANCE")
- **Links**: Primary Green, underline on hover
- **Tagline**: 14px, 400 weight, Text Muted ("Your plants, thriving")

---

## Spacing

### Base Unit
8px grid system

### Spacing Scale
| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight spacing, icon gaps |
| `space-2` | 8px | Small gaps, inline elements |
| `space-3` | 12px | List item padding |
| `space-4` | 16px | Standard padding, card padding |
| `space-5` | 20px | Section spacing |
| `space-6` | 24px | Large gaps |
| `space-8` | 32px | Section margins |
| `space-10` | 40px | Page margins |
| `space-12` | 48px | Large section spacing |

### Screen Padding
- **Horizontal**: 16px (mobile standard)
- **Safe area**: Respect device safe areas

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 8px | Small elements, chips |
| `radius-md` | 12px | Input fields, small cards |
| `radius-lg` | 16px | Cards, images |
| `radius-xl` | 24px | Buttons, large cards |
| `radius-full` | 9999px | Avatars, circular buttons |

---

## Shadows

| Name | Value | Usage |
|------|-------|-------|
| **Shadow SM** | `0 1px 2px rgba(0,0,0,0.05)` | Subtle elevation |
| **Shadow MD** | `0 4px 6px rgba(0,0,0,0.07)` | Cards, dropdowns |
| **Shadow LG** | `0 10px 25px rgba(0,0,0,0.1)` | Modals, bottom sheets |

---

## Components

### Buttons

#### Primary Button
```
Background: Primary Green (#5B8C5A)
Text: White
Border Radius: 24px (radius-xl)
Padding: 16px 32px
Font: 16px, 600 weight
Height: 52px
```

#### Secondary Button
```
Background: Transparent
Border: 1px solid Primary Green
Text: Primary Green
Border Radius: 24px
Padding: 16px 32px
```

#### Destructive Button
```
Background: Coral (#E8997E)
Text: White
Border Radius: 24px
```

#### Text Button
```
Background: Transparent
Text: Primary Green
No border
```

#### Icon Button
```
Size: 40px x 40px
Border Radius: radius-full
Background: Surface Tinted or transparent
```

### Cards

#### Standard Card
```
Background: White
Border Radius: 16px
Padding: 16px
Shadow: Shadow MD (optional)
```

#### Plant Card (Grid)
```
Background: White
Border Radius: 16px
Image: Top, border-radius 12px
Padding: 12px
```

#### Stat Card
```
Background: White
Border Radius: 12px
Padding: 16px
Text: Centered
Border: 1px solid #E5E7EB (optional)
```

### Input Fields

#### Text Input
```
Background: #E8F0E8
Border: none (or 1px solid transparent)
Border Radius: 12px
Padding: 14px 16px
Font: 16px
Focus: Border 1px solid Primary Green
```

#### Dropdown/Select
```
Same as Text Input
Chevron icon on right
```

### Chips/Pills

#### Filter Chip
```
Background: Transparent (inactive), Primary Green (active)
Text: Text Secondary (inactive), White (active)
Border Radius: 20px
Padding: 8px 16px
Font: 14px, 500 weight
```

#### Status Badge
```
Background: Status color with 20% opacity
Text: Status color
Border Radius: 12px
Padding: 4px 10px
Font: 12px, 600 weight
```

### Navigation

#### Bottom Tab Bar
```
Background: White
Height: 64px (+ safe area)
Border Top: 1px solid #E5E7EB
Icon Size: 24px
Label: 10px
Active: Primary Green
Inactive: Text Muted
```

#### FAB (Floating Action Button)
```
Size: 56px
Background: Primary Green
Icon: White, 24px
Border Radius: radius-full
Shadow: Shadow LG
Position: Center of tab bar
```

### Bottom Sheet

```
Background: White
Border Radius: 24px 24px 0 0 (top corners only)
Handle: 36px x 4px, #D1D5DB, centered, margin-top 8px
Padding: 24px
```

### List Items

#### Settings List Item
```
Padding: 16px
Icon Container: 40px, Border Radius full, Background Surface Tinted
Icon: 20px, Primary Green
Text: Body Large
Chevron: 16px, Text Muted
Divider: 1px solid #F3F4F6
```

#### Plant List Item
```
Avatar: 56px, Border Radius 12px
Title: H4
Subtitle: Body Small, Text Muted
Padding: 12px
```

### Chat Bubbles

#### Assistant Message
```
Background: #E8F5E8
Border Radius: 16px 16px 16px 4px
Padding: 12px 16px
Max Width: 80%
Align: Left
```

#### User Message
```
Background: #F3F4F6
Border Radius: 16px 16px 4px 16px
Padding: 12px 16px
Max Width: 80%
Align: Right
```

### Avatars

| Size | Dimensions | Usage |
|------|------------|-------|
| XS | 32px | Small indicators |
| SM | 40px | List items, settings |
| MD | 56px | Plant cards, chat |
| LG | 80px | Profile, detail views |
| XL | 120px | Hero images |

### Modals

```
Background: White
Border Radius: 24px
Padding: 24px
Max Width: 320px
Shadow: Shadow LG
Overlay: rgba(0,0,0,0.5)
```

### Timeline

```
Line: 2px solid #E5E7EB
Dot: 32px circle, colored by action type
Card: Standard card, connected to dot
Spacing: 16px between entries
```

### Achievement Badge

#### Unlocked
```
Size: 80px
Background: Gradient (lighter to Primary Green)
Icon: 40px, White
Border: 3px solid Achievement Gold
```

#### Locked
```
Same size
Background: #E5E7EB
Icon: Text Muted
Border: none
Opacity: 0.6
```

---

## Icons

### Icon Sizes
| Size | Dimensions | Usage |
|------|------------|-------|
| XS | 16px | Inline, badges |
| SM | 20px | List items |
| MD | 24px | Navigation, buttons |
| LG | 32px | Feature icons |
| XL | 40px | Illustrations |

### Icon Style
- **Style**: Rounded/outlined (not sharp)
- **Stroke**: 1.5-2px
- **Color**: Inherits from text or specified semantic color

---

## Animation

### Durations
| Name | Duration | Usage |
|------|----------|-------|
| Fast | 150ms | Hover, focus states |
| Normal | 250ms | Transitions, toggles |
| Slow | 350ms | Page transitions, modals |

### Easing
- **Default**: `ease-out` / `cubic-bezier(0.0, 0.0, 0.2, 1)`
- **Enter**: `ease-out`
- **Exit**: `ease-in`

---

## Implementation Notes

### Files to Create/Modify
- `packages/app/src/theme/colors.ts` - Color tokens
- `packages/app/src/theme/typography.ts` - Typography scale
- `packages/app/src/theme/spacing.ts` - Spacing tokens
- `packages/app/src/theme/index.ts` - Theme export
- `packages/app/src/components/ui/` - Reusable components

### React Native Considerations
- Use `StyleSheet.create()` for performance
- Consider using a theme provider (React Context or styled-components)
- Use `react-native-safe-area-context` for safe areas
- Platform-specific font weights may be needed

---

## Quick Reference - Most Used Values

```typescript
// Colors
const colors = {
  primary: '#5B8C5A',
  primaryDark: '#4A7A49',
  primaryLight: '#6B9C6A',
  coral: '#E8997E',
  coralDark: '#D88A6F',
  background: '#F8FAF8',
  surface: '#FFFFFF',
  surfaceTinted: '#F0F5F0',
  inputBackground: '#E8F0E8',
  textPrimary: '#1A1A1A',
  textSecondary: '#4A5568',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',
  success: '#5B8C5A',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  waterBlue: '#60A5FA',
  fertilizerOrange: '#F59E0B',
  pruneRed: '#F87171',
  mistTeal: '#5EEAD4',
  achievementGold: '#FCD34D',
}

// Spacing (8px grid)
const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 40,
  '3xl': 48,
}

// Border Radius
const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
}

// Typography
const typography = {
  display: { size: 32, weight: '700', lineHeight: 1.2 },
  h1: { size: 28, weight: '700', lineHeight: 1.3 },
  h2: { size: 24, weight: '600', lineHeight: 1.3 },
  h3: { size: 20, weight: '600', lineHeight: 1.4 },
  h4: { size: 18, weight: '600', lineHeight: 1.4 },
  bodyLarge: { size: 16, weight: '400', lineHeight: 1.5 },
  body: { size: 14, weight: '400', lineHeight: 1.5 },
  bodySmall: { size: 12, weight: '400', lineHeight: 1.4 },
  caption: { size: 11, weight: '500', lineHeight: 1.3 },
  button: { size: 16, weight: '600', lineHeight: 1 },
}
```

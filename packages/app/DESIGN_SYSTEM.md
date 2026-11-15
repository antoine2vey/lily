# Lily design system

How the app looks, and the components that carry the look. The tokens live in two files. `tailwind.config.js` defines the classes. `src/theme/index.ts` holds the same colors as hex values (`iconColorsLight`, `iconColorsDark`) for props that take a color, which read them through `useIconColors()`. This page names the roles and points to those files for the values. The styling rules for code live in `CLAUDE.md`.

## Color roles

| Role | Classes |
| --- | --- |
| Brand and primary actions | `primary`, pressed `primary-dark`. Primary text pairs `text-primary` with `dark:text-primary-light`. `primary-tint` fills the user's chat bubble and the success badge |
| Destructive actions | `coral`, pressed `coral-dark` |
| Screen background | `bg-background` with `dark:bg-background-dark` |
| Cards, sheets and modals | `bg-white` or `bg-surface` with `dark:bg-surface-dark` |
| Inputs and filled cards | `bg-surface-tinted` with `dark:bg-surface-dark` |
| Text | `text-text-primary` with `dark:text-white`, then `text-text-secondary` and `text-text-muted` |
| Borders | `border-border` with `dark:border-slate-700` |
| Status | `success` (the primary green), `warning`, `error`, `info` |
| Achievements | `achievement-gold` |

`background-light`, `surface-light` and `text-main` are legacy aliases of `background`, `surface` and `text-primary`. The config also extends the `slate`, `amber`, `blue`, `orange`, `teal` and `purple` scales with the shades the badges and care states use.

Dark mode is class-based. Every background, text and border class carries its `dark:` pair. `iconColorsDark` holds brighter variants of the icon colors so they read on dark surfaces.

### Care type colors

Each care type has an icon color in `iconColors`: `waterBlue` for watering, `fertilizerOrange` for fertilization, `mistTeal` for misting and `repotBrown` for repotting. `src/screens/care/components/care-type-config.ts`, which the Care tab task and plan cards use, draws misting in `waterBlue`.

## Typography

The font is Space Grotesk, loaded in `app/_layout.tsx`. The classes `font-regular`, `font-medium`, `font-semibold` and `font-bold` select its four faces, and `font-extrabold` falls back to bold. Font sizes are Tailwind's defaults (`text-base` is 16px).

| Use | Classes |
| --- | --- |
| Sheet title | `text-2xl font-bold tracking-tight` |
| Section header | `text-lg font-semibold`, with its action in `text-sm text-primary` |
| Body | `text-base font-regular` |
| Button label | `text-base font-semibold` |
| Secondary text and captions | `text-sm` or `text-xs`, in `text-text-muted` |

## Radius and shadows

The radius scale is custom, so `rounded-xl` is 24px and `rounded-2xl` is 32px. Read `borderRadius` in `tailwind.config.js` for the full scale.

| Element | Radius |
| --- | --- |
| Buttons and inputs | `rounded-xl`, or `rounded-full` for the pill form |
| Cards | `rounded-2xl` |
| Bottom sheets | 32px |
| Modals | `rounded-3xl` |
| Chips | `rounded-full`, or `rounded-lg` for the input chip |

The shadow scale adds `shadow-soft`, `shadow-nav` and `shadow-sheet` to the usual sizes. The elevated card sets its shadow and Android `elevation` through `style`, because those have no class.

## Components

The base controls live in `src/components/ui/`. The shared components live in `src/components/`. A component with variants maps each one to class strings with `Match`, so read the component for the exact classes.

### Button

`src/components/ui/Button.tsx`. It is 56px tall (`h-14`) with `px-8` and a 0.98 scale while pressed. Its one optional 20px icon sits right of the label unless `iconPosition` is `left`. `pill` makes it fully round, `loading` swaps the label for a spinner, and `disabled` drops it to 50% opacity.

| Variant | Look |
| --- | --- |
| `primary` | Solid primary with white text |
| `secondary` | Primary border and text on a clear fill |
| `destructive` | Solid coral with white text |
| `ghost` | Primary text with no fill |
| `glass` | Translucent white fill and border with white text. It is the secondary action on the green mesh background, where the outline of `secondary` disappears |

### Icon buttons

`src/components/ui/IconButton.tsx` is a 40px circle with no fill and a faint pressed fill. Its icon defaults to `slate900`. `src/components/GlassIconButton.tsx` and `src/components/GlassBackButton.tsx` are the 40px liquid glass versions, with a solid fallback.

### Input

`src/components/ui/Input.tsx`. It is 56px tall, `rounded-xl` (or `rounded-full` as a pill), `bg-surface-tinted`, with `px-5` and `text-base` text. An error adds a 2px `border-error`.

### Chip

`src/components/Chip.tsx`. A selected chip is solid primary with white text. An unselected chip is white with a `slate-200` border. The label is `text-sm font-medium`.

| Variant | Shape |
| --- | --- |
| `filter` | `px-4 py-2 rounded-full` |
| `input` | `px-3 py-1.5 rounded-lg` |
| `suggestion` | `px-3.5 py-2.5 rounded-full` |

### Badge

`src/components/Badge.tsx`. A tinted fill with colored `font-semibold` text, `rounded-md`. The variants are `success`, `warning`, `error`, `info` and `neutral`. The `sm` size uses 10px text, and `md` uses `text-xs`.

### Card

`src/components/Card.tsx`. Every card is `rounded-2xl`. Padding is `none`, `sm`, `md` (the default) or `lg`, which map to `p-0`, `p-2`, `p-4` and `p-6`.

| Variant | Look |
| --- | --- |
| `elevated` (default) | White with a soft native shadow |
| `outlined` | White with a `border-border` outline |
| `filled` | `bg-surface-tinted` |

### Avatar

`src/components/Avatar.tsx`. Sizes `xs`, `sm`, `md`, `lg` and `xl` are 20, 32, 40, 56 and 80px. Without an image it shows initials in white on primary.

### Bottom sheet

`src/components/BottomSheet.tsx`. A 32px top radius on the surface color, a `text-2xl font-bold` title with a 32px close button, and `px-5` content padded for the home indicator.

### Confirmation modal

`src/components/ConfirmationModal.tsx`. A 320px wide card, `rounded-3xl` with `p-6`, over a 50% black overlay. A 56px icon circle sits above the title.

### Skeletons

`src/components/skeletons/index.ts` exports `SkeletonBox` and `SkeletonCircle`. A screen's skeleton mirrors its real layout. `CLAUDE.md` covers when a screen shows one.

## Chat bubbles

### Assistant message

```
Background: none (text on the screen background)
Avatar: none
Width: full content width
Text: Markdown, 16px / 24px line height
Align: left
```

### User message

```
Background: primary-tint (dark: white 10%)
Border: none
Radius: rounded-xl (24px)
Padding: 10px 16px
Max width: 82%
Text: text-base, 24px line height
Align: right
```

Messages are 24px apart. Images render outside the bubble at 224px, `rounded-xl`.

## Chat bars and composer

The chat follows iOS 26 Messages. Both bars float over the message list, which fills the screen behind them. Each glass element checks `useGlass` and falls back to a solid surface when liquid glass is unavailable.

### Header

```
Background: none (floats over the list)
Back and menu: GlassBackButton, GlassIconButton (40px circles)
Title pill: liquid glass, non-interactive, sized to its text
  Height: 40px (title only), 44px (title and subtitle)
  Radius: half the height
  Padding: 0 16px
  Title: text-base, SemiBold
  Subtitle: text-xs, text-muted (dark: slate-400), one line
Fallback pill: white (dark: surface-dark), rounded-full
```

### Composer

```
Container: liquid glass, radius 28px, 12px side margins
Fallback: surface (dark: surface-dark), radius 28px, 1px border at 60%
          (dark: white 10%), shadow-soft (dark: none)
Attach (+): no fill under glass; surface-tinted (dark: white 10%) in the fallback
Send: 36px solid primary circle; idle is border (dark: white 10%)
Photo thumbnail: inside the capsule, above the text row
Bottom gap: home indicator inset (min 12px); 8px while the keyboard is open
```

### Layout

- The header and composer report their heights with `onLayout`. The list uses them as insets, so the first and last messages clear both bars. The list is inverted, so `paddingTop` is the visual bottom.
- A scroll-edge fade sits under each bar. It is solid background over the system inset (status bar, home indicator), drops to 70% halfway through the bar, and clears at the bar's inner edge.
- The error banner and its Retry pill sit directly above the composer, on an opaque background base so the error tint reads over any message. The follow-up chips sit there too. The typing indicator is the list's first row, so it also sits above the composer.
- A new chat fills the space between the two bars. The mascot empty state takes the free height, and the plant carousel and starter chips sit at its bottom.
- Both bars use `pointerEvents="box-none"`, so a drag in the gaps beside the title pill scrolls the list.

## Icons and motion

Icons come from `MaterialIcons` in `@expo/vector-icons`, at 20px inside buttons. Screens and sections enter with Reanimated's `FadeIn.duration(300)`.

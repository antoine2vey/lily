# App Package Architecture

This document describes the architecture and patterns specific to the React Native mobile app.

> **Global rules** (Effect patterns, code conventions) are in the root `/CLAUDE.md`

---

## Critical Styling Rules

### NativeWind is the Primary Styling Method

**ALWAYS use `className` with Tailwind classes for styling.** This app uses NativeWind, which brings Tailwind CSS to React Native.

```tsx
// ✅ CORRECT - Use className with Tailwind
<View className="flex-1 bg-background p-4">
  <Text className="text-xl font-semibold text-text-primary">Hello</Text>
</View>
```

### NEVER Use StyleSheet.create() for Static Styles

StyleSheet.create() should **NEVER** be used for styles that can be expressed with Tailwind classes.

```tsx
// ❌ FORBIDDEN - Raw StyleSheet for static styles
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAF8', padding: 16 },
})

// ✅ CORRECT - Tailwind classes
<View className="flex-1 bg-background p-4">
```

### When Inline Styles ARE Acceptable

Use inline `style` prop **ONLY** for:

1. **Dynamic values** that cannot be expressed in Tailwind:
   ```tsx
   <View style={{ transform: [{ translateX: animatedValue }] }} />
   <View style={{ height: dynamicHeight }} />
   ```

2. **Font families** (NativeWind limitation):
   ```tsx
   <Text className="text-base text-text-primary" style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
     Text with custom font
   </Text>
   ```

3. **Platform-specific overrides** when absolutely necessary:
   ```tsx
   <View style={Platform.select({ ios: { shadowOffset: { width: 0, height: 2 } } })} />
   ```

4. **Animated styles** from Reanimated:
   ```tsx
   <Animated.View style={animatedStyle} className="bg-primary rounded-xl" />
   ```

---

## Theme Token Reference

### Colors

| Design Token | Tailwind Class | Hex Value |
|-------------|----------------|-----------|
| Primary Green | `bg-primary`, `text-primary`, `border-primary` | `#5B8C5A` |
| Primary Dark | `bg-primary-dark` | `#4A7A49` |
| Primary Light | `bg-primary-light` | `#6B9C6A` |
| Primary Tint | `bg-primary-tint` | `#E8F5E8` |
| Coral | `bg-coral`, `text-coral` | `#E8997E` |
| Coral Dark | `bg-coral-dark` | `#D88A6F` |
| Background | `bg-background` | `#F8FAF8` |
| Surface | `bg-surface` | `#FFFFFF` |
| Surface Tinted | `bg-surface-tinted` | `#F0F5F0` |
| Input Background | `bg-input-bg` | `#E8F0E8` |
| Text Primary | `text-text-primary` | `#1A1A1A` |
| Text Secondary | `text-text-secondary` | `#4A5568` |
| Text Muted | `text-text-muted` | `#9CA3AF` |
| Success | `bg-success`, `text-success` | `#5B8C5A` |
| Warning | `bg-warning`, `text-warning` | `#F59E0B` |
| Error | `bg-error`, `text-error` | `#EF4444` |
| Info | `bg-info`, `text-info` | `#3B82F6` |
| Water Blue | `bg-water-blue`, `text-water-blue` | `#60A5FA` |
| Achievement Gold | `bg-achievement-gold` | `#FCD34D` |
| Border | `border-border` | `#E5E7EB` |

### Spacing

Use Tailwind spacing classes (based on 4px increments):

| Spacing | Class | Value |
|---------|-------|-------|
| 1 | `p-1`, `m-1`, `gap-1` | 4px |
| 2 | `p-2`, `m-2`, `gap-2` | 8px |
| 3 | `p-3`, `m-3`, `gap-3` | 12px |
| 4 | `p-4`, `m-4`, `gap-4` | 16px |
| 5 | `p-5`, `m-5`, `gap-5` | 20px |
| 6 | `p-6`, `m-6`, `gap-6` | 24px |
| 8 | `p-8`, `m-8`, `gap-8` | 32px |

### Border Radius

| Token | Class | Value |
|-------|-------|-------|
| Small | `rounded-sm` | 8px |
| Medium | `rounded-md` | 12px |
| Large | `rounded-lg` | 16px |
| Extra Large | `rounded-xl` | 24px |
| 2XL | `rounded-2xl` | 32px |
| Full | `rounded-full` | 9999px |

### Typography

| Style | Classes |
|-------|---------|
| Display | `text-3xl font-bold` (32px) |
| H1 | `text-2xl font-bold` (28px) |
| H2 | `text-xl font-semibold` (24px) |
| H3 | `text-lg font-semibold` (20px) |
| H4 | `text-base font-semibold` (18px) |
| Body Large | `text-base font-regular` (16px) |
| Body | `text-sm font-regular` (14px) |
| Body Small | `text-xs font-regular` (12px) |
| Caption | `text-[11px] font-medium uppercase tracking-wide` |

**Font families** (use with style prop):
- `SpaceGrotesk_400Regular` - Regular text
- `SpaceGrotesk_500Medium` - Medium weight
- `SpaceGrotesk_600SemiBold` - Semibold (buttons, headings)
- `SpaceGrotesk_700Bold` - Bold (titles)

---

## Component Variant Pattern

When creating components with variants, use Effect's `Match` module for exhaustive variant handling. Return className strings, not style objects.

```tsx
import { Match, pipe } from 'effect'

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost'

const getButtonClasses = (variant: ButtonVariant): string =>
  pipe(
    Match.value(variant),
    Match.when('primary', () => 'bg-primary active:bg-primary-dark'),
    Match.when('secondary', () => 'bg-transparent border border-primary'),
    Match.when('destructive', () => 'bg-coral active:bg-coral-dark'),
    Match.when('ghost', () => 'bg-transparent'),
    Match.exhaustive
  )

// Usage
export function Button({ variant = 'primary', children }: ButtonProps) {
  return (
    <Pressable className={`rounded-xl py-4 px-8 ${getButtonClasses(variant)}`}>
      <Text
        className={`text-base font-semibold text-center ${getTextClasses(variant)}`}
        style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
      >
        {children}
      </Text>
    </Pressable>
  )
}
```

---

## Common Styling Mistakes

### 1. Using StyleSheet.create() for Static Styles

```tsx
// ❌ WRONG
const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16 },
})
<View style={styles.card}>...</View>

// ✅ CORRECT
<View className="bg-surface rounded-lg p-4">...</View>
```

### 2. Hardcoding Color Hex Values

```tsx
// ❌ WRONG
<View style={{ backgroundColor: '#5B8C5A' }}>
<Text style={{ color: '#1A1A1A' }}>

// ✅ CORRECT
<View className="bg-primary">
<Text className="text-text-primary">
```

### 3. Mixing Styles Unnecessarily

```tsx
// ❌ WRONG - Mixing className and style for things Tailwind can handle
<View className="flex-1" style={{ padding: 16, backgroundColor: '#F8FAF8' }}>

// ✅ CORRECT - Only use style for what Tailwind cannot handle
<View className="flex-1 p-4 bg-background">
```

---

## Quick Reference Patterns

**Card:**
```tsx
<View className="bg-surface rounded-lg p-4 shadow-md">
```

**Primary Button:**
```tsx
<Pressable className="bg-primary active:bg-primary-dark rounded-xl py-4 px-8">
  <Text className="text-white text-base text-center" style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
    Button
  </Text>
</Pressable>
```

**Input Field:**
```tsx
<TextInput
  className="bg-input-bg rounded-md px-4 py-3.5 text-base text-text-primary"
  placeholderTextColor="#9CA3AF"
/>
```

**Section Header:**
```tsx
<Text
  className="text-[11px] text-text-muted uppercase tracking-wide mb-2"
  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
>
  SECTION TITLE
</Text>
```

**List Item:**
```tsx
<Pressable className="flex-row items-center p-4 bg-surface border-b border-border">
  <View className="w-10 h-10 rounded-full bg-surface-tinted items-center justify-center mr-3">
    <Icon name="settings" size={20} className="text-primary" />
  </View>
  <Text className="flex-1 text-base text-text-primary">Item Label</Text>
  <Icon name="chevron-right" size={16} className="text-text-muted" />
</Pressable>
```

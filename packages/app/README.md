# App Package

> React Native mobile application built with Expo

## Overview

The app package contains the React Native mobile application for iOS, Android, and Web. It's built using Expo SDK ~53 and React 19, providing a cross-platform plant care management experience.

## Project Structure

```
.
├── src/
│   └── utils/                  # Utility functions
├── assets/                     # Static assets (images, fonts)
├── .expo/                      # Expo configuration cache
├── index.ts                    # App entry point
├── app.json                    # Expo configuration
├── package.json                # Dependencies & scripts
├── tsconfig.json               # TypeScript configuration
└── .env                        # Environment variables
```

## Tech Stack

- **React**: 19.0.0
- **React Native**: 0.79.4
- **Expo**: SDK ~53.0.12
- **TanStack Query**: 5.81.5 (data fetching)
- **Effect.js**: 3.17.5 (functional programming)

## Getting Started

### Prerequisites

1. **Install Expo CLI** (if not already installed):
```bash
npm install -g expo-cli
```

2. **Install dependencies**:
```bash
cd packages/app
bun install
```

3. **Environment Setup**:
Create a `.env` file in `packages/app/`:
```bash
API_URL=http://localhost:3000
```

### Running the App

#### Development Server
```bash
bun run start
```
Opens Expo Dev Tools in your browser. Scan QR code with Expo Go app (iOS/Android).

#### Platform-Specific

**iOS Simulator** (macOS only):
```bash
bun run ios
```

**Android Emulator** (requires Android Studio):
```bash
bun run android
```

**Web Browser**:
```bash
bun run web
```

## Development Workflow

### Hot Reloading
Expo provides fast refresh out of the box. Save any file to see changes instantly.

### Debugging

**React DevTools**:
```bash
npm install -g react-devtools
react-devtools
```

**Chrome DevTools**:
- Shake device or press `Cmd+D` (iOS) / `Cmd+M` (Android)
- Select "Debug JS Remotely"

**Expo Dev Tools**:
- Access at `http://localhost:19002` when dev server is running
- View logs, run on different devices, open debugger

## Project Configuration

### Expo Configuration (`app.json`)

Key settings:
- **name**: App display name
- **slug**: URL-friendly identifier
- **version**: App version
- **sdkVersion**: Expo SDK version
- **platforms**: ios, android, web
- **splash**: Splash screen configuration
- **icon**: App icon path

See [Expo App Config](https://docs.expo.dev/workflow/configuration/) for full options.

### Environment Variables

Create `.env` in `packages/app/`:
```bash
API_URL=http://localhost:3000
EXPO_PUBLIC_API_URL=http://localhost:3000  # Available in app via process.env
```

**Important**: Expo requires `EXPO_PUBLIC_` prefix for environment variables accessible in the app.

## API Integration

### TanStack Query

The app uses TanStack Query (React Query) for API communication:

```typescript
import { useQuery } from '@tanstack/react-query'

function PlantsScreen() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['plants'],
    queryFn: async () => {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/plants`)
      return response.json()
    },
  })

  if (isLoading) return <Loading />
  if (error) return <Error />

  return <PlantsList plants={data} />
}
```

### Effect.js Integration

Planned integration with Effect RPC client for type-safe API calls:

```typescript
import { Effect } from 'effect'
import { HttpClient } from '@effect/platform'

const getPlants = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  const response = yield* client.get('/api/plants')
  return yield* response.json
})
```

See [API Package](../api/README.md) for backend endpoints.

## Building for Production

### EAS Build (Recommended)

**Setup EAS**:
```bash
npm install -g eas-cli
eas login
eas build:configure
```

**Build for iOS**:
```bash
eas build --platform ios
```

**Build for Android**:
```bash
eas build --platform android
```

**Build for both**:
```bash
eas build --platform all
```

### Classic Build (Local)

**iOS** (macOS only):
```bash
expo build:ios
```

**Android**:
```bash
expo build:android
```

See [Expo Build](https://docs.expo.dev/build/introduction/) for detailed guide.

## Testing

```bash
# Run tests
bun test

# Watch mode
bun test --watch

# Coverage
bun test --coverage
```

## Common Tasks

### Adding a New Screen

1. **Create screen component** in `src/screens/`:
```typescript
// src/screens/MyScreen.tsx
import React from 'react'
import { View, Text } from 'react-native'

export function MyScreen() {
  return (
    <View>
      <Text>My Screen</Text>
    </View>
  )
}
```

2. **Add to navigation** (when navigation is set up)

### Adding Dependencies

```bash
# Install via bun
cd packages/app
bun add <package>

# Install via expo
expo install <package>
```

**Note**: Use `expo install` for packages with native dependencies to ensure version compatibility.

### Using Native APIs

Expo provides many built-in APIs:

```typescript
import * as Camera from 'expo-camera'
import * as Location from 'expo-location'
import * as Notifications from 'expo-notifications'

// Request permissions
const { status } = await Camera.requestCameraPermissionsAsync()

// Use camera
const photo = await camera.takePictureAsync()
```

See [Expo API Reference](https://docs.expo.dev/versions/latest/) for available APIs.

### Custom Fonts

1. **Add fonts to `assets/fonts/`**
2. **Load in app**:
```typescript
import { useFonts } from 'expo-font'

function App() {
  const [fontsLoaded] = useFonts({
    'CustomFont-Regular': require('./assets/fonts/CustomFont-Regular.ttf'),
  })

  if (!fontsLoaded) return null

  return <MainApp />
}
```

### App Icons & Splash Screen

**Icon**:
- Place image at `assets/icon.png` (1024x1024 recommended)
- Configure in `app.json`: `"icon": "./assets/icon.png"`

**Splash Screen**:
- Place image at `assets/splash.png`
- Configure in `app.json`: `"splash": { "image": "./assets/splash.png" }`

## Project Status

This is an early-stage mobile app with minimal implementation. Key areas to develop:

- **Navigation**: React Navigation or Expo Router
- **State Management**: Effect.js integration
- **UI Components**: Component library (e.g., React Native Paper)
- **Authentication**: JWT token storage & refresh
- **Screens**: Plants, Care Logs, Notifications, Profile, etc.
- **Push Notifications**: Expo Push integration
- **Offline Support**: React Query persistence
- **Error Handling**: Error boundaries & user feedback

## Planned Features

- Plant inventory management
- Care log tracking
- Watering/fertilizing reminders
- AI plant identification
- AI chat assistant
- Achievement system
- Photo gallery
- User profiles & settings

## Troubleshooting

### Metro Bundler Issues
```bash
# Clear cache
expo start -c

# Or manually
rm -rf node_modules
rm -rf .expo
bun install
```

### iOS Build Errors
- Ensure you have Xcode installed (macOS only)
- Update CocoaPods: `sudo gem install cocoapods`
- Clear iOS build: `rm -rf ios/build`

### Android Build Errors
- Ensure Android Studio is installed
- Set `ANDROID_HOME` environment variable
- Accept Android SDK licenses: `sdkmanager --licenses`

### Network Errors
- Ensure backend API is running
- Check `API_URL` in `.env`
- For iOS simulator, use `http://localhost:3000`
- For Android emulator, use `http://10.0.2.2:3000`
- For physical device, use computer's local IP

## Related Documentation

- [Root README](../../README.md) - Project overview
- [API Package](../api/README.md) - Backend endpoints
- [Shared Package](../shared/README.md) - Shared types & schemas
- [Expo Documentation](https://docs.expo.dev) - Official Expo docs
- [React Native Documentation](https://reactnative.dev) - React Native docs
- [TanStack Query](https://tanstack.com/query/latest) - Data fetching

## Quick Reference

### Commands
```bash
bun run start           # Start development server
bun run ios             # Run on iOS simulator
bun run android         # Run on Android emulator
bun run web             # Run in web browser
bun test                # Run tests
bun run lint            # Check linting
bun run lint:fix        # Fix linting issues
```

### Environment Variables
```bash
# .env
API_URL=http://localhost:3000
EXPO_PUBLIC_API_URL=http://localhost:3000
```

### Device Connection
- **iOS Simulator**: `http://localhost:3000`
- **Android Emulator**: `http://10.0.2.2:3000`
- **Physical Device**: `http://<YOUR_LOCAL_IP>:3000`

### Key Files
- `index.ts` - App entry point
- `app.json` - Expo configuration
- `.env` - Environment variables
- `assets/` - Static assets

# Lily Monorepo

This is a Bun monorepo containing multiple packages for the Lily project.

## Structure

```
lily/
├── packages/
│   ├── api/          # Node.js API with Effect RPC
│   └── shared/       # Shared utilities and types
├── package.json      # Root workspace configuration
└── bunfig.toml      # Bun workspace configuration
```

## Available Scripts

### Root Level (runs across all packages)

- `bun run build` - Build all packages
- `bun run test` - Run tests in all packages
- `bun run lint` - Run linting in all packages + biome check
- `bun run lint:fix` - Fix linting issues in all packages + biome check
- `bun run clean` - Clean all packages

### Package Level

- `bun run --filter=@lily/api dev` - Run API in development mode
- `bun run --filter=@lily/shared build` - Build shared package only

## Workspace Dependencies

Packages can depend on each other using `workspace:*`:

```json
{
  "dependencies": {
    "@lily/shared": "workspace:*"
  }
}
```

## Adding New Packages

1. Create a new directory in `packages/`
2. Add a `package.json` with a unique name (prefixed with `@lily/`)
3. Include standard scripts: `build`, `test`, `lint`, `lint:fix`, `clean`
4. Run `bun install` to link workspace dependencies

## Development Workflow

1. `bun install` - Install all dependencies
2. `bun run build` - Build all packages
3. `bun run lint` - Check code quality
4. `bun run test` - Run all tests
5. `bun run --filter=@lily/api dev` - Start development server 
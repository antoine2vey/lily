# Lily App Implementation Tasks

Atomic, testable, committable tasks for implementing the Lily mobile app screens.

## Quick Start

1. Pick a phase to work on
2. Open the task file (e.g., `phase-00-core-components/T0.01-bottom-sheet.md`)
3. Implement the component/feature
4. Write tests as specified
5. Run tests: `cd packages/app && bun test`
6. Update task status in the file
7. Commit with the specified message

## Phases Overview

| Phase | Tasks | Description |
|-------|-------|-------------|
| [00 - Core Components](./phase-00-core-components/) | 13 | Reusable UI components |
| [01 - Tab Navigation](./phase-01-tab-navigation/) | 6 | Bottom tab navigator |
| [02 - Home Dashboard](./phase-02-home-dashboard/) | 7 | Home screen |
| [03 - My Plants](./phase-03-my-plants/) | 8 | Plants collection |
| [04 - Plant Detail](./phase-04-plant-detail/) | 13 | Plant detail view |
| [05 - Add Plant](./phase-05-add-plant/) | 10 | Add plant flow |
| [06 - Edit Plant](./phase-06-edit-plant/) | 8 | Edit plant form |
| [07 - Care Tasks](./phase-07-care-tasks/) | 7 | Care tasks screen |
| [08 - Care History](./phase-08-care-history/) | 6 | Care history timeline |
| [09 - Log Care](./phase-09-log-care/) | 7 | Log care entry |
| [10 - AI Chat](./phase-10-ai-chat/) | 11 | AI plant assistant |
| [11 - Notifications](./phase-11-notifications/) | 7 | Notification center |
| [12 - Notification Settings](./phase-12-notification-settings/) | 6 | Notification preferences |
| [13 - Achievements](./phase-13-achievements/) | 8 | Achievements gallery |
| [14 - Settings](./phase-14-settings/) | 9 | Settings screen |
| [15 - Privacy/About](./phase-15-privacy-about/) | 7 | Privacy & About |

**Total: 133 tasks**

## Task File Structure

Each task file contains:

```markdown
# T{phase}.{number} - Task Name

Brief description.

## Status: Not Started | In Progress | Complete

## Design Reference
- Screen design file name

## Output Files
- Files to create/modify

## Implementation
- Code snippets

## Test Cases
- Test descriptions

## Completion Checklist
- [ ] Criteria 1
- [ ] Criteria 2

## Ralph Loop Completion
Output `<promise>TASK COMPLETE</promise>` when all checklist items are done and tests pass.

## Commit Message
- Suggested commit message
```

## Workflow

### Starting a Task

1. Update status to "In Progress"
2. Create output files
3. Implement feature

### Testing

```bash
cd packages/app
bun test src/components/__tests__/ComponentName.test.tsx  # Single file
bun test                                                   # All tests
```

### Completing a Task

1. Verify all checklist items
2. Update status to "Complete"
3. Commit with specified message:

```bash
git add .
git commit -m "feat(app): add ComponentName component"
```

## Dependencies

Tasks list their dependencies. Complete dependent tasks first:

```
T0.01 (BottomSheet) ─┬─> T5.01 (Add Plant Options)
                     ├─> T4.08 (Plant Options Menu)
                     └─> T9.01 (Log Care Sheet)
```

## Design References

Screen designs are in `~/Downloads/lily_screens/`. Each task references the relevant design file.

## Recommended Order

1. **Phase 0** - Core components (parallel work possible)
2. **Phase 1** - Tab navigation
3. **Phase 2** - Home dashboard
4. **Phases 3-6** - Plants (collection, detail, add, edit)
5. **Phases 7-9** - Care (tasks, history, logging)
6. **Phase 10** - AI Chat
7. **Phases 11-12** - Notifications
8. **Phase 13** - Achievements
9. **Phases 14-15** - Settings & Privacy

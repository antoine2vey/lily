import { createTestMembership } from '@lily/api/__tests__/fixtures/canopies'
import {
  allowedRoles,
  allows,
  type PlantAction,
  PlantRole,
  plantRole,
} from '@lily/api/services/plants/helpers/plant-access'
import type { CanopyId, PlantOwner } from '@lily/shared'
import { Array, Option, Record } from 'effect'
import { describe, expect, it } from 'vitest'

const roles = [
  PlantRole.Owner(),
  PlantRole.Caretaker(),
  PlantRole.CanopyOwner(),
  PlantRole.CanopyCreator(),
  PlantRole.CanopyMember(),
]

// decisions.md, "Actions on a Canopy plant", "Moving plants", "Reminders"
const expected: Record<PlantAction, ReadonlyArray<PlantRole['_tag']>> = {
  view: ['Owner', 'Caretaker', 'CanopyOwner', 'CanopyCreator', 'CanopyMember'],
  edit: ['Owner', 'Caretaker', 'CanopyOwner', 'CanopyCreator', 'CanopyMember'],
  care: ['Owner', 'Caretaker', 'CanopyOwner', 'CanopyCreator', 'CanopyMember'],
  photo: ['Owner', 'Caretaker', 'CanopyOwner', 'CanopyCreator', 'CanopyMember'],
  diagnose: [
    'Owner',
    'Caretaker',
    'CanopyOwner',
    'CanopyCreator',
    'CanopyMember',
  ],
  chat: ['Owner', 'Caretaker', 'CanopyOwner', 'CanopyCreator', 'CanopyMember'],
  markDead: ['Owner', 'CanopyOwner', 'CanopyCreator', 'CanopyMember'],
  revive: ['Owner', 'CanopyOwner', 'CanopyCreator', 'CanopyMember'],
  delete: ['Owner', 'CanopyOwner', 'CanopyCreator'],
  share: ['Owner'],
  unshare: ['CanopyOwner', 'CanopyCreator'],
  mute: ['CanopyOwner', 'CanopyCreator', 'CanopyMember'],
  delegate: ['Owner'],
}

describe('plant permission table', () => {
  it('names every action exactly once', () => {
    expect(Record.keys(allowedRoles).sort()).toEqual(
      Record.keys(expected).sort()
    )
  })

  for (const [action, allowed] of Record.toEntries(expected)) {
    for (const role of roles) {
      const verdict = Array.contains(allowed, role._tag) ? 'allows' : 'refuses'
      it(`${verdict} ${role._tag} to ${action}`, () => {
        expect(allows(action)(role)).toBe(Array.contains(allowed, role._tag))
      })
    }
  }
})

const alex = 'user-alex'
const lily = 'user-lily'
const sam = 'user-sam'
const canopyId = 'canopy-1' as CanopyId
const personal: PlantOwner = { _tag: 'User', userId: alex }
const shared: PlantOwner = { _tag: 'Canopy', canopyId }

const facts = (
  userId: string,
  overrides: {
    membership?: ReturnType<typeof createTestMembership>
    caretaker?: boolean
  } = {}
) => ({
  userId,
  membership: overrides.membership ?? null,
  caretaker: overrides.caretaker ?? false,
})

describe('plantRole', () => {
  it('gives the owner of a personal plant Owner', () => {
    expect(
      plantRole({ owner: personal, createdByUserId: alex }, facts(alex))
    ).toEqual(Option.some(PlantRole.Owner()))
  })

  it('gives an active caretaker of a personal plant Caretaker', () => {
    expect(
      plantRole(
        { owner: personal, createdByUserId: alex },
        facts(lily, { caretaker: true })
      )
    ).toEqual(Option.some(PlantRole.Caretaker()))
  })

  it('gives a stranger to a personal plant no role, even as a Canopy member', () => {
    expect(
      plantRole(
        { owner: personal, createdByUserId: alex },
        facts(lily, {
          membership: createTestMembership({ userId: lily, canopyId }),
        })
      )
    ).toEqual(Option.none())
  })

  it('gives the Canopy owner CanopyOwner, whoever created the plant', () => {
    expect(
      plantRole(
        { owner: shared, createdByUserId: lily },
        facts(alex, {
          membership: createTestMembership({
            userId: alex,
            canopyId,
            role: 'owner',
          }),
        })
      )
    ).toEqual(Option.some(PlantRole.CanopyOwner()))
  })

  it('gives the member who created the plant CanopyCreator', () => {
    expect(
      plantRole(
        { owner: shared, createdByUserId: lily },
        facts(lily, {
          membership: createTestMembership({ userId: lily, canopyId }),
        })
      )
    ).toEqual(Option.some(PlantRole.CanopyCreator()))
  })

  it('gives another member CanopyMember', () => {
    expect(
      plantRole(
        { owner: shared, createdByUserId: lily },
        facts(sam, {
          membership: createTestMembership({ userId: sam, canopyId }),
        })
      )
    ).toEqual(Option.some(PlantRole.CanopyMember()))
  })

  it('gives a member of another Canopy no role', () => {
    expect(
      plantRole(
        { owner: shared, createdByUserId: lily },
        facts(sam, {
          membership: createTestMembership({
            userId: sam,
            canopyId: 'canopy-2' as CanopyId,
            role: 'owner',
          }),
        })
      )
    ).toEqual(Option.none())
  })

  it('ignores a delegation on a Canopy plant', () => {
    expect(
      plantRole(
        { owner: shared, createdByUserId: lily },
        facts(sam, { caretaker: true })
      )
    ).toEqual(Option.none())
  })

  it('gives a creator who left the Canopy no role', () => {
    expect(
      plantRole({ owner: shared, createdByUserId: lily }, facts(lily))
    ).toEqual(Option.none())
  })
})

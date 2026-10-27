import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import {
  allowedRoles,
  allows,
  canopyRole,
  type PlantAction,
  PlantRole,
  personalRole,
} from '@lily/api/services/plants/helpers/plant-access'
import { Array, Option, Record } from 'effect'
import { describe, expect, it } from 'vitest'

const roles = [
  PlantRole.Owner(),
  PlantRole.Caretaker(),
  PlantRole.CanopyOwner(),
  PlantRole.CanopyCreator(),
  PlantRole.CanopyMember(),
]

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
const shared = { canopyId: mockCanopyId, createdByUserId: lily }

describe('personalRole', () => {
  it('gives the owner Owner', () => {
    expect(personalRole(alex, alex, false)).toEqual(
      Option.some(PlantRole.Owner())
    )
  })

  it('gives an active caretaker Caretaker', () => {
    expect(personalRole(alex, lily, true)).toEqual(
      Option.some(PlantRole.Caretaker())
    )
  })

  it('gives a stranger no role', () => {
    expect(personalRole(alex, lily, false)).toEqual(Option.none())
  })
})

describe('canopyRole', () => {
  it('gives the Canopy owner CanopyOwner, whoever created the plant', () => {
    expect(
      canopyRole(
        shared,
        alex,
        createTestMembership({ userId: alex, role: 'owner' })
      )
    ).toEqual(Option.some(PlantRole.CanopyOwner()))
  })

  it('gives the member who created the plant CanopyCreator', () => {
    expect(
      canopyRole(shared, lily, createTestMembership({ userId: lily }))
    ).toEqual(Option.some(PlantRole.CanopyCreator()))
  })

  it('gives another member CanopyMember', () => {
    expect(
      canopyRole(shared, sam, createTestMembership({ userId: sam }))
    ).toEqual(Option.some(PlantRole.CanopyMember()))
  })

  it('gives a member of another Canopy no role, even its owner', () => {
    expect(
      canopyRole(
        shared,
        sam,
        createTestMembership({
          userId: sam,
          canopyId: 'canopy-2',
          role: 'owner',
        })
      )
    ).toEqual(Option.none())
  })

  it('gives a creator who left the Canopy no role', () => {
    expect(canopyRole(shared, lily, null)).toEqual(Option.none())
  })
})

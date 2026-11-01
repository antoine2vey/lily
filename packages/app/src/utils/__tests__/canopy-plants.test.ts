import { Option } from 'effect'
import {
  actionsOnPlant,
  careActorFor,
  filterByScope,
  plantActionsFor,
  plantRoleFor,
} from '@/utils/canopy-plants'

const ME = 'user-me'
const OTHER = 'user-other'

describe('plantRoleFor', () => {
  it('reads a personal plant as owned by its user', () => {
    expect(plantRoleFor({ ownership: 'owned', userId: ME }, ME, null)).toBe(
      'owner'
    )
  })

  it('reads a delegated plant reported as owned to its caretaker', () => {
    expect(
      plantRoleFor({ ownership: 'owned', userId: OTHER }, ME, 'member')
    ).toBe('caretaker')
    expect(
      plantRoleFor({ ownership: 'caretaking', userId: OTHER }, ME, null)
    ).toBe('caretaker')
  })

  it('splits Canopy plants by Canopy role, then by who added them', () => {
    const plant = {
      ownership: 'canopy' as const,
      userId: null,
      createdBy: { id: OTHER },
    }
    expect(plantRoleFor(plant, ME, 'owner')).toBe('canopyOwner')
    expect(plantRoleFor(plant, ME, 'member')).toBe('canopyMember')
    expect(
      plantRoleFor({ ...plant, createdBy: { id: ME } }, ME, 'member')
    ).toBe('canopyCreator')
    expect(plantRoleFor({ ...plant, createdBy: null }, ME, 'member')).toBe(
      'canopyMember'
    )
  })
})

describe('plantActionsFor', () => {
  const inCanopy = { inCanopy: true, sharer: 'member' } as const
  const outside = { inCanopy: false, sharer: 'you' } as const

  it('offers sharing only to the owner of a personal plant in a Canopy', () => {
    expect(
      plantActionsFor('owner', { inCanopy: true, sharer: 'you' }).shareToCanopy
    ).toBe(true)
    expect(plantActionsFor('owner', outside).shareToCanopy).toBe(false)
    expect(plantActionsFor('canopyOwner', inCanopy).shareToCanopy).toBe(false)
    expect(plantActionsFor('caretaker', inCanopy).shareToCanopy).toBe(false)
  })

  it('lets the creator unshare and delete', () => {
    expect(
      plantActionsFor('canopyCreator', { inCanopy: true, sharer: 'you' })
    ).toEqual({
      shareToCanopy: false,
      unshare: true,
      mute: true,
      delete: true,
      endLife: true,
    })
  })

  it('lets the Canopy owner delete a member plant but not unshare it', () => {
    expect(plantActionsFor('canopyOwner', inCanopy)).toEqual({
      shareToCanopy: false,
      unshare: false,
      mute: true,
      delete: true,
      endLife: true,
    })
  })

  it('lets any other member mute, say goodbye and bring back, not delete', () => {
    expect(plantActionsFor('canopyMember', inCanopy)).toEqual({
      shareToCanopy: false,
      unshare: false,
      mute: true,
      delete: false,
      endLife: true,
    })
  })

  it('gives a caretaker none of the Canopy actions and no delete', () => {
    expect(plantActionsFor('caretaker', inCanopy)).toEqual({
      shareToCanopy: false,
      unshare: false,
      mute: false,
      delete: false,
      endLife: false,
    })
  })
})

describe('actionsOnPlant', () => {
  const GONE = 'user-gone'
  const members = [{ userId: ME }, { userId: OTHER }]
  const asOwner = Option.some({ role: 'owner' as const, members })
  const asMember = Option.some({ role: 'member' as const, members })
  const canopyPlant = (createdBy: { id: string } | null | undefined) => ({
    ownership: 'canopy' as const,
    userId: null,
    createdBy,
  })
  const unshare = (
    createdBy: { id: string } | null | undefined,
    canopy: Parameters<typeof actionsOnPlant>[2]
  ) => actionsOnPlant(canopyPlant(createdBy), ME, canopy).unshare

  it('hides Make personal from the Canopy owner while the sharer is a member', () => {
    expect(unshare({ id: OTHER }, asOwner)).toBe(false)
  })

  it('offers Make personal to the Canopy owner once the sharer has left', () => {
    expect(unshare({ id: GONE }, asOwner)).toBe(true)
  })

  it('offers Make personal to the Canopy owner when the sharer account is gone', () => {
    expect(unshare(null, asOwner)).toBe(true)
    expect(unshare(undefined, asOwner)).toBe(true)
  })

  it('offers Make personal to the Canopy owner on a plant they shared', () => {
    expect(unshare({ id: ME }, asOwner)).toBe(true)
  })

  it('offers Make personal to the member who shared it', () => {
    expect(unshare({ id: ME }, asMember)).toBe(true)
  })

  it('hides Make personal from a member who did not share it', () => {
    expect(unshare({ id: OTHER }, asMember)).toBe(false)
    expect(unshare({ id: GONE }, asMember)).toBe(false)
    expect(unshare(null, asMember)).toBe(false)
  })

  it('reads a personal plant outside any Canopy', () => {
    expect(
      actionsOnPlant({ ownership: 'owned', userId: ME }, ME, Option.none())
    ).toEqual({
      shareToCanopy: false,
      unshare: false,
      mute: false,
      delete: true,
      endLife: true,
    })
  })
})

describe('filterByScope', () => {
  const plants = [
    { id: 'mine', ownership: 'owned' as const },
    { id: 'tending', ownership: 'caretaking' as const },
    { id: 'shared', ownership: 'canopy' as const },
  ]
  const ids = (scope: 'all' | 'mine' | 'canopy') =>
    filterByScope(plants, scope).map((p) => p.id)

  it('keeps every plant for all', () => {
    expect(ids('all')).toEqual(['mine', 'tending', 'shared'])
  })

  it('keeps everything outside the Canopy for mine', () => {
    expect(ids('mine')).toEqual(['mine', 'tending'])
  })

  it('keeps only Canopy plants for canopy', () => {
    expect(ids('canopy')).toEqual(['shared'])
  })
})

describe('careActorFor', () => {
  it('maps the performer to you, a named member, unnamed or former', () => {
    expect(careActorFor({ id: ME, name: 'Alex' }, ME)).toEqual({ _tag: 'you' })
    expect(careActorFor({ id: OTHER, name: 'Lily' }, ME)).toEqual({
      _tag: 'member',
      name: 'Lily',
    })
    expect(careActorFor({ id: OTHER, name: null }, ME)).toEqual({
      _tag: 'unnamed',
    })
    expect(careActorFor(null, ME)).toEqual({ _tag: 'former' })
  })
})

import {
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
  it('offers sharing only to the owner of a personal plant in a Canopy', () => {
    expect(plantActionsFor('owner', true).shareToCanopy).toBe(true)
    expect(plantActionsFor('owner', false).shareToCanopy).toBe(false)
    expect(plantActionsFor('canopyOwner', true).shareToCanopy).toBe(false)
    expect(plantActionsFor('caretaker', true).shareToCanopy).toBe(false)
  })

  it('lets the Canopy owner and the creator unshare and delete', () => {
    for (const role of ['canopyOwner', 'canopyCreator'] as const) {
      expect(plantActionsFor(role, true)).toEqual({
        shareToCanopy: false,
        unshare: true,
        mute: true,
        delete: true,
      })
    }
  })

  it('lets any other member only mute', () => {
    expect(plantActionsFor('canopyMember', true)).toEqual({
      shareToCanopy: false,
      unshare: false,
      mute: true,
      delete: false,
    })
  })

  it('gives a caretaker none of the Canopy actions and no delete', () => {
    expect(plantActionsFor('caretaker', true)).toEqual({
      shareToCanopy: false,
      unshare: false,
      mute: false,
      delete: false,
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

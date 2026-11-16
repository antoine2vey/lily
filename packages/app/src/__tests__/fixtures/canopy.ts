import type { Canopy, CanopyId } from '@lily/shared'

// The API client rejects path ids that are not UUIDs before sending a request.
export const canopyIds = {
  canopy: '5b8d0f2a-4c6e-4a1b-9d3f-6e8a0c2e4b17' as CanopyId,
  owner: '9e1a3c5d-7f2b-4d6e-8a0c-2e4b6d8f0a13',
  member: '4f6b8d0e-2a4c-4e7a-9c1e-3a5c7e9b1d25',
  invitation: '1c3e5a7b-9d1f-4b3d-8f5a-7c9e1b3d5f37',
  otherInvitation: '8a0c2e4f-6b8d-4f1a-9c3e-5a7c9e1b3d49',
} as const

const invitation = (id: string, inviteeId: string, name: string) => ({
  id,
  invitee: { userId: inviteeId, name, image: null },
  invitedByUserId: canopyIds.owner,
  expiresAt: new Date('2026-11-23T09:00:00Z'),
})

export const mockCanopy: Canopy = {
  id: canopyIds.canopy,
  name: 'Home',
  timezone: 'Europe/Paris',
  latitude: null,
  longitude: null,
  role: 'owner',
  members: [
    {
      userId: canopyIds.owner,
      name: 'Alex',
      image: null,
      role: 'owner',
      joinedAt: new Date('2026-10-01T09:00:00Z'),
    },
    {
      userId: canopyIds.member,
      name: 'Sam',
      image: null,
      role: 'member',
      joinedAt: new Date('2026-10-02T09:00:00Z'),
    },
  ],
  invite: null,
  invitations: [
    invitation(
      canopyIds.invitation,
      '6d8f0a2c-4e6b-4a8d-9f1b-3d5f7a9c1e61',
      'Robin'
    ),
    invitation(
      canopyIds.otherInvitation,
      '0e2a4c6f-8b1d-4c3e-9a5b-7d9f1c3e5a73',
      'Kim'
    ),
  ],
  createdAt: new Date('2026-10-01T09:00:00Z'),
  updatedAt: new Date('2026-10-02T09:00:00Z'),
}

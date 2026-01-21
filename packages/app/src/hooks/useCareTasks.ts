import { useQuery } from '@tanstack/react-query'

type CareTaskType = 'water' | 'fertilize' | 'prune' | 'rotate' | 'mist'

interface CareTask {
  id: string
  plantId: string
  plantName: string
  plantImageUrl?: string
  type: CareTaskType
  completed: boolean
  dueDate: string
}

interface CareTasksResponse {
  overdue: CareTask[]
  today: CareTask[]
  thisWeek: CareTask[]
}

async function fetchCareTasks(): Promise<CareTasksResponse> {
  // TODO: Implement actual API call when backend is ready
  // const tasks = await api.careTasks.list()
  // return tasks

  // Mock delay
  await new Promise((resolve) => setTimeout(resolve, 300))

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const inThreeDays = new Date(today)
  inThreeDays.setDate(inThreeDays.getDate() + 3)

  // Mock response
  return {
    overdue: [
      {
        id: 'task-1',
        plantId: 'plant-1',
        plantName: 'Monstera',
        plantImageUrl:
          'https://images.unsplash.com/photo-1614594975525-e45190c55d0b',
        type: 'water',
        completed: false,
        dueDate: yesterday.toISOString(),
      },
    ],
    today: [
      {
        id: 'task-2',
        plantId: 'plant-2',
        plantName: 'Snake Plant',
        plantImageUrl:
          'https://images.unsplash.com/photo-1593482892540-61f2b4d6eb0d',
        type: 'water',
        completed: false,
        dueDate: today.toISOString(),
      },
      {
        id: 'task-3',
        plantId: 'plant-3',
        plantName: 'Pothos',
        plantImageUrl:
          'https://images.unsplash.com/photo-1614594975525-e45190c55d0b',
        type: 'mist',
        completed: true,
        dueDate: today.toISOString(),
      },
    ],
    thisWeek: [
      {
        id: 'task-4',
        plantId: 'plant-1',
        plantName: 'Monstera',
        plantImageUrl:
          'https://images.unsplash.com/photo-1614594975525-e45190c55d0b',
        type: 'fertilize',
        completed: false,
        dueDate: tomorrow.toISOString(),
      },
      {
        id: 'task-5',
        plantId: 'plant-4',
        plantName: 'Fiddle Leaf Fig',
        plantImageUrl:
          'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a',
        type: 'rotate',
        completed: false,
        dueDate: inThreeDays.toISOString(),
      },
    ],
  }
}

export function useCareTasks() {
  return useQuery({
    queryKey: ['care-tasks'],
    queryFn: fetchCareTasks,
  })
}

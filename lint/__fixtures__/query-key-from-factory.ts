useQuery({ queryKey: ['gift-codes', page], queryFn }) // flag
useQuery({ queryKey: ['plants', 'getPlants'] as const, queryFn }) // flag
useQuery({ queryKey: [...queryKeys.plants.all, 'getPlants'], queryFn }) // flag
queryClient.invalidateQueries({ queryKey: ['deviceTokens'] }) // flag
queryClient.removeQueries({ queryKey: ['aiChat'], exact: true }) // flag
queryClient.setQueryData(['users', 'getUserSettings', {}], settings) // flag
queryClient.getQueryData<Settings>(['users', 'getUserSettings', {}]) // flag
queryClient.getQueryState(['careTasks', 'getCareTasks', {}]) // flag
const CARE_TASKS_QUERY_KEY = ['careTasks', 'getCareTasks', {}] as const // flag
export const settingsKey = ['users', 'getUserSettings', {}] // flag
export const plantDetailKey = (id: string) => ['plants', 'getPlant', { params: { id } }] as const // flag
const followUpsKey = () => ['aiChat', 'listChatFollowUps'] // flag

useQuery({ queryKey: queryKeys.rooms.list(), queryFn })
useQuery({ queryKey: effectQueryKey('rooms', 'getRooms', {}), queryFn })
queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
queryClient.setQueryData(CARE_TASKS_QUERY_KEY, ['not', 'a', 'key'])
queryClient.setQueryData(plantDetailKey(id), (old) => old)
const STORAGE_KEY = 'lily_access_token'
const sortKeys = ['name', 'date']
const DOT_DELAYS = [0, 150, 300] as const
const detailKey = plantDetailKey(id)

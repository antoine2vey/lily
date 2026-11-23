queryClient.getQueryData(queryKeys.careTasks.all) // flag
queryClient.setQueryData(queryKeys.users.settings(), (old) => old) // flag
queryClient.getQueryState(queryKeys.plants.details()) // flag
const previous = queryClient.getQueryData<CareTasksResponse>( // flag
  queryKeys.careTasks.list()
)
queryClient.setQueryData<ApiResult<UserSettings>>(USER_SETTINGS_QUERY_KEY, (old) => old) // flag
queryClient.getQueryData<ApiResult<PlantDetail>>(detailKey) // flag

queryClient.getQueryData(CARE_TASKS_QUERY_KEY)
queryClient.setQueryData(plantDetailKey(id), (old) => old)
queryClient.setQueryData(context.key, context.previous)
queryClient.setQueryData(KEY, queryKeys.users.settings())
queryClient.invalidateQueries({ queryKey: queryKeys.users.settings() })
queryClient.setQueriesData<ApiResult<T>>(filters, (cached) => cached)
queryClient.cancelQueries({ queryKey: queryKeys.careTasks.all })

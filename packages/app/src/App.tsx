import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FlatList, SafeAreaView, StyleSheet, Text, View } from 'react-native'
import { useEffectQuery } from 'src/utils/client'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <View style={styles.container}>
        <Plants />
      </View>
    </QueryClientProvider>
  )
}

const Plants = () => {
  const { data: plants, isLoading: isLoadingPlants } = useEffectQuery(
    'plants',
    'getPlants',
    { urlParams: { page: '1', limit: '20', filter: 'all', sort: 'added' } }
  )

  if (isLoadingPlants) {
    return <Text>Loading...</Text>
  }

  return (
    <SafeAreaView>
      <Text>plants</Text>
      <FlatList
        data={plants?.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text>{item.name}</Text>}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

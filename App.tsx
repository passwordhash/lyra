import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { initDb } from './src/db';
import { rescanLibrary } from './src/sync';

export default function App() {
  useEffect(() => {
    void (async () => {
      const db = await initDb();
      // Фоновый рескан при запуске (#8); ошибки глушим (#9: без спец-UI).
      rescanLibrary(db).catch(() => {});
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Text>Open up App.tsx to start working on your app!</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

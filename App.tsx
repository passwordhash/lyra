import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDb } from './src/db';
import { rescanLibrary } from './src/sync';
import HomeScreen from './src/ui/Home';
import SettingsScreen from './src/ui/Settings';

const Stack = createNativeStackNavigator();

export default function App() {
  // Тема — только системная (#9): следуем scheme, без override.
  const scheme = useColorScheme();

  useEffect(() => {
    void (async () => {
      const db = await initDb();
      // Фоновый рескан при запуске (#8); ошибки глушим (#9: без спец-UI).
      rescanLibrary(db).catch(() => {});
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack.Navigator>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'Lyra', headerLargeTitle: true, headerShadowVisible: false }}
          />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Настройки' }} />
        </Stack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

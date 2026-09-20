import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { initDb } from './src/db';
import { applyLanguageOverride } from './src/i18n';
import { rescanLibrary } from './src/sync';
import HomeScreen from './src/ui/Home';
import SettingsScreen from './src/ui/Settings';

const Stack = createNativeStackNavigator();

export default function App() {
  // Тема — только системная (#9): следуем scheme, без override.
  const scheme = useColorScheme();
  const { t } = useTranslation();

  useEffect(() => {
    void (async () => {
      const db = await initDb();
      // Override языка из БД (#15), затем фоновый рескан при запуске (#8);
      // ошибки глушим (#9: без спец-UI).
      await applyLanguageOverride().catch(() => {});
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
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: t('settings.title') }}
          />
        </Stack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

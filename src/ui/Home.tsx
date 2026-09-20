/**
 * Главный экран библиотеки: крупный заголовок «Lyra», шестерёнка настроек (#9),
 * сегменты Треки/Альбомы/Плейлисты (#5), пустые состояния с CTA «Подключить папку».
 * Списки библиотеки — тикет #18.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  PlatformColor,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { initDb } from '../db';
import { connectFolder, libraryStats, type LibraryStats } from '../library';
import { isSyncing, onSyncingChange } from '../sync';
import { ACCENT } from './theme';

export default function HomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<{ Home: undefined; Settings: undefined }>>();
  const syncing = useSyncExternalStore(onSyncingChange, isSyncing);
  const [seg, setSeg] = useState(0);
  const [stats, setStats] = useState<LibraryStats | null>(null);

  const reload = useCallback(async () => {
    setStats(await libraryStats(await initDb()));
  }, []);

  // Данные — на каждый показ экрана и по завершении рескана (счётчик треков).
  useFocusEffect(useCallback(() => void reload(), [reload]));
  useEffect(() => {
    if (!syncing) void reload();
  }, [syncing, reload]);

  // Шестерёнка справа от заголовка, спиннер рескана рядом (#9).
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          {syncing ? <ActivityIndicator size="small" color={ACCENT} style={styles.headerSpinner} /> : null}
          <Pressable hitSlop={8} onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={24} color={ACCENT} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, syncing]);

  const handleConnect = useCallback(async () => {
    await connectFolder(await initDb());
    await reload();
  }, [reload]);

  const hasFolder = stats?.folderName != null;
  const isEmpty = !hasFolder || stats!.trackCount === 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Segments
        labels={[t('seg.tracks'), t('seg.albums'), t('seg.playlists')]}
        index={seg}
        onChange={setSeg}
      />
      {isEmpty ? (
        <View style={styles.empty}>
          <Ionicons name="musical-notes-outline" size={56} color={PlatformColor('secondaryLabelColor')} />
          <Text style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
          <Text style={styles.emptyText}>
            {hasFolder ? t('home.emptyNoTracks') : t('home.emptyNoFolder')}
          </Text>
          {!hasFolder ? (
            <Pressable style={styles.cta} onPress={() => void handleConnect()}>
              <Text style={styles.ctaText}>{t('home.connectFolder')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Segments({ labels, index, onChange }: { labels: string[]; index: number; onChange: (i: number) => void }) {
  return (
    <View style={styles.segments}>
      {labels.map((label, i) => (
        <Pressable key={label} style={[styles.seg, i === index && styles.segOn]} onPress={() => onChange(i)}>
          <Text style={[styles.segText, i === index && styles.segTextOn]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PlatformColor('systemBackgroundColor'),
  },
  content: {
    paddingBottom: 32,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerSpinner: {
    marginRight: 2,
  },
  segments: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: 9,
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: 'rgba(118,118,128,0.24)',
  },
  seg: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 7,
  },
  segOn: {
    backgroundColor: PlatformColor('secondarySystemGroupedBackgroundColor'),
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  segText: {
    fontSize: 13,
    fontWeight: '600',
    color: PlatformColor('labelColor'),
  },
  segTextOn: {
    color: PlatformColor('labelColor'),
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: 72,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: PlatformColor('labelColor'),
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    color: PlatformColor('secondaryLabelColor'),
  },
  cta: {
    marginTop: 16,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

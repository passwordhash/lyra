/**
 * Экран настроек (решение #9): секция «Библиотека» — подключённая папка,
 * последний успешный рескан, отключение с полной очисткой; секция «Общие» —
 * язык «Системный / Русский / English» (override в state-таблице + немедленное
 * применение через i18n, тикет #15). Темы нет: только системная.
 */
import { useCallback, useState } from 'react';
import {
  Alert,
  PlatformColor,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { initDb } from '../db';
import * as repo from '../db/repo';
import { disconnectFolder, libraryStats, type LibraryStats } from '../library';
import { setLanguage, type LanguageSetting } from '../i18n';
import { ACCENT } from './theme';

// Названия языков — эндонимы («Русский», «English») в любой локали, как в iOS.
const LANGS: { key: LanguageSetting; label: string | null }[] = [
  { key: 'system', label: null },
  { key: 'ru', label: 'Русский' },
  { key: 'en', label: 'English' },
];

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const dateFmt = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [lang, setLang] = useState<LanguageSetting>('system');

  const reload = useCallback(async () => {
    const db = await initDb();
    setStats(await libraryStats(db));
    setLang(((await repo.getState(db, 'language_override')) as LanguageSetting | null) ?? 'system');
  }, []);

  useFocusEffect(useCallback(() => void reload(), [reload]));

  const chooseLanguage = async (key: LanguageSetting) => {
    setLang(key);
    await repo.setState(await initDb(), 'language_override', key === 'system' ? null : key);
    await setLanguage(key);
  };

  const confirmDisconnect = () => {
    Alert.alert(
      t('settings.disconnectTitle'),
      t('settings.disconnectBody'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.disconnectAction'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await disconnectFolder(await initDb());
              await reload();
            })();
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Section title={t('settings.librarySection')}>
        <Row label={t('settings.folder')}>
          {stats?.folderName ? (
            <View style={styles.valueCol}>
              <Text style={styles.value}>{stats.folderName}</Text>
              <Text style={styles.valueSmall} numberOfLines={1}>
                {stats.folderPath}
              </Text>
            </View>
          ) : (
            <Text style={styles.valuePlaceholder}>{t('settings.notConnected')}</Text>
          )}
        </Row>
        <Separator />
        <Row label={t('settings.tracks')}>
          <Text style={styles.value}>{stats ? String(stats.trackCount) : '—'}</Text>
        </Row>
        <Separator />
        <Row label={t('settings.lastScan')}>
          <Text style={styles.value}>
            {stats?.lastScanAt ? dateFmt.format(new Date(stats.lastScanAt)) : t('settings.never')}
          </Text>
        </Row>
        <Separator />
        <Pressable
          style={styles.destructiveRow}
          disabled={!stats?.folderName}
          onPress={confirmDisconnect}
        >
          <Text style={[styles.destructiveText, !stats?.folderName && styles.disabled]}>
            {t('settings.disconnect')}
          </Text>
        </Pressable>
      </Section>

      <Section title={t('settings.generalSection')}>
        {LANGS.map((l, i) => (
          <View key={l.key}>
            {i > 0 ? <Separator /> : null}
            <Pressable style={styles.row} onPress={() => void chooseLanguage(l.key)}>
              <Text style={styles.label}>{l.label ?? t('settings.systemLanguage')}</Text>
              {lang === l.key ? <Ionicons name="checkmark" size={20} color={ACCENT} /> : null}
            </Pressable>
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PlatformColor('systemGroupedBackgroundColor'),
  },
  content: {
    paddingTop: 8,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    marginHorizontal: 16,
    marginBottom: 7,
    color: PlatformColor('secondaryLabelColor'),
  },
  group: {
    borderRadius: 10,
    backgroundColor: PlatformColor('secondarySystemGroupedBackgroundColor'),
    overflow: 'hidden',
  },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  label: {
    flexShrink: 1,
    fontSize: 17,
    color: PlatformColor('labelColor'),
  },
  valueCol: {
    flexShrink: 1,
    alignItems: 'flex-end',
  },
  value: {
    flexShrink: 1,
    fontSize: 17,
    textAlign: 'right',
    color: PlatformColor('secondaryLabelColor'),
  },
  valueSmall: {
    fontSize: 12,
    marginTop: 1,
    color: PlatformColor('secondaryLabelColor'),
  },
  valuePlaceholder: {
    fontSize: 17,
    color: PlatformColor('placeholderTextColor'),
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
    backgroundColor: PlatformColor('separatorColor'),
  },
  destructiveRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  destructiveText: {
    fontSize: 17,
    color: PlatformColor('systemRed'),
  },
  disabled: {
    opacity: 0.4,
  },
});

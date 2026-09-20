// Самопроверка слоя БД: репо-функции прогоняются на node:sqlite через шим
// интерфейса expo-sqlite. Запуск: npm run check
import assert from 'node:assert/strict';
import { migrate } from '../src/db/migrations';
import * as repo from '../src/db/repo';
import { makeDb } from './lib/sqlite-shim';

function track(over: Partial<repo.NewTrack> = {}): repo.NewTrack {
  return {
    folderId: 1,
    path: `/music/${over.title}.m4a`,
    filename: `${over.title}.m4a`,
    size: 100,
    mtime: 1000,
    title: 'untitled',
    artist: null,
    albumArtist: null,
    albumId: null,
    trackNo: null,
    discNo: null,
    year: null,
    duration: 200,
    format: 'm4a',
    artworkPath: null,
    ...over,
  };
}

async function main(): Promise<void> {
    const tags = (over: Partial<repo.NewTrack>): Omit<repo.NewTrack, 'folderId' | 'path'> => {
    const { folderId, path, ...rest } = track(over);
    return rest;
  };

const db = makeDb();
  await migrate(db);
  assert.equal((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version, 1);

  // Папка
  await repo.setFolder(db, { bookmark: new Uint8Array([1, 2, 3]), displayName: 'Music' });
  const folder = await repo.getFolder(db);
  assert.equal(folder!.display_name, 'Music');
  assert.deepEqual(Array.from(folder!.bookmark), [1, 2, 3]);

  // Альбом + треки; дефолтный порядок (disc_no, track_no)
  const albumId = await repo.findOrCreateAlbum(db, 'Кино', 'Виктор Цой');
  assert.equal(await repo.findOrCreateAlbum(db, 'Кино', 'Виктор Цой'), albumId);
  const t1 = await repo.insertTrack(db, track({ title: 'Группа крови', trackNo: 1, discNo: 2, albumId, artist: 'Виктор Цой' }));
  const t2 = await repo.insertTrack(db, track({ title: 'Пачка сигарет', trackNo: 9, discNo: 1, albumId, artist: 'Виктор Цой', artworkPath: '/covers/a.jpg' }));
  const t3 = await repo.insertTrack(db, track({ title: 'Звезда по имени Солнце', trackNo: 3, discNo: 1, albumId, artist: 'Виктор Цой' }));
  let albumTracks = await repo.getAlbumTracks(db, albumId);
  assert.deepEqual(albumTracks.map((t) => t.title), ['Звезда по имени Солнце', 'Пачка сигарет', 'Группа крови']);

  // search_text: ё→е, диакритика снята (#10)
  const zoe = await repo.insertTrack(db, track({ title: 'Ёлка', artist: 'Zoé' }));
  assert.equal((await repo.getTrack(db, zoe))!.search_text, 'елка zoe');

  // Ручной порядок альбома
  await repo.setAlbumTrackOrder(db, albumId, [t3, t1, t2]);
  albumTracks = await repo.getAlbumTracks(db, albumId);
  assert.deepEqual(albumTracks.map((t) => t.id), [t3, t1, t2]);
  await repo.setAlbumTrackOrder(db, albumId, null);
  assert.equal(await repo.getAlbum(db, albumId)!.then((a) => a!.track_order), null);

  // Перегруппировка при перечитывании тегов: старый альбом чистится (#8)
  const album2 = await repo.findOrCreateAlbum(db, 'Новый альбом', 'Виктор Цой');
  await repo.updateTrack(db, t2, tags({ title: 'Пачка сигарет', albumId: album2, artist: 'Виктор Цой', artworkPath: '/covers/new.jpg' }));
  assert.equal((await repo.getTrack(db, t2))!.album_id, album2);
  const removedCovers = await repo.cleanupEmptyAlbums(db);
  assert.deepEqual(removedCovers, []); // «Кино» ещё не пуст: остались t1 и t3
  // уводим остальные треки в album2 — «Кино» пустеет и удаляется вместе с обложкой
  await db.runAsync("UPDATE albums SET artwork_path = '/covers/kino.jpg' WHERE id = ?", [albumId]); // как сделал бы рескан
  await repo.updateTrack(db, t1, tags({ title: 'Группа крови', albumId: album2, artist: 'Виктор Цой' }));
  await repo.updateTrack(db, t3, tags({ title: 'Звезда по имени Солнце', albumId: album2, artist: 'Виктор Цой' }));
  const removedCovers2 = await repo.cleanupEmptyAlbums(db);
  assert.deepEqual(removedCovers2, ['/covers/kino.jpg']);
  assert.equal(await repo.getAlbum(db, albumId), null);

  // Очередь
  await repo.replaceQueue(db, [
    { trackId: t1, sourceKind: 'album', sourceId: albumId },
    { trackId: t3, sourceKind: 'album', sourceId: albumId },
    { trackId: t2, sourceKind: 'manual', sourceId: null },
  ]);
  await repo.insertQueueItemAt(db, 1, { trackId: t2, sourceKind: 'manual', sourceId: null });
  let queue = await repo.getQueue(db);
  assert.deepEqual(queue.map((q) => q.id), [t1, t2, t3, t2]);
  await repo.removeQueueItemAt(db, 3);
  await repo.appendToQueue(db, { trackId: t3, sourceKind: 'manual', sourceId: null });
  queue = await repo.getQueue(db);
  assert.deepEqual(queue.map((q) => q.position), [0, 1, 2, 3]);

  // state
  await repo.setState(db, 'now_playing_track_id', String(t1));
  assert.equal(await repo.getState(db, 'now_playing_track_id'), String(t1));

  // Удаление трека: чистка плейлистов/очереди/track_order/now_playing (#8, #6)
  const pl = await repo.createPlaylist(db, 'Тест');
  await repo.addToPlaylist(db, pl, t1);
  await repo.addToPlaylist(db, pl, t3);
  await repo.setAlbumTrackOrder(db, album2, [t3, t1]);
  await repo.deleteTracks(db, [t1]);
  assert.equal(await repo.getState(db, 'now_playing_track_id'), null); // now_playing сброшен
  assert.deepEqual((await repo.getPlaylistTracks(db, pl)).map((t) => t.title), ['Звезда по имени Солнце']);
  queue = await repo.getQueue(db);
  assert.ok(queue.every((q) => q.id !== t1)); // каскад
  assert.deepEqual(await repo.getAlbumTracks(db, album2).then((ts) => ts.map((t) => t.id)), [t3, t2]); // t3 из track_order, t2 дописан в конец
  assert.equal(await repo.getTrack(db, t1), null);

  // Плейлисты: переименование, позиции, счётчик
  await repo.renamePlaylist(db, pl, 'Переименован');
  assert.equal((await repo.listPlaylists(db))[0].title, 'Переименован');
  assert.equal((await repo.listPlaylists(db))[0].track_count, 1);
  await repo.removePlaylistItem(db, pl, 1); // t3 стоит на позиции 1: t1 удалили каскадом без перенумерации
  assert.deepEqual(await repo.getPlaylistTracks(db, pl), []);
  await repo.deletePlaylist(db, pl);

  // Полная очистка (#9)
  await repo.clearLibrary(db);
  assert.equal(await repo.getFolder(db), null);
  assert.deepEqual(await repo.listTracks(db), []);
  assert.deepEqual(await repo.listAlbums(db), []);
  assert.deepEqual(await repo.listPlaylists(db), []);
  assert.deepEqual(await repo.getQueue(db), []);
  assert.equal(await repo.getState(db, 'now_playing_track_id'), null);

  console.log('OK: слой БД прошёл самопроверку');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

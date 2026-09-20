// Самопроверка рескана (#8): ядро src/sync/core с моками IO на node:sqlite.
// Запуск: npm run check:sync
import assert from 'node:assert/strict';
import { migrate } from '../src/db/migrations';
import * as repo from '../src/db/repo';
import { runRescan, SyncAborted, type SyncIo } from '../src/sync/core';
import type { TrackTags } from '../src/tags';
import { makeDb } from './lib/sqlite-shim';

type FakeFile = { tags: Partial<TrackTags> | 'corrupt'; size: number; mtime: number };

function makeIo(files: Map<string, FakeFile>) {
  const io: SyncIo & { deleted: string[] } = {
    deleted: [],
    async listTracks() {
      return [...files.entries()].map(([path, f]) => ({
        path,
        url: `file:///lib/${path}`,
        size: f.size,
        mtime: f.mtime,
      }));
    },
    async getTags(url) {
      const f = files.get(url.replace('file:///lib/', ''));
      if (!f || f.tags === 'corrupt') throw new Error('битый файл');
      return {
        title: null, artist: null, albumArtist: null, album: null, trackNo: null,
        discNo: null, year: null, duration: null, format: 'm4a', artwork: null,
        ...f.tags,
      };
    },
    async saveCover(albumId) {
      return `/cache/covers/${albumId}.jpg`;
    },
    async deleteFile(path) {
      io.deleted.push(path);
    },
  };
  return io;
}

async function main(): Promise<void> {
  const db = makeDb();
  await migrate(db);
  await repo.setFolder(db, { bookmark: new Uint8Array([1]), displayName: 'Music' });

  // 1. Первый импорт: два трека альбома (один с обложкой) + трек без album + битый
  const files = new Map<string, FakeFile>([
    ['a/1.m4a', { tags: { title: 'Один', artist: 'Тест', album: 'Альбом', trackNo: 1, year: 2000, artwork: 'data:image/jpeg;base64,AAA' }, size: 10, mtime: 100 }],
    ['a/2.m4a', { tags: { title: 'Два', artist: 'Тест', album: 'Альбом', trackNo: 2, year: 2000 }, size: 11, mtime: 101 }],
    ['b/одиночка.flac', { tags: { title: 'Одиночка' }, size: 12, mtime: 102 }],
    ['b/битый.mp3', { tags: 'corrupt', size: 13, mtime: 103 }],
  ]);
  let r = await runRescan(db, makeIo(files));
  assert.deepEqual(r, { added: 3, updated: 0, deleted: 0 });
  const tracks = await repo.listTracks(db);
  assert.equal(tracks.length, 3); // битый пропущен
  const albums = await repo.listAlbums(db);
  assert.equal(albums.length, 1);
  assert.equal(albums[0].artwork_path, '/cache/covers/1.jpg'); // первая найденная
  assert.equal(albums[0].year, 2000);
  const noAlbum = tracks.find((t) => t.title === 'Одиночка')!;
  assert.equal(noAlbum.album_id, null); // без album — вне альбомов (#7.3)
  assert.equal(tracks.find((t) => t.title === 'Два')!.artwork_path, null);
  assert.equal(tracks.find((t) => t.title === 'Один')!.artwork_path, '/cache/covers/1.jpg');
  assert.ok((await repo.getFolder(db))!.last_scan_at);

  // 2. Идемпотентность: без изменений ничего не происходит
  r = await runRescan(db, makeIo(files));
  assert.deepEqual(r, { added: 0, updated: 0, deleted: 0 });
  assert.equal((await repo.listTracks(db)).map((t) => t.id).join(), tracks.map((t) => t.id).join());

  // 3. Ручной порядок + очередь + плейлист + now_playing перед сценариями удаления
  const odin = tracks.find((t) => t.title === 'Один')!.id; // a/1.m4a
  const dva = tracks.find((t) => t.title === 'Два')!.id; // a/2.m4a
  await repo.setAlbumTrackOrder(db, albums[0].id, [dva, odin]);
  await repo.replaceQueue(db, [{ trackId: odin, sourceKind: 'album', sourceId: albums[0].id }]);
  const pl = await repo.createPlaylist(db, 'Пл');
  await repo.addToPlaylist(db, pl, odin);
  await repo.setState(db, 'now_playing_track_id', String(odin));

  // 4. Изменение тегов (size/mtime): перегруппировка в новый альбом, обложка
  //    перезаписана, ручной порядок не сброшен (#8). «Два» получает обложку —
  //    «Альбом» сохраняет свою (файл 1.jpg переиспользуется).
  const io4 = makeIo(files);
  files.set('a/1.m4a', { tags: { title: 'Один', artist: 'Тест', album: 'Другой', trackNo: 5, year: 2001, artwork: 'data:image/jpeg;base64,BBB' }, size: 99, mtime: 200 });
  files.set('a/2.m4a', { tags: { title: 'Два', artist: 'Тест', album: 'Альбом', trackNo: 2, year: 2000, artwork: 'data:image/jpeg;base64,CCC' }, size: 21, mtime: 201 });
  r = await runRescan(db, io4);
  assert.deepEqual(r, { added: 0, updated: 2, deleted: 0 });
  assert.deepEqual(io4.deleted, []);
  const moved = (await repo.getTrack(db, odin))!;
  assert.equal(moved.album_id, albums[0].id + 1);
  assert.equal(moved.track_no, 5);
  assert.equal(moved.artwork_path, `/cache/covers/${albums[0].id + 1}.jpg`);
  const kept = (await repo.getTrack(db, dva))!;
  assert.equal(kept.artwork_path, '/cache/covers/1.jpg'); // обложка альбома уже была — переиспользована
  const oldAlbum = (await repo.getAlbum(db, albums[0].id))!;
  // Ушедший перегруппировкой остаётся в массиве (#8 чистит только удалённые;
  // getAlbumTracks его отфильтрует, а при возврате трека позиция восстановится).
  assert.deepEqual(JSON.parse(oldAlbum.track_order!), [dva, odin]);
  assert.equal(oldAlbum.artwork_path, '/cache/covers/1.jpg');
  const newAlbum = (await repo.listAlbums(db)).find((a) => a.title === 'Другой')!;
  assert.equal(newAlbum.artwork_path, `/cache/covers/${newAlbum.id}.jpg`);

  // 5. Удаление: жёсткое, чистка плейлиста/очереди/now_playing; опустевший
  //    «Другой» удалён, осиротевшая обложка 2.jpg удалена с диска
  const io5 = makeIo(files);
  files.delete('a/1.m4a');
  files.delete('b/одиночка.flac');
  r = await runRescan(db, io5);
  assert.deepEqual(r, { added: 0, updated: 0, deleted: 2 });
  assert.equal(await repo.getTrack(db, odin), null);
  assert.equal(await repo.getTrack(db, noAlbum.id), null);
  assert.equal(await repo.getState(db, 'now_playing_track_id'), null); // сброшен
  assert.deepEqual(await repo.getPlaylistTracks(db, pl), []); // каскад
  assert.deepEqual(await repo.getQueue(db), []); // каскад
  assert.equal(await repo.getAlbum(db, newAlbum.id), null);
  assert.deepEqual(io5.deleted, [`/cache/covers/${newAlbum.id}.jpg`]); // сирота

  // 6. Новый трек в альбом с заданным ручным порядком — дописывается в конец (#8)
  files.set('a/3.m4a', { tags: { title: 'Три', artist: 'Тест', album: 'Альбом', trackNo: 3 }, size: 14, mtime: 104 });
  r = await runRescan(db, makeIo(files));
  assert.deepEqual(r, { added: 1, updated: 0, deleted: 0 });
  const t3 = (await repo.listTracks(db)).find((t) => t.title === 'Три')!.id;
  assert.deepEqual(JSON.parse((await repo.getAlbum(db, albums[0].id))!.track_order!), [dva, t3]);

  // 7. Пустой листинг — успех: всё удалено, обложка опустевшего альбома с диска (#8)
  const io7 = makeIo(new Map());
  r = await runRescan(db, io7);
  assert.deepEqual(r, { added: 0, updated: 0, deleted: 2 });
  assert.deepEqual(await repo.listTracks(db), []);
  assert.deepEqual(await repo.listAlbums(db), []);
  assert.deepEqual(io7.deleted, ['/cache/covers/1.jpg']);

  // 8. Ошибка листинга — abort, БД не тронута (#8)
  const before = (await repo.getFolder(db))!.last_scan_at;
  const bad: SyncIo = { ...makeIo(new Map()), listTracks: async () => { throw new Error('scope умер'); } };
  await assert.rejects(() => runRescan(db, bad), SyncAborted);
  assert.equal((await repo.getFolder(db))!.last_scan_at, before);

  // 9. Нет папки — no-op
  await repo.clearLibrary(db);
  assert.deepEqual(await runRescan(db, makeIo(files)), { added: 0, updated: 0, deleted: 0 });

  console.log('OK: рескан прошёл самопроверку');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

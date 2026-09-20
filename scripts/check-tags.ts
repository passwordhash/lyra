// Самопроверка тег-парсера (#17): наcrafted фикстуры mp3 (ID3v2.3) и flac
// парсятся реальной @missingcore/audio-metadata в Node; m4a генерируется
// afconvert (в тегах пусто — проверяем нормализацию отсутствующих полей).
// Запуск: npm run check:tags
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAudioMetadata } from '../src/tags/audio-metadata';
import { getTags } from '../src/tags';
import { normalizeTags } from '../src/tags/normalize';

const u32be = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u32le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const syncsafe = (n: number) => [(n >>> 21) & 0x7f, (n >>> 14) & 0x7f, (n >>> 7) & 0x7f, n & 0x7f];
const latin1 = (s: string) => Array.from(Buffer.from(s, 'latin1'), (b) => b);
const bytes = (arr: number[]) => Buffer.from(arr);

/** Минимальный JPEG-стаб: парсер его не декодирует, важен только base64-раундтрип. */
const JPEG = [
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
  0xff, 0xd9,
];

/** ID3v2.3-фрейм: id(4) + size u32be + flags(2) + payload. */
function id3v2Text(id: string, value: string): number[] {
  const payload = [0x00, ...latin1(value)]; // encoding 0 = latin1
  return [...latin1(id), ...u32be(payload.length), 0x00, 0x00, ...payload];
}

function id3v2Apic(mime: string, data: number[]): number[] {
  const payload = [0x00, ...latin1(mime), 0x00, 0x03, 0x00, ...data]; // latin1, cover(front), пустая desc
  return [...latin1('APIC'), ...u32be(payload.length), 0x00, 0x00, ...payload];
}

function makeMp3(path: string): void {
  const frames = [
    id3v2Text('TIT2', 'Blood Type'),
    id3v2Text('TPE1', 'Kino'),
    id3v2Text('TPE2', 'Kino'),
    id3v2Text('TALB', 'Blood Type'),
    id3v2Text('TRCK', '3/12'),
    id3v2Text('TYER', '1988'),
    id3v2Apic('image/jpeg', JPEG),
  ];
  const framesLen = frames.reduce((n, f) => n + f.length, 0);
  const tag = [
    ...latin1('ID3'),
    0x03,
    0x00, // v2.3
    0x00, // flags
    ...syncsafe(framesLen),
    ...frames.flat(),
    ...new Array<number>(64).fill(0), // padding
    0xff, 0xfb, 0x90, 0x00, // псевдо-аудиофрейм
  ];
  writeFileSync(path, bytes(tag));
}

/** FLAC-метаблок: header(4) + data. */
function flacBlock(isLast: boolean, type: number, data: number[]): number[] {
  return [(isLast ? 0x80 : 0x00) | type, (data.length >>> 16) & 0xff, (data.length >>> 8) & 0xff, data.length & 0xff, ...data];
}

function flacVorbis(comments: string[]): number[] {
  const out = [...u32le(0), ...u32le(comments.length)]; // vendor '' + count
  for (const c of comments) out.push(...u32le(Buffer.byteLength(c)), ...latin1(c));
  return out;
}

function flacPicture(mime: string, data: number[]): number[] {
  return [
    ...u32be(3), // cover (front)
    ...u32be(mime.length), ...latin1(mime),
    ...u32be(0), // пустая description
    ...new Array<number>(16).fill(0), // размеры/глубина — парсер скипает
    ...u32be(data.length), ...data,
  ];
}

function makeFlac(path: string): void {
  const streamInfo = new Array<number>(34).fill(0);
  const blocks = [
    flacBlock(false, 0, streamInfo),
    flacBlock(false, 4, flacVorbis(['TITLE=Blood Type', 'ARTIST=Kino', 'ALBUM=Blood Type', 'ALBUMARTIST=Kino', 'TRACKNUMBER=3', 'DATE=1988'])),
    flacBlock(true, 6, flacPicture('image/jpeg', JPEG)),
  ];
  writeFileSync(path, bytes([...latin1('fLaC'), ...blocks.flat(), 0x00, 0x00, 0x00, 0x00]));
}

/** Пустой m4a через afconvert (нативный кодер macOS). */
function makeM4a(path: string, dir: string): boolean {
  const wav = join(dir, 'in.wav');
  const sampleRate = 8000;
  const samples = Math.floor(sampleRate * 0.25);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(wav, Buffer.concat([header, pcm]));
  const r = spawnSync('/usr/bin/afconvert', ['-f', 'm4af', '-d', 'aac', wav, path]);
  return r.status === 0;
}

async function main(): Promise<void> {
  // Нормализация: edge-кейсы без файлов.
  const t = normalizeTags('mp3', { name: '  ', track: '0007', year: 1988.9 });
  assert.equal(t.title, null);
  assert.equal(t.trackNo, 7);
  assert.equal(t.year, 1988);
  assert.equal(normalizeTags('mp3', { track: 'abc' }).trackNo, null);
  assert.equal(normalizeTags('mp4', {}).format, 'm4a');

  const dir = mkdtempSync(join(tmpdir(), 'lyra-tags-'));
  try {
    const jpegB64 = Buffer.from(JPEG).toString('base64');
    const mp3 = join(dir, 'track.mp3');
    const flac = join(dir, 'track.flac');
    makeMp3(mp3);
    makeFlac(flac);

    // mp3: полный набор полей + обложка
    const mp3Tags = await getTags(mp3);
    assert.deepEqual(mp3Tags, {
      title: 'Blood Type',
      artist: 'Kino',
      albumArtist: 'Kino',
      album: 'Blood Type',
      trackNo: 3, // из «3/12»
      discNo: null,
      year: 1988,
      duration: null,
      format: 'mp3',
      artwork: `data:image/jpeg;base64,${jpegB64}`,
    });

    // flac: Vorbis comments + PICTURE
    const flacTags = await getTags(flac);
    assert.deepEqual(flacTags, { ...mp3Tags, format: 'flac' });

    // Неподдерживаемое расширение
    assert.equal(await getTags(join(dir, 'track.txt')), null);

    // m4a: реальный файл afconvert без тегов — все поля null
    const m4a = join(dir, 'track.m4a');
    if (makeM4a(m4a, dir)) {
      assert.deepEqual(await getTags(m4a), {
        title: null,
        artist: null,
        albumArtist: null,
        album: null,
        trackNo: null,
        discNo: null,
        year: null,
        duration: null,
        format: 'm4a',
        artwork: null,
      });
    } else {
      console.log('  (afconvert недоступен — m4a-кейс пропущен)');
    }

    // Читаемость сырого ответа парсера (шлюз для будущих проверок контракта)
    const raw = await getAudioMetadata(mp3 as 'x.mp3', ['name']);
    assert.equal(raw.metadata.name, 'Blood Type');
    void raw;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log('OK: тег-парсер прошёл самопроверку (mp3 ID3v2.3, flac, m4a, нормализация)');
  void execFileSync;
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

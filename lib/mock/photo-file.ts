/**
 * Mock горимын зургийн файл.
 *
 * Mock router нь ЗӨВХӨН JSON буцаадаг (`Response.json`) тул зургийн хоёртын
 * биетийг тэндээс өгөх аргагүй. Иймд прокси нь `/photos/:id/file` хүсэлтийг
 * `public/mock-photos/`-д байгаа статик жишээ зураг руу шилжүүлнэ.
 *
 * ЖИНХЭНЭ ЗУРАГ ТАВИХ: `public/mock-photos/`-д байгаа файлуудыг өөрийн
 * зургаар солиод, өргөтгөл нь өөр бол `MOCK_PHOTO_EXT`-ийг зас (`.jpg` г.м).
 */
export const MOCK_PHOTO_EXT = ".svg";

const MOCK_PHOTO_COUNT = 6;

/** `/photos/:id/file` мөн эсэх — мөн бол статик зургийн зам, эс бөгөөс null. */
export function mockPhotoPath(path: string[]): string | null {
  if (path.length !== 3 || path[0] !== "photos" || path[2] !== "file")
    return null;

  // id-гаас тогтмол сонголт — нэг зураг дахин ачаалах бүрд өөрчлөгдөхгүй.
  let h = 2166136261;
  for (let i = 0; i < path[1].length; i++) {
    h ^= path[1].charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return `/mock-photos/${((h >>> 0) % MOCK_PHOTO_COUNT) + 1}${MOCK_PHOTO_EXT}`;
}

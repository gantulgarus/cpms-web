"use client";

/**
 * Ажлын БҮХ зургийн баримт нэг дор.
 *
 * Гүйцэтгэл бүрийн зураг нь түүхэн жагсаалтад тэр мэдээллийнхээ ДООР
 * харагдана — энэ самбар нь бүгдийг нэг дор харах зориулалттай.
 *
 * ГОЛ ҮҮРЭГ: «гүйцэтгэлд холбогдоогүй» зургийг тусад нь тодруулна. Тийм
 * зураг бол аль мэдээллийн нотолгоо болох нь мэдэгдэхгүй, тиймээс хяналтын
 * инженерт бараг ашиггүй. Хуучин өгөгдөл ба яаралтай нэмсэн зураг ингэж
 * үлддэг тул нүдэнд харагдаж байх ёстой.
 *
 * Талбайн утасны зураг 5–10 МБ хүрдэг тул хөтөч дээр урьдчилж багасгана.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ImagePlus, Lock, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { downscale, PHOTO_TYPES } from "@/components/photo-picker";
import { photoUrl, workItems } from "@/lib/api/v2/endpoints";
import type { Photo, PhotoType, Uuid } from "@/lib/api/v2/types";
import { formatDateTime } from "@/lib/domain";
import { cn } from "@/lib/utils";

const TYPES = PHOTO_TYPES;

export function PhotoGallery({
  workItemId,
  canUpload,
  onChange,
}: {
  workItemId: Uuid;
  canUpload: boolean;
  onChange?: () => void;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<PhotoType>("progress");
  const [preview, setPreview] = useState<Photo | null>(null);

  const photosQuery = useQuery({
    queryKey: ["v2-photos", workItemId],
    queryFn: () => workItems.photos(workItemId),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["v2-photos", workItemId] });
    onChange?.();
  };

  const upload = useMutation({
    // `File[]` авна, `FileList` биш. `input.value = ""` хийхэд FileList нь
    // ХООСОРДОГ — mutation асинхрон тул ажиллах үедээ файл нь алга болсон
    // байдаг. Тиймээс дуудахаасаа өмнө массив болгож хуулна.
    mutationFn: async (files: File[]) => {
      for (const original of files) {
        const file = await downscale(original);
        await workItems.addPhoto(workItemId, file, type);
      }

      return files.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} зураг хавсаргалаа`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (photoId: Uuid) => workItems.removePhoto(photoId),
    onSuccess: () => {
      toast.success("Зураг устгагдлаа");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const photos = photosQuery.data?.data ?? [];
  // Холбогдоогүй нь ЭХЭНД — анхаарал татах ёстой зүйл дээд талд байна.
  const orphans = photos.filter((p) => !p.progressEntryId);
  const linked = photos.filter((p) => p.progressEntryId);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm">
          Зургийн баримт
          {photos.length > 0 && (
            <span className="text-muted-foreground ml-2 font-normal">{photos.length}</span>
          )}
        </CardTitle>

        {canUpload && (
          <div className="flex items-center gap-1">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  type === t.value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="size-4" /> {upload.isPending ? "Илгээж байна…" : "Нэмэх"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                // Эхлээд хуулж авна — дараа нь input-ыг цэвэрлэнэ, эс бөгөөс
                // ижил файлыг дахин сонгоход `change` дуудагдахгүй.
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) upload.mutate(files);
              }}
            />
          </div>
        )}
      </CardHeader>

      <CardContent>
        {photosQuery.isLoading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-muted aspect-square animate-pulse rounded-lg" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <EmptyState
            title="Зураг алга"
            description={
              canUpload
                ? "Гүйцэтгэлийн нотолгоо болгож зураг хавсаргана уу."
                : "Талбайгаас зураг ирээгүй байна."
            }
          />
        ) : (
          <div className="space-y-4">
            {orphans.length > 0 && (
              <section>
                <h3 className="text-muted-foreground mb-1.5 text-xs font-medium">
                  Гүйцэтгэлд холбогдоогүй · {orphans.length}
                  <span className="ml-1 font-normal">
                    — аль мэдээллийн нотолгоо болох нь тодорхойгүй
                  </span>
                </h3>
                <PhotoGrid
                  photos={orphans}
                  canUpload={canUpload}
                  onPreview={setPreview}
                  onRemove={(id) => remove.mutate(id)}
                  removing={remove.isPending}
                />
              </section>
            )}

            {linked.length > 0 && (
              <section>
                <h3 className="text-muted-foreground mb-1.5 text-xs font-medium">
                  Гүйцэтгэлд холбогдсон · {linked.length}
                  <span className="ml-1 font-normal">— түүхэн жагсаалтаас дэлгэрэнгүй</span>
                </h3>
                <PhotoGrid
                  photos={linked}
                  canUpload={canUpload}
                  onPreview={setPreview}
                  onRemove={(id) => remove.mutate(id)}
                  removing={remove.isPending}
                />
              </section>
            )}
          </div>
        )}
      </CardContent>

      {preview && <Lightbox photo={preview} onClose={() => setPreview(null)} />}
    </Card>
  );
}

/** Зургийн сүлжээ — хоёр хэсэгт давхардуулахгүйн тулд тусад нь. */
function PhotoGrid({
  photos,
  canUpload,
  onPreview,
  onRemove,
  removing,
}: {
  photos: Photo[];
  canUpload: boolean;
  onPreview: (photo: Photo) => void;
  onRemove: (id: Uuid) => void;
  removing: boolean;
}) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((p) => (
        <li key={p.id} className="group relative">
          <button
            type="button"
            onClick={() => onPreview(p)}
            className="block w-full overflow-hidden rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl(p)}
              alt={`${p.type} — ${formatDateTime(p.takenAt)}`}
              loading="lazy"
              className="bg-muted aspect-square w-full object-cover transition-transform group-hover:scale-105"
            />
          </button>

          <span className="bg-background/85 absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[11px] font-medium">
            {TYPES.find((t) => t.value === p.type)?.label ?? p.type}
          </span>

          {p.locked ? (
            <span
              className="bg-background/85 absolute top-1 right-1 rounded p-1"
              title="Батлагдсан — устгах боломжгүй"
            >
              <Lock className="size-3" />
            </span>
          ) : (
            canUpload && (
              <button
                type="button"
                aria-label="Зураг устгах"
                onClick={() => onRemove(p.id)}
                disabled={removing}
                className="bg-background/85 text-muted-foreground hover:text-destructive absolute top-1 right-1 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="size-3" />
              </button>
            )
          )}
        </li>
      ))}
    </ul>
  );
}

/** Томруулж харах — гар аргаар, ямар нэг нэмэлт сан хэрэггүй. */
function Lightbox({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <button
        type="button"
        aria-label="Хаах"
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl(photo)}
        alt={photo.type}
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      <p className="absolute bottom-4 text-sm text-white/80">
        {photo.uploadedBy ? `${photo.uploadedBy} · ` : ""}
        {formatDateTime(photo.takenAt ?? photo.uploadedAt)}
      </p>
    </div>
  );
}

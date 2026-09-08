"use client";

/**
 * Гүйцэтгэл бүртгэхийн ЗЭРЭГЦЭЭ зураг хавсаргах.
 *
 * ЯАГААД ХЭРЭГТЭЙ: урьд нь зураг ажилд ерөнхийд нь хавсардаг байсан. 20
 * удаа гүйцэтгэл мэдээлсэн ажилд 40 зураг нэг овоо болж хэвтэх ба «аль
 * зураг нь алины нотолгоо вэ» гэдэг НЭГ Ч ХҮНД мэдэгдэхгүй байв. Хяналтын
 * инженер батлахдаа яг тэр 5 м²-ийн зургийг хайж олох ёстой.
 *
 * Шийдэл: зургийг гүйцэтгэл мэдээлэх урсгал ДОТОР нь авч, мэдээлэл үүссэний
 * дараа `progressEntryId`-аар холбоно.
 *
 * Энэ бүрэлдэхүүн нь файлыг ЗӨВХӨН цуглуулна — илгээх нь эцэг дээр, учир нь
 * гүйцэтгэлийн мөр үүсэхээс өмнө холбох id байхгүй.
 */
import { useRef } from "react";
import { ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PhotoType } from "@/lib/api/v2/types";
import { cn } from "@/lib/utils";

/** Илгээхийн өмнөх дээд хэмжээ — талбайн сүлжээнд эвтэйхэн. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export const PHOTO_TYPES: { value: PhotoType; label: string }[] = [
  { value: "before", label: "Өмнө" },
  { value: "progress", label: "Явцад" },
  { value: "after", label: "Дараа" },
];

/**
 * Зургийг хөтөч дээр багасгана.
 *
 * Ямар нэг шалтгаанаар болохгүй бол эх файлыг буцаана — багасгаж чадаагүйгээс
 * болж зураг огт орохгүй байх нь дор.
 */
export async function downscale(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    if (scale >= 1 && file.size < 1_500_000) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export interface PickedPhoto {
  /** Урьдчилан харах локал хаяг — салахдаа чөлөөлөгдөнө. */
  previewUrl: string;
  file: File;
}

export function PhotoPicker({
  picked,
  onPick,
  onRemove,
  type,
  onTypeChange,
  disabled,
}: {
  picked: PickedPhoto[];
  onPick: (files: File[]) => void;
  onRemove: (index: number) => void;
  type: PhotoType;
  onTypeChange: (type: PhotoType) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Зургийн баримт</span>
        <div className="flex items-center gap-1">
          {PHOTO_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onTypeChange(t.value)}
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
        </div>
      </div>

      {picked.length > 0 && (
        <ul className="grid grid-cols-4 gap-1.5">
          {picked.map((p, i) => (
            <li key={p.previewUrl} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.previewUrl}
                alt={p.file.name}
                className="bg-muted aspect-square w-full rounded-md object-cover"
              />
              <button
                type="button"
                aria-label="Хасах"
                disabled={disabled}
                onClick={() => onRemove(i)}
                className="bg-background/90 text-muted-foreground hover:text-destructive absolute top-0.5 right-0.5 rounded p-0.5"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus className="size-4" />
        {picked.length === 0 ? "Зураг хавсаргах" : "Дахин нэмэх"}
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          // Эхлээд хуулж авна — дараа нь input-ыг цэвэрлэнэ, эс бөгөөс ижил
          // файлыг дахин сонгоход `change` дуудагдахгүй.
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onPick(files);
        }}
      />
    </div>
  );
}

/**
 * Текст хуулах — HTTP дээр ч ажиллана.
 *
 * ЯАГААД ТУСГАЙ КОД ХЭРЭГТЭЙ ВЭ: `navigator.clipboard` нь зөвхөн ХАМГААЛАГДСАН
 * ОРЧИНД (HTTPS эсвэл `localhost`) байдаг. Дотоод сүлжээнд `http://192.168.…`
 * гэж хандахад тэр объект нь `undefined` бөгөөд товч дарахад ямар ч хариу
 * үзүүлэхгүй — хэрэглэгч «систем эвдэрсэн» гэж бодно.
 *
 * Тиймээс хуучин `document.execCommand("copy")` рүү шилжинэ. Тэр нь албан
 * ёсоор хуучирсан ч бүх хөтөч дэмждэг бөгөөд HTTPS шаарддаггүй.
 */
export async function copyText(text: string): Promise<boolean> {
  // 1. Орчин үеийн зам — HTTPS дээр.
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);

      return true;
    } catch {
      // Зөвшөөрөл өгөөгүй байж болно — доорх нөөц замаар үргэлжилнэ.
    }
  }

  // 2. Нөөц зам — HTTP дээр.
  if (typeof document === "undefined") return false;

  const area = document.createElement("textarea");
  area.value = text;
  // Дэлгэцээс гаргахгүйгээр нуух: `display:none` бол сонголт ажиллахгүй.
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.opacity = "0";
  document.body.appendChild(area);

  try {
    area.select();
    area.setSelectionRange(0, text.length); // iOS-д `select()` ганцаараа хүрэлцэхгүй

    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
  }
}

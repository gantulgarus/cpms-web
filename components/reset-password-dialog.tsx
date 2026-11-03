"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormDialog, FormField } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { users } from "@/lib/api/endpoints";
import type { ManagedUser } from "@/lib/api/types";

function suggestPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const limit = 256 - (256 % alphabet.length);
  let password = "";
  while (password.length < 16) {
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
      if (byte < limit && password.length < 16) password += alphabet[byte % alphabet.length];
    }
  }
  return password;
}

export function ResetPasswordDialog({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const [password, setPassword] = useState(suggestPassword);
  const [visible, setVisible] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: () => users.resetPassword(user.id, password),
    onSuccess: (actualPassword) => {
      setSaved(actualPassword);
      toast.success("Нууц үг шинэчлэгдлээ");
    },
  });
  return (
    <FormDialog open onOpenChange={(open) => { if (!open && !reset.isPending) onClose(); }}
      title={saved !== null ? "Нууц үг шинэчлэгдлээ" : "Шинэ нууц үг тохируулах"}
      submitLabel={saved !== null ? "Дуусгах" : "Нууц үг хадгалах"}
      submitDisabled={saved === null && password.length < 8}
      pending={reset.isPending}
      onSubmit={() => { if (saved !== null) onClose(); else if (!reset.isPending && password.length >= 8) reset.mutate(); }}>
      <div className="rounded-lg bg-muted p-3 text-sm"><p className="font-medium">{user.name}</p><p className="text-muted-foreground">{user.email}</p></div>
      <FormField label={saved !== null ? "Хадгалагдсан нууц үг" : "Шинэ нууц үг"} hint={saved !== null ? "Энэ цонхыг хаахаас өмнө шинэ нууц үгээ хуулж авна уу." : "Санал болгосон нууц үгийг ашиглах эсвэл хүссэн нууц үгээ бичнэ үү. Хамгийн багадаа 8 тэмдэгт."}>
        <Input aria-label="Шинэ нууц үг" type={visible ? "text" : "password"} autoComplete="new-password" spellCheck={false} value={saved ?? password} readOnly={saved !== null} disabled={reset.isPending} minLength={8} onChange={(event) => { setPassword(event.target.value); reset.reset(); }} />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setVisible((old) => !old)}>{visible ? "Нуух" : "Харуулах"}</Button>
        {saved === null && <Button type="button" variant="outline" disabled={reset.isPending} onClick={() => { setPassword(suggestPassword()); reset.reset(); }}>Өөр нууц үг санал болгох</Button>}
        <Button type="button" variant="outline" onClick={async () => {
          try { await navigator.clipboard.writeText(saved ?? password); toast.success("Хууллаа"); }
          catch { toast.error("Хуулж чадсангүй. Нууц үгээ сонгоод гараар хуулна уу."); }
        }}>Хуулах</Button>
      </div>
      {saved !== null && saved !== password && <p role="alert" className="text-amber-700 text-sm">Сервер сонгосон нууц үгийн оронд өөр нууц үг үүсгэсэн байна. Дээрх хадгалагдсан нууц үгийг ашиглана уу.</p>}
      {reset.error && <p role="alert" className="text-destructive text-sm">{reset.error.message}</p>}
      {saved === null && <p className="text-muted-foreground text-sm">“Нууц үг хадгалах” дарсны дараа нууц үг солигдоно.</p>}
    </FormDialog>
  );
}

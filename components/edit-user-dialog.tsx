"use client";

/**
 * Хэрэглэгчийн мэдээлэл засах.
 *
 * ЯАГААД ХЭРЭГТЭЙ ВЭ: урьд нь нэр, үүрэг, хамрах барилгыг ЗӨВХӨН бүртгэх
 * мөчид сонгодог байв. Шинэ барилга нэмэгдэхэд тэр инженерт нэмж өгөх арга
 * байхгүй — данс нь устгаад дахин үүсгэхээс өөр зам үлддэггүй. Тэгвэл түүний
 * нэрээр хийгдсэн бүх бүртгэл өнчин болно.
 *
 * Сервер талд `PATCH /users/{id}` аль хэдийн бүх талбарыг хүлээж авдаг
 * байсан — зөвхөн дуудах цонх нь дутуу байв.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { Input } from "@/components/ui/input";
import { blocks as blocksApi, users } from "@/lib/api/v2/endpoints";
import type { ManagedUser } from "@/lib/api/v2/types";
import { useMe } from "@/lib/api/v2/use-me";
import { useProject } from "@/lib/api/v2/use-project";

export function EditUserDialog({
  user,
  open,
  onOpenChange,
}: {
  user: ManagedUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { me } = useMe();
  const { project } = useProject();

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [scopeBlockIds, setScopeBlockIds] = useState<string[]>(user.scopeBlockIds);
  const [isActive, setIsActive] = useState(user.isActive);

  // Хоёулаа кэшлэгдсэн түлхүүр — жагсаалтын хуудас аль хэдийн татсан байна.
  const roles = useQuery({ queryKey: ["v2-roles"], queryFn: users.roles });
  const blockList = useQuery({
    queryKey: ["v2-blocks", project?.id],
    queryFn: () => blocksApi.listForProject(project!.id),
    enabled: Boolean(project),
  });

  const selectedRole = roles.data?.find((r) => r.value === role);

  /*
   * Өөрийн эрхээ бууруулахаас сэргийлнэ.
   *
   * Сервер үүнийг 422-оор няцаадаг. Дэлгэц дээр ЧУХАЛ нь няцаалт биш —
   * товчийг нь урьдчилж унтраах: сүүлчийн админ өөрийгөө инженер болгоод
   * хэрэглэгч удирдах хаалга бүрмөсөн хаагдвал өгөгдлийн сангаас засахаас
   * өөр арга үлдэхгүй.
   */
  const isSelf = me?.id === user.id;
  const losingOwnAccess = isSelf && selectedRole !== undefined && !selectedRole.canManageUsers;

  const save = useMutation({
    mutationFn: () =>
      users.update(user.id, {
        name: name.trim(),
        email: email.trim(),
        role,
        // Хоосон массив нь «хязгаарлалт байхгүй» гэсэн утгатай — сервер
        // үүнийг `null`-ээс ялгаж ойлгодог тул үргэлж илгээнэ.
        scopeBlockIds: selectedRole?.seesAllBlocks ? [] : scopeBlockIds,
        isActive,
      }),
    onSuccess: (updated) => {
      toast.success(`${updated.name} шинэчлэгдлээ`);
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["v2-users"] });
      // Өөрийгөө засвал толгойн нэр, эрх шууд шинэчлэгдэнэ.
      if (isSelf) qc.invalidateQueries({ queryKey: ["v2-me"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleBlock = (id: string, checked: boolean) =>
    setScopeBlockIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${user.name} — засах`}
      submitLabel="Хадгалах"
      submitDisabled={!name.trim() || !email.trim() || losingOwnAccess}
      pending={save.isPending}
      onSubmit={() => save.mutate()}
    >
      <FormField label="Нэр" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </FormField>

      <FormField label="Имэйл" required hint="Нэвтрэхэд хэрэглэгдэнэ.">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>

      <FormField label="Үүрэг" required>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          {(roles.data ?? []).map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </FormField>

      {/* Үүрэг юу гэсэн үг болохыг ШУУД харуулна — эрхийг дараа нь гайхахаас
          сэргийлнэ. */}
      {selectedRole && (
        <p className="text-muted-foreground text-xs">
          {[
            selectedRole.canReportProgress ? "Гүйцэтгэл мэдээлнэ" : "Гүйцэтгэл мэдээлэхгүй",
            selectedRole.canInspect ? "баталгаажуулна" : "баталгаажуулахгүй",
            selectedRole.seesAllBlocks ? "бүх барилга харна" : "зөвхөн оноосон барилга харна",
          ].join(" · ")}
        </p>
      )}

      {losingOwnAccess && (
        <p className="text-destructive text-xs" role="alert">
          Өөрийн эрхээ бууруулах боломжгүй. Өөр админ гүйцэтгэнэ.
        </p>
      )}

      {!selectedRole?.seesAllBlocks && (blockList.data?.data.length ?? 0) > 0 && (
        <FormField label="Хамрах барилга">
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
            {(blockList.data?.data ?? []).map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scopeBlockIds.includes(b.id)}
                  onChange={(e) => toggleBlock(b.id, e.target.checked)}
                />
                {b.name}
              </label>
            ))}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Хоосон орхивол бүх барилга харагдана. Сонгосон бол бусад барилга жагсаалтад ч гарахгүй.
          </p>
        </FormField>
      )}

      {/* Хаасан хэрэглэгчийг эргүүлэн нээх цорын ганц зам. Урьд нь хаасны
          дараа дахин нээх боломжгүй байв. */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={isSelf}
        />
        Идэвхтэй — нэвтрэх эрхтэй
        {isSelf && <span className="text-muted-foreground text-xs">(өөрийгөө хааж болохгүй)</span>}
      </label>
    </FormDialog>
  );
}

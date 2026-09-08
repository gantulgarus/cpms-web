"use client";

/**
 * Хэрэглэгчийн бүртгэл (админ, захирал).
 *
 * Систем нь "хэн мэдээлсэн, хэн баталсан"-д тулгуурладаг тул хүн бүр өөрийн
 * данстай байх ёстой. Урьд нь данс зөвхөн seed-ээс үүсдэг байсан.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { KeyRound, ShieldOff, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { FormDialog, FormField } from "@/components/form-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { ToneBadge } from "@/components/tone-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { blocks as blocksApi, users } from "@/lib/api/v2/endpoints";
import type { ManagedUser } from "@/lib/api/v2/types";
import { useMe } from "@/lib/api/v2/use-me";
import { useProject } from "@/lib/api/v2/use-project";

const EMPTY = { name: "", email: "", role: "site_engineer", password: "", scopeBlockIds: [] as string[] };

export default function UsersPage() {
  const qc = useQueryClient();
  const { me } = useMe();
  const { project } = useProject();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState("");

  const canManage = Boolean(me?.canManageUsers);

  const list = useQuery({
    queryKey: ["v2-users"],
    queryFn: () => users.list(),
    enabled: canManage,
  });
  const roles = useQuery({ queryKey: ["v2-roles"], queryFn: users.roles, enabled: canManage });
  const blockList = useQuery({
    queryKey: ["v2-blocks", project?.id],
    queryFn: () => blocksApi.listForProject(project!.id),
    enabled: Boolean(project) && canManage,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["v2-users"] });

  const selectedRole = roles.data?.find((r) => r.value === form.role);

  const create = useMutation({
    mutationFn: () =>
      users.create({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        password: form.password.trim() || undefined,
        scopeBlockIds: form.scopeBlockIds.length ? form.scopeBlockIds : undefined,
      }),
    onSuccess: (res) => {
      setCreating(false);
      setForm(EMPTY);
      refresh();
      // Түр нууц үг зөвхөн энэ мөчид харагдана — дахин авах боломжгүй.
      const temp = res.meta?.temporaryPassword;
      toast.success(
        temp ? `${res.data.name} бүртгэгдлээ. Түр нууц үг: ${temp}` : `${res.data.name} бүртгэгдлээ.`,
        { duration: 20000 },
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: (id: ManagedUser["id"]) => users.resetPassword(id),
    onSuccess: (password) =>
      toast.success(`Шинэ түр нууц үг: ${password}`, { duration: 20000 }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivate = useMutation({
    mutationFn: (id: ManagedUser["id"]) => users.deactivate(id),
    onSuccess: () => {
      toast.success("Хандалт хаагдлаа");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const all = list.data?.data ?? [];
    const q = search.trim().toLowerCase();
    return q ? all.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q)) : all;
  }, [list.data, search]);

  if (!canManage) {
    return (
      <EmptyState
        title="Хандах эрхгүй"
        description="Хэрэглэгчийн бүртгэлийг зөвхөн админ, захирал удирдана."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Хэрэглэгчид"
        description="Хүн бүр өөрийн данстай байх ёстой — гүйцэтгэл хэн мэдээлсэн, хэн баталсныг ялгах үндэс нь энэ."
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus className="size-4" /> Шинэ хэрэглэгч
          </Button>
        }
      />

      <div className="mb-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Нэр эсвэл имэйлээр хайх…"
          className="max-w-xs"
        />
      </div>

      {list.isLoading ? (
        <LoadingRows rows={5} />
      ) : list.error ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="Хэрэглэгч олдсонгүй" description="Хайлтаа өөрчилж үзнэ үү." />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Нэр</TableHead>
                <TableHead>Имэйл</TableHead>
                <TableHead>Үүрэг</TableHead>
                <TableHead>Эрх</TableHead>
                <TableHead className="w-56" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id} className={u.isActive ? undefined : "opacity-55"}>
                  <TableCell className="font-medium">
                    {u.name}
                    {!u.isActive && (
                      <span className="ml-2">
                        <ToneBadge tone="gray">Идэвхгүй</ToneBadge>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>{u.roleLabel}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {[
                      u.canReportProgress && "мэдээлнэ",
                      u.canInspect && "батална",
                      u.scopeBlockIds.length > 0 && `${u.scopeBlockIds.length} блок`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={reset.isPending}
                        onClick={() => {
                          if (confirm(`${u.name}-ийн нууц үгийг сэргээх үү?`)) reset.mutate(u.id);
                        }}
                      >
                        <KeyRound className="size-3.5" /> Нууц үг
                      </Button>
                      {u.isActive && (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deactivate.isPending}
                          onClick={() => {
                            if (confirm(`${u.name}-ийн хандалтыг хаах уу?`)) deactivate.mutate(u.id);
                          }}
                        >
                          <ShieldOff className="size-3.5" /> Хаах
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Шинэ хэрэглэгч"
        submitLabel="Бүртгэх"
        submitDisabled={!form.name.trim() || !form.email.trim()}
        pending={create.isPending}
        onSubmit={() => create.mutate()}
      >
        <FormField label="Нэр" required>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Б.Болд"
            autoFocus
          />
        </FormField>
        <FormField label="Имэйл" required>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="bold@cpms.mn"
          />
        </FormField>
        <FormField label="Үүрэг" required>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {(roles.data ?? []).map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </FormField>

        {/* Үүрэг сонгоход тэр нь юу гэсэн үг болохыг ШУУД харуулна — эрхийг
            дараа нь гайхахаас сэргийлнэ. */}
        {selectedRole && (
          <p className="text-muted-foreground text-xs">
            {[
              selectedRole.canReportProgress ? "Гүйцэтгэл мэдээлнэ" : "Гүйцэтгэл мэдээлэхгүй",
              selectedRole.canInspect ? "баталгаажуулна" : "баталгаажуулахгүй",
              selectedRole.seesAllBlocks ? "бүх барилга харна" : "зөвхөн оноосон барилга харна",
            ].join(" · ")}
          </p>
        )}

        {!selectedRole?.seesAllBlocks && (blockList.data?.data.length ?? 0) > 0 && (
          <FormField label="Хамрах барилга">
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
              {(blockList.data?.data ?? []).map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.scopeBlockIds.includes(b.id)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        scopeBlockIds: e.target.checked
                          ? [...f.scopeBlockIds, b.id]
                          : f.scopeBlockIds.filter((x) => x !== b.id),
                      }))
                    }
                  />
                  {b.name}
                </label>
              ))}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Хоосон орхивол бүх барилга харагдана.
            </p>
          </FormField>
        )}

        <FormField label="Нууц үг">
          <Input
            type="text"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Хоосон орхивол автоматаар үүснэ"
          />
        </FormField>
      </FormDialog>
    </div>
  );
}

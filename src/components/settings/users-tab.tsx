"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getSettingsUsers, createSettingsUser, updateSettingsUser, deleteSettingsUser } from "@/lib/api";

interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  STAFF: "Staff",
  INSTRUCTOR: "Instructor",
};

export function UsersTab() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [form, setForm] = useState({ email: "", name: "", role: "STAFF" });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSettingsUsers();
      setUsers((data as { users?: UserRecord[] } & UserRecord[]).users || (data as UserRecord[]));
    } catch {
      toast.error("Failed to load users");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function openCreate() {
    setEditing(null);
    setForm({ email: "", name: "", role: "STAFF" });
    setDialogOpen(true);
  }

  function openEdit(user: UserRecord) {
    setEditing(user);
    setForm({ email: user.email, name: user.name, role: user.role });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      if (editing) {
        await updateSettingsUser(editing.id, { name: form.name, role: form.role });
        toast.success("User updated");
      } else {
        await createSettingsUser(form);
        toast.success("User created");
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function handleToggleActive(user: UserRecord) {
    try {
      await updateSettingsUser(user.id, { isActive: !user.isActive });
      toast.success(user.isActive ? "User deactivated" : "User activated");
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleDelete(user: UserRecord) {
    if (!confirm(`Deactivate "${user.name}"?`)) return;
    try {
      await deleteSettingsUser(user.id);
      toast.success("User deactivated");
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to deactivate");
    }
  }

  if (loading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Users</h3>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No users</TableCell></TableRow>
            ) : users.map((user) => (
              <TableRow key={user.id} className={!user.isActive ? "opacity-50" : ""}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell><Badge variant="outline">{ROLE_LABELS[user.role] || user.role}</Badge></TableCell>
                <TableCell>
                  {user.isActive
                    ? <Badge variant="default" className="bg-green-600">Active</Badge>
                    : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(user)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleToggleActive(user)}>
                      {user.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(user)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={!!editing}
                type="email"
              />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v ?? "STAFF" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  <SelectItem value="INSTRUCTOR">Instructor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.email || !form.name}>{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

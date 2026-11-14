"use client";
import { DropdownMenu } from "radix-ui";
import { MoreVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CatalogActions({
  label,
  addLabel,
  deleteLabel,
  onAdd,
  onDelete,
  canAdd = true,
  canDelete = false,
}: {
  label: string;
  addLabel: string;
  deleteLabel: string;
  onAdd: () => void;
  onDelete: () => void;
  canAdd?: boolean;
  canDelete?: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={label}
        >
          <MoreVertical />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="account-dropdown z-90 min-w-52"
        >
          <DropdownMenu.Item
            className="account-dropdown-item data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
            disabled={!canAdd}
            onSelect={onAdd}
          >
            <Plus size={16} />
            {addLabel}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
          <DropdownMenu.Item
            className="account-dropdown-item text-red-700 data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
            disabled={!canDelete}
            onSelect={onDelete}
          >
            <Trash2 size={16} />
            {deleteLabel}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

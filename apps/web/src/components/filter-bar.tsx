"use client";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
export function FilterBar({
  search,
  onSearch,
  filter,
  onFilter,
}: {
  search: string;
  onSearch: (value: string) => void;
  filter: string;
  onFilter: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div className="relative w-full sm:max-w-xs">
        <Search
          className="absolute top-3 left-3 size-4 text-slate-400"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search records"
          placeholder="Search records..."
          className="search-input pl-9"
        />
      </div>
      <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600">
        <SlidersHorizontal className="size-3.5" aria-hidden="true" />
        <span className="sr-only">Record status</span>
        <select
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          className="bg-transparent outline-none"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
    </div>
  );
}

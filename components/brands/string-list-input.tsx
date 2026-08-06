"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function StringListInput({
  value,
  onChange,
  placeholder,
  addLabel,
  multiline = false,
  max = 10,
}: {
  value: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel: string;
  multiline?: boolean;
  max?: number;
}) {
  function update(index: number, next: string) {
    onChange(value.map((item, i) => (i === index ? next : item)));
  }

  return (
    <div className="space-y-2">
      {value.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          {multiline ? (
            <Textarea
              value={item}
              onChange={(event) => update(index, event.target.value)}
              placeholder={placeholder}
              rows={3}
              className="flex-1"
            />
          ) : (
            <Input
              value={item}
              onChange={(event) => update(index, event.target.value)}
              placeholder={placeholder}
              className="flex-1"
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            title="Quitar"
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}

      {value.length < max ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...value, ""])}
        >
          <Plus className="size-4" />
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}

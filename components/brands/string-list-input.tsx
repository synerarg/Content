"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SuggestInput, SuggestTextarea } from "@/components/ui/suggest-field";

export function StringListInput({
  value,
  onChange,
  placeholder,
  addLabel,
  multiline = false,
  max = 10,
  suggest = false,
}: {
  value: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel: string;
  multiline?: boolean;
  max?: number;
  /*
    Whether Tab may accept the placeholder — off by default, because this
    component's placeholder is as often an instruction ("Pegá acá un caption
    que ya hayas publicado…") as an example ("stock photo genérico"), and only
    the caller knows which one it passed.
  */
  suggest?: boolean;
}) {
  const LongField = suggest ? SuggestTextarea : Textarea;
  const ShortField = suggest ? SuggestInput : Input;

  function update(index: number, next: string) {
    onChange(value.map((item, i) => (i === index ? next : item)));
  }

  return (
    <div className="space-y-2">
      {value.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          {/* The wrapper carries the width: SuggestInput renders a relative
              div around the field, so `flex-1` has to land on the outside. */}
          <div className="min-w-0 flex-1">
            {multiline ? (
              <LongField
                value={item}
                onChange={(event) => update(index, event.target.value)}
                placeholder={placeholder}
                rows={3}
              />
            ) : (
              <ShortField
                value={item}
                onChange={(event) => update(index, event.target.value)}
                placeholder={placeholder}
              />
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            title="Quitar"
            aria-label="Quitar"
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

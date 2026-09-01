"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/*
  Tab turns the placeholder into a real value.

  The placeholders on the brand form are not hints, they are ANSWERS — someone
  wrote "Cercano pero profesional. Voseo rioplatense. Sin jerga corporativa ni
  promesas exageradas." as an example of a good tone, and then everyone who
  agreed with it had to retype it. This makes the grey text acceptable with one
  key, the way an inline completion works.

  Three rules, and each one exists to keep Tab trustworthy:

    1. Tab is only intercepted when there is SOMETHING TO ACCEPT — the value is
       empty, or it is a prefix of the placeholder. Otherwise Tab moves focus,
       which is the only behaviour a keyboard user can be sure of. A field that
       swallowed Tab unconditionally would trap them.
    2. Accepting keeps focus, caret at the end. The text is a starting point and
       is meant to be edited; sending focus onward would say the opposite.
       The SECOND Tab then leaves, because a full value has nothing left to
       accept — so tab-tab still walks the form.
    3. It is opt-in per field. A placeholder that reads "Pegá acá un caption que
       ya hayas publicado…" is an instruction, and typing an instruction into
       the field is worse than typing nothing. Only placeholders that are real
       example content get this.

  The partial case — you typed "Cercano" and the rest is still offered — needs
  an overlay, because HTML hides the placeholder the moment a field is not
  empty. The empty case needs none: the browser is already drawing it.
*/

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * What is left of the placeholder, given what is typed. Empty string when
 * there is nothing to offer — which is also the signal to leave Tab alone.
 */
export function completionFor(value: string, placeholder: string | undefined): string {
  if (!placeholder) return "";
  if (value.length >= placeholder.length) return "";
  if (!placeholder.toLowerCase().startsWith(value.toLowerCase())) return "";
  return placeholder.slice(value.length);
}

/*
  Written through the prototype's own setter, then announced.

  React tracks the last value it wrote to the node and skips the change event
  when a plain `el.value = x` matches it; going through the native setter and
  dispatching a bubbling `input` is what makes React — and therefore
  react-hook-form and every controlled caller — see the new value. Assigning
  directly leaves the DOM showing text the form does not have.
*/
function commit(el: Field, next: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

  if (setter) setter.call(el, next);
  else el.value = next;

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.setSelectionRange(next.length, next.length);
}

type Handlers = {
  onKeyDown?: React.KeyboardEventHandler<Field>;
  onFocus?: React.FocusEventHandler<Field>;
  onBlur?: React.FocusEventHandler<Field>;
  onInput?: React.FormEventHandler<Field>;
};

function useCompletion(placeholder: string | undefined, outer: Handlers) {
  const [typed, setTyped] = React.useState("");
  const [focused, setFocused] = React.useState(false);

  // Only ever offered to the field someone is actually in: a page of grey
  // "Tab" chips reads as clutter, and the offer is meaningless without focus.
  const completion = focused ? completionFor(typed, placeholder) : "";

  const handlers: Handlers = {
    onFocus: (event) => {
      // Re-read rather than trust `typed`: importing a site draft calls the
      // form's `reset`, which changes the DOM value without an input event.
      setTyped(event.currentTarget.value);
      setFocused(true);
      outer.onFocus?.(event);
    },
    onBlur: (event) => {
      setFocused(false);
      outer.onBlur?.(event);
    },
    onInput: (event) => {
      setTyped(event.currentTarget.value);
      outer.onInput?.(event);
    },
    onKeyDown: (event) => {
      outer.onKeyDown?.(event);

      const plainTab =
        event.key === "Tab" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey;
      if (!plainTab || event.defaultPrevented) return;

      const element = event.currentTarget;
      const rest = completionFor(element.value, placeholder);
      if (!rest) return; // Nothing to accept — let Tab move focus.

      event.preventDefault();
      const next = element.value + rest;
      commit(element, next);
      setTyped(next);
    },
  };

  return { typed, completion, handlers };
}

/** The key cap. Says which key, because nothing else on screen would. */
function TabHint({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute rounded border border-border bg-background px-1 py-px text-[10px] leading-4 text-muted-foreground",
        className,
      )}
    >
      Tab
    </span>
  );
}

export function SuggestInput({
  className,
  placeholder,
  onKeyDown,
  onFocus,
  onBlur,
  onInput,
  ...props
}: React.ComponentProps<typeof Input>) {
  const { typed, completion, handlers } = useCompletion(placeholder, {
    onKeyDown,
    onFocus,
    onBlur,
    onInput,
  });

  return (
    <div className="relative">
      <Input
        {...props}
        {...handlers}
        placeholder={placeholder}
        aria-autocomplete="inline"
        className={className}
      />

      {/* Only for a partial value: an empty field already shows the
          placeholder, and drawing a second copy over it would double it. */}
      {completion && typed ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center overflow-hidden rounded-md px-2.5 py-1 text-base md:text-sm"
        >
          <span className="invisible whitespace-pre">{typed}</span>
          <span className="whitespace-pre text-muted-foreground/60">{completion}</span>
        </div>
      ) : null}

      {completion ? <TabHint className="top-1/2 right-2 -translate-y-1/2" /> : null}
    </div>
  );
}

export function SuggestTextarea({
  className,
  placeholder,
  onKeyDown,
  onFocus,
  onBlur,
  onInput,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  const { typed, completion, handlers } = useCompletion(placeholder, {
    onKeyDown,
    onFocus,
    onBlur,
    onInput,
  });

  return (
    <div className="relative">
      <Textarea
        {...props}
        {...handlers}
        placeholder={placeholder}
        aria-autocomplete="inline"
        className={className}
      />

      {completion && typed ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-md px-2.5 py-2 text-base break-words whitespace-pre-wrap md:text-sm"
        >
          <span className="invisible">{typed}</span>
          <span className="text-muted-foreground/60">{completion}</span>
        </div>
      ) : null}

      {completion ? <TabHint className="right-2 bottom-2" /> : null}
    </div>
  );
}

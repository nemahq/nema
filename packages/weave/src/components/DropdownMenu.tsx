import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import * as React from "react";

import { useEscapeAwareCloseFocus } from "../hooks/useEscapeAwareCloseFocus";
import { useIsOverflowing } from "../hooks/useIsOverflowing";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "../icons";
import { cn, POPOVER_SURFACE_CLASSNAME } from "../utils";

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  );
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  );
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  width,
  style,
  onEscapeKeyDown,
  onCloseAutoFocus,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content> & {
  width?: number | string;
}) {
  const escapeAwareCloseFocus = useEscapeAwareCloseFocus(
    onEscapeKeyDown,
    onCloseAutoFocus,
  );
  const fixedWidth = typeof width === "number" ? `${width}px` : width;
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        {...escapeAwareCloseFocus}
        style={
          fixedWidth === undefined
            ? style
            : { ...style, width: fixedWidth, minWidth: fixedWidth }
        }
        className={cn(
          POPOVER_SURFACE_CLASSNAME,
          "z-50 min-w-[8rem]",
          className,
        )}
        {...props}
      >
        {/* 스크롤 클리핑(overflow)을 바깥 박스가 아니라 이 안쪽 레이어에서만
            건다 — 바깥 박스에 overflow를 같이 걸면 그 박스 자신의 box-shadow도
            같이 잘려서 안 보이게 된다. */}
        <div className="max-h-(--radix-dropdown-menu-content-available-height) overflow-x-hidden overflow-y-auto p-1">
          {children}
        </div>
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  );
}

// 순수 텍스트 children은 감쌀 엘리먼트가 없으면 min-width를 줄 수 없어 flex item
// 기본값(min-width: auto)에 막혀 ellipsis 없이 그냥 잘린다 — 텍스트 구간만 별도
// span으로 감싸 min-w-0을 걸어준다.
function wrapDropdownMenuItemLabel(
  children: React.ReactNode,
  labelRef: React.Ref<HTMLSpanElement>,
  labelTitle: string | undefined,
): React.ReactNode[] {
  const content: React.ReactNode[] = [];
  let labelRun: React.ReactNode[] = [];
  let labelWrapped = false;

  function flushLabelRun() {
    if (labelRun.length === 0) {
      return;
    }
    const isFirstLabelRun = !labelWrapped;
    labelWrapped = true;
    content.push(
      <span
        key={`label-${content.length}`}
        ref={isFirstLabelRun ? labelRef : undefined}
        className="min-w-0 flex-1 truncate"
        title={isFirstLabelRun ? labelTitle : undefined}
      >
        {labelRun}
      </span>,
    );
    labelRun = [];
  }

  for (const child of React.Children.toArray(children)) {
    if (typeof child === "string" || typeof child === "number") {
      labelRun.push(child);
    } else {
      flushLabelRun();
      content.push(child);
    }
  }
  flushLabelRun();

  return content;
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  title,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "danger";
}) {
  const { ref, isOverflowing } = useIsOverflowing<HTMLSpanElement>();
  const resolvedTitle =
    title ??
    (isOverflowing ? (ref.current?.textContent ?? undefined) : undefined);

  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm outline-hidden select-none focus:bg-surface-raised-hover/75 dark:focus:bg-surface-raised-hover data-[disabled]:pointer-events-none data-[disabled]:text-fg-quaternary data-[inset]:pl-8 data-[variant=danger]:text-status-error data-[variant=danger]:focus:bg-status-error-tint data-[variant=danger]:focus:text-status-error [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-fg-tertiary data-[variant=danger]:*:[svg]:text-status-error! data-[disabled]:[&_svg:not([class*='text-'])]:text-fg-quaternary",
        className,
      )}
      {...props}
    >
      {wrapDropdownMenuItemLabel(children, ref, resolvedTitle)}
    </DropdownMenuPrimitive.Item>
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm py-1 pr-2 pl-8 text-sm outline-hidden select-none focus:bg-surface-raised-hover/75 dark:focus:bg-surface-raised-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" strokeWidth={3} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm py-1 pr-2 pl-8 text-sm outline-hidden select-none focus:bg-surface-raised-hover/75 dark:focus:bg-surface-raised-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-fg-tertiary",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm outline-hidden select-none focus:bg-surface-raised-hover/75 dark:focus:bg-surface-raised-hover data-[inset]:pl-8 data-[state=open]:bg-surface-raised [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-fg-tertiary",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        POPOVER_SURFACE_CLASSNAME,
        "z-50 min-w-[8rem] p-1",
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};

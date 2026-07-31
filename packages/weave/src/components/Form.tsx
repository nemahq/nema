import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "../utils";
import { Label } from "./Label";

type FormMessageVariant = "error" | "success";

const formMessageVariantClasses: Record<FormMessageVariant, string> = {
  error: "text-status-error",
  success: "text-status-success",
};

interface FormFieldContextValue {
  fieldId: string;
  messageId: string;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(
  null,
);

function useFormFieldContext(componentName: string) {
  const context = React.useContext(FormFieldContext);
  if (!context) {
    throw new Error(`${componentName} must be used inside a <FormField>.`);
  }
  return context;
}

function FormField({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId();
  const contextValue: FormFieldContextValue = {
    fieldId: id,
    messageId: `${id}-message`,
  };

  return (
    <FormFieldContext.Provider value={contextValue}>
      <div
        data-slot="form-field"
        className={cn("flex flex-col gap-1.5", className)}
        {...props}
      />
    </FormFieldContext.Provider>
  );
}

function FormLabel(props: React.ComponentProps<typeof Label>) {
  const { fieldId } = useFormFieldContext("FormLabel");
  return <Label htmlFor={fieldId} {...props} />;
}

// 라디오형 피커처럼 단일 포커스 컨트롤이 아니라 그룹인 필드는 FormControl
// 없이 FormField 안에서 role="group" 등으로 직접 조립한다.
function FormControl({ children }: { children: React.ReactElement }) {
  const { fieldId, messageId } = useFormFieldContext("FormControl");
  return (
    <Slot.Root id={fieldId} aria-describedby={messageId}>
      {children}
    </Slot.Root>
  );
}

function FormMessage({
  variant = "error",
  reserveSpace = false,
  errorPrefix,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"p">, "id"> & {
  variant?: FormMessageVariant;
  reserveSpace?: boolean;
  // Dialog의 closeLabel과 같은 이유로 소비처가 t()로 넘긴다 — weave는 tolgee를
  // 모른다. 시각적으로는 텍스트만, 스크린리더는 필드가 왜 유효하지 않은지 먼저
  // 듣는다(GOV.UK 에러 메시지 패턴).
  errorPrefix?: string;
}) {
  const { messageId } = useFormFieldContext("FormMessage");
  const hasContent = children != null && children !== "";

  let content: React.ReactNode = null;
  if (hasContent) {
    content = (
      <>
        {variant === "error" && errorPrefix && (
          <span className="sr-only">{errorPrefix}</span>
        )}
        {children}
      </>
    );
  } else if (reserveSpace) {
    content = " ";
  }

  return (
    <p
      id={messageId}
      data-slot="form-message"
      role={variant === "error" ? "alert" : undefined}
      className={cn(
        "text-xs",
        hasContent
          ? formMessageVariantClasses[variant]
          : reserveSpace && "text-transparent",
        className,
      )}
      {...props}
    >
      {content}
    </p>
  );
}

export {
  FormControl,
  FormField,
  FormLabel,
  FormMessage,
  type FormMessageVariant,
};

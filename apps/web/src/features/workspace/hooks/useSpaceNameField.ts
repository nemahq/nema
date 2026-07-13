import { useState } from "react";
import { TRPCClientError } from "@trpc/client";

export function useSpaceNameField(initialValue = "") {
  const [name, setName] = useState(initialValue);
  const [hasConflict, setHasConflict] = useState(false);
  const [touched, setTouched] = useState(false);

  function handleChange(value: string) {
    setName(value);
    setHasConflict(false);
    setTouched(true);
  }

  function markConflictIfNameTaken(error: unknown) {
    if (error instanceof TRPCClientError && error.data?.code === "CONFLICT") {
      setHasConflict(true);
    }
  }

  return {
    name,
    handleChange,
    hasConflict,
    touched,
    markConflictIfNameTaken,
  };
}

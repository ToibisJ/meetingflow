"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/primitives";
import { signOutAction } from "./actions";

export function SignOutButton({ label }: { label: string }) {
  return (
    <form action={signOutAction}>
      <Button variant="quiet" type="submit" className="w-full justify-start px-2">
        <LogOut size={16} className="opacity-70" />
        {label}
      </Button>
    </form>
  );
}

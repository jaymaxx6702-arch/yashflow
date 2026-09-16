import type { ReactNode } from "react";
import AllWorkflowStages from "./AllWorkflowStages";

export default function EmployeeOrderLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <AllWorkflowStages />
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Employee = {
  id: string;
  full_name: string;
  mobile: string;
  department: string | null;
  role: string | null;
  approval_status: "pending" | "approved" | "rejected";
  is_active: boolean;
};

type Department = {
  id: number;
  name: string;
  is_active: boolean;
  sort_order: number;
};

type EmployeeDepartment = {
  id: number;
  employee_id: string;
  department_id: number;
  is_primary: boolean;
};

type AppPermission = {
  id: string;
  permission_key: string;
  label: string;
  description: string | null;
  category: string;
  sort_order: number;
  is_active: boolean;
};

type EmployeePermission = {
  id: string;
  employee_id: string;
  permission_id: string;
  is_allowed: boolean;
};

export default function EmployeeApprovalPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assignments, setAssignments] = useState<EmployeeDepartment[]>([]);
  const [permissions, setPermissions] = useState<AppPermission[]>([]);
  const [employeePermissions, setEmployeePermissions] = useState<EmployeePermission[]>([]);

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);

  const [editPrimaryDepartmentId, setEditPrimaryDepartmentId] = useState("");
  const [editAdditionalDepartmentIds, setEditAdditionalDepartmentIds] = useState<number[]>([]);
  const [editPermissionIds, setEditPermissionIds] = useState<string[]>([]);

  const [message, setMessage] = useState("");

  async function loadDepartments() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("departments")
      .select("id, name, is_active, sort_order")
      .eq("is_active", true)
    
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      setMessage(`Department Load Error: ${error.message}`);
      return;
    }

    setDepartments((data || []) as Department[]);
  }

  async function loadAssignments() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("employee_departments")
      .select("id, employee_id, department_id, is_primary");

    if (error) {
      setMessage(`Department Assignment Load Error: ${error.message}`);
      return;
    }

    setAssignments((data || []) as EmployeeDepartment[]);
  }

  async function loadPermissions() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("app_permissions")
      .select(`
        id,
        permission_key,
        label,
        description,
        category,
        sort_order,
        is_active
      `)
      .eq("is_active", true)
      
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });

    if (error) {
      setMessage(`Permission Load Error: ${error.message}`);
      return;
    }

    setPermissions((data || []) as AppPermission[]);
  }

  async function loadEmployeePermissions() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("employee_app_permissions")
      .select("id, employee_id, permission_id, is_allowed");

    if (error) {
      setMessage(`Employee Permission Load Error: ${error.message}`);
      return;
    }

    setEmployeePermissions((data || []) as EmployeePermission[]);
  }

  async function loadEmployees() {
    setLoading(true);
    setMessage("");

    const supabase = createClient();

    const { data, error } = await supabase
      .from("employees")
      
      .select(
        `
        id,
        full_name,
        mobile,
        department,
        role,
        approval_status,
        is_active
      `
      )
      .neq("role", "admin")
      .eq("is_hidden", false)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("કર્મચારીઓની માહિતી લાવવામાં સમસ્યા આવી.");
      setLoading(false);
      return;
    }

    setEmployees((data || []) as Employee[]);
    setLoading(false);
  }

  async function ensureCorePermissions() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch("/api/admin/ensure-permissions", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
  }

  async function verifyAdminAccess() {
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/");
      return false;
    }

    const { data: adminProfile, error: adminError } = await supabase
      .from("employees")
      .select("id, role, approval_status, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (
      adminError ||
      !adminProfile ||
      adminProfile.role !== "admin" ||
      adminProfile.approval_status !== "approved" ||
      !adminProfile.is_active
    ) {
      router.replace("/dashboard");
      return false;
    }

    return true;
  }

  async function loadPage() {
    setLoading(true);
    setMessage("");

    const allowed = await verifyAdminAccess();

    if (!allowed) {
      setLoading(false);
      return;
    }

    await ensureCorePermissions();

    await Promise.all([
      loadEmployees(),
      loadDepartments(),
      loadAssignments(),
      loadPermissions(),
      loadEmployeePermissions(),
    ]);

    setLoading(false);
  }

  useEffect(() => {
    void loadPage();
    // loadPage intentionally runs when router context is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const departmentMap = useMemo(() => {
    return new Map(departments.map((department) => [department.id, department]));
  }, [departments]);

  function employeeAssignments(employeeId: string) {
    return assignments.filter((item) => item.employee_id === employeeId);
  }

  function employeePrimaryDepartment(employeeId: string) {
    const primary = employeeAssignments(employeeId).find((item) => item.is_primary);
    return primary ? departmentMap.get(primary.department_id) || null : null;
  }

  function employeeAdditionalDepartments(employeeId: string) {
    return employeeAssignments(employeeId)
      .filter((item) => !item.is_primary)
      .map((item) => departmentMap.get(item.department_id))
      .filter(Boolean) as Department[];
  }

  function employeeDirectPermissionIds(employeeId: string) {
    return employeePermissions
      .filter(
        (item) =>
          item.employee_id === employeeId &&
          item.is_allowed
      )
      .map((item) => item.permission_id);
  }

  const permissionsByCategory = useMemo(() => {
    const map = new Map<string, AppPermission[]>();

    for (const permission of permissions) {
      const list = map.get(permission.category) || [];
      list.push(permission);
      map.set(permission.category, list);
    }

    return map;
  }, [permissions]);

  function togglePermission(permissionId: string) {
    setEditPermissionIds((current) =>
      current.includes(permissionId)
        ? current.filter((id) => id !== permissionId)
        : [...current, permissionId]
    );
  }

  async function updateStatus(
    employeeId: string,
    status: "approved" | "rejected"
  ) {
    setUpdatingId(employeeId);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("employees")
      .update({
        approval_status: status,
        is_active: status === "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", employeeId);

    if (error) {
      setMessage("Status update કરવામાં સમસ્યા આવી.");
      setUpdatingId(null);
      return;
    }

    await loadEmployees();
    setUpdatingId(null);
  }

  function startDepartmentEdit(employee: Employee) {
    const currentAssignments = employeeAssignments(employee.id);
    const primary = currentAssignments.find((item) => item.is_primary);

    setEditingEmployeeId(employee.id);
    setEditPrimaryDepartmentId(primary ? String(primary.department_id) : "");

    setEditAdditionalDepartmentIds(
      currentAssignments
        .filter((item) => !item.is_primary)
        .map((item) => item.department_id)
    );

    setEditPermissionIds(
      employeeDirectPermissionIds(employee.id)
    );

    setMessage("");
  }

  function toggleAdditionalDepartment(departmentId: number) {
    const primaryId = Number(editPrimaryDepartmentId);

    if (departmentId === primaryId) return;

    setEditAdditionalDepartmentIds((current) =>
      current.includes(departmentId)
        ? current.filter((id) => id !== departmentId)
        : [...current, departmentId]
    );
  }

  function handlePrimaryDepartmentChange(value: string) {
    setEditPrimaryDepartmentId(value);

    const primaryId = Number(value);

    if (primaryId) {
      setEditAdditionalDepartmentIds((current) =>
        current.filter((id) => id !== primaryId)
      );
    }
  }

  async function saveDepartmentAssignments(employee: Employee) {
    const primaryId = Number(editPrimaryDepartmentId);

    if (!primaryId) {
      setMessage("Primary Department select કરો.");
      return;
    }

    const primaryDepartment = departments.find(
      (department) => department.id === primaryId
    );

    if (!primaryDepartment) {
      setMessage("Selected Primary Department મળ્યો નથી.");
      return;
    }

    setUpdatingId(employee.id);
    setMessage("");

    const supabase = createClient();

    const { error: deleteError } = await supabase
      .from("employee_departments")
      .delete()
      .eq("employee_id", employee.id);

    if (deleteError) {
      setMessage(`Old Department Assignment Delete Error: ${deleteError.message}`);
      setUpdatingId(null);
      return;
    }

    const cleanAdditionalIds = editAdditionalDepartmentIds.filter(
      (id) => id !== primaryId
    );

    const rows = [
      {
        employee_id: employee.id,
        department_id: primaryId,
        is_primary: true,
      },
      ...cleanAdditionalIds.map((departmentId) => ({
        employee_id: employee.id,
        department_id: departmentId,
        is_primary: false,
      })),
    ];

    const { error: insertError } = await supabase
      .from("employee_departments")
      .insert(rows);

    if (insertError) {
      setMessage(`Department Assignment Save Error: ${insertError.message}`);
      setUpdatingId(null);
      await loadAssignments();
      return;
    }

    const { error: employeeError } = await supabase
      .from("employees")
      .update({
        department: primaryDepartment.name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", employee.id);

    if (employeeError) {
      setMessage(
        `Department mapping save થયું, પણ Employee Primary Department Sync Error: ${employeeError.message}`
      );
      setUpdatingId(null);
      await Promise.all([loadEmployees(), loadAssignments()]);
      return;
    }

    const { error: permissionDeleteError } = await supabase
      .from("employee_app_permissions")
      .delete()
      .eq("employee_id", employee.id);

    if (permissionDeleteError) {
      setMessage(
        `Departments save થયા, પણ old permissions remove કરવામાં error: ${permissionDeleteError.message}`
      );
      setUpdatingId(null);
      await Promise.all([
        loadEmployees(),
        loadAssignments(),
        loadEmployeePermissions(),
      ]);
      return;
    }

    if (editPermissionIds.length > 0) {
      const { error: permissionInsertError } = await supabase
        .from("employee_app_permissions")
        .insert(
          editPermissionIds.map((permissionId) => ({
            employee_id: employee.id,
            permission_id: permissionId,
            is_allowed: true,
          }))
        );

      if (permissionInsertError) {
        setMessage(
          `Departments save થયા, પણ permissions save error: ${permissionInsertError.message}`
        );
        setUpdatingId(null);
        await Promise.all([
          loadEmployees(),
          loadAssignments(),
          loadEmployeePermissions(),
        ]);
        return;
      }
    }

    setEditingEmployeeId(null);
    setEditPrimaryDepartmentId("");
    setEditAdditionalDepartmentIds([]);
    setEditPermissionIds([]);

    await Promise.all([
      loadEmployees(),
      loadAssignments(),
      loadEmployeePermissions(),
    ]);

    setMessage(`${employee.full_name} ના departments + permissions update થયા ✅`);
    setUpdatingId(null);
  }

  function statusLabel(status: string) {
    if (status === "approved") return "મંજૂર";
    if (status === "rejected") return "નામંજૂર";
    return "મંજૂરી બાકી";
  }

  function statusClass(status: string) {
    if (status === "approved") return "bg-green-100 text-green-700";
    if (status === "rejected") return "bg-red-100 text-red-700";
    return "bg-amber-100 text-amber-700";
  }

  return (
    <main className="yf-page">
      <div className="yf-container max-w-6xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <Link
              href="/admin"
              className="text-sm font-semibold text-blue-600"
            >
              ← Admin Dashboard
            </Link>

            <h1 className="text-3xl font-black text-slate-900 mt-2">
              કર્મચારી મંજૂરી
            </h1>

            <p className="text-slate-500 mt-1">
              કર્મચારી approval સાથે Primary અને Additional Departments manage કરો
            </p>
          </div>

          <button
            type="button"
            onClick={loadPage}
            className="yf-btn yf-btn-secondary"
          >
            Refresh
          </button>
        </div>

        {message && (
          <div className="yf-alert yf-alert-info mt-5">
            {message}
          </div>
        )}

        <div className="yf-card mt-5 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500">
              માહિતી લોડ થઈ રહી છે...
            </div>
          ) : employees.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              કોઈ કર્મચારી મળ્યો નથી.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {employees.map((employee) => {
                const primaryDepartment = employeePrimaryDepartment(employee.id);
                const additionalDepartments = employeeAdditionalDepartments(employee.id);
                const isEditing = editingEmployeeId === employee.id;

                return (
                  <div key={employee.id} className="p-5">
                    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-lg font-bold text-slate-900">
                            {employee.full_name}
                          </h2>

                          <span
                            className={`yf-badge ${statusClass(
                              employee.approval_status
                            )}`}
                          >
                            {statusLabel(employee.approval_status)}
                          </span>
                        </div>

                        <div className="mt-3 grid md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                          <p>
                            <span className="font-semibold text-slate-600">
                              મોબાઇલ:
                            </span>{" "}
                            {employee.mobile}
                          </p>

                          <p>
                            <span className="font-semibold text-slate-600">
                              Role:
                            </span>{" "}
                            {employee.role || "employee"}
                          </p>

                          <div>
                            <span className="font-semibold text-slate-600">
                              Primary Department:
                            </span>{" "}
                            <span className="font-bold text-blue-700">
                              {primaryDepartment?.name || employee.department || "-"}
                            </span>
                          </div>

                          <div>
                            <span className="font-semibold text-slate-600">
                              Additional Departments:
                            </span>{" "}
                            {additionalDepartments.length > 0 ? (
                              <span className="font-semibold">
                                {additionalDepartments.map((item) => item.name).join(", ")}
                              </span>
                            ) : (
                              "-"
                            )}
                          </div>

                          <p>
                            <span className="font-semibold text-slate-600">
                              Account:
                            </span>{" "}
                            {employee.is_active ? "Active" : "Inactive"}
                          </p>

                          <div className="md:col-span-2">
                            <span className="font-semibold text-slate-600">
                              Access Permissions:
                            </span>{" "}
                            {employeeDirectPermissionIds(employee.id).length > 0 ? (
                              <span className="font-semibold text-emerald-700">
                                {employeeDirectPermissionIds(employee.id).length} Permission(s)
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                No extra permission
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => startDepartmentEdit(employee)}
                          className="yf-btn yf-btn-primary"
                        >
                          Manage Departments
                        </button>

                        <button
                          type="button"
                          disabled={
                            updatingId === employee.id ||
                            employee.approval_status === "approved"
                          }
                          onClick={() => updateStatus(employee.id, "approved")}
                          className="yf-btn yf-btn-success disabled:bg-slate-300"
                        >
                          {updatingId === employee.id ? "અપડેટ..." : "મંજૂર કરો"}
                        </button>

                        <button
                          type="button"
                          disabled={
                            updatingId === employee.id ||
                            employee.approval_status === "rejected"
                          }
                          onClick={() => updateStatus(employee.id, "rejected")}
                          className="yf-btn yf-btn-danger disabled:bg-slate-300"
                        >
                          નામંજૂર કરો
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="yf-card-soft mt-5 p-4 sm:p-5">
                        <h3 className="font-black text-lg">
                          Manage Departments — {employee.full_name}
                        </h3>

                        <div className="mt-4">
                          <label className="block text-sm font-black text-slate-700 mb-2">
                            Primary Department *
                          </label>

                          <select
                            value={editPrimaryDepartmentId}
                            onChange={(e) =>
                              handlePrimaryDepartmentChange(e.target.value)
                            }
                            className="yf-input md:max-w-md"
                          >
                            <option value="">Select Primary Department</option>

                            {departments.map((department) => (
                              <option key={department.id} value={department.id}>
                                {department.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="mt-5">
                          <p className="text-sm font-black text-slate-700">
                            Additional Departments
                          </p>

                          <p className="text-xs text-slate-500 mt-1">
                            Employeeને જરૂરી હોય એટલા additional departments assign કરી શકો.
                          </p>

                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                            {departments.map((department) => {
                              const primaryId = Number(editPrimaryDepartmentId);
                              const isPrimary = department.id === primaryId;
                              const checked = editAdditionalDepartmentIds.includes(
                                department.id
                              );

                              return (
                                <label
                                  key={department.id}
                                  className={`flex items-center gap-3 border rounded-xl px-3 py-3 transition ${
                                    isPrimary
                                      ? "bg-slate-100 border-slate-200 opacity-60"
                                      : checked
                                      ? "bg-blue-50 border-blue-500 cursor-pointer"
                                      : "bg-white border-slate-200 cursor-pointer"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={isPrimary}
                                    checked={checked}
                                    onChange={() =>
                                      toggleAdditionalDepartment(department.id)
                                    }
                                  />

                                  <span className="font-bold text-sm">
                                    {department.name}
                                    {isPrimary ? " (Primary)" : ""}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-6 border-t border-slate-200 pt-5">
                          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                            <div>
                              <p className="text-sm font-black text-slate-700">
                                Access Permissions
                              </p>

                              <p className="text-xs text-slate-500 mt-1">
                                Sensitive modules માટે explicit access આપો. Adminને full access રહે છે.
                              </p>
                            </div>

                            <span className="text-xs font-black text-emerald-700">
                              {editPermissionIds.length} Selected
                            </span>
                          </div>

                          <div className="mt-4 space-y-4">
                            {Array.from(permissionsByCategory.entries()).map(
                              ([categoryName, categoryPermissions]) => (
                                <div
                                  key={categoryName}
                                  className="rounded-2xl border border-slate-200 bg-white p-4"
                                >
                                  <p className="text-xs font-black tracking-[0.12em] text-blue-700 uppercase">
                                    {categoryName}
                                  </p>

                                  <div className="grid md:grid-cols-2 gap-2 mt-3">
                                    {categoryPermissions.map((permission) => {
                                      const checked = editPermissionIds.includes(
                                        permission.id
                                      );

                                      return (
                                        <label
                                          key={permission.id}
                                          className={`flex items-start gap-3 border rounded-xl px-3 py-3 cursor-pointer transition ${
                                            checked
                                              ? "bg-emerald-50 border-emerald-400"
                                              : "bg-white border-slate-200"
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() =>
                                              togglePermission(permission.id)
                                            }
                                            className="mt-1"
                                          />

                                          <span>
                                            <span className="block font-black text-sm text-slate-900">
                                              {permission.label}
                                            </span>

                                            {permission.description && (
                                              <span className="block text-xs text-slate-500 mt-1">
                                                {permission.description}
                                              </span>
                                            )}

                                            <span className="block text-[10px] font-mono text-slate-400 mt-1">
                                              {permission.permission_key}
                                            </span>
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3 mt-5">
                          <button
                            type="button"
                            disabled={updatingId === employee.id}
                            onClick={() => saveDepartmentAssignments(employee)}
                            className="yf-btn yf-btn-success disabled:opacity-50"
                          >
                            {updatingId === employee.id
                              ? "Saving..."
                              : "Save Departments"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingEmployeeId(null);
                              setEditPrimaryDepartmentId("");
                              setEditAdditionalDepartmentIds([]);
                              setEditPermissionIds([]);
                            }}
                            className="yf-btn yf-btn-secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

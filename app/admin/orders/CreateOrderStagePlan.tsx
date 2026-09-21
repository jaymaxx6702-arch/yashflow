"use client";

export type CreateStagePlanEmployee = {
  id: string;
  full_name: string;
  department: string | null;
  departmentNames: string[];
};

export type CreateStagePlanStage = {
  templateStageId: string;
  stageId: string;
  stageName: string;
  departmentName: string | null;
  sequenceNo: number;
  defaultPrimaryId: string | null;
  defaultSupportIds: string[];
};

export type CreateStagePlanValue = Record<
  string,
  {
    primaryId: string | null;
    supportIds: string[];
  }
>;

type Props = {
  stages: CreateStagePlanStage[];
  employees: CreateStagePlanEmployee[];
  value: CreateStagePlanValue;
  onChange: (value: CreateStagePlanValue) => void;
};

function normalizedPlan(
  stage: CreateStagePlanStage,
  value: CreateStagePlanValue
) {
  return (
    value[stage.templateStageId] || {
      primaryId: stage.defaultPrimaryId,
      supportIds: stage.defaultSupportIds,
    }
  );
}

export default function CreateOrderStagePlan({
  stages,
  employees,
  value,
  onChange,
}: Props) {
  if (!stages.length) return null;

  function updateStage(
    stage: CreateStagePlanStage,
    patch: Partial<{
      primaryId: string | null;
      supportIds: string[];
    }>
  ) {
    const current = normalizedPlan(stage, value);

    const next = {
      ...current,
      ...patch,
    };

    if (next.primaryId) {
      next.supportIds = next.supportIds.filter(
        (id) => id !== next.primaryId
      );
    }

    onChange({
      ...value,
      [stage.templateStageId]: next,
    });
  }

  function resetStage(stage: CreateStagePlanStage) {
    const next = { ...value };
    delete next[stage.templateStageId];
    onChange(next);
  }

  return (
    <section className="md:col-span-2 xl:col-span-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <p className="text-[10px] font-black tracking-[0.14em] text-blue-700">
            STAGE FLOW / TEAM PLAN
          </p>
          <h3 className="font-black text-slate-900 mt-1">
            Default Team Auto Selected
          </h3>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            જરૂર હોય ત્યારે જ Primary અથવા Additional Department Support બદલો.
          </p>
        </div>

        <span className="yf-badge bg-green-100 text-green-700">
          Future Stages → Upcoming Work
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {stages.map((stage, index) => {
          const plan = normalizedPlan(stage, value);
          const primaryDepartmentEmployees = employees.filter(
            (employee) =>
              Boolean(stage.departmentName) &&
              employee.departmentNames.some(
                (name) =>
                  name.trim().toLowerCase() ===
                  stage.departmentName?.trim().toLowerCase()
              )
          );

          const additionalEmployees = employees.filter(
            (employee) =>
              !primaryDepartmentEmployees.some(
                (item) => item.id === employee.id
              )
          );

          const changed = Boolean(value[stage.templateStageId]);

          return (
            <article
              key={stage.templateStageId}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-black">
                      {index + 1}
                    </span>
                    <p className="font-black text-slate-900">
                      {stage.stageName}
                    </p>
                    {stage.departmentName && (
                      <span className="yf-badge bg-blue-100 text-blue-700">
                        {stage.departmentName}
                      </span>
                    )}
                    {changed && (
                      <span className="yf-badge bg-amber-100 text-amber-800">
                        Custom Team
                      </span>
                    )}
                  </div>
                </div>

                {changed && (
                  <button
                    type="button"
                    onClick={() => resetStage(stage)}
                    className="yf-btn yf-btn-secondary yf-btn-sm"
                  >
                    Reset Default
                  </button>
                )}
              </div>

              <div className="mt-3 grid lg:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-black text-slate-600">
                    Primary Employee
                  </span>
                  <select
                    value={plan.primaryId || ""}
                    onChange={(event) =>
                      updateStage(stage, {
                        primaryId: event.target.value || null,
                      })
                    }
                    className="yf-input mt-1.5"
                  >
                    <option value="">Needs Assignment</option>

                    {primaryDepartmentEmployees.length > 0 && (
                      <optgroup
                        label={`Primary Department • ${
                          stage.departmentName || "Stage"
                        }`}
                      >
                        {primaryDepartmentEmployees.map((employee) => (
                          <option
                            key={employee.id}
                            value={employee.id}
                          >
                            {employee.full_name}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {additionalEmployees.length > 0 && (
                      <optgroup label="Additional Departments">
                        {additionalEmployees.map((employee) => (
                          <option
                            key={employee.id}
                            value={employee.id}
                          >
                            {employee.full_name}
                            {employee.departmentNames.length
                              ? ` • ${employee.departmentNames.join(" / ")}`
                              : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>

                <div>
                  <p className="text-xs font-black text-slate-600">
                    Support Employees
                  </p>

                  <div className="mt-1.5 max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {employees
                      .filter(
                        (employee) =>
                          employee.id !== plan.primaryId
                      )
                      .map((employee) => {
                        const selected =
                          plan.supportIds.includes(employee.id);

                        const inPrimaryDepartment =
                          primaryDepartmentEmployees.some(
                            (item) => item.id === employee.id
                          );

                        return (
                          <label
                            key={employee.id}
                            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer ${
                              selected
                                ? "bg-green-50"
                                : "bg-white"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => {
                                const supportIds = event.target.checked
                                  ? Array.from(
                                      new Set([
                                        ...plan.supportIds,
                                        employee.id,
                                      ])
                                    )
                                  : plan.supportIds.filter(
                                      (id) => id !== employee.id
                                    );

                                updateStage(stage, {
                                  supportIds,
                                });
                              }}
                            />

                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-black text-slate-800">
                                {employee.full_name}
                              </span>
                              <span className="block text-[10px] font-semibold text-slate-500">
                                {employee.departmentNames.length
                                  ? employee.departmentNames.join(" / ")
                                  : "No Department"}
                                {!inPrimaryDepartment
                                  ? " • Additional Dept"
                                  : ""}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

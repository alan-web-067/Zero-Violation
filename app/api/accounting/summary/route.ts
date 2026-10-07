// app/api/accounting/summary/route.ts
// ACCOUNTING FINANCIAL SUMMARY — per-block income, salary expenses, and profit
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, all } from "@/lib/db";
import { requireAuth, errorStatus } from "@/lib/auth";

export async function GET(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (user.role !== "accounting" && user.role !== "admin" && user.role !== "super_admin") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const year     = Number(searchParams.get("year")     || new Date().getFullYear());
    const month    = Number(searchParams.get("month")    || new Date().getMonth() + 1);
    const blockId  = searchParams.get("block_id");   // optional: load employee detail

    // Per-block financial summary: truck income + aggregated payroll
    const blocks = await all<any>(`
      SELECT
        b.id            AS block_id,
        b.name          AS block_name,
        COALESCE(ti.amount, 0)          AS truck_income,
        ti.notes                         AS income_notes,
        COALESCE(p.total_salary, 0)      AS total_salary,
        COALESCE(p.total_bonus, 0)       AS total_bonus,
        COALESCE(p.total_deduction, 0)   AS total_deduction,
        COALESCE(p.total_expense, 0)     AS total_expense,
        COALESCE(p.employee_count, 0)    AS employee_count
      FROM blocks b
      LEFT JOIN truck_income ti
             ON ti.block_id = b.id AND ti.year = ? AND ti.month = ?
      LEFT JOIN (
        SELECT
          m.block_id,
          COUNT(DISTINCT mp.member_id)                                        AS employee_count,
          SUM(COALESCE(mp.salary, 0))                                         AS total_salary,
          SUM(COALESCE(mp.bonus, 0))                                          AS total_bonus,
          SUM(COALESCE(mp.deduction, 0))                                      AS total_deduction,
          SUM(
            COALESCE(mp.salary, 0)
            + COALESCE(mp.bonus, 0)
            - COALESCE(mp.deduction, 0)
          )                                                                   AS total_expense
        FROM member_payroll mp
        JOIN members m ON m.id = mp.member_id
        WHERE mp.year = ? AND mp.month = ? AND m.status = 'active'
        GROUP BY m.block_id
      ) p ON p.block_id = b.id
      WHERE b.status = 'active'
      ORDER BY b.sort_order, b.name
    `, [year, month, year, month]);

    const totals = {
      truck_income:   blocks.reduce((s: number, b: any) => s + Number(b.truck_income),  0),
      total_expense:  blocks.reduce((s: number, b: any) => s + Number(b.total_expense), 0),
      profit:         blocks.reduce((s: number, b: any) => s + (Number(b.truck_income) - Number(b.total_expense)), 0),
      employee_count: blocks.reduce((s: number, b: any) => s + Number(b.employee_count), 0),
    };

    // If a specific block is requested, also return employee-level payroll detail
    let employees: any[] = [];
    if (blockId) {
      employees = await all<any>(`
        SELECT
          m.id, m.first_name, m.last_name, m.employee_id, m.photo_url,
          COALESCE(mp.salary, 0)                                              AS salary,
          COALESCE(mp.bonus, 0)                                               AS bonus,
          COALESCE(mp.deduction, 0)                                           AS deduction,
          COALESCE(mp.salary, 0) + COALESCE(mp.bonus, 0) - COALESCE(mp.deduction, 0) AS total_expense,
          mp.payment_type, mp.notes
        FROM members m
        LEFT JOIN member_payroll mp
               ON mp.member_id = m.id AND mp.year = ? AND mp.month = ?
        WHERE m.block_id = ? AND m.status = 'active'
        ORDER BY m.last_name, m.first_name
      `, [year, month, Number(blockId)]);
    }

    return NextResponse.json({ blocks, totals, employees });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: errorStatus(e) });
  }
}

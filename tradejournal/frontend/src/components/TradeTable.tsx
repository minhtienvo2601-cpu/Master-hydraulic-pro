"use client";
import Link from "next/link";
import { dt, LABEL, num, r, signedMoney, tone } from "./format";
import type { Trade } from "./types";
import { Badge } from "./ui";

type Sort = { sort: string; order: "asc" | "desc" };

export default function TradeTable({ items, tz, sort, onSort, onDelete }: {
  items: Trade[]; tz: string; sort: Sort; onSort: (s: Sort) => void; onDelete?: (t: Trade) => void;
}) {
  const th = (key: string, label: string) => (
    <th>
      <button className="sort" onClick={() => onSort({ sort: key, order: sort.sort === key && sort.order === "desc" ? "asc" : "desc" })}>
        {label}{sort.sort === key ? (sort.order === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {th("code", "Mã")}
            {th("entry_time", "Vào lệnh")}
            <th>Thị trường</th><th>Hướng</th><th>Trạng thái</th>
            <th className="num">Giá vào</th><th className="num">Giá thoát</th>
            {th("net_pnl", "Kết quả ròng")}
            {th("r_multiple", "R")}
            <th>Setup</th><th aria-label="Thao tác" />
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id}>
              <td data-label="Mã"><Link href={`/trades/${t.id}`}>{t.code}</Link>{t.is_draft && <Badge kind="warn">nháp</Badge>}{t.image_count > 0 && <span className="muted small"> 🖼{t.image_count}</span>}</td>
              <td data-label="Vào lệnh">{dt(t.entry_time, tz)}</td>
              <td data-label="Thị trường">{t.market} <span className="muted small">{t.timeframe}</span></td>
              <td data-label="Hướng"><Badge kind={t.direction}>{LABEL.direction[t.direction]}</Badge></td>
              <td data-label="Trạng thái">{LABEL.status[t.status]}{t.outcome && <> · <span className={t.outcome === "win" ? "pos" : t.outcome === "loss" ? "neg" : ""}>{LABEL.outcome[t.outcome]}</span></>}</td>
              <td data-label="Giá vào" className="num">{num(t.entry_price)}</td>
              <td data-label="Giá thoát" className="num">{num(t.exit_price)}</td>
              <td data-label="Kết quả ròng" className={`num ${tone(t.net_pnl)}`}>{t.net_pnl === null ? "—" : signedMoney(t.net_pnl)}</td>
              <td data-label="R" className={`num ${tone(t.r_multiple)}`}>{t.r_multiple === null ? "—" : r(t.r_multiple)}</td>
              <td data-label="Setup">{t.setup}</td>
              <td className="row-actions">
                <Link className="btn sm ghost" href={`/trades/${t.id}/edit`}>Sửa</Link>
                {onDelete && <button className="btn sm ghost danger" onClick={() => onDelete(t)}>Xóa</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

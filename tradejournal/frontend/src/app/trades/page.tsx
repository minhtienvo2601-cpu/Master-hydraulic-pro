"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/components/api";
import { useUser } from "@/components/AppShell";
import FilterBar, { Filters } from "@/components/FilterBar";
import TradeTable from "@/components/TradeTable";
import type { Trade, TradePage } from "@/components/types";
import { Empty, ErrorBox, Loading, Pager } from "@/components/ui";

export default function TradesPage() {
  const { user } = useUser();
  const [filters, setFilters] = useState<Filters>({});
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ sort: string; order: "asc" | "desc" }>({ sort: "entry_time", order: "desc" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TradePage | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<TradePage>(`/trades${qs({ ...filters, q, trade_type: "live", page, page_size: 25, ...sort })}`));
      setError(null);
    } catch (e) { setError(e); }
  }, [filters, q, page, sort]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filters, q, sort]);

  async function del(t: Trade) {
    if (!confirm(`Xóa giao dịch ${t.code}${t.image_count ? ` và ${t.image_count} ảnh` : ""}? Không thể hoàn tác.`)) return;
    try { await api(`/trades/${t.id}`, { method: "DELETE" }); await load(); } catch (e) { setError(e); }
  }

  return (
    <div>
      <header className="page-head">
        <h1>Nhật ký Live Trading</h1>
        <Link href="/trades/new" className="btn primary">+ Giao dịch mới</Link>
      </header>
      <div className="filters-row">
        <input className="search" type="search" placeholder="Tìm theo mã giao dịch…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm mã giao dịch" />
      </div>
      <FilterBar value={filters} onChange={setFilters} tradeType="live" extended />
      <ErrorBox error={error} onRetry={load} />
      {data === null ? <Loading /> : data.items.length === 0 ? (
        <Empty title="Không có giao dịch">{Object.values(filters).some(Boolean) || q ? "Thử bỏ bớt bộ lọc." : <Link href="/trades/new">Ghi giao dịch đầu tiên</Link>}</Empty>
      ) : (
        <>
          <TradeTable items={data.items} tz={user!.timezone} sort={sort} onSort={setSort} onDelete={del} />
          <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

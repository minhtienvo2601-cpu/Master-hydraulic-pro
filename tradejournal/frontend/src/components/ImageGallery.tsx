"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { LABEL } from "./format";
import type { Image } from "./types";
import { Empty, ErrorBox, Loading } from "./ui";

/** Ảnh tải qua API có kiểm tra quyền (không có URL public). */
export default function ImageGallery({ owner }: { owner: { trade?: string; session?: string } }) {
  const base = owner.trade ? `/trades/${owner.trade}/images` : `/backtest-sessions/${owner.session}/images`;
  const [items, setItems] = useState<Image[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"before" | "after" | "other">("before");
  const [caption, setCaption] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Image | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<Image | null>(null);
  const [ver, setVer] = useState(0);

  const load = useCallback(async () => {
    try { setItems(await api<Image[]>(base)); setError(null); } catch (e) { setError(e); }
  }, [base]);
  useEffect(() => { load(); }, [load]);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function upload() {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) { setError(new Error("Chỉ hỗ trợ PNG, JPG, WebP")); return; }
    const form = new FormData();
    form.append("file", f); form.append("kind", kind); form.append("caption", caption);
    setBusy(true);
    try {
      await api(base, { method: "POST", form });
      setCaption(""); setPreview(null); if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function saveCaption(img: Image, value: string) {
    if (value === img.caption) return;
    try { await api(`/images/${img.id}`, { method: "PATCH", body: { caption: value } }); await load(); } catch (e) { setError(e); }
  }

  async function remove(img: Image) {
    if (!confirm("Xóa ảnh này? Giao dịch vẫn được giữ nguyên.")) return;
    try { await api(`/images/${img.id}`, { method: "DELETE" }); await load(); } catch (e) { setError(e); }
  }

  async function doReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !replacing) return;
    const form = new FormData(); form.append("file", f);
    setBusy(true);
    try { await api(`/images/${replacing.id}/file`, { method: "PUT", form }); setVer((v) => v + 1); await load(); }
    catch (err) { setError(err); } finally { setBusy(false); setReplacing(null); e.target.value = ""; }
  }

  return (
    <div>
      <ErrorBox error={error} />
      <div className="upload">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} aria-label="Chọn ảnh" />
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Loại ảnh">
          <option value="before">Trước khi vào lệnh</option><option value="after">Sau khi thoát lệnh</option><option value="other">Khác</option>
        </select>
        <input placeholder="Chú thích" value={caption} onChange={(e) => setCaption(e.target.value)} />
        <button className="btn sm primary" onClick={upload} disabled={busy || !preview}>{busy ? "Đang tải…" : "Tải ảnh lên"}</button>
      </div>
      {preview && <img className="preview" src={preview} alt="Xem trước" />}
      <input ref={replaceRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={doReplace} />
      {items === null ? <Loading /> : items.length === 0 ? <Empty title="Chưa có ảnh">PNG/JPG/WebP từ TradingView, MT4, MT5…</Empty> : (
        <div className="gallery">
          {items.map((img) => (
            <figure key={img.id}>
              <img src={`/api/v1/images/${img.id}/file?v=${ver}-${img.size_bytes}`} alt={img.caption || LABEL.imageKind[img.kind]} loading="lazy" onClick={() => setZoom(img)} />
              <figcaption>
                <span className="badge">{LABEL.imageKind[img.kind]}</span>
                <input defaultValue={img.caption} placeholder="Chú thích…" onBlur={(e) => saveCaption(img, e.target.value)} aria-label="Chú thích ảnh" />
                <div className="row-actions">
                  <button className="btn sm ghost" onClick={() => { setReplacing(img); replaceRef.current?.click(); }}>Thay</button>
                  <button className="btn sm ghost danger" onClick={() => remove(img)}>Xóa</button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)} role="dialog" aria-label="Xem ảnh">
          <img src={`/api/v1/images/${zoom.id}/file?v=${ver}-${zoom.size_bytes}`} alt={zoom.caption} />
          {zoom.caption && <p>{zoom.caption}</p>}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   app.js - 정적(JSON) 아카이빙 사이트 런타임
   - 상단 탭/복잡한 UI 없이: "목록 + 상세(view)"만 제공
   - 모든 데이터는 /data 아래 JSON로 관리
   ========================================================= */
(() => {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  function getMeta(name) {
    return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || "";
  }

  // 각 페이지에서 meta[name="site-base"]로 루트 상대경로를 알려줌
  // 예) 루트(/) 페이지: "./"
  //     devlog/index.html: "../"
  //     create/comic/index.html: "../../"
  const SITE_BASE = (() => {
    const raw = getMeta("site-base") || "./";
    return raw.endsWith("/") ? raw : raw + "/";
  })();

  function fromRoot(pathFromRoot) {
    // pathFromRoot: "data/devlog/index.json" 처럼 "루트 기준" 경로
    const clean = String(pathFromRoot || "").replace(/^\/+/, "");
    return SITE_BASE + clean;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function safeText(str) {
    return escapeHtml(str).replaceAll("\n", "<br />");
  }

  function formatDate(dateStr) {
    // "YYYY-MM-DD" 또는 "YYYY-MM-DDTHH:mm" 지원
    const s = String(dateStr || "");
    if (!s) return "";
    // ISO 형태는 앞 10자리만 표기
    if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }

  function parseQuery() {
    const usp = new URLSearchParams(window.location.search);
    const out = {};
    for (const [k, v] of usp.entries()) out[k] = v;
    return out;
  }

  async function fetchJson(pathFromRoot) {
    const url = fromRoot(pathFromRoot);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`JSON 로드 실패: ${pathFromRoot} (${res.status})`);
    }
    return await res.json();
  }

  function matchQuery(entry, q) {
    if (!q) return true;
    const hay = [
      entry.title,
      entry.summary,
      ...(entry.tags || []),
      entry.type,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function renderTagBadges(tags = []) {
    if (!Array.isArray(tags) || tags.length === 0) return "";
    return tags
      .slice(0, 12)
      .map((t) => `<span class="badge">#${escapeHtml(t)}</span>`)
      .join(" ");
  }

  function renderEntryCard(entry, indexMeta) {
    const title = escapeHtml(entry.title || "(제목 없음)");
    const date = formatDate(entry.date);
    const summary = entry.summary ? `<p class="item-summary muted">${escapeHtml(entry.summary)}</p>` : "";
    const tags = renderTagBadges(entry.tags || []);
    const typeLabel = indexMeta?.short || indexMeta?.section || entry.type || "";

    const viewHref = fromRoot(`view.html?src=${encodeURIComponent(entry.src || "")}`);

    return `
      <div class="card">
        <div class="meta">
          <span class="badge">${escapeHtml(typeLabel)}</span>
          <span class="muted">${escapeHtml(date)}</span>
          ${entry.visibility ? `<span class="badge">${escapeHtml(entry.visibility)}</span>` : ""}
        </div>
        <h3 class="item-title"><a class="link" href="${viewHref}">${title}</a></h3>
        ${tags ? `<div class="meta">${tags}</div>` : ""}
        ${summary}
      </div>
    `;
  }

  /* =========================================================
     Markdown (아주 얇은) 렌더러
     - Obsidian 느낌의 핵심만: heading/list/code/link/inline code
     - 개인용이니 "완전한 CommonMark"까지는 안 감
     ========================================================= */
  function renderMarkdown(md) {
    const src = String(md || "").replaceAll("\r\n", "\n");
    if (!src.trim()) return "";

    // 1) 코드 펜스 먼저 추출
    const codeBlocks = [];
    const text = src.replace(/```([\w-]+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      const i = codeBlocks.length;
      codeBlocks.push({ lang: lang || "", code });
      return `@@CODEBLOCK_${i}@@`;
    });

    // 2) 라인 단위 처리
    const lines = text.split("\n");
    const out = [];
    let inUl = false;
    let inOl = false;

    function closeLists() {
      if (inUl) out.push("</ul>");
      if (inOl) out.push("</ol>");
      inUl = false;
      inOl = false;
    }

    function inline(s) {
      // 링크 [t](u)
      let x = escapeHtml(s);

      x = x.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => {
        const tt = escapeHtml(t);
        const uu = escapeHtml(u);
        return `<a class="link" href="${uu}" target="_blank" rel="noopener noreferrer">${tt}</a>`;
      });

      // 인라인 코드
      x = x.replace(/`([^`]+)`/g, (_, c) => `<code class="inline">${escapeHtml(c)}</code>`);

      // 굵게/기울임(가벼운 지원)
      x = x.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      x = x.replace(/\*([^*]+)\*/g, "<em>$1</em>");

      return x;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 코드 블록 플레이스홀더
      const mCode = line.match(/^@@CODEBLOCK_(\d+)@@$/);
      if (mCode) {
        closeLists();
        const idx = Number(mCode[1]);
        const cb = codeBlocks[idx];
        const langLabel = cb.lang ? `<div class="muted local-small">language: ${escapeHtml(cb.lang)}</div>` : "";
        out.push(`
          <div class="card">
            ${langLabel}
            <pre class="codeblock"><code>${escapeHtml(cb.code)}</code></pre>
          </div>
        `);
        continue;
      }

      // 헤딩
      const mH = line.match(/^(#{1,4})\s+(.*)$/);
      if (mH) {
        closeLists();
        const level = mH[1].length;
        const tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
        out.push(`<${tag}>${inline(mH[2])}</${tag}>`);
        continue;
      }

      // 구분선
      if (/^\s*---\s*$/.test(line)) {
        closeLists();
        out.push("<hr />");
        continue;
      }

      // UL
      const mUl = line.match(/^\s*[-*]\s+(.*)$/);
      if (mUl) {
        if (inOl) {
          out.push("</ol>");
          inOl = false;
        }
        if (!inUl) {
          out.push("<ul>");
          inUl = true;
        }
        out.push(`<li>${inline(mUl[1])}</li>`);
        continue;
      }

      // OL
      const mOl = line.match(/^\s*\d+\.\s+(.*)$/);
      if (mOl) {
        if (inUl) {
          out.push("</ul>");
          inUl = false;
        }
        if (!inOl) {
          out.push("<ol>");
          inOl = true;
        }
        out.push(`<li>${inline(mOl[1])}</li>`);
        continue;
      }

      // 빈 줄
      if (!line.trim()) {
        closeLists();
        continue;
      }

      // 일반 문단
      closeLists();
      out.push(`<p>${inline(line)}</p>`);
    }

    closeLists();
    return out.join("\n");
  }

  /* =========================================================
     이미지 모달(클릭 확대) - UI는 깔끔, 기능은 실용
     - 휠: 줌
     - 드래그: 패닝(확대 상태에서)
     ========================================================= */
  function initImageModal() {
    const modal = $("#imgModal");
    if (!modal) return;

    const backdrop = $(".img-modal-backdrop", modal);
    const stage = $(".img-modal-stage", modal);
    const img = $(".img-modal-content", modal);
    const btnClose = $(".img-modal-close", modal);

    let scale = 1;
    let tx = 0;
    let ty = 0;
    let dragging = false;
    let startX = 0;
    let startY = 0;

    function applyTransform() {
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }

    function open(src, alt = "") {
      img.src = src;
      img.alt = alt || "";
      scale = 1;
      tx = 0;
      ty = 0;
      applyTransform();
      modal.style.display = "block";
      document.body.style.overflow = "hidden";
    }

    function close() {
      modal.style.display = "none";
      document.body.style.overflow = "";
    }

    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    // 클릭 확대 대상: class="tool-thumb" 또는 data-zoomable="1"
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;

      const imgEl = t.closest("img.tool-thumb, img[data-zoomable='1']");
      if (!imgEl) return;

      open(imgEl.getAttribute("src") || "", imgEl.getAttribute("alt") || "");
    });

    backdrop?.addEventListener("click", close);
    btnClose?.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    // 휠 줌
    stage?.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta = Math.sign(e.deltaY);
        const next = delta > 0 ? scale * 0.9 : scale * 1.1;
        scale = clamp(next, 1, 6);
        applyTransform();
      },
      { passive: false }
    );

    // 드래그 패닝
    stage?.addEventListener("pointerdown", (e) => {
      if (scale <= 1) return;
      dragging = true;
      startX = e.clientX - tx;
      startY = e.clientY - ty;
      stage.setPointerCapture(e.pointerId);
    });

    stage?.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      tx = e.clientX - startX;
      ty = e.clientY - startY;
      applyTransform();
    });

    stage?.addEventListener("pointerup", (e) => {
      dragging = false;
      try {
        stage.releasePointerCapture(e.pointerId);
      } catch (_) {}
    });
  }

  /* =========================================================
     페이지: HOME
     - data/site.json 의 indexes 배열을 읽어 최근 업데이트 합치기
     ========================================================= */
  async function initHome() {
    const recentEl = $("#recent-list");
    if (!recentEl) return;

    try {
      const site = await fetchJson("data/site.json");
      const idxPaths = site.indexes || [];
      const merged = [];

      for (const p of idxPaths) {
        const idx = await fetchJson(p);
        const meta = {
          section: idx.section || "",
          title: idx.title || "",
          short: idx.short || idx.section || "",
          listPage: idx.listPage || "",
        };
        for (const e of idx.entries || []) {
          merged.push({ ...e, __meta: meta });
        }
      }

      merged.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

      const topN = merged.slice(0, 12);
      if (topN.length === 0) {
        recentEl.innerHTML = `<div class="muted">아직 데이터가 없어요. /data 아래에 JSON을 추가해 주세요.</div>`;
        return;
      }

      recentEl.innerHTML = topN.map((e) => renderEntryCard(e, e.__meta)).join("\n");
    } catch (err) {
      recentEl.innerHTML = `
        <div class="card">
          <div class="muted">최근 업데이트 로드 실패</div>
          <pre class="codeblock"><code>${escapeHtml(err?.message || String(err))}</code></pre>
          <div class="muted">로컬에서 file://로 열면 fetch가 막혀요. 아래 README의 "로컬 서버"로 실행하세요.</div>
        </div>
      `;
    }
  }

  /* =========================================================
     페이지: LIST
     - body[data-index] 의 index.json을 읽어서 목록 렌더
     ========================================================= */
  async function initList() {
    const indexPath = document.body.dataset.index;
    const listEl = $("#list");
    const countEl = $("#count");
    const qInput = $("#q");

    if (!indexPath || !listEl) return;

    try {
      const idx = await fetchJson(indexPath);
      const entries = idx.entries || [];

      function render(filtered) {
        if (countEl) countEl.textContent = `${filtered.length}개`;
        listEl.innerHTML = filtered.map((e) => renderEntryCard(e, idx)).join("\n");
        if (filtered.length === 0) {
          listEl.innerHTML = `<div class="muted">검색 결과가 없어요.</div>`;
        }
      }

      render(entries);

      if (qInput) {
        qInput.addEventListener("input", () => {
          const q = qInput.value.trim();
          const filtered = entries.filter((e) => matchQuery(e, q));
          render(filtered);
        });
      }
    } catch (err) {
      listEl.innerHTML = `
        <div class="card">
          <div class="muted">목록 로드 실패</div>
          <pre class="codeblock"><code>${escapeHtml(err?.message || String(err))}</code></pre>
        </div>
      `;
    }
  }

  /* =========================================================
     페이지: VIEW
     - view.html?src=data/.../items/xxx.json 로 상세 렌더
     ========================================================= */
  function renderImages(images, layout = "stack") {
    if (!Array.isArray(images) || images.length === 0) return "";

    // layout: "stack"(기본), "grid2"
    const wrapClass = layout === "grid2" ? "grid two" : "grid";
    const items = images
      .map((img) => {
        if (typeof img === "string") {
          return `<img class="tool-thumb" data-zoomable="1" src="${escapeHtml(img)}" alt="" />`;
        }
        const src = escapeHtml(img.src || "");
        const alt = escapeHtml(img.alt || "");
        const cap = img.caption ? `<div class="muted local-small">${escapeHtml(img.caption)}</div>` : "";
        return `
          <div>
            <img class="tool-thumb" data-zoomable="1" src="${src}" alt="${alt}" />
            ${cap}
          </div>
        `;
      })
      .join("\n");

    return `<div class="${wrapClass}">${items}</div>`;
  }

  function renderKeyValueRows(obj) {
    const rows = [];
    for (const [k, v] of Object.entries(obj || {})) {
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === "object" && !Array.isArray(v)) continue;
      const vv = Array.isArray(v) ? v.join(", ") : String(v);
      rows.push(`<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(vv)}</td></tr>`);
    }
    if (rows.length === 0) return "";
    return `
      <div class="table-wrap">
        <table class="sheetlike simple-table">
          <tbody>
            ${rows.join("\n")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function initView() {
    const detailEl = $("#detail");
    if (!detailEl) return;

    const q = parseQuery();
    const src = q.src;

    if (!src) {
      detailEl.innerHTML = `<div class="card"><div class="muted">src 파라미터가 없어요. (예: view.html?src=data/devlog/items/xxx.json)</div></div>`;
      return;
    }

    try {
      const item = await fetchJson(src);

      const title = escapeHtml(item.title || "(제목 없음)");
      const date = formatDate(item.date);
      const tags = renderTagBadges(item.tags || []);
      const visibility = item.visibility ? `<span class="badge">${escapeHtml(item.visibility)}</span>` : "";
      const type = item.type ? `<span class="badge">${escapeHtml(item.type)}</span>` : "";

      // 일부 타입별 보조 메타(깔끔하게, 있으면만 표시)
      const extraMeta = {
        medium: item.medium,
        topic: item.topic,
        format: item.format,
        seriesId: item.seriesId,
        episodeNo: item.episodeNo,
        rating: item.rating,
        spoiler: item.spoiler ? "true" : "",
      };

      // 본문: bodyHtml 우선, 없으면 bodyMd 렌더, 그것도 없으면 body 텍스트
      let bodyHtml = "";
      if (item.bodyHtml) bodyHtml = String(item.bodyHtml);
      else if (item.bodyMd) bodyHtml = renderMarkdown(item.bodyMd);
      else if (item.body) bodyHtml = `<p>${safeText(item.body)}</p>`;

      // 링크
      const linksHtml = Array.isArray(item.links) && item.links.length
        ? `
          <div class="card">
            <h3 class="local-h3 local-tight">링크</h3>
            <ul>
              ${item.links.map((u) => {
                if (typeof u === "string") {
                  const uu = escapeHtml(u);
                  return `<li><a class="link" href="${uu}" target="_blank" rel="noopener noreferrer">${uu}</a></li>`;
                }
                const uu = escapeHtml(u.url || "");
                const tt = escapeHtml(u.title || u.url || "");
                return `<li><a class="link" href="${uu}" target="_blank" rel="noopener noreferrer">${tt}</a></li>`;
              }).join("\n")}
            </ul>
          </div>
        `
        : "";

      // 이미지
      // - comic/memo는 stack이 자연스럽고
      // - illustration은 grid2가 보기 좋음(기본은 stack)
      let imageLayout = "stack";
      if (String(item.type || "").includes("illustration")) imageLayout = "grid2";
      const imagesHtml = renderImages(item.images, imageLayout);

      // related (선택)
      const relatedHtml = Array.isArray(item.related) && item.related.length
        ? `
          <div class="card">
            <h3 class="local-h3 local-tight">연결</h3>
            <ul>
              ${item.related.map((r) => {
                if (typeof r === "string") {
                  return `<li><code class="inline">${escapeHtml(r)}</code></li>`;
                }
                const label = escapeHtml(r.label || r.id || "");
                if (r.src) {
                  const href = fromRoot(`view.html?src=${encodeURIComponent(r.src)}`);
                  return `<li><a class="link" href="${href}">${label}</a></li>`;
                }
                return `<li>${label}</li>`;
              }).join("\n")}
            </ul>
          </div>
        `
        : "";

      document.title = `${item.title || "view"} - archive`;

      detailEl.innerHTML = `
        <section class="section">
          <div class="meta">
            ${type}
            <span class="muted">${escapeHtml(date)}</span>
            ${visibility}
          </div>
          <h1>${title}</h1>
          ${tags ? `<div class="meta">${tags}</div>` : ""}
          ${renderKeyValueRows(extraMeta)}
        </section>

        ${bodyHtml ? `<section class="section">${bodyHtml}</section>` : ""}

        ${imagesHtml ? `<section class="section"><h2 class="local-h2 local-tight">이미지</h2>${imagesHtml}</section>` : ""}

        ${relatedHtml}
        ${linksHtml}
      `;
    } catch (err) {
      detailEl.innerHTML = `
        <div class="card">
          <div class="muted">상세 로드 실패</div>
          <pre class="codeblock"><code>${escapeHtml(err?.message || String(err))}</code></pre>
        </div>
      `;
    }
  }

  /* =========================================================
     부팅
     ========================================================= */
  document.addEventListener("DOMContentLoaded", () => {
    initImageModal();

    const page = document.body.dataset.page || "";
    if (page === "home") initHome();
    if (page === "list") initList();
    if (page === "view") initView();
  });
})();

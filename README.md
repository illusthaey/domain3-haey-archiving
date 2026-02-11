# archiving-site-starter (정적 + JSON)

상단 탭/메뉴 없이 **홈 → 섹션 목록 → 상세(view)**만 있는, 아주 단순한 개인 아카이빙 스캐폴딩입니다.

## 실행(중요)

브라우저에서 `file://`로 직접 열면 `fetch()`가 막혀서 JSON을 못 읽습니다.  
로컬 서버로 띄우세요.

### 옵션 A) Python
```bash
python -m http.server 5173
# 또는
python3 -m http.server 5173
```
그 다음 브라우저에서 `http://localhost:5173/` 접속.

### 옵션 B) Node
```bash
npx serve .
```

---

## 폴더 구조

```
/
  index.html
  view.html
  devlog/
  create/
    comic/
    illustration/
    writing/
    memo/
  review/
  work/
  assets/
    style.css   # (사용자가 준 CSS 그대로 + 아주 약간의 보조 스타일)
    app.js      # 렌더링 로직
    media/      # 샘플 placeholder 이미지
  data/
    site.json   # 홈에서 읽는 "index 파일 목록"
    devlog/
      index.json
      items/*.json
    create/
      comic/
        index.json
        items/*.json
      illustration/
      writing/
      memo/
    review/
    work/
  templates/
    *.template.json
```

---

## 데이터 추가 흐름(가장 단순한 방식)

### 1) 아이템 JSON 만들기
예: `data/devlog/items/2026-02-05-my-note.json`

`templates/` 안의 템플릿을 복사해서 쓰면 됩니다.

### 2) index.json에 엔트리 1줄 추가
예: `data/devlog/index.json`의 `entries[]`에 아래 형태로 추가

```json
{
  "id": "2026-02-05-my-note",
  "type": "devlog.note",
  "title": "제목",
  "date": "2026-02-05",
  "tags": ["tag1"],
  "visibility": "private",
  "summary": "한 줄 요약",
  "src": "data/devlog/items/2026-02-05-my-note.json"
}
```

---

## (선택) index.json 자동 재생성

엔트리 추가를 매번 손으로 하고 싶지 않으면:

```bash
node tools/rebuild-index.mjs
```

- `data/site.json`에 있는 index 목록을 기준으로
- 각 index 폴더의 `items/*.json`을 읽어서
- `entries[]`를 자동으로 재생성합니다.

---

## 주의(개인/비공개)

정적 호스팅(예: GitHub Pages)은 기본이 공개입니다.  
`visibility: "private"`는 **표시용 배지**일 뿐, 보안 기능이 아닙니다.

진짜로 비공개로 두려면:
- 로컬에서만 쓰거나
- 인증이 있는 호스팅/서버를 쓰거나
- 레포를 private으로 유지하세요.

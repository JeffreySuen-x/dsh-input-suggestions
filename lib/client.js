window.__ModuleLoader__.load({id:"@learning-ai/dsh-input-suggestions",factory:require=>{const module={exports:{}};const exports=module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.js
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react3 = __toESM(require("react"), 1);

// src/remote.js
var PACKAGE = "@learning-ai/dsh-input-suggestions";
var NAMESPACE = "inputSuggestions";
var codec = (typeSymbol, parse) => ({ mode: "strict", typeSymbol, create: () => ({ parse }) });
var output = codec("unknown", (value) => value);
var codecs = {
  sessionId: codec("string", validSession),
  reading: codec("unknown", validReading),
  candidateId: codec("string | null", (value) => value == null ? null : validSession(value))
};
var remote = { package: PACKAGE, descriptors: [
  ["watch", ["sessionId", "reading"], true],
  ["readGhost", ["sessionId", "reading", "candidateId"]],
  ["accepted", ["sessionId", "reading", "candidateId"]]
].map(([method, names, stream]) => ({
  id: `${NAMESPACE}/${method}`,
  namespace: NAMESPACE,
  service: NAMESPACE,
  method,
  invocation: { kind: "direct" },
  parameters: names.map((name) => ({ name, wire: name, source: "json", codec: codecs[name] })),
  result: output,
  ...stream ? { mode: "stream", cancellation: { parameter: "signal" } } : {}
})) };
function validSession(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 256)
    throw new Error("invalid_session");
  return value;
}
function validReading(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((k) => !["text", "source", "revision"].includes(k)) || typeof value.text !== "string" || !value.text.trim() || value.text.length > 6e3 || typeof value.source !== "string" || value.source.length > 500 || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error("invalid_reading_context");
  return { text: value.text, source: value.source, revision: value.revision };
}

// src/feed.js
function createFeeds(api) {
  const entries = /* @__PURE__ */ new Map();
  function get(id, reading = null) {
    const key = JSON.stringify([id, reading]);
    if (entries.has(key)) return entries.get(key);
    let state = { view: void 0, error: null }, controller, stream, serial = 0;
    const listeners = /* @__PURE__ */ new Set();
    const publish = (next) => {
      state = next;
      for (const listener of listeners) listener();
    };
    const stop = () => {
      serial++;
      controller?.abort();
      stream?.dispose();
      controller = stream = void 0;
    };
    const start = () => {
      stop();
      const version = serial;
      controller = new AbortController();
      publish({ view: void 0, error: null });
      (async () => {
        try {
          const active = stream = api.watch(id, reading, controller.signal);
          for await (const view of active) {
            if (version !== serial) return;
            publish({ view, error: null });
          }
        } catch (error) {
          if (version === serial) publish({ ...state, error });
        }
      })();
    };
    const entry = {
      snapshot: () => state,
      subscribe(listener) {
        listeners.add(listener);
        entries.set(key, entry);
        if (listeners.size === 1) start();
        return () => {
          listeners.delete(listener);
          queueMicrotask(() => {
            if (!listeners.size) {
              stop();
              if (entries.get(key) === entry) entries.delete(key);
            }
          });
        };
      },
      restart: () => {
        if (listeners.size) start();
      },
      dispose: () => {
        stop();
        listeners.clear();
      }
    };
    entries.set(key, entry);
    return entry;
  }
  return {
    get,
    reset: () => {
      for (const entry of entries.values()) entry.restart();
    },
    dispose: () => {
      for (const entry of entries.values()) entry.dispose();
      entries.clear();
    }
  };
}

// src/ghost-input.js
var import_react = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/ghost.js
function canShowGhost(input, session, reading = null) {
  const matches = !!reading && reading.draft === input?.draft && reading.draftRev === input?.draftRev;
  return !!input && !!session && (input.draft === "" || matches) && input.phase === "plain" && !input.claim && !input.attachmentIds.length && !input.occurrences.length && !input.queue.length && !session.running && !session.removed && !session.pendingSubmissions.length;
}
function plainKey(event, key) {
  return event.key === key && !event.isComposing && event.keyCode !== 229 && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
}
async function acceptGhost(api, sessionId, ghost, actions, current, reading = null) {
  const span = actions.captureInsertion();
  if (reading && (span.draftRev !== reading.draftRev || span.start !== span.end)) return false;
  const reply = await api.readGhost(sessionId, reading?.wire ?? null, ghost.id);
  if (!reply.ok || !current() || reply.value?.id !== ghost.id || reply.value?.text !== ghost.text) return false;
  const inserted = actions.insertText((reading ? "\n" : "") + ghost.text, span);
  if (inserted) {
    try {
      await api.accepted?.(sessionId, reading?.wire ?? null, ghost.id);
    } catch {
    }
  }
  return inserted;
}

// src/ghost-input.js
var h = import_react.default.createElement;
function createGhostInput(api, useView, useReading = () => null, statusFeed) {
  const dismissed = /* @__PURE__ */ new Set();
  const dismiss = (id) => {
    dismissed.add(id);
    if (dismissed.size > 128) dismissed.delete(dismissed.values().next().value);
  };
  return function GhostInput({ sessionId, useInput, useSession, inputActions }) {
    const input = useInput((s) => s), session = useSession((s) => s), offeredReading = useReading(sessionId);
    const reading = offeredReading?.draft === input.draft && offeredReading?.draftRev === input.draftRev ? offeredReading : null;
    const eligible = canShowGhost(input, session, reading);
    const root = (0, import_react.useRef)(null), editorNode = (0, import_react.useRef)(null), live = (0, import_react.useRef)(null), accept = (0, import_react.useRef)(null);
    const [composing, setComposing] = (0, import_react.useState)(false), [revision, refresh] = (0, import_react.useState)(0), [geometry, setGeometry] = (0, import_react.useState)(null), [surfaceReady, setSurfaceReady] = (0, import_react.useState)(false);
    const active = eligible && surfaceReady && !composing;
    const { view, error } = useView(sessionId, reading?.wire ?? null, active);
    const [expanded, setExpanded] = (0, import_react.useState)(false);
    const candidates = (view?.candidates ?? (view?.ghost ? [view.ghost] : [])).filter((c) => !dismissed.has(c.id));
    const candidate = candidates[0];
    const ghost = !error && surfaceReady && !composing && candidate && !dismissed.has(candidate.id) && eligible ? candidate : null;
    live.current = { ghost, candidates, input, session, reading };
    const statusOwner = (0, import_react.useRef)(Symbol());
    const status = session.removed ? "inactive" : session.running || session.pendingSubmissions.length ? "waiting" : composing || !reading && input.draft !== "" ? "editing" : !active ? "inactive" : error ? "offline" : !view ? "connecting" : !candidates.length && view.ghost ? "dismissed" : view.status ?? (ghost ? "ready" : "idle");
    (0, import_react.useEffect)(() => statusFeed?.publish(sessionId, statusOwner.current, status, active), [sessionId, status, active]);
    (0, import_react.useEffect)(() => setExpanded(false), [candidate?.id, eligible]);
    (0, import_react.useEffect)(() => {
      if (candidate && !eligible) dismiss(candidate.id);
    }, [candidate?.id, eligible]);
    (0, import_react.useEffect)(() => {
      const mount = root.current;
      let card = mount.parentElement;
      while (card && !card.querySelector("[data-composer-input]")) card = card.parentElement;
      const editor = card?.querySelector("[data-composer-input]");
      if (!editor || card.querySelectorAll("[data-composer-input]").length !== 1) return;
      editorNode.current = editor;
      let disposed = false, composingNow = false, compositionEnded = false, enterHeld = false, pending = false;
      const allowed = () => !disposed && editor.isConnected && editor.getAttribute("contenteditable") === "true" && !editor.closest("[inert], [hidden]") && !!editor.getClientRects().length && !composingNow && !compositionEnded && canShowGhost(live.current.input, live.current.session, live.current.reading);
      const hide = () => {
        for (const g of live.current.candidates) dismiss(g.id);
        setExpanded(false);
        refresh((n) => n + 1);
      };
      const take = async (requested) => {
        const g = requested ?? live.current.ghost;
        if (!g || !allowed() || pending) return;
        if (!live.current.candidates.some((c) => c.id === g.id)) return;
        setExpanded(false);
        pending = true;
        try {
          await acceptGhost(
            api,
            sessionId,
            g,
            inputActions,
            () => allowed() && live.current.candidates.some((c) => c.id === g.id),
            live.current.reading
          );
        } catch {
        } finally {
          pending = false;
          if (!disposed) {
            dismiss(g.id);
            refresh((n) => n + 1);
          }
        }
      };
      accept.current = take;
      const keydown = (event) => {
        if (event.target !== editor && !editor.contains(event.target)) return;
        if (plainKey(event, "Enter") && enterHeld) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!live.current.ghost || !allowed()) return;
        if (plainKey(event, "Escape")) {
          event.preventDefault();
          event.stopPropagation();
          hide();
        } else if (plainKey(event, "Enter") && !event.repeat) {
          enterHeld = true;
          event.preventDefault();
          event.stopPropagation();
          void take();
        }
      };
      const keyup = (event) => {
        if (event.key === "Enter") enterHeld = false;
        compositionEnded = false;
      };
      const start = () => {
        composingNow = true;
        setComposing(true);
      };
      const end = () => {
        composingNow = false;
        compositionEnded = true;
        setComposing(false);
      };
      const edit = () => hide();
      const blur = () => {
        enterHeld = false;
        compositionEnded = false;
      };
      card.addEventListener("keydown", keydown, true);
      card.addEventListener("keyup", keyup, true);
      editor.addEventListener("compositionstart", start);
      editor.addEventListener("compositionend", end);
      editor.addEventListener("beforeinput", edit);
      editor.addEventListener("blur", blur);
      const measure = () => {
        setSurfaceReady(editor.getAttribute("contenteditable") === "true" && !editor.closest("[inert], [hidden]") && !!editor.getClientRects().length);
        const parent = mount.offsetParent;
        if (!parent) return;
        const a = editor.getBoundingClientRect(), b = parent.getBoundingClientRect(), style = getComputedStyle(editor);
        const bottomLine = live.current.reading ? Math.max(0, a.height - parseFloat(style.lineHeight) - parseFloat(style.paddingBottom)) : 0;
        setGeometry({
          left: a.left - b.left + parent.scrollLeft,
          top: a.top - b.top + parent.scrollTop + bottomLine,
          width: a.width,
          font: style.font,
          lineHeight: style.lineHeight,
          padding: style.padding
        });
      };
      const attributes = new MutationObserver(measure);
      attributes.observe(editor, { attributes: true, attributeFilter: ["contenteditable", "data-phase"] });
      attributes.observe(card, { attributes: true, attributeFilter: ["inert", "hidden"] });
      const resize = new ResizeObserver(measure);
      resize.observe(editor);
      resize.observe(card);
      measure();
      return () => {
        disposed = true;
        accept.current = null;
        editorNode.current = null;
        resize.disconnect();
        attributes.disconnect();
        card.removeAttribute("data-input-suggestion");
        card.removeAttribute("data-input-suggestion-reading");
        card.removeEventListener("keydown", keydown, true);
        card.removeEventListener("keyup", keyup, true);
        editor.removeEventListener("compositionstart", start);
        editor.removeEventListener("compositionend", end);
        editor.removeEventListener("beforeinput", edit);
        editor.removeEventListener("blur", blur);
      };
    }, [sessionId, inputActions]);
    (0, import_react.useLayoutEffect)(() => {
      let card = root.current.parentElement;
      while (card && !card.querySelector("[data-composer-input]")) card = card.parentElement;
      if (ghost && geometry) card?.setAttribute("data-input-suggestion", "");
      else card?.removeAttribute("data-input-suggestion");
      if (ghost && reading) card?.setAttribute("data-input-suggestion-reading", "");
      else card?.removeAttribute("data-input-suggestion-reading");
      return () => {
        card?.removeAttribute("data-input-suggestion");
        card?.removeAttribute("data-input-suggestion-reading");
      };
    }, [ghost?.id, !!reading, geometry, revision]);
    return h(
      "span",
      { ref: root, className: "dsh-ghost-slot", style: geometry ?? {} },
      ghost && geometry && h(import_react.default.Fragment, null, h(
        "span",
        { className: "dsh-ghost-row" },
        candidates.length > 1 && h(import_dsh_client_ui_primitives.Menu, {
          open: expanded,
          side: "top",
          align: "start",
          portal: true,
          returnFocus: () => editorNode.current,
          onClose: () => setExpanded(false),
          className: "dsh-ghost-menu-anchor",
          listClassName: "dsh-ghost-menu",
          anchor: h(import_dsh_client_ui_primitives.Button, {
            type: "button",
            variant: "ghost",
            size: "sm",
            className: "dsh-ghost-more",
            "aria-label": `\u5176\u4ED6\u5EFA\u8BAE\uFF08${candidates.length - 1}\uFF09`,
            "aria-expanded": expanded,
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => setExpanded((v) => !v)
          }, "\u2304"),
          items: candidates.map((c) => ({ id: c.id, label: h(
            "span",
            { className: "dsh-ghost-choice" },
            c.text,
            c.kind === "advisor" && h("small", { className: "dsh-ghost-label" }, " \xB7 \u987E\u95EE\u5EFA\u8BAE")
          ) })),
          onSelect: (id) => {
            const choice = live.current.candidates.find((c) => c.id === id);
            if (choice) void accept.current?.(choice);
          }
        }),
        h("button", {
          type: "button",
          className: "dsh-ghost",
          "aria-description": "Enter \u63A5\u7EB3 \xB7 Esc \u5FFD\u7565",
          "aria-label": `\u63A5\u7EB3\u5EFA\u8BAE\uFF1A${ghost.text}`,
          "aria-keyshortcuts": "Enter",
          onMouseDown: (event) => event.preventDefault(),
          onClick: () => accept.current?.()
        }, ghost.text),
        ghost.kind === "advisor" && h("small", { className: "dsh-ghost-label" }, "\u987E\u95EE\u5EFA\u8BAE")
      ))
    );
  };
}

// src/status.js
var STATUS = Object.freeze({
  idle: ["idle", "\u7B49\u5F85\u65B0\u7684\u5BF9\u8BDD\u6216\u9605\u8BFB\u9009\u6587"],
  connecting: ["idle", "\u6B63\u5728\u8FDE\u63A5\u9884\u6D4B\u670D\u52A1"],
  waiting: ["idle", "\u7B49\u5F85\u4E3B\u5BF9\u8BDD\u56DE\u7B54\u5B8C\u6210"],
  editing: ["idle", "\u4F60\u6B63\u5728\u7F16\u8F91\uFF0C\u9884\u6D4B\u5DF2\u8BA9\u51FA\u8F93\u5165\u6846"],
  inactive: ["idle", "\u8F93\u5165\u6846\u6682\u4E0D\u53EF\u7528\u4E8E\u9884\u6D4B"],
  dismissed: ["idle", "\u672C\u8F6E\u5EFA\u8BAE\u5DF2\u63A5\u7EB3\u6216\u5FFD\u7565\uFF0C\u7B49\u5F85\u65B0\u7684\u4E0A\u4E0B\u6587"],
  queued: ["ongoing", "\u7B49\u5F85\u672C\u8F6E\u4E0A\u4E0B\u6587\u7A33\u5B9A"],
  preparing: ["ongoing", "\u6B63\u5728\u6574\u7406\u4E0A\u4E0B\u6587\u5E76\u68C0\u67E5\u9884\u7B97"],
  generating: ["ongoing", "\u6B63\u5728\u751F\u6210\u4E0B\u4E00\u53E5\u5EFA\u8BAE"],
  checking: ["ongoing", "\u6B63\u5728\u6821\u9A8C\u5EFA\u8BAE\u5E76\u4FDD\u5B58\u4EFB\u52A1\u8BB0\u5FC6"],
  ready: ["done", "\u5EFA\u8BAE\u5DF2\u5C31\u7EEA\uFF0C\u53EF\u5728\u8F93\u5165\u6846\u63A5\u7EB3"],
  empty: ["idle", "\u672C\u8F6E\u9884\u6D4B\u5B8C\u6210\uFF0C\u6682\u65E0\u5408\u9002\u5EFA\u8BAE"],
  budget: ["warning", "\u9884\u6D4B\u9884\u7B97\u4E0D\u8DB3\uFF0C\u672C\u8F6E\u672A\u53D1\u8D77\u6A21\u578B\u8BF7\u6C42"],
  oversized: ["warning", "\u6750\u6599\u8FC7\u957F\u6216\u4E0D\u5B8C\u6574\uFF0C\u672C\u8F6E\u672A\u53D1\u8D77\u6A21\u578B\u8BF7\u6C42"],
  interrupted: ["warning", "\u672C\u8F6E\u5DF2\u505C\u6B62\uFF0C\u7B49\u5F85\u65B0\u7684\u4E0A\u4E0B\u6587\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u590D\u8C03\u7528"],
  unavailable: ["error", "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u9884\u6D4B\u4E0A\u4E0B\u6587\uFF0C\u4E3B\u5BF9\u8BDD\u4ECD\u53EF\u7EE7\u7EED"],
  error: ["error", "\u672C\u8F6E\u9884\u6D4B\u5931\u8D25\uFF0C\u4E3B\u5BF9\u8BDD\u4ECD\u53EF\u7EE7\u7EED"],
  timeout: ["error", "\u672C\u8F6E\u9884\u6D4B\u8D85\u65F6\uFF0C\u5DF2\u505C\u6B62\u7B49\u5F85"],
  offline: ["error", "\u9884\u6D4B\u8FDE\u63A5\u4E2D\u65AD"]
});
function createStatusFeed() {
  const entries = /* @__PURE__ */ new Map();
  const get = (id) => {
    if (!entries.has(id)) entries.set(id, { values: /* @__PURE__ */ new Map(), listeners: /* @__PURE__ */ new Set(), status: "inactive" });
    return entries.get(id);
  };
  const update = (id, e) => {
    const values = [...e.values.values()], current = values.filter((v) => v.active).at(-1) ?? values.at(-1);
    const status = current?.status ?? "inactive";
    if (e.status !== status) {
      e.status = status;
      for (const fn of e.listeners) fn();
    }
    if (!e.values.size && !e.listeners.size) entries.delete(id);
  };
  return {
    snapshot: (id) => entries.get(id)?.status ?? "inactive",
    subscribe(id, fn) {
      const e = get(id);
      e.listeners.add(fn);
      return () => {
        e.listeners.delete(fn);
        update(id, e);
      };
    },
    publish(id, owner, status, active) {
      const e = get(id), value = { status, active };
      e.values.set(owner, value);
      update(id, e);
      return () => {
        if (e.values.get(owner) === value) {
          e.values.delete(owner);
          update(id, e);
        }
      };
    }
  };
}

// src/status-indicator.js
var import_react2 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var h2 = import_react2.default.createElement;
function createStatusIndicator(feed) {
  function Indicator({ sessionId }) {
    const subscribe = (0, import_react2.useCallback)((fn) => feed.subscribe(sessionId, fn), [sessionId]);
    const status = (0, import_react2.useSyncExternalStore)(subscribe, () => feed.snapshot(sessionId));
    const [tone, detail] = STATUS[status] ?? STATUS.inactive, label = `\u8F93\u5165\u9884\u6D4B \xB7 ${detail}`;
    return h2(
      import_dsh_client_ui_primitives2.Tooltip,
      { label, side: "bottom", portal: true, openOnClick: true, maxWidth: 300 },
      h2(
        import_dsh_client_ui_primitives2.Button,
        {
          type: "button",
          variant: "ghost",
          size: "sm",
          className: "dsh-prediction-indicator",
          "aria-label": label,
          "data-prediction-status": status
        },
        tone === "ongoing" ? h2("span", { className: "dsh-prediction-working", "aria-hidden": true }) : h2(import_dsh_client_ui_primitives2.StateDot, { state: tone, size: 8 })
      )
    );
  }
  return function Entrance(props) {
    return /^(chishui-companion-|dsh-input-prediction-)/.test(props.sessionId) ? null : h2(Indicator, props);
  };
}

// src/style.js
var css = `
.dsh-ghost-slot{position:absolute;pointer-events:none;box-sizing:border-box;z-index:1}
.dsh-ghost{display:block;box-sizing:border-box;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;padding:0;margin:0;background:transparent;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font:inherit;line-height:inherit;text-align:left;cursor:pointer;pointer-events:auto}
.dsh-ghost:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dsh-ghost-row{display:flex;align-items:center;gap:6px;min-width:0}
.dsh-ghost-row>.dsh-ghost{flex:1;min-width:0}
.dsh-ghost-more{pointer-events:auto;flex:none!important;min-height:20px!important;height:20px!important;padding:0 5px!important;color:var(--dsw-alias-label-tertiary)!important}
.dsh-ghost-menu-anchor{pointer-events:auto;flex:none}
.dsh-ghost-menu{max-width:min(480px,calc(100vw - 32px))}
.dsh-ghost-choice{display:block;white-space:normal;line-height:1.5}
.dsh-ghost-label{color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-size:11px;font-weight:normal}
.dsh-prediction-indicator{width:24px!important;min-width:24px!important;padding:0!important;flex:none;display:inline-flex;align-items:center;justify-content:center}
.dsh-prediction-working{display:block;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-business-primary);animation:dsh-prediction-pulse 1.4s ease-in-out infinite}
@keyframes dsh-prediction-pulse{50%{opacity:.4}}
@media(prefers-reduced-motion:reduce){.dsh-prediction-working{animation:none}}
[data-input-suggestion] [data-composer-placeholder]{visibility:hidden}
[data-input-suggestion-reading] [data-composer-input]::after{content:'';display:block;height:1lh;pointer-events:none}

`;

// src/reading.js
function optionalReading() {
  let provider = null;
  const listeners = /* @__PURE__ */ new Set();
  const changed = () => {
    for (const fn of listeners) fn();
  };
  return {
    get: (id) => provider?.get(id) ?? null,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    attach(value) {
      provider = value;
      const off = value.subscribe(changed);
      changed();
      return () => {
        if (provider === value) {
          provider = null;
          off();
          changed();
        }
      };
    }
  };
}

// src/client.js
var inject = ["slots", "remote"];
async function apply(ctx) {
  const reading = optionalReading();
  ctx.inject(["readerInputContext"], (scope) => {
    const off = reading.attach(scope.readerInputContext);
    scope.effect(() => off);
  });
  const unmount = await ctx.remote.$mount(remote);
  ctx.effect(() => unmount);
  ctx.inject([`remote.${NAMESPACE}`], (scope) => {
    const api = scope.remote[NAMESPACE], feeds = createFeeds(api), status = createStatusFeed();
    scope.on("connection/reset", () => feeds.reset());
    scope.effect(() => () => feeds.dispose());
    scope.effect(() => {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.append(style);
      return () => style.remove();
    });
    const idle = { subscribe: () => () => {
    }, snapshot: () => EMPTY };
    const EMPTY = { view: void 0, error: null };
    function useView(sessionId, wire, active) {
      const key = JSON.stringify(wire);
      const feed = (0, import_react3.useMemo)(() => active ? feeds.get(sessionId, wire) : idle, [sessionId, key, active]);
      return (0, import_react3.useSyncExternalStore)(feed.subscribe, feed.snapshot);
    }
    function useReading(sessionId) {
      return (0, import_react3.useSyncExternalStore)(reading.subscribe, () => reading.get(sessionId));
    }
    const GhostInput = createGhostInput(api, useView, useReading, status);
    const Indicator = createStatusIndicator(status);
    scope.slots.inject("conversation.session.header.utilities", () => scope.slots.register({
      name: "conversation.session.header.utilities",
      id: PACKAGE,
      order: 61
    }, Indicator));
    scope.slots.inject("conversation.input.overlay", () => scope.slots.register({
      name: "conversation.input.overlay",
      id: PACKAGE,
      order: 60
    }, GhostInput));
  });
}

return module.exports;}});

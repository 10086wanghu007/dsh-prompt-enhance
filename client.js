window.__ModuleLoader__.load({
  id: 'dsh-prompt-enhance',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Command registered by this bundle's Host half. */
    const COMMAND = '/prompt-enhance ';

    /** Phases of the composer in which replacing the draft would fight the user. */
    const LOCKED_PHASES = ['submitting', 'adjudicating', 'claimed'];

    const TEXT = {
      zh: {
        tooltip: '提示词增强',
        busy: '正在增强…',
        done: '已增强',
        empty: '先输入一些文字',
        failed: '增强失败',
        unavailable: '当前会话无法调用提示词增强',
      },
      en: {
        tooltip: 'Enhance prompt',
        busy: 'Enhancing…',
        done: 'Enhanced',
        empty: 'Type something first',
        failed: 'Enhance failed',
        unavailable: 'Prompt enhancement is unavailable in this session',
      },
    };

    const CSS = [
      '.dsh-pe-root{position:relative;display:inline-flex;align-items:center}',
      '.dsh-pe-button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#8a8f99);border-radius:var(--dsw-radius-sm,8px);cursor:pointer;transition:background-color .15s ease,color .15s ease}',
      '.dsh-pe-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,#111)}',
      '.dsh-pe-button:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#4d6ef5);outline-offset:2px}',
      '.dsh-pe-button:disabled{opacity:.4;cursor:default}',
      '.dsh-pe-button[data-done="true"]{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-primary,#111))}',
      '.dsh-pe-icon{width:16px;height:16px;display:block}',
      '.dsh-pe-button[data-busy="true"] .dsh-pe-icon{animation:dsh-pe-spin .9s linear infinite}',
      '@keyframes dsh-pe-spin{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion:reduce){.dsh-pe-button[data-busy="true"] .dsh-pe-icon{animation:none}}',
      '.dsh-pe-bubble{position:absolute;right:0;bottom:calc(100% + 6px);max-width:min(320px,60vw);padding:6px 9px;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-module-platform,#1f2126);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));box-shadow:var(--dsw-elevation-soft,none);font-family:var(--dsw-font-family,inherit);font-size:12px;line-height:1.45;white-space:pre-wrap;z-index:40}',
      '.dsh-pe-bubble[data-kind="error"]{color:var(--dsw-alias-state-error-primary,#e5484d)}',
      '.dsh-pe-bubble[data-kind="done"]{white-space:nowrap;color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-primary,#111))}',
      '.dsh-pe-visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
    ].join('\n');

    function readService(ctx, name) {
      try {
        const service = ctx.get(name);
        if (service !== undefined && service !== null) return service;
      } catch {
        /* fall through to the property seat */
      }
      try {
        const seated = ctx[name];
        return seated === undefined ? undefined : seated;
      } catch {
        return undefined;
      }
    }

    /** Resolve the `commands` Remote namespace through whichever seat is mounted. */
    function resolveCommands(ctx) {
      const namespace = readService(ctx, 'remote.commands');
      if (namespace !== undefined && typeof namespace.execute === 'function') return namespace;
      const remote = readService(ctx, 'remote');
      const nested = remote?.commands;
      if (nested !== undefined && typeof nested.execute === 'function') return nested;
      return undefined;
    }

    /** Active locale id, kept in sync through the client locale service. */
    function useActiveLocale(ctx) {
      const service = readService(ctx, 'locale');
      const subscribe = React.useCallback(
        (onChange) => {
          if (service !== undefined && typeof service.subscribe === 'function') {
            return service.subscribe(onChange);
          }
          return () => {};
        },
        [service],
      );
      const getSnapshot = React.useCallback(() => {
        try {
          const snapshot = typeof service?.getSnapshot === 'function' ? service.getSnapshot() : undefined;
          return String(snapshot?.active ?? service?.getLocale?.().active ?? 'en');
        } catch {
          return 'en';
        }
      }, [service]);
      if (typeof React.useSyncExternalStore !== 'function') {
        return getSnapshot();
      }
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return React.useSyncExternalStore(subscribe, getSnapshot, () => 'en');
    }

    function stringsFor(active) {
      return String(active).toLowerCase().startsWith('zh') ? TEXT.zh : TEXT.en;
    }

    function SparkleIcon() {
      return h(
        'svg',
        { className: 'dsh-pe-icon', viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', {
          d: 'M11.6 3.4l1.66 4.6 4.6 1.66-4.6 1.66-1.66 4.6-1.66-4.6L5.34 9.66l4.6-1.66L11.6 3.4z',
          fill: 'currentColor',
        }),
        h('path', {
          d: 'M18.5 14.4l.78 2.16 2.16.78-2.16.78-.78 2.16-.78-2.16-2.16-.78 2.16-.78.78-2.16z',
          fill: 'currentColor',
          opacity: '0.62',
        }),
      );
    }

    function SpinnerIcon() {
      return h(
        'svg',
        { className: 'dsh-pe-icon', viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('circle', { cx: 12, cy: 12, r: 7.6, stroke: 'currentColor', strokeWidth: 2.4, strokeOpacity: 0.24 }),
        h('path', {
          d: 'M19.6 12A7.6 7.6 0 0 0 12 4.4',
          stroke: 'currentColor',
          strokeWidth: 2.4,
          strokeLinecap: 'round',
        }),
      );
    }

    /**
     * Pull the command outcome out of the RemoteResult envelope:
     * `{ ok: true, value: { commandId, result } }` or `{ ok: false, error }`.
     */
    function unwrapResult(result, fallbackText) {
      if (result === undefined || result === null) throw new Error(fallbackText);
      if (result.ok === false) throw new Error(result.error?.message ?? fallbackText);
      const outcome = result.value?.result;
      if (outcome === undefined || outcome === null) throw new Error(fallbackText);
      if (outcome.kind !== 'success' || typeof outcome.text !== 'string' || outcome.text === '') {
        throw new Error(typeof outcome.text === 'string' && outcome.text !== '' ? outcome.text : fallbackText);
      }
      return outcome.text;
    }

    function createButton(ctx) {
      return function PromptEnhanceButton(props) {
        const { inputActions, useInput, sessionId } = props;
        const state = typeof useInput === 'function' ? useInput((snapshot) => snapshot) : undefined;
        const draft = typeof state?.draft === 'string' ? state.draft : '';
        const phase = String(state?.phase ?? 'plain');
        const busyRef = React.useRef(false);
        const aliveRef = React.useRef(true);
        const [busy, setBusy] = React.useState(false);
        const [flash, setFlash] = React.useState(false);
        const [error, setError] = React.useState('');
        const active = useActiveLocale(ctx);
        const text = stringsFor(active);

        React.useEffect(() => {
          aliveRef.current = true;
          return () => {
            aliveRef.current = false;
          };
        }, []);

        React.useEffect(() => {
          const timers = [];
          if (error !== '') timers.push(setTimeout(() => setError(''), 8000));
          if (flash) timers.push(setTimeout(() => setFlash(false), 1400));
          return () => timers.forEach(clearTimeout);
        }, [error, flash]);

        const locked = LOCKED_PHASES.includes(phase);
        const disabled = busy || locked || draft.trim() === '';

        const run = async (event) => {
          if (event !== undefined && typeof event.preventDefault === 'function') event.preventDefault();
          if (busyRef.current || disabled) return;
          const source = draft.trim();
          if (source === '') {
            setError(text.empty);
            return;
          }
          const commands = resolveCommands(ctx);
          if (
            commands === undefined ||
            inputActions === undefined ||
            typeof inputActions.setDraft !== 'function' ||
            sessionId === undefined
          ) {
            setError(text.unavailable);
            return;
          }
          busyRef.current = true;
          setBusy(true);
          setError('');
          try {
            // Every byte after the command name belongs to rawInput, so the draft is
            // appended as-is and trimmed again on the Host side.
            const line = COMMAND + source.replace(/\r\n/g, '\n');
            const result = await commands.execute(sessionId, line, []);
            const enhanced = unwrapResult(result, text.failed);
            inputActions.setDraft(enhanced);
            if (aliveRef.current) setFlash(true);
          } catch (failure) {
            if (aliveRef.current) setError(failure instanceof Error ? failure.message : String(failure));
          } finally {
            busyRef.current = false;
            if (aliveRef.current) setBusy(false);
          }
        };

        const bubble = error !== '' ? error : flash ? text.done : '';
        const bubbleKind = error !== '' ? 'error' : 'done';
        const title = busy ? text.busy : draft.trim() === '' ? text.empty : text.tooltip;

        return h(
          'span',
          { className: 'dsh-pe-root' },
          h('span', { className: 'dsh-pe-visually-hidden', 'aria-live': 'polite' }, bubble),
          bubble === ''
            ? null
            : h('span', { className: 'dsh-pe-bubble', 'data-kind': bubbleKind, role: bubbleKind === 'error' ? 'alert' : 'status' }, bubble),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-pe-button',
              'data-busy': busy ? 'true' : 'false',
              'data-done': flash ? 'true' : 'false',
              title,
              'aria-label': text.tooltip,
              'aria-busy': busy ? 'true' : 'false',
              disabled,
              // Keep the caret in the composer: focusing the button would collapse
              // the selection the draft replacement is measured against.
              onMouseDown: (event) => event.preventDefault(),
              onClick: run,
            },
            busy ? h(SpinnerIcon) : h(SparkleIcon),
          ),
        );
      };
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.id = 'dsh-prompt-enhance-style';
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => {
            style.remove();
          };
        });
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register(
            { name: 'conversation.input.right', id: 'prompt-enhance', order: 5 },
            createButton(ctx),
          ),
        );
      },
    };
  },
});
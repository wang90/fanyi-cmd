# ai-cmd zsh shell integration
# 作用：执行 ai <内容> 成功后，下一次 prompt 自动预填 `ai `

typeset -g AI_CMD_PREFILL_NEXT=0

if ! typeset -f _ai_cmd_prefill_line_init >/dev/null 2>&1; then
  _ai_cmd_prefill_line_init() {
    if (( AI_CMD_PREFILL_NEXT )); then
      LBUFFER+="ai "
      AI_CMD_PREFILL_NEXT=0
    fi
  }
fi

if ! typeset -f _ai_cmd_call_cli >/dev/null 2>&1; then
  _ai_cmd_call_cli() {
    local __ai_path
    __ai_path="$(whence -p ai 2>/dev/null || true)"
    if [[ -n "$__ai_path" ]]; then
      "$__ai_path" "$@"
      return $?
    fi

    local __script_dir __project_root __cli_bin
    __script_dir="${0:A:h}"
    __project_root="${__script_dir:h}"
    __cli_bin="${__project_root}/bin/ai"
    if [[ -x "$__cli_bin" ]]; then
      "$__cli_bin" "$@"
      return $?
    fi

    echo "ai-cmd: 未找到 ai 命令，请先执行 npm link 或 ./install.sh" >&2
    return 127
  }
fi

if ! typeset -f _ai_cmd_output_ends_with_question >/dev/null 2>&1; then
  _ai_cmd_output_ends_with_question() {
    local __output_file __flag
    __output_file="$1"
    __flag="$(
      node -e '
        const fs = require("fs");
        const file = process.argv[1];
        let text = "";
        try {
          text = fs.readFileSync(file, "utf8");
        } catch {
          process.stdout.write("0");
          process.exit(0);
        }
        text = text.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "").trim();
        let chars = Array.from(text);
        const ignoreRe = /[!！。．,.，:：;；、~～"“”‘’）)\]\}》」』】]/u;
        while (chars.length > 0) {
          const ch = chars[chars.length - 1];
          const cp = ch.codePointAt(0) || 0;
          if (/\s/u.test(ch) || ignoreRe.test(ch) || cp === 0xfe0f || cp === 0x200d || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf)) {
            chars.pop();
            continue;
          }
          break;
        }
        const normalized = chars.join("");
        process.stdout.write(/[？?]$/u.test(normalized) ? "1" : "0");
      ' "$__output_file" 2>/dev/null
    )"
    [[ "$__flag" == "1" ]]
  }
fi

unalias ai >/dev/null 2>&1 || true
if ! typeset -f ai >/dev/null 2>&1; then
  ai() {
    local __status __tmp_output
    __tmp_output="$(mktemp -t ai-cmd-output.XXXXXX 2>/dev/null || true)"

    if [[ -n "$__tmp_output" ]]; then
      _ai_cmd_call_cli "$@" | tee "$__tmp_output"
      __status=${pipestatus[1]}
    else
      _ai_cmd_call_cli "$@"
      __status=$?
    fi

    if (( __status == 0 )) && (( $# > 0 )) && [[ -n "$__tmp_output" ]] && _ai_cmd_output_ends_with_question "$__tmp_output"; then
      AI_CMD_PREFILL_NEXT=1
    fi
    [[ -n "$__tmp_output" ]] && rm -f "$__tmp_output" >/dev/null 2>&1
    return $__status
  }
fi

autoload -Uz add-zle-hook-widget
add-zle-hook-widget line-init _ai_cmd_prefill_line_init
